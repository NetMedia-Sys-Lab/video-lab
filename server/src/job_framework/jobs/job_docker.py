from dataclasses import dataclass
from dataclasses import dataclass
from functools import cached_property
from io import BytesIO
from pprint import pprint
from sys import stdout
import sys
from time import time
from typing import List, Tuple, TypedDict, Union

import docker
from docker.models.containers import Container
from docker.types import Mount
from src.job_framework.util import job_class

from src.job_framework.jobs.job_base import JobBase



class DockerJobConfig(TypedDict):
    image: str
    mounts: List[Union[Tuple[str, str], str]]
    args: List[str]

@job_class
class DockerJob(JobBase):
    type = "DockerJob"
    config: DockerJobConfig

    def __init__(self, *, config: DockerJobConfig, **kwargs):
        super().__init__(config=config, **kwargs)

    def run(self):
        client = docker.from_env()
        mounts = []
        for mount in self.config['mounts']:
            if isinstance(mount, str):
                mounts.append(Mount(mount, mount, 'bind'))
            else:
                mounts.append(Mount(mount[1], mount[0], 'bind'))
        try:
            container: Container = client.containers.run(
                self.config['image'],
                mounts=mounts,
                auto_remove=False,
                name=self.job_name,
                command=self.config['args'],
                detach=True
            )
            ret = container.wait()
            stdout = container.logs(stdout=True, stderr=False)
            stderr = container.logs(stdout=False, stderr=True)
            sys.stdout.write(stdout.decode())
            sys.stderr.write(stderr.decode())
            sys.stdout.flush()
            sys.stderr.flush()
            container.remove()
            if ret['StatusCode'] != 0:
                raise Exception(
                    f"Docker container {self.job_name} existed with status code {ret}")
            self.output = stdout.decode()

        except Exception as e:
            raise e

    @cached_property
    def job_name(self):
        return f"{self.job_id or round(time()*1000)}_DockerJob_{self.config['image'].rsplit('/', 1)[-1].split(':', 1)[0]}"
