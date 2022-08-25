import queue
from asyncio import AbstractEventLoop
from queue import Queue
from threading import Thread
from typing import Union, Optional, List

from flask import Flask, jsonify, request

from src.job_framework.jobs.job_base import JobBase, JobStatus
from src.job_framework.jobs.job_bash import BashJobConfig, BashJob
from src.job_framework.jobs.job_docker import DockerJobConfig, DockerJob
from src.job_framework.jobs.job_python import PythonJobConfig, PythonJob
from src.state_manager import StateManager


def python_job(job_callback):
    async def inner(*args, **kwargs):
        job: PythonJob = JOB_MANAGER.schedule(PythonJobConfig(job_callback, args, kwargs))
        return await job.wait_for_output()

    return inner


class JobManagerStats:
    scheduled: List[JobBase] = []
    running: List[JobBase] = []
    successful: List[JobBase] = []
    cancelled: List[JobBase] = []
    failed: List[JobBase] = []

    def __init__(self, state_manager: StateManager):
        self.state_manager = state_manager

    def __setattr__(self, name, value):
        super().__setattr__(name, value)

    def updated(self):
        self.state_manager.state_updated("job_manager_state", {
            "scheduled": self.job_dicts(self.scheduled),
            "running": self.job_dicts(self.running),
            "successful": self.job_dicts(self.successful),
            "cancelled": self.job_dicts(self.cancelled),
            "failed": self.job_dicts(self.failed),
        })

    def job_dicts(self, jobs: List[JobBase]):
        return [job.job_dict() for job in jobs]

    @property
    def total(self) -> int:
        return len(self.scheduled) + \
               len(self.running) + \
               len(self.successful) + \
               len(self.cancelled) + \
               len(self.failed)


class JobWorker(Thread):
    loop: AbstractEventLoop
    stats: JobManagerStats
    job_queue: Queue[JobBase]
    worker_id: str

    def __init__(self, job_queue: Queue[JobBase], worker_id: str, stats: JobManagerStats, loop: AbstractEventLoop):
        super().__init__(daemon=True)
        self.job_queue = job_queue
        self.worker_id = worker_id
        self.stats = stats
        self.loop = loop

    def run(self) -> None:
        while True:
            job = self.job_queue.get()
            self.stats.running.append(job)
            self.stats.scheduled.remove(job)
            self.stats.updated()
            try:
                job.status = JobStatus.RUNNING
                job.run()
                job.status = JobStatus.SUCCESSFUL
                self.stats.successful.append(job)
            except Exception as e:
                job.status = JobStatus.FAILED
                job.error = e
                self.stats.failed.append(job)
            finally:
                self.stats.running.remove(job)
                self.loop.call_soon_threadsafe(job.done.set)
                self.stats.updated()


class JobManager:
    jobs: dict[str, JobBase]
    app: Flask
    loop: Optional[AbstractEventLoop]
    stats: Optional[JobManagerStats]
    num_workers: int
    workers: dict[str, JobWorker]
    job_queue: Queue[JobBase]

    def __init__(self):
        self.loop = None
        self.state_manager = None
        self.logger = None
        self.job_queue = queue.Queue()
        self.num_workers = 5
        self.stats = None
        self.workers = {}
        self.jobs = {}

    def init(self, app: Flask, state_manager: StateManager, loop: AbstractEventLoop):
        self.app = app
        self.logger = app.logger
        self.state_manager = state_manager
        self.loop = loop
        self.stats = JobManagerStats(self.state_manager)

    def schedule(self, job_config: Union[BashJobConfig, DockerJobConfig, PythonJobConfig]):
        job_id = f"{self.stats.total:06d}"
        if isinstance(job_config, BashJobConfig):
            job = BashJob(job_config, job_id=job_id)
        elif isinstance(job_config, DockerJobConfig):
            job = DockerJob(job_config, job_id=job_id)
        elif isinstance(job_config, PythonJobConfig):
            job = PythonJob(job_config, job_id=job_id)
        else:
            raise Exception(f"Invalid Job Config : {job_config}")
        job.status = JobStatus.SCHEDULED
        self.stats.scheduled.append(job)
        self.job_queue.put(job)
        self.jobs[job_id] = job
        return job

    def start_workers(self):
        for i in range(self.num_workers):
            worker_id = f"worker-{i:03d}"
            if worker_id not in self.workers:
                self.workers[worker_id] = JobWorker(self.job_queue, worker_id, self.stats, self.loop)
            self.workers[worker_id].start()

    def start_background(self):
        self.start_workers()

    def init_routes(self):
        @self.app.get("/job-manager/job/details")
        def get_job_details():
            print(request.args["job"])
            return jsonify(self.jobs[request.args["job"]].details())


JOB_MANAGER = JobManager()
