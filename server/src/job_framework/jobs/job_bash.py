import subprocess
from dataclasses import dataclass
from typing import List

from src.job_framework.jobs.job_base import JobBase


@dataclass
class BashJobConfig:
    cmd: List[str]


class BashJob(JobBase):
    config: BashJobConfig

    def __init__(self, config: BashJobConfig, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = config

    def run(self):
        process = subprocess.Popen(self.config.cmd, executable="/bin/bash", stdout=subprocess.PIPE)
        output, error = process.communicate()

        return output, error

    @property
    def output(self):
        return self.stdout
