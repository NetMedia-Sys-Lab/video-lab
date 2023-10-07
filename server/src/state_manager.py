from collections import defaultdict
from datetime import datetime
import json
from logging import Logger
import os
import random
from time import time
from typing import Dict, Generic, Callable, Any, Optional, Set, TypeVar
from os.path import join
from pathlib import Path
from flask import Flask, request
from flask_socketio import SocketIO

from src.util.func_util import debounce


with open("config.json") as config_file:
    CONFIG = json.load(config_file)


REMOVE_VALUE = random.getrandbits(128)
LOCAL_CLIENT = "LOCAL"
SERVER_STATE = "SERVER_STATE"


StateType = TypeVar("StateType", bound=Dict)
ListenerType = Callable[[str, StateType, int], None]


class StateManager:
    app: Flask
    socketio: SocketIO
    log: Logger
    states: Dict[str, Any]
    listeners: Dict[str, Dict[str, Set[ListenerType]]]
    is_updated: Dict[str, bool]
    state_ids: Dict[str, int]

    def __init__(self, app: Flask, socketio: SocketIO, default_states={}):
        self.app = app
        self.socketio = socketio
        self.log = app.logger
        self.states = default_states

        self.listeners = {}
        self.state_ids = defaultdict(int)
        self.is_updated = defaultdict(bool)

        self.server_state = PersistentStateVar(self.log, self, SERVER_STATE, {"num_socket_clients": 0})

    def get_value(self, json_path):
        value = self.get_nested_item(json_path)
        id = self.state_ids[self.get_root_key(json_path)]
        return value, id

    def add_listener(self, json_path: str, listener: ListenerType):
        (self.listeners.setdefault(LOCAL_CLIENT, {}).setdefault(json_path, set()).add(listener))

    def state_updated(self, json_path: str, value: Any, *, id: Optional[int] = None, broadcast: bool = True):
        root_key = self.get_root_key(json_path)
        if id is None:
            id = int(time() * 1000)
        if id < self.state_ids[root_key]:
            return

        self.set_nested_item(json_path, value)
        self.is_updated[root_key] = True
        self.state_ids[root_key] = id
        if broadcast:
            # self.log.info(f"{json_path} updated. Broadcasting.")
            self.broadcast_state()

    def get_root_key(self, json_path: str) -> str:
        return json_path.split(".", 1)[0]

    def get_nested_item(self, json_path: str) -> Any:
        map_list = [int(t) if t.isnumeric() else t for t in json_path.split(".")]
        obj = self.states
        try:
            for key in map_list[:-1]:
                if key not in obj:
                    obj[key] = {}  # type: ignore
                obj = obj[key]  # type: ignore
            return obj[map_list[-1]]  # type: ignore
        except KeyError:
            return None

    def set_nested_item(self, json_path: str, val: Any):
        """Set item in nested dictionary"""
        map_list = [int(t) if t.isnumeric() else t for t in json_path.split(".")]
        obj = self.states
        for key in map_list[:-1]:
            if key not in obj:
                obj[key] = {}  # type: ignore
            obj = obj[key]  # type: ignore

        if val == REMOVE_VALUE:
            del obj[map_list[-1]]  # type: ignore
        else:
            obj[map_list[-1]] = val  # type: ignore

    @debounce(0.5)
    def broadcast_state(self):
        to_call = []
        for sid, sid_listeners in self.listeners.items():
            for json_path, listeners in sid_listeners.items():
                root_key = self.get_root_key(json_path)
                if self.is_updated[root_key]:
                    val = self.get_nested_item(json_path)
                    for listener in listeners:
                        to_call.append((listener, (json_path, val, self.state_ids[root_key])))

        for root_key in self.is_updated.keys():
            self.is_updated[root_key] = False

        for func, args in to_call:
            func(*args)

    def init_routes(self):
        @self.socketio.on("connect")
        def handle_on_connect():
            sid = request.sid  # type: ignore
            self.listeners[sid] = {}
            self.server_state.update({"num_socket_clients": len(self.listeners)})

        @self.socketio.on("state_sub")
        def handle_state_sub(data):
            json_path = data["key"]
            sid = request.sid  # type: ignore
            # self.log.info(f"Client {sid} subscribed to state: {json_path}")
            root_key = self.get_root_key(json_path)

            def on_state_update(json_path, value, id):
                # self.log.info(f"Sending {json_path} to {sid}")
                self.socketio.emit("state_update", {"key": json_path, "value": value, "id": id}, room=sid)

            (self.listeners.setdefault(sid, {}).setdefault(json_path, set()).add(on_state_update))
            if root_key in self.states:
                on_state_update(json_path, self.get_nested_item(json_path), self.state_ids[root_key])

        @self.socketio.on("state_unsub")
        def handle_state_unsub(data):
            json_path = data["key"]
            sid = request.sid  # type: ignore
            # self.log.info(f"Client {sid} unsubscribed from state: {json_path}")
            del self.listeners.setdefault(sid, {})[json_path]

        @self.socketio.on("state_update")
        def handle_state_update(data):
            json_path = data["key"]
            self.state_updated(json_path, data["value"], id=data["id"])

        @self.socketio.on("disconnect")
        def handle_disconnect():
            sid = request.sid  # type: ignore
            # self.log.info(f"Client {sid} disconnect")
            if sid in self.listeners:
                self.listeners.pop(sid)
            self.server_state.update({"num_socket_clients": len(self.listeners)})


class PersistentStateVar(Generic[StateType]):
    log: Logger

    def __init__(self, log: Logger, state_manager: StateManager, name: str, init_val: StateType) -> None:
        self.state_manager = state_manager
        self._name = name
        self._states_dir = f"{CONFIG['stateManager']['statesDir']}"
        self._prefix = f"STATE_{self._name}_"
        self.log = log
        Path(self._states_dir).mkdir(exist_ok=True)

        last_state = self.get_last_saved_state()
        if last_state is None:
            self.state_manager.state_updated(self._name, init_val)
            self.save_state()
        else:
            self.state_manager.state_updated(self._name, last_state["value"], id=last_state["id"])

        self.state_manager.add_listener(self._name, self.on_value_update)

    def update(self, val: StateType):
        self.state_manager.state_updated(self._name, val)
        self.save_state()

    def on_value_update(self, key: str, val: StateType, id: int):
        self.log.info(f"Saving persisted state var {self._name}")
        self.save_state()

    def get_last_saved_state(self) -> Optional[StateType]:
        json_files = []
        for file in os.listdir(self._states_dir):
            if not file.startswith(self._prefix) or not file.endswith(".json"):
                continue
            json_files.append(file)

        if len(json_files) == 0:
            return None

        latest_file = max(json_files)
        with open(join(self._states_dir, latest_file)) as f:
            return json.load(f)

    @debounce(1)
    def save_state(self):
        value, id = self.state_manager.get_value(self._name)
        file_name = self._prefix + datetime.today().strftime("%Y_%m_%d") + ".json"
        file_path = join(self._states_dir, file_name)
        with open(file_path, "w") as f:
            json.dump({"key": self._name, "value": value, "id": id}, f, indent=4)
