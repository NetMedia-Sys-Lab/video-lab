import json
from logging import Logger
import os
from queue import Queue
import subprocess
import sys
from os.path import join
from pprint import pprint
from random import shuffle
from subprocess import check_call, check_output
from time import sleep, time
from typing import List, TypedDict
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
    result_id: str
    # num_workers: int
    runs: List[dict]


# class OldRunsConfig(TypedDict):
#     resultId: str               # ROOT
#     numWorkers: int             # ROOT
#     videos: List[str]           # configs[i] > input
#     beta: List[bool]            # configs[i] > mod_beta
#     codecs: List[str]           # configs[i] > input
#     protocols: List[str]        # configs[i] > mod_downloader
#     lengths: List[int]          # configs[i] > input
#     bufferSettings: List[str]   # configs[i] > buffer_duration, safe_buffer_level, panic_buffer_level, min_rebuffer_duration, min_start_duration
#     abr: List[str]              # configs[i] > mod_abr
#     bwProfiles: List[str]       # configs[i] > mod_network
#     repeat: int                 # N/A (repeated config for repeats)
#     serverImages: List[str]     # configs[i] > serverImage
#     serverLogLevel: str         # configs[i] > serverLogLevel
#     extra: dict[str, List[str]] # N/A (All extra configs in separate configs)

# class RunConfig(TypedDict):
#     resultId: str
#     runId: str
#     runDir: str
#     video: str
#     beta: bool
#     codec: str
#     protocol: str
#     length: int
#     bufferSetting: str
#     bwProfile: str
#     abr: str
#     attempt: int
#     target: str
#     env: str
#     serverImage: str
#     serverLogLevel: str
#     calcaulateVmaf: bool


@register_python_job()
def docker_compose_up(run_config: dict):
    network_id = network_ids.get()
    # sleep(1)
    env = {
        **{k: str(v) for k, v in run_config.items()},
        "NETWORK_ID": str(int(network_id)),
        "UID": str(os.getuid()),
        "SSLKEYLOGFILE": CONFIG["SSLKEYLOGFILE"],
        "DATASET_DIR": CONFIG["dataset"]["datasetDir"],
    }
    print(json.dumps(env, indent=4))
    project_name = f"istream_player_{round(time() * 1000)}"
    try:
        proc = subprocess.Popen(
            f"docker compose -f {CONFIG['headlessPlayer']['dockerCompose']} -p {project_name} up --abort-on-container-exit",
            shell=True,
            stderr=sys.stderr,
            stdout=sys.stdout,
            env=env,
        )
        proc.communicate()
        if proc.returncode != 0:
            raise Exception(f"Docker Compose returned non zero return code : {proc.returncode}")

    finally:
        print("Removing container")
        subprocess.check_call(
            f"docker compose -f {CONFIG['headlessPlayer']['dockerCompose']} -p {project_name} rm -f -s",
            shell=True,
            stderr=sys.stderr,
            stdout=sys.stdout,
            env=env,
        )
        subprocess.check_call(f"docker network rm {project_name}_default", shell=True)
        sleep(1)
        network_ids.put(network_id)


class ExperimentRunner:
    log: Logger
    job_manager: JobManagerServer

    def __init__(self, app: Flask, state_manager: StateManager, job_manager: JobManagerServer):
        self.log = app.logger
        self.state_manager = state_manager
        self.job_manager = job_manager

    def clear_containers(self):
        print("Stopping and removing all containers")
        container_ids = "docker container ls -aq -f ancestor=research_aioquic"
        running_containers = check_output(container_ids, shell=True).decode()
        if running_containers:
            try:
                check_call(f"docker container stop $({container_ids})", shell=True)
                sleep(1)
            finally:
                pass
            try:
                check_call(f"docker container rm $({container_ids})", shell=True)
                sleep(1)
            finally:
                pass

    # def to_list_of_runs(self, runs_config: RunsConfig) -> List[RunConfig]:
    #     configs: Any = [{}]

    #     def multiply(run_configs, values: Iterable, prop):
    #         return [{**rc, prop: val} for val in values for rc in run_configs]

    #     configs = multiply(configs, runs_config['protocols'], 'protocol')
    #     configs = multiply(
    #         configs, runs_config['bufferSettings'], 'bufferSetting')
    #     configs = multiply(configs, runs_config['bwProfiles'], 'bwProfile')
    #     configs = multiply(configs, runs_config['abr'], 'abr')
    #     configs = multiply(configs, runs_config['codecs'], 'codec')
    #     configs = multiply(configs, runs_config['lengths'], 'length')
    #     configs = multiply(configs, runs_config['beta'], 'beta')
    #     configs = multiply(configs, runs_config['videos'], 'video')
    #     configs = multiply(configs, range(1, runs_config['repeat'] + 1), 'attempt')
    #     configs = multiply(configs, [runs_config['resultId']], 'resultId')
    #     configs = multiply(configs, [runs_config['serverLogLevel']], 'serverLogLevel')
    #     configs = multiply(configs, [runs_config['calculateVmaf']], 'calculateVmaf')
    #     configs = multiply(configs, runs_config.get('serverImages', ['server_aioquic:latest']), 'serverImage')

    #     for prop, vals in runs_config.get('extra', {}).items():
    #         configs = multiply(configs, vals, prop)

    #     configs = list(
    #         filter(lambda c: c['beta'] or c['protocol'] != "quic", configs))

    #     for config in configs:
    #         config['length'] = int(config['length'])
    #         config['runId'], config['runDir'] = self.make_run_id(
    #             f"{CONFIG['headlessPlayer']['resultsDir']}/{config['resultId']}"
    #             f"/run_{config['bwProfile']}_{config['bufferSetting']}_{config['abr']}_{config['codec']}_{config['video']}_{config['length']}sec_"
    #             f"{'beta' if config['beta'] else 'nonbeta'}_{config['protocol']}"
    #         )
    #         config['runId'] = config['resultId'] + "/" + config['runId']
    #         url = f"https://server:443/videos/{config['codec']}"
    #         url += f"-{config['length']}sec"
    #         url += f"/{config['video']}/output-beta.mpd"
    #         config['target'] = url

    #         config['bwProfile'] = {
    #             'drop': '/run/bw_always_400.txt',
    #             'drop-low': '/run/bw_always_low.txt'
    #         }.get(config['bwProfile'], '/run/bw_multi-drop.txt')

    #         config['env'] = f"/run/application-{config['bufferSetting']}-{config['protocol']}.yaml"

    #     return configs

    def schedule_runs(self, config: RunsConfig):
        self.log.info(f"Total runs = {len(config['runs'])}")
        shuffle(config["runs"])
        pprint(config)

        subprocess.call("docker container prune -f", shell=True)
        subprocess.call("docker network prune -f", shell=True)
        scheduled_runs = []

        for run in config["runs"]:
            run["run_dir"] = run_dir = join(CONFIG["headlessPlayer"]["resultsDir"], config["result_id"], run["run_id"])
            if not run["input"].startswith("http"):
                run["input"] = f"https://server:443/{run['input']}"
            os.makedirs(run_dir, exist_ok=True)
            with open(join(run_dir, "config.json"), "w") as f:
                f.write(json.dumps(run, indent=4))

            os.makedirs(join(run_dir, "server_log"), exist_ok=True)

            self.job_manager.schedule(
                PythonJob(config={
                        "callback": docker_compose_up.__name__,
                        "args": (run,),
                        "kwargs": {},
                        "name": run["run_id"],
                    })
            )
            print(f"Scheduled {run['run_id']}")
            scheduled_runs.append(run["run_id"])
            sleep(0.01)

        return scheduled_runs
