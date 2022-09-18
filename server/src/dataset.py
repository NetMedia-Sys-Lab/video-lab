import asyncio
import json
from os import listdir
import os
from threading import Thread
from flask import Flask, request, jsonify
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import PythonJob

from src.beta.beta import replace_beta_parameters


config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
dataset_dir = CONFIG["dataset"]["datasetDir"]


class Dataset:
    app: Flask
    job_manager: JobManagerServer
    loop: asyncio.AbstractEventLoop

    def __init__(self, app: Flask, job_manager: JobManagerServer, loop: asyncio.AbstractEventLoop) -> None:
        self.app = app
        self.job_manager = job_manager
        self.loop = loop

    def recursive_tree(self, path: str):
        tree = {
            "title": path.rsplit("/")[-1],
            "key": path
        }
        if os.path.isdir(path):
            tree["children"] = [
                self.recursive_tree(os.path.join(path, node))
                for node in listdir(path)
            ]
        return tree

    def init_routes(self):

        @self.app.get("/dataset/tree")
        def _get_tree():
            tree = self.recursive_tree(dataset_dir)
            return jsonify(tree['children'])

        @self.app.get("/dataset/video/createMpd")
        def _create_mpd():
            paths = request.args['paths'].split(",")

            async def await_tasks():
                tasks = []
                for path in paths:
                    job = self.job_manager.schedule(PythonJob(
                        config={
                            "callback": replace_beta_parameters.__name__,
                            "args": (path,),
                            "kwargs": {},
                            "name": f"BETA_mpd_{path.rsplit('/', 1)[-1]}"
                        }
                    ))
                    tasks.append(job.wait_for_output())
                await asyncio.gather(*tasks)
            Thread(
                target=self.loop.run_until_complete,
                args=(await_tasks(),),
                daemon=True).start()
            return jsonify({'message': f"Scheduled {len(paths)} BETA parameter calculations"})
