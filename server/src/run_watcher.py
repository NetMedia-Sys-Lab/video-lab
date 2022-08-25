import json
import os
from os.path import join
from pprint import pprint
from typing import Union, Dict

from exp_common.exp_events import ExpEvent_Progress, ExpEvent_State
from exp_common.exp_recorder import ExpReader
from flask import Flask
from watchdog.events import FileSystemEventHandler, DirCreatedEvent, FileCreatedEvent
from watchdog.observers import Observer

from src.state_manager import StateManager

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


class RunsWatcher(FileSystemEventHandler):
    results_dir: str
    app: Flask
    state_manager: StateManager
    __log_readers: Dict[str, ExpReader] = {}

    def __init__(self, state_manager: StateManager, app: Flask):
        self.app = app
        self.state_manager = state_manager
        self.results_dir = CONFIG['headlessPlayer']['resultsDir']
        self.watching_files = ["event_logs.txt"]

    def start_background(self):
        for path, subdirs, files in os.walk(self.results_dir):
            for name in files:
                if name in self.watching_files:
                    if os.path.exists(join(path, "data-1.json")):
                        run_id = f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 2)[-1]}"
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.state", 'State.END', False)
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", 1, False)
                    else:
                        self.tail_exp_logs(join(path, name), False)
        observer = Observer()
        observer.schedule(self, self.results_dir, recursive=True)
        observer.start()

    def on_created(self, event: Union[DirCreatedEvent, FileCreatedEvent]):
        if event.src_path.rsplit("/", 1)[-1] in self.watching_files:
            self.tail_exp_logs(event.src_path, True)

    def on_modified(self, event):
        if event.src_path.rsplit("/", 1)[-1] in self.watching_files:
            self.tail_exp_logs(event.src_path, True)

    def tail_exp_logs(self, file_path, broadcast=False):
        if file_path not in self.__log_readers:
            self.__log_readers[file_path] = ExpReader(file_path)
        for event in self.__log_readers[file_path].read_events():
            if isinstance(event, ExpEvent_Progress):
                run_id = f"{file_path.split('/')[-3]}/{file_path.split('/')[-2]}"
                self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", event.progress, broadcast)
            elif isinstance(event, ExpEvent_State):
                run_id = f"{file_path.split('/')[-3]}/{file_path.split('/')[-2]}"
                self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", event.progress, broadcast)
                self.state_manager.state_updated_partial("run_states", f"{run_id}.state", event.new_state, broadcast)
