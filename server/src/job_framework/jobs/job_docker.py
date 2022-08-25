from dataclasses import dataclass
from dataclasses import dataclass
from functools import cached_property
from io import BytesIO
from pprint import pprint
from sys import stdout
from typing import Union

import docker
from docker.models.containers import Container
from docker.types import Mount

from src.job_framework.jobs.job_base import JobBase


@dataclass
class DockerJobConfig:
    image: str
    mounts: list[Union[tuple[str, str], str]]
    args: list[str]


class DockerJob(JobBase):
    config: DockerJobConfig
    stdout: str
    stderr: str

    def __init__(self, config: DockerJobConfig, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.stdout = ""
        self.stderr = ""
        self.config = config

    def run(self):
        client = docker.from_env()
        mounts = []
        for mount in self.config.mounts:
            if isinstance(mount, str):
                mounts.append(Mount(mount, mount, 'bind'))
            else:
                mounts.append(Mount(mount[1], mount[0], 'bind'))
        try:
            container: Container = client.containers.run(
                self.config.image,
                mounts=mounts,
                auto_remove=False,
                name=self.job_name,
                command=self.config.args,
                detach=True
            )
            ret = container.wait()
            self.stdout = container.logs(stdout=True, stderr=False)
            self.stderr = container.logs(stdout=False, stderr=True)
            container.remove()
            if ret['StatusCode'] != 0:
                raise Exception(f"Docker container {self.job_name} existed with status code {ret}")
        except Exception as e:
            raise e

    @property
    def output(self):
        return self.stdout

    @cached_property
    def job_name(self):
        return f"DockerJob_{self.config.image.rsplit('/', 1)[-1].split(':', 1)[0]}_{self.job_id}"

