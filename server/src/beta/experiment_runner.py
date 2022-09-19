import asyncio
import json
from logging import Logger
import os
from queue import Queue
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from os.path import join
from pathlib import Path
from pprint import pprint
from random import shuffle
from subprocess import check_call, check_output
from time import sleep, time
from typing import List, TypedDict, Iterable
from flask import Flask
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import PythonJob, register_python_job

from src.state_manager import StateManager


config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

network_ids: Queue[int] = Queue()
for i in range(1, 255):
    network_ids.put(i)


class RunsConfig(TypedDict):
    resultId: str
    videos: List[str]
    beta: List[bool]
    codecs: List[str]
    protocols: List[str]
    lengths: List[int]
    bufferSettings: List[str]
    bwProfiles: List[str]
    numWorkers: int
    repeat: int
    serverImages: List[str]
    serverLogLevel: str
    calculateVmaf: bool


class RunConfig(TypedDict):
    resultId: str
    runId: str
    runDir: str
    video: str
    beta: bool
    codec: str
    protocol: str
    length: int
    bufferSetting: str
    bwProfile: str
    attempt: int
    target: str
    env: str
    serverImage: str
    serverLogLevel: str
    calcaulateVmaf: bool


@register_python_job()
def docker_compose_up(run_config: RunConfig):
    network_id = network_ids.get()
    print(f"{network_id=}")
    try:
        project_name = f"{int(time()*1000000)}_beta-emulator-quic"
        proc = subprocess.Popen(
            f"docker compose -f {CONFIG['headlessPlayer']['dockerCompose']} -p {project_name} up --abort-on-container-exit",
            shell=True,
            stderr=sys.stderr,
            stdout=sys.stdout,
            env={
                **{k: str(v) for k, v in run_config.items()},
                'NETWORK_ID': str(int(network_id)),
                'UID': str(os.getuid()),
                'SSLKEYLOGFILE': CONFIG['SSLKEYLOGFILE'],
                'DATASET_DIR': CONFIG['dataset']['datasetDir']
            }
        )
        proc.communicate()
        if proc.returncode != 0:
            raise Exception(
                f"Docker Compose returned non zero return code : {proc.returncode}")

    finally:
        network_ids.put(network_id)


class ExperimentRunner:
    log: Logger
    job_manager: JobManagerServer

    def __init__(self, app: Flask, state_manager: StateManager, job_manager: JobManagerServer):
        self.log = app.logger
        self.state_manager = state_manager
        self.job_manager = job_manager

    def make_run_id(self, dir_path):
        suffix = 1
        while Path(f"{dir_path}_{suffix:02d}").exists():
            suffix += 1
        new_path = f"{dir_path}_{suffix:02d}"
        os.makedirs(new_path, exist_ok=True)
        return os.path.basename(new_path), new_path

    def clear_containers(self):
        print("Stopping and removing all containers")
        container_ids = "docker container ls -aq -f ancestor=research_aioquic"
        running_containers = check_output(container_ids, shell=True).decode()
        if running_containers:
            try:
                check_call(
                    f"docker container stop $({container_ids})", shell=True)
                sleep(1)
            except:
                pass
            try:
                check_call(
                    f"docker container rm $({container_ids})", shell=True)
                sleep(1)
            except:
                pass

    def to_list_of_runs(self, runs_config: RunsConfig) -> List[RunConfig]:
        configs: List[RunConfig] = [{}]

        def multiply(run_configs, values: Iterable, prop):
            return [{**rc, prop: val} for val in values for rc in run_configs]

        configs = multiply(configs, runs_config['protocols'], 'protocol')
        configs = multiply(
            configs, runs_config['bufferSettings'], 'bufferSetting')
        configs = multiply(configs, runs_config['bwProfiles'], 'bwProfile')
        configs = multiply(configs, runs_config['codecs'], 'codec')
        configs = multiply(configs, runs_config['lengths'], 'length')
        configs = multiply(configs, runs_config['beta'], 'beta')
        configs = multiply(configs, runs_config['videos'], 'video')
        configs = multiply(configs, range(
            1, runs_config['repeat'] + 1), 'attempt')
        configs = multiply(configs, [runs_config['resultId']], 'resultId')
        configs = multiply(
            configs, [runs_config['serverLogLevel']], 'serverLogLevel')
        configs = multiply(
            configs, [runs_config['calculateVmaf']], 'calculateVmaf')
        configs = multiply(configs, runs_config.get(
            'serverImages', ['research_aioquic:latest']), 'serverImage')

        configs = list(
            filter(lambda c: c['beta'] or c['protocol'] != "quic", configs))

        for config in configs:
            config['runId'], config['runDir'] = self.make_run_id(
                f"{CONFIG['headlessPlayer']['resultsDir']}/{config['resultId']}"
                f"/run_{config['bwProfile']}_{config['bufferSetting']}_{config['codec']}_{config['video']}_{config['length']}sec_"
                f"{'beta' if config['beta'] else 'nonbeta'}_{config['protocol']}"
            )
            config['runId'] = config['resultId'] + "/" + config['runId']
            url = f"https://server:443/videos/{config['codec']}"
            if config['length'] == 2:
                url += "-2sec"
            url += f"/{config['video']}/output-beta.mpd"
            config['target'] = url

            config['bwProfile'] = {
                'drop': '/run/bw_always_400.txt',
                'drop-low': '/run/bw_always_low.txt'
            }.get(config['bwProfile'], '/run/bw_multi-drop.txt')

            config['env'] = f"/run/application-{config['bufferSetting']}-{config['protocol']}.yaml"

        return configs

    def schedule_runs(self, config: RunsConfig):
        run_configs = self.to_list_of_runs(config)
        self.log.info(f"Total runs = {len(run_configs)}")
        shuffle(run_configs)
        # pprint(run_configs)
        subprocess.call("docker container prune -f", shell=True)
        subprocess.call("docker network prune -f", shell=True)
        scheduled_runs = []
        for run_config in run_configs:
            with open(join(run_config['runDir'], 'config.json'), 'w') as f:
                f.write(json.dumps(run_config, indent=4))

            bw_profile_name = run_config['bwProfile'].split('/')[-1]
            env_name = run_config['env'].split('/')[-1]

            check_call(["cp", f"{CONFIG['headlessPlayer']['profilesDir']}/{bw_profile_name}",
                        f"{run_config['runDir']}/{bw_profile_name}"])
            check_call(["cp", f"{CONFIG['headlessPlayer']['envsDir']}/{env_name}",
                        f"{run_config['runDir']}/{env_name}"])
            check_call(["mkdir", join(run_config['runDir'], 'downloaded')])
            if config['serverLogLevel'] == 'debug':
                check_call(["mkdir", join(run_config['runDir'], 'server_log')])
            self.job_manager.schedule(PythonJob(
                config={
                    "callback": docker_compose_up.__name__,
                    "args": (run_config, ),
                    "kwargs": {},
                    "name": run_config['runId']
                }
            ))
            print(f"Scheduled {run_config['runId']}")
            scheduled_runs.append(run_config['runId'])
            sleep(0.5)

        return scheduled_runs
