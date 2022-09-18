import json
from logging import Logger
from os import mkdir
from asyncio import AbstractEventLoop
import shutil
import sys
from time import time
from typing import Callable

from flask import Flask, jsonify, request
from src.job_framework.jobs.job_python import PythonJob
from src.job_framework.server.job_manager_queues import JobManagerQueues
from src.job_framework.jobs.job_base import JobBase, JobStatus
from src.job_framework.worker.stdout_helper import enable_proxy
from src.state_manager import StateManager

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

enable_proxy()

stdout_backup = sys.__stdout__


class JobManagerServer:
    app: Flask
    logger: Logger
    state_manager: StateManager
    loop: AbstractEventLoop
    queues: JobManagerQueues

    def __init__(self, app: Flask, state_manager: StateManager, queues: JobManagerQueues, loop: AbstractEventLoop):
        self.app = app
        self.logger = app.logger
        self.state_manager = state_manager
        self.loop = loop
        self.queues = queues

        try:
            shutil.rmtree(CONFIG["jobManager"]["jobsDir"])
        except Exception as e:
            pass
        finally:
            mkdir(CONFIG["jobManager"]["jobsDir"])

    def schedule(self, job: JobBase):
        job_id = f"{int(time()*1000000)}"
        job.job_id = job_id
        job.status = JobStatus.SCHEDULED
        job.scheduled_at = time()
        self.queues.put('scheduled', job)
        self.queues.updated()
        return job

    def init_routes(self):

        @self.app.get("/job-manager/job/details")
        def _get_job_details():
            print(request.args["job"])
            job: JobBase = self.queues.find_by_id(request.args['job'])
            return jsonify(job.details())
    

    async def run_with_output(self, callable: Callable, *args, **kwargs):
        job: PythonJob = PythonJob(
            config={
                'callback': callable.__name__,
                "args": args,
                'kwargs': kwargs
            }
        )
        self.schedule(job)
        output = await job.wait_for_output()
        return output