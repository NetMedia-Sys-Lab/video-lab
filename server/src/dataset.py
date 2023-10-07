import asyncio
import json
from os import listdir
from os.path import basename, dirname, join
from pathlib import Path
import os
from threading import Thread
from flask import Flask, request, jsonify
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import PythonJob

from src.beta.beta import replace_beta_parameters
from src.util.ffmpeg import Ffmpeg


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
        tree = {"title": path.rsplit("/")[-1], "key": path}
        if os.path.isdir(path):
            tree["children"] = [self.recursive_tree(os.path.join(path, node)) for node in listdir(path)]
        return tree

    def init_routes(self):
        @self.app.get("/dataset/allInputs")
        def _get_all_inputs():
            paths = []
            for path in Path(dataset_dir).rglob("*.mpd"):
                paths.append(str(path.relative_to(dataset_dir)))
            return jsonify(paths)

        @self.app.get("/dataset/tree")
        def _get_tree():
            tree = self.recursive_tree(dataset_dir)
            return jsonify(tree["children"])

        @self.app.get("/dataset/video/createMpd")
        def _create_mpd():
            paths = request.args["paths"].split(",")

            for path in paths:
                self.job_manager.schedule(
                    PythonJob(
                        config={
                            "callback": replace_beta_parameters.__name__,
                            "args": (path,),
                            "kwargs": {},
                            "name": f"BETA_mpd_{path.rsplit('/', 1)[-1]}",
                        }
                    )
                )
            return jsonify({"message": f"Scheduled {len(paths)} BETA parameter calculations"})

        @self.app.post("/dataset/video/encode/hevc")
        def _encode_hevc():
            data = request.get_json(force=True)
            assert data is not None, "Body missing"
            paths = data["paths"]
            bitrates = data["bitrates"]
            resolutions = data["resolutions"]
            seg_length = int(data["segLength"])

            for path in paths:
                for i, bitrate in enumerate(bitrates):
                    self.job_manager.schedule(
                        PythonJob(
                            config={
                                "callback": Ffmpeg.encode_hevc_video.__name__,
                                "args": (join(path, "video.y4m"), int(bitrate), resolutions[i], seg_length),
                                "kwargs": {},
                                "name": f"Encode_HEVC_{basename(path)}_{seg_length}_{bitrate}bps",
                            }
                        )
                    )
            return "Success"

        @self.app.post("/dataset/video/dash")
        def _create_dash_playlist():
            data = request.get_json(force=True)
            assert data is not None, "Body missing"
            paths = data["paths"]
            seg_length = int(data["segLength"])

            for path in paths:
                source_paths = [join(f.path, "video.hevc") for f in os.scandir(join(path, "DROP0")) if f.is_dir()]
                for source_path in source_paths:
                    self.job_manager.schedule(
                        PythonJob(
                            config={
                                "callback": Ffmpeg.create_dash_playlist.__name__,
                                "args": (source_path, seg_length),
                                "kwargs": {},
                                "name": f"Create_DASH_{basename(dirname(dirname(dirname(source_path))))}"
                                + f"_{seg_length}_{dirname(source_path)}",
                            }
                        )
                    )
            return "Success"
