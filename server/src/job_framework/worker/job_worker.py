

from asyncio import AbstractEventLoop
from os import mkdir
from threading import Thread
from time import time
import traceback
from src.job_framework.jobs.job_base import JobStatus
from src.job_framework.worker.job_manager_queues_remote import RemoteJobManagerQueues
from src.job_framework.worker.stdout_helper import redirect, stop_redirect


class JobWorker(Thread):
    worker_id: str
    queues: RemoteJobManagerQueues
    loop: AbstractEventLoop

    def __init__(self, worker_id: str, queues: RemoteJobManagerQueues, loop: AbstractEventLoop):
        super().__init__(daemon=True)
        self.worker_id = worker_id
        self.queues = queues
        self.loop = loop

    def run(self) -> None:
        while True:
            job = self.queues.get('scheduled')
            mkdir(job.job_dir)
            stdouterr_file = open(job.stdouterr_path, 'w+')
            stdout_thread, stderr_thread = redirect(stdouterr_file)
            try:
                job.status = JobStatus.RUNNING
                job.run_at = time()
                self.queues.put('running', job)
                job.run()
                stop_redirect()
                job.status = JobStatus.SUCCESSFUL
                job.finished_at = time()
                job.__done__.set()
                self.queues.put('successful', job)
            except Exception as e:
                job.status = JobStatus.FAILED
                job.error = "".join(traceback.format_exception(e))
                job.finished_at = time()
                job.__done__.set()
                self.queues.put('failed', job)
            finally:
                stop_redirect()
                stderr_thread.join()
                stdout_thread.join()
                stdouterr_file.close()
