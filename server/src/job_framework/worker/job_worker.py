

from asyncio import AbstractEventLoop
from os import mkdir
import re
from threading import Thread
from time import time
import traceback
from typing import Optional
from src.job_framework.server.job_manager_queues import JobManagerQueuesInterface
from src.job_framework.jobs.job_base import JobStatus
from src.job_framework.worker.stdout_helper import redirect, stop_redirect


class JobWorker(Thread):
    worker_id: str
    queues: JobManagerQueuesInterface
    loop: AbstractEventLoop

    def __init__(self, worker_id: str, queues: JobManagerQueuesInterface, loop: AbstractEventLoop):
        super().__init__(daemon=True)
        self.worker_id = worker_id
        self.queues = queues
        self.loop = loop

    def run(self) -> None:
        while True:
            job = self.queues.get('scheduled')
            max_progress: Optional[float] = None
            progress: Optional[float] = None

            def read_progress(line: str):
                nonlocal progress, max_progress
                try:
                    progress = [float(x.group(1)) for x in re.finditer(r"(?:JOB_PROGRESS|frame)\s*=\s*(\d+(?:\.\d+)?)", line)][-1]
                except Exception:
                    pass
                try:
                    max_progress = [float(x.group(1)) for x in re.finditer(r"JOB_MAX_PROGRESS\s*=\s*(\d+(?:\.\d+)?)", line)][-1]
                except Exception:
                    pass
                if progress is not None and max_progress is not None:
                    job.progress = progress/max_progress
                    self.queues.sync_job(job)
            
            mkdir(job.job_dir)
            with open(job.stdouterr_path, 'wb+') as stdouterr_file:
                stdout_thread, stderr_thread = redirect(stdouterr_file)
                stdout_thread.on_write_line(read_progress)
                stderr_thread.on_write_line(read_progress)
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
                except Exception:
                    job.status = JobStatus.FAILED
                    job.error = "".join(traceback.format_exc())
                    job.finished_at = time()
                    job.__done__.set()
                    self.queues.put('failed', job)
                finally:
                    stop_redirect()
                    stderr_thread.join()
                    stdout_thread.join()
