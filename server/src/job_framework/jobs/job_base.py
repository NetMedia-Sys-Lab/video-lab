import asyncio
from enum import Enum
from functools import cached_property
import json
from typing import Dict, Optional
from os.path import join

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


class JobStatus:
    INITIALIZED = "INITIALIZED"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    SUCCESSFUL = "SUCCESSFUL"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class JobBase:
    __done__: asyncio.Event

    job_id: str
    status: str = JobStatus.SCHEDULED
    type: Optional[str] = None
    error: Optional[str] = None
    output: Optional[str] = None
    finished_at: Optional[float] = None
    scheduled_at: Optional[float] = None
    run_at: Optional[float] = None
    config: Optional[Dict] = None
    progress: Optional[float] = None

    def __init__(self, *args, **config):
        self.type = self.__class__.type
        for k, v in config.items():
            self.__setattr__(k, v)
        self.__done__ = asyncio.Event()

    def run(self):
        raise NotImplementedError("Cannot run JobBase")

    @cached_property
    def job_name(self):
        return f"{self.job_id}_{self.__class__.__name__}"

    @cached_property
    def job_dir(self):
        return join(CONFIG["jobManager"]["jobsDir"], self.job_id)

    @cached_property
    def job_pkl(self):
        return join(self.job_dir, "job.pkl")

    @cached_property
    def stdouterr_path(self):
        return join(self.job_dir, "stdouterr.txt")

    def try_read(self, file_path):
        try:
            print(f"Trying to read : {file_path}")
            with open(file_path, "rb") as f:
                return f.read().decode("utf-8")
        except Exception as e:
            return f"Failed to read {file_path}: {e}"

    def is_done(self) -> bool:
        return self.__done__.is_set()

    async def wait_until_done(self) -> JobStatus:
        await self.__done__.wait()
        return self.status

    async def wait_for_output(self):
        await self.wait_until_done()
        if self.error is not None:
            raise Exception(self.error)
        elif self.status != JobStatus.SUCCESSFUL:
            raise Exception(f"Job status {self.status}, error is unknown")
        elif self.output is not None:
            return self.output
        else:
            return self.try_read(self.stdouterr_path)

    def details_short(self):
        return {
            "type": self.type,
            "job_name": self.job_name,
            "job_id": self.job_id,
            "status": str(self.status),
            "scheduled_at": self.scheduled_at,
            "run_at": self.run_at,
            "finished_at": self.finished_at,
            "progress": self.progress,
        }

    def details(self):
        output = self.try_read(self.stdouterr_path)

        return {
            **self.details_short(),
            "error": self.error,
            "progress": self.progress,
            "stdouterr": output,
            "config": self.config,
            "output": self.output,
        }

    def serialize(self):
        def is_internal(s: str):
            return s.startswith("__") and s.endswith("__")

        ret = {k: v for k, v in self.__dict__.items() if not is_internal(k)}
        # print(ret.keys())
        if self.__done__.is_set():
            ret["done"] = True
        return ret

    def deserialize(self, job_dict: Dict, loop: asyncio.AbstractEventLoop = None):
        # pprint(job_dict)
        for k, v in job_dict.items():
            self.__setattr__(k, v)
        if job_dict.get("done"):
            if loop:
                loop.call_soon_threadsafe(self.__done__.set)
