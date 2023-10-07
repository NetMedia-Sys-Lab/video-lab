from asyncio import AbstractEventLoop
from typing import Optional
import requests
from time import sleep, time
from src.job_framework.server.job_manager_queues import JobManagerQueuesInterface
from src.job_framework.jobs.job_base import JobBase
from src.job_framework.util import to_job
from src.util.func_util import throttle


class RemoteJobManagerQueues(JobManagerQueuesInterface):
    loop: AbstractEventLoop

    def __init__(self, url_base: str, loop: AbstractEventLoop) -> None:
        self.url_base = url_base
        self.loop = loop

    def get(self, q_name, timeout: Optional[int] = None) -> JobBase:
        ser = None
        last_try_at = 0
        min_delay = 2
        while ser is None:
            sleep(max(last_try_at + min_delay - time(), 0))
            try:
                last_try_at = time()
                res = requests.get(f"{self.url_base}/job-manager/queue/{q_name}?timeout={timeout}")
                if res.status_code == 204:
                    continue
                res.raise_for_status()
                ser = res.json()
            except Exception:
                pass
        return to_job(ser, loop=self.loop)

    def put(self, q_name, job: JobBase):
        res = requests.put(f"{self.url_base}/job-manager/queue/{q_name}", json=job.serialize())
        res.raise_for_status()
        return res.json()

    @throttle(2)
    def sync_job(self, job: JobBase):
        res = requests.put(f"{self.url_base}/job-manager/update", json=job.serialize())
        res.raise_for_status()
        return res.json()
