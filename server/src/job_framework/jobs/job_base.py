import asyncio
from abc import ABC, abstractmethod
from enum import Enum
from functools import cached_property
from typing import Optional


class JobStatus(Enum):
    INITIALIZED = 0
    SCHEDULED = 1
    RUNNING = 2
    SUCCESSFUL = 3
    CANCELLED = 4
    FAILED = 5


class JobBase(ABC):
    job_id: str
    status: JobStatus
    error: Optional[Exception]
    done: asyncio.Event

    def __init__(self, *, job_id: str):
        self.job_id = job_id
        self.status = JobStatus.INITIALIZED
        self.done = asyncio.Event()
        self.error = None

    @abstractmethod
    def run(self):
        pass

    @cached_property
    def job_name(self):
        return f"{self.__class__.__name__}-{self.job_id}"

    @property
    def output(self):
        return None

    # async def done(self, job_done_threadsafe: threading.Event):
    #     self.done.set()
    #     job_done_threadsafe.set()
    #     print("Job Done")

    def is_done(self) -> bool:
        return self.done.is_set()

    async def wait_until_done(self) -> JobStatus:
        await self.done.wait()
        return self.status

    async def wait_for_output(self):
        await self.wait_until_done()
        if self.error is not None:
            raise self.error
        elif self.status != JobStatus.SUCCESSFUL:
            raise Exception(f"Job status {self.status}, error is unknown")
        return self.output

    def job_dict(self):
        return {
            "job_name": self.job_name,
            "job_id": self.job_id,
            "status": str(self.status)
        }

    def details(self):
        return {
            **self.job_dict(),
            "error": str(self.error)
        }
