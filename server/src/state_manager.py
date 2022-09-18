from logging import Logger
import threading
from abc import ABC, abstractmethod
from functools import cache
from threading import Thread, Timer
from time import sleep, time
from typing import Dict, List, Callable, Any

from flask import Flask, request
from flask_socketio import SocketIO


class StateUpdateListener(ABC):
    @abstractmethod
    def state_updated(self, key, value):
        pass


def debounce(wait_time):
    """
    Decorator that will debounce a function so that it is called after wait_time seconds
    If it is called multiple times, will wait for the last call to be debounced and run only this one.
    """

    def decorator(function):
        def debounced(*args, **kwargs):
            def call_function():
                debounced._timer = None
                return function(*args, **kwargs)

            # if we already have a call to the function currently waiting to be executed, reset the timer
            reduce_time = 0
            if debounced._timer is not None:
                debounced._timer.cancel()
                reduce_time = time() - debounced._timer_start_time

            # after wait_time, call the function provided to the decorator with its arguments
            debounced._timer = threading.Timer(
                max(0, wait_time - reduce_time), call_function)
            debounced._timer.start()
            debounced._timer_start_time = time()

        debounced._timer = None
        return debounced

    return decorator


class StateManager(StateUpdateListener):
    app: Flask
    socketio: SocketIO
    log: Logger
    states: Dict[str, Any]
    is_updated: Dict[str, bool]
    listeners: Dict[str, Dict[str, List[Callable]]]

    def __init__(self, app: Flask, socketio: SocketIO, default_states={}):
        self.app = app
        self.socketio = socketio
        self.log = app.logger
        self.states = default_states
        self.is_updated = {}
        self.listeners = {}

    def state_updated(self, key, value, broadcast=False):
        self.states[key] = value
        self.is_updated[key] = True
        if broadcast:
            self.broadcast_state(key)

    def state_updated_partial(self, key: str, path: str, value: Any, broadcast=False):
        json_keys = self.parse_json_keys(path)
        self.set_nested_item(self.states[key], json_keys, value)
        self.is_updated[key] = True
        if broadcast:
            self.broadcast_state(key)

    @cache
    def parse_json_keys(self, path: str):
        return [int(t) if t.isnumeric() else t for t in path.split(".")]

    def set_nested_item(self, data_dict, map_list, val):
        """Set item in nested dictionary"""
        obj = data_dict
        for key in map_list[:-1]:
            if key not in obj:
                obj[key] = {}
            obj = obj[key]
        obj[map_list[-1]] = val

    def add_listener(self, sid, key, callback: Callable):
        if sid not in self.listeners:
            self.listeners[sid] = {}
        if key not in self.listeners[sid]:
            self.listeners[sid][key] = []
        self.listeners[sid][key].append(callback)

        callback(key, self.states.get(key))

    def remove_listeners(self, sid):
        if sid in self.listeners:
            self.listeners.pop(sid)

    @debounce(0.1)
    def broadcast_state(self, key):
        self.is_updated[key] = False
        for sid, sid_listeners in list(self.listeners.items()):
            for listener in sid_listeners.get(key, []):
                listener(key, self.states[key])

    # def check_state_updated(self):
    #     for key, is_updated in self.is_updated.items():
    #         if not is_updated:
    #             continue
    #         self.broadcast_state(key)

    # def start_background(self):
    #     Timer(1, self.check_state_updated).start()


    def init_routes(self):
        @self.socketio.on('state_sub')
        def handle_state(data):
            key = data["key"]
            sid = request.sid
            self.log.info(f'Client {sid} subscribed to state: {key}')

            def on_state_update(key, value):
                self.socketio.emit('state_update', {
                    "key": key,
                    "value": value
                }, room=sid)

            self.add_listener(sid, key, on_state_update)

        @self.socketio.on('disconnect')
        def handle_disconnect():
            sid = request.sid
            self.log.info(f'Client {sid} disconnect')
            self.remove_listeners(sid)

        @self.app.post('/state/<key>')
        def _post_update_state(key: str):
            path = str(request.json['path'])
            value = str(request.json['value'])
            broadcast = bool(request.json['value'])
            self.state_updated_partial(key, path, value, broadcast)
