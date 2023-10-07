import asyncio
from functools import cached_property
from typing import Callable, Optional, Tuple, Dict, TypedDict
from src.job_framework.util import job_class
from src.job_framework.jobs.job_base import JobBase

PRIMITIVES = (int, str, bool, str)


PYTHON_JOB_CALLBACKS = {}


def register_python_job(name: Optional[str] = None):
    def decorator(func: Callable):
        PYTHON_JOB_CALLBACKS[name or func.__name__] = func
        return func

    return decorator


class PythonJobConfig(TypedDict):
    callback: str
    args: Tuple
    kwargs: Dict
    name: Optional[str]


def synchronize_async_helper(to_await):
    async_response = []

    async def run_and_capture_result():
        r = await to_await
        async_response.append(r)

    loop = asyncio.new_event_loop()
    coroutine = run_and_capture_result()
    loop.run_until_complete(coroutine)
    return async_response[0]


@job_class
class PythonJob(JobBase):
    type = "PythonJob"
    config: PythonJobConfig

    def __init__(self, *, config: PythonJobConfig, **kwargs):
        super().__init__(config=config, **kwargs)

    def run(self):
        self.output = str(PYTHON_JOB_CALLBACKS[self.config["callback"]](*self.config["args"], **self.config["kwargs"]))

    @cached_property
    def job_name(self):
        return f"{self.job_id}_PythonJob_{self.config.get('name') or self.config['callback']}"
