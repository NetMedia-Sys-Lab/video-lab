import json
import os
from os.path import join, basename, exists, dirname
from typing import Dict, Union

from istream_player.modules.analyzer.exp_events import ExpEvent_Progress, ExpEvent_State
from istream_player.modules.analyzer.exp_recorder import ExpReader
from flask import Flask
from watchdog.events import DirCreatedEvent, FileCreatedEvent, DirDeletedEvent, FileDeletedEvent, FileSystemEventHandler
from watchdog.observers import Observer

from src.state_manager import REMOVE_VALUE, StateManager

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


FILE_EVENT_LOGS = "event_logs.txt"
FILE_CONFIG_JSON = "config.json"
FILE_DATA_JSON = "data-1.json"


class RunsWatcher(FileSystemEventHandler):
    results_dir: str
    app: Flask
    state_manager: StateManager
    __log_readers: Dict[str, ExpReader] = {}

    def __init__(self, app: Flask, state_manager: StateManager):
        self.app = app
        self.state_manager = state_manager
        self.results_dir = CONFIG['headlessPlayer']['resultsDir']

    def start_background(self):
        for path, subdirs, files in os.walk(self.results_dir):
            for name in files:
                if name == FILE_CONFIG_JSON:
                    run_id = f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 2)[-1]}"
                    if exists(join(path, FILE_DATA_JSON)):
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.state", 'State.END', False)
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", 1, False)
                    elif exists(join(path, FILE_EVENT_LOGS)):
                        self.tail_exp_logs(join(path, FILE_EVENT_LOGS), False)
                    else:
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.state", 'State.SCHEDULED', False)
                        self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", 0, False)

        self.state_manager.broadcast_state('run_states')
        observer = Observer()
        observer.schedule(self, self.results_dir, recursive=True)
        observer.start()

    def on_created(self, event: Union[DirCreatedEvent, FileCreatedEvent]):
        name = basename(event.src_path)
        path = dirname(event.src_path)
        
        if name == FILE_EVENT_LOGS:
            self.tail_exp_logs(event.src_path, True)
        elif name == FILE_CONFIG_JSON and not exists(join(path, FILE_EVENT_LOGS)):
            run_id = f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 2)[-1]}"
            self.state_manager.state_updated_partial("run_states", f"{run_id}.state", 'State.SCHEDULED', True)
            self.state_manager.state_updated_partial("run_states", f"{run_id}.progress", 0, True)
    
    def on_deleted(self, event: Union[DirDeletedEvent, FileDeletedEvent]):
        name = basename(event.src_path)
        path = dirname(event.src_path)

        if name == FILE_CONFIG_JSON:
            run_id = f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 2)[-1]}"
            self.state_manager.state_updated_partial("run_states", f"{run_id}", REMOVE_VALUE, True)

    def on_modified(self, event):
        name = basename(event.src_path)
        if name == FILE_EVENT_LOGS:
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

            