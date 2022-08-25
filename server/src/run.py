import json
import logging
import os
import re
import shutil
from datetime import datetime
from functools import cached_property
from os.path import join
from pathlib import Path
from typing import Union, Optional, List

import pandas as pd
from exp_common.exp_events import ExpEvent_BwSwitch, ExpEvent_TcStat
from exp_common.exp_recorder import ExpReader
from typing_extensions import Self

from src.experiment_runner import RunConfig
from src.tc_stat import TcStat

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]
dataset_dir = CONFIG["headlessPlayer"]["datasetDir"]


class Run:
    log = logging.getLogger("Run")

    def __init__(self, run: Union[str, dict[str, str], Self], result: Optional[str] = None) -> None:
        self.run: str = None
        self.result: str = None
        self.start_time = 0
        if result is None and run is not None:
            if isinstance(run, dict):
                self.run = run["run"]
                self.result = run["result"]
            elif isinstance(run, str):
                arr = run.split("/")
                self.run: str = arr[1]
                self.result: str = arr[0]
            elif isinstance(run, self.__class__):
                self.run = run.run
                self.result = run.result
        elif result is not None and run is not None:
            self.run: str = run
            self.result: str = result

        if self.run is None or self.result is None:
            raise Exception(f"Cannot parse Run run={run}, result={result}")

    def __str__(self) -> str:
        return f"{self.result}/{self.run}"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Run) and self.run == other.run and self.result == other.result

    @cached_property
    def details(self):
        json_file = join(results_dir, self.result, self.run, "data-1.json")
        with open(json_file) as f:
            return json.load(f)

    @cached_property
    def run_config(self) -> RunConfig:
        run_config_file = join(results_dir, self.result, self.run, "config.json")
        with open(run_config_file) as f:
            return json.load(f)

    @cached_property
    def segments_df(self):
        df = pd.DataFrame(self.details["segments"])
        df.set_index('index', inplace=True)
        df["duration"] = df["end"] - df["first_byte_at"]
        df["pending_duration"] = df["last_byte_at"] - df["end"]
        df["first_byte_delay"] = df["first_byte_at"] - df["start"]
        return df

    @cached_property
    def events(self):
        event_log_file = join(results_dir, self.result, self.run, "event_logs.txt")
        log_reader = ExpReader(event_log_file)
        events = list(log_reader.read_events())
        start_time = None
        for event in events:
            if event.type == "PLAYBACK_START":
                start_time = event.time
        if start_time is None:
            raise Exception("PLAYBACK_START time not found")
        for event in events:
            event.time_rel = event.time - start_time
        self.start_time = start_time
        return events

    @cached_property
    def bw_drop_time(self):
        for ev in self.events:
            if isinstance(ev, ExpEvent_BwSwitch) and int(ev.bw) < 1000:
                return ev.time_rel / 1000
        else:
            raise Exception("Failed to find drop time")

    @property
    def tc_stats(self) -> List[TcStat]:
        # Trigger reading of event_logs.txt. It sets self.start_time
        self.events
        event_log_file = join(results_dir, self.result, self.run, "event_logs_tc.txt")
        tc_stat_logs = ExpReader(event_log_file)
        max_time = 120 * 1000
        i = 0
        for event in tc_stat_logs.read_events():
            if isinstance(event, ExpEvent_TcStat):
                event.time_rel = int(event.time) - self.start_time
                yield TcStat(event)
                if event.time_rel >= max_time:
                    break

    @property
    def bandwidth_actual(self) -> List[ExpEvent_BwSwitch]:
        return [ev for ev in self.events if isinstance(ev, ExpEvent_BwSwitch)]

    @cached_property
    def run_dir(self):
        return join(results_dir, self.result, self.run)

    @cached_property
    def downloads_dir(self):
        return join(self.run_dir, 'downloaded')

    @cached_property
    def segments_dir(self):
        return join(self.run_dir, 'downloaded', 'segments')

    @cached_property
    def vmaf_dir(self):
        path = join(self.run_dir, 'vmaf')
        Path(path).mkdir(exist_ok=True)
        return path

    @cached_property
    def original_video_dir(self):
        path = join(dataset_dir, 'videos', self.run_config['codec'])
        if self.run_config['length'] == 2:
            path += "-2sec"
        path = join(path, self.run_config['video'])
        return path

    def json(self):
        return {
            "runId": f"{self.result}/{self.run}",
            "run_config": self.run_config,
            **self.details,
            "tc_stats": [tc_stat.json() for tc_stat in self.tc_stats],
            "bandwidth_actual": [{
                "time": ev.time_rel / 1000,
                "bw": ev.bw,
                "latency": ev.latency,
                "drop": ev.drop,
            } for ev in self.bandwidth_actual]
        }

    def delete(self):
        try:
            shutil.rmtree(Path(f"{results_dir}/{self.result}/{self.run}"))
            if len(list(
                    filter(lambda f: not str(f).endswith("events.txt"),
                           os.listdir(Path(f"{results_dir}/{self.result}")))
            )) == 0:
                shutil.rmtree(Path(f"{results_dir}/{self.result}"))
        except Exception as e:
            print(f"Failed to delete {self}")
            raise e

    def get_logs(self):
        logs = []
        log_file = join(results_dir, self.result, self.run, "player_logs.txt")
        p = re.compile('^(\d\d\d\d\-\d\d\-\d\d \d\d:\d\d:\d\d,\d\d\d)\s+(\w+)\s+(INFO|DEBUG|ERROR):(.+)$')

        time = 0
        tags = []
        type = "INFO"

        ev_playback_start = self.get_events("PLAYBACK_START")
        if len(ev_playback_start) > 0:
            time_start = ev_playback_start[0]["time"]
        else:
            time_start = 0

        with open(log_file) as f:
            for line in f:
                m = p.match(line)
                if m:
                    time_abs = datetime.strptime(m.group(1), '%Y-%m-%d %H:%M:%S,%f').timestamp() * 1000
                    if time_start == 0:
                        time_start = time_abs
                    time = (time_abs - time_start) / 1000
                    tags = [m.group(2)]
                    type = m.group(3)
                    text = m.group(4)
                else:
                    text = line
                logs.append({
                    "time": time,
                    "tags": tags,
                    "type": type,
                    "text": text
                })

        return {
            "time_start": time_start / 1000,
            "logs": logs
        }
