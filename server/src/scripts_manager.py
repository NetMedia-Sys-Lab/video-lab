import os
import subprocess
import sys
from typing import Dict, TypedDict
from flask import Flask, jsonify, request
from src.job_framework.jobs.job_python import PythonJob, register_python_job
from src.job_framework.server.job_manager_server import JobManagerServer
from src.state_manager import PersistentStateVar, StateManager

from watchdog.events import FileModifiedEvent, FileSystemEventHandler

from watchdog.observers import Observer


class ScriptType(TypedDict):
    id: str
    name: str
    path: str


class ScriptsManager(FileSystemEventHandler):
    def __init__(self, app: Flask, job_manager: JobManagerServer, state_manager: StateManager) -> None:
        self.job_manager = job_manager
        self.log = app.logger
        self.app = app
        self.state_manager = state_manager

        PersistentStateVar(app.logger, state_manager, "SCRIPTS", {})

        self.state_manager.add_listener("SCRIPTS", self.on_scripts_state_update)

        self.observers: Dict[str, Observer] = {}
        self._last_saved_content = {}

    def on_scriptcontent_state_update(self, json_path: str, content: str, id: int):
        script_id = json_path.split("#", 1)[1]
        script_path = self.state_manager.get_value("SCRIPTS")[0][script_id]["path"]
        if content != self._last_saved_content.get(script_path):
            self._last_saved_content[script_path] = content
            with open(script_path, "w") as f:
                f.write(content)

    def on_scripts_state_update(self, json_path: str, scripts: Dict[str, ScriptType], id: int):
        new_paths = set(script["path"] for script in scripts.values())
        old_paths = set(self.observers.keys())

        # Watch new content states
        for script_id, script in scripts.items():
            self.state_manager.add_listener(f"SCRIPT_CONTENT#{script_id}", self.on_scriptcontent_state_update)

        # Watch new paths
        for path in new_paths - old_paths:
            observer = Observer()
            observer.schedule(self, path, recursive=False)
            observer.start()
            self.observers[path] = observer
            self.check_file_content_updated(path)

        # Unwatch old paths
        for path in old_paths - new_paths:
            self.observers[path].stop()
            del self.observers[path]

    def check_file_content_updated(self, script_path):
        for script_id, script in self.state_manager.get_value("SCRIPTS")[0].items():
            if script["path"] != script_path:
                continue
            json_path = f"SCRIPT_CONTENT#{script_id}"
            self.log.info(f"Script modified on fs: {script_path}")
            try:
                with open(script_path, "r") as f:
                    script_content = f.read()
            except FileNotFoundError:
                script_content = ""
            if self.state_manager.get_value(json_path)[0] != script_content:
                self.state_manager.state_updated(json_path, script_content)

    def on_modified(self, event: FileModifiedEvent):
        script_path = event.src_path
        if script_path not in self.observers:
            return
        self.check_file_content_updated(script_path)

    @register_python_job()
    @staticmethod
    def run_script(script_path: str):
        executable = ""
        ext = script_path.rsplit(".", 1)[-1].lower()
        if ext == "sh":
            executable = "bash"
        elif ext == "py":
            executable = "python"

        subprocess.check_call(
            [executable, script_path],
            stderr=sys.stderr,
            stdout=sys.stdout,
            cwd=os.path.dirname(script_path)
        )
        # assert proc.returncode == 0, f"Script returned with non-zero code {proc.returncode}"

    def init_routes(self):
        @self.app.post("/scripts-manager/run")
        def run_job():
            assert request.json is not None
            script_id = request.json["script_id"]
            script_path = self.state_manager.get_value(f"SCRIPTS.{script_id}")[0]["path"]
            job_ids = [
                self.job_manager.schedule(
                    PythonJob(
                        config={
                            "callback": ScriptsManager.run_script.__name__,
                            "args": (script_path,),
                            "kwargs": {},
                            "name": f"RUN_SCRIPT_{script_id}",
                        }
                    )
                ).job_id
            ]
            return jsonify({"message": f"Scheduled {len(job_ids)} script runs", "job_ids": job_ids})
