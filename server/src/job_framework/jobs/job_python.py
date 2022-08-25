from dataclasses import dataclass
from functools import cached_property
from typing import Callable, Tuple, Dict

from src.job_framework.jobs.job_base import JobBase


@dataclass
class PythonJobConfig:
    callback: Callable
    args: Tuple
    kwargs: Dict


class PythonJob(JobBase):
    config: PythonJobConfig
    output: str = ""

    def __init__(self, config: PythonJobConfig, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = config

    def run(self):
        output = self.config.callback(*self.config.args, **self.config.kwargs)

    @cached_property
    def job_name(self):
        return f"PythonJob_{getattr(self.config.callback, '__name__', 'PythonFunction')}_{self.job_id}"


    def details(self):
        return {
            **super(PythonJob, self).details(),
            "output": str(self.output),
            # "config": vars(self.config)
        }
