import traceback
import requests
from time import sleep, time
from src.job_framework.jobs.job_base import JobBase
from src.job_framework.util import to_job


class RemoteJobManagerQueues:

    def __init__(self, url_base: str) -> None:
        self.url_base = url_base

    def get(self, q_name) -> JobBase:
        ser = None
        last_try_at = 0
        min_delay = 2
        while ser is None:
            sleep(max(last_try_at + min_delay - time(), 0))
            try:
                last_try_at = time()
                res = requests.get(f"{self.url_base}/job-manager/queue/{q_name}")
                if res.status_code == 204:
                    continue
                res.raise_for_status()
                ser = res.json()
            except:
                print(traceback.format_exc())
        return to_job(ser)

    def put(self, q_name, job: JobBase):
        res = requests.put(f"{self.url_base}/job-manager/queue/{q_name}", json=job.serialize())
        res.raise_for_status()
        return res.json()