import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from os.path import join
from pathlib import Path
from pprint import pprint
from random import shuffle
from subprocess import check_call, check_output
from time import sleep
from typing import List, TypedDict, Iterable

from src.state_manager import StateManager

BASE_DIR = Path(os.path.dirname(os.path.realpath(__file__)) + "../../../../").resolve()
print(BASE_DIR)


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


class ExperimentRunner:
    def __init__(self, app, state_manager: StateManager):
        self.log = app.logger
        self.state_manager = state_manager
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.executor_stats = {
            'scheduled': 0,
            'running': 0,
            'cancelled': 0,
            'failed': 0,
            'successful': 0,
        }
        self.state_manager.state_updated('executor_stats', self.executor_stats, broadcast=True)
        self.available_network_ids = [i for i in range(1, 255)]

    def process_done(self, f):
        self.executor_stats['running'] -= 1
        if f.cancelled():
            self.executor_stats['cancelled'] += 1
        elif f.exception():
            self.executor_stats['failed'] += 1
            self.log.error(f.exception())
        else:
            self.executor_stats['successful'] += 1
        self.executor_stats_updated()

    def executor_stats_updated(self):
        print(f"Process Pool Stats: "
              f"scheduled={self.executor_stats['scheduled']}, "
              f"running={self.executor_stats['running']}, "
              f"cancelled={self.executor_stats['cancelled']}, "
              f"failed={self.executor_stats['failed']}, "
              f"successful={self.executor_stats['successful']}")
        self.state_manager.state_updated('executor_stats', self.executor_stats, broadcast=True)

    def alloc_network_id(self):
        while len(self.available_network_ids) == 0:
            sleep(0.5)
        return self.available_network_ids.pop(0)

    def free_network_id(self, id: int):
        self.available_network_ids.append(id)

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
                check_call(f"docker container stop $({container_ids})", shell=True)
                sleep(1)
            except:
                pass
            try:
                check_call(f"docker container rm $({container_ids})", shell=True)
                sleep(1)
            except:
                pass

    def to_list_of_runs(self, runs_config: RunsConfig) -> List[RunConfig]:
        configs: List[RunConfig] = [{}]

        def multiply(run_configs, values: Iterable, prop):
            return [{**rc, prop: val} for val in values for rc in run_configs]

        configs = multiply(configs, runs_config['protocols'], 'protocol')
        configs = multiply(configs, runs_config['bufferSettings'], 'bufferSetting')
        configs = multiply(configs, runs_config['bwProfiles'], 'bwProfile')
        configs = multiply(configs, runs_config['codecs'], 'codec')
        configs = multiply(configs, runs_config['lengths'], 'length')
        configs = multiply(configs, runs_config['beta'], 'beta')
        configs = multiply(configs, runs_config['videos'], 'video')
        configs = multiply(configs, range(1, runs_config['repeat'] + 1), 'attempt')
        configs = multiply(configs, [runs_config['resultId']], 'resultId')
        configs = multiply(configs, [runs_config['serverLogLevel']], 'serverLogLevel')
        configs = multiply(configs, runs_config.get('serverImages', ['research_aioquic:latest']), 'serverImage')

        configs = list(filter(lambda c: c['beta'] or c['protocol'] != "quic", configs))

        for config in configs:
            config['runId'], config['runDir'] = self.make_run_id(
                f"{BASE_DIR}/runs/{config['resultId']}"
                f"/run_{config['bwProfile']}_{config['bufferSetting']}_{config['codec']}_{config['video']}_{config['length']}sec_"
                f"{'beta' if config['beta'] else 'nonbeta'}_{config['protocol']}"
            )
            config['runId'] = config['resultId'] + "/" + config['runId']
            url = f"https://server:443/videos/{config['codec']}"
            if config['length'] == 2:
                url += "-2sec"
            url += f"/{config['video']}/output.mpd"
            config['target'] = url

            config['bwProfile'] = {
                'drop': '/run/bw_always_400.txt',
                'drop-low': '/run/bw_always_low.txt'
            }.get(config['bwProfile'], '/run/bw_multi-drop.txt')

            config['env'] = f"/run/application-{config['bufferSetting']}-{config['protocol']}.yaml"

        return configs

    def docker_compose_up(self, run_config: RunConfig):
        self.executor_stats['scheduled'] -= 1
        self.executor_stats['running'] += 1
        self.executor_stats_updated()
        network_id = self.alloc_network_id()
        try:
            check_call(
                f"/usr/local/bin/docker-compose -f {BASE_DIR}/beta-emulator-quic/docker-compose.yml -p {run_config['runId']} up --abort-on-container-exit",
                shell=True,
                stderr=sys.stdout,
                stdout=subprocess.DEVNULL,
                env={
                    **{k: str(v) for k, v in run_config.items()},
                    'BASE_DIR': BASE_DIR,
                    'NETWORK_ID': str(int(network_id)),
                    'UID': str(os.getuid())
                }
            )
            print(f"Experiment successful : {run_config['runId']}")
        finally:
            self.free_network_id(network_id)

    def schedule_runs(self, config: RunsConfig):
        run_configs = self.to_list_of_runs(config)
        self.log.info(f"Total runs = {len(run_configs)}")
        shuffle(run_configs)
        pprint(run_configs)
        subprocess.call("docker container prune -f", shell=True)
        subprocess.call("docker network prune -f", shell=True)
        scheduled_runs = []
        for run_config in run_configs:
            with open(join(run_config['runDir'], 'config.json'), 'w') as f:
                f.write(json.dumps(run_config, indent=4))

            bw_profile_name = run_config['bwProfile'].split('/')[-1]
            env_name = run_config['env'].split('/')[-1]

            check_call(["cp", f"{BASE_DIR}/beta/scripts/expr/bandwidth/{bw_profile_name}",
                        f"{run_config['runDir']}/{bw_profile_name}"])
            check_call(["cp", f"{BASE_DIR}/beta-emulator-quic/dash_emulator_quic/resources/{env_name}",
                        f"{run_config['runDir']}/{env_name}"])
            check_call(["mkdir", join(run_config['runDir'], 'downloaded')])
            if config['serverLogLevel'] == 'debug':
                check_call(["mkdir", join(run_config['runDir'], 'server_log')])
            self.executor_stats['scheduled'] += 1
            self.executor_stats_updated()
            f = self.executor.submit(self.docker_compose_up, run_config)
            f.add_done_callback(self.process_done)
            scheduled_runs.append(run_config['runId'])
            sleep(0.5)

        return scheduled_runs
