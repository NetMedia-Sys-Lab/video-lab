from abc import ABC, abstractmethod
from asyncio import AbstractEventLoop
from queue import Queue
import queue
from typing import Deque, Dict, Optional
from flask import Flask, jsonify, request, Response
from src.job_framework.util import to_job
from src.job_framework.jobs.job_base import JobBase, JobStatus
from src.state_manager import StateManager


# class QueuesDict(TypedDict):
#     initialized: Queue[JobBase]
#     scheduled: Queue[JobBase]
#     running: Queue[JobBase]
#     successful: Queue[JobBase]
#     cancelled: Queue[JobBase]
#     failed: Queue[JobBase]


class JobManagerQueuesInterface(ABC):

    @abstractmethod
    def get(self, q_name, timeout: Optional[int] = None) -> JobBase:
        pass

    @abstractmethod
    def put(self, q_name, job: JobBase) -> None:
        pass

    @abstractmethod
    def sync_job(self, job: JobBase) -> None:
        pass


class JobManagerQueues(JobManagerQueuesInterface):
    app: Flask
    state_manager: StateManager
    loop: AbstractEventLoop
    q: Dict[str, Queue[JobBase]]
    jobs_cache: Dict[str, JobBase]

    def __init__(self, app: Flask, state_manager: StateManager, loop: AbstractEventLoop):
        self.app = app
        self.state_manager = state_manager
        self.loop = loop
        self.q = {
            str(JobStatus.SCHEDULED.lower()): Queue(),
            str(JobStatus.RUNNING.lower()): Queue(),
            str(JobStatus.SUCCESSFUL.lower()): Queue(),
            str(JobStatus.CANCELLED.lower()): Queue(),
            str(JobStatus.FAILED.lower()): Queue(),
        }
        self.jobs_cache = {}
        self.updated()

    def init_routes(self):
        @self.app.get("/job-manager/queue/<q_name>")
        def _get_queue(q_name):
            timeout = int(request.args.get("timeout", "10"))
            try:
                return jsonify(self.get(q_name, timeout=timeout).serialize())
            except queue.Empty:
                return Response("Queue is empty", status=204, mimetype="text/plain")

        @self.app.put("/job-manager/queue/<q_name>")
        def _put_queue(q_name):
            assert request.json is not None, "Body missing"
            job_json = request.json
            job: JobBase = to_job(job_json, cache=self.jobs_cache, loop=self.loop)
            self.put(q_name, job)
            return jsonify("success")

        @self.app.put("/job-manager/update")
        def _update_job():
            assert request.json is not None, "Body missing"
            job_json = request.json
            # This will also update the job
            to_job(job_json, cache=self.jobs_cache, loop=self.loop)
            return jsonify("success")

    def updated(self):
        state = {}
        for q_name, q in self.q.items():
            with q.mutex:
                state[q_name] = [job.details_short() for job in q.queue]

        self.state_manager.state_updated("job_manager_state", state, broadcast=True)

    def clear_jobs(self):
        q_names = ["successful", "cancelled", "failed"]
        jobs = []
        for q_name in q_names:
            jobs.extend(self.q[q_name].queue)
            with self.q[q_name].mutex:
                self.q[q_name].queue.clear()
        self.updated()
        return jobs

    def put(self, q_name: str, job: JobBase):
        if job.job_id not in self.jobs_cache:
            self.jobs_cache[job.job_id] = job
        q: Queue[JobBase] = self.q[q_name]
        self.purge(job.job_id)
        q.put(job)
        self.updated()

    def get(self, q_name: str, timeout: Optional[int] = None):
        q: Queue[JobBase] = self.q[q_name]
        ret = q.get(timeout=timeout)
        self.updated()
        return ret

    def sync_job(self, job: JobBase) -> None:
        # In local queue job object is already synced
        pass

    def purge(self, job_id: str):
        for q_name, q in self.q.items():
            with q.mutex:
                deq: Deque = q.queue
                jobs_to_remove = [job for i, job in enumerate(deq) if job.job_id == job_id]
                for _ in range(len(deq)):
                    job = deq.popleft()
                    if job not in jobs_to_remove:
                        deq.append(job)

    def find_by_id(self, job_id: str):
        return self.jobs_cache[job_id]
