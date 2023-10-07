import json
from logging import Logger
import os
from queue import Queue
import shutil
import subprocess
import sys
from os.path import join
from random import shuffle
from subprocess import check_call, check_output
from time import sleep, time
from typing import Dict, List
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
        "MY_UID": str(os.getuid()),
        "MY_GID": str(os.getgid()),
        "COMPOSE_STATUS_STDOUT": "1"
    }
    print(json.dumps(env, indent=4))
    project_name = f"{round(time() * 10000)}"
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

    def schedule_runs(self, configs: List[Dict]):
        self.log.info(f"Total runs = {len(configs)}")
        shuffle(configs)

        subprocess.call("docker container prune -f", shell=True)
        subprocess.call("docker network prune -f", shell=True)
        scheduled_runs = []

        for run in configs:
            run["run_dir"] = run_dir = join(CONFIG["headlessPlayer"]["resultsDir"], run["run_id"])
            if not run["input"].startswith("http"):
                run["input"] = f"https://server:443/{run['input']}"
            
            # Delete any previous run with same ID (Rerun)
            if os.path.exists(run_dir):
                shutil.rmtree(run_dir)

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
