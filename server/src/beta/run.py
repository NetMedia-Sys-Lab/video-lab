import inspect
import json
import logging
import os
from pprint import pprint
import re
import shutil
from datetime import datetime
from functools import cache, cached_property
from inspect import FrameInfo
from os.path import join
from pathlib import Path
from subprocess import check_output
from typing import List, Optional, Union

import numpy as np
import pandas as pd
from istream_player.modules.analyzer.exp_events import ExpEvent_BwSwitch, ExpEvent_TcStat
from istream_player.modules.analyzer.exp_recorder import ExpReader
from typing_extensions import Self

# from src.beta.experiment_runner import RunConfig
from src.beta.tc_stat import TcStat

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]
dataset_dir = CONFIG["dataset"]["datasetDir"]


@cache
def get_run(run_id: str):
    print(f"Cache miss .. creating new run : {run_id}")
    return Run(run_id)


def run_if_mod(file_paths: List[str]):
    def decorator(func):
        func.cache_mod = [0] * len(file_paths)
        func.cache_val = None
        func.has_run = False

        def wrapper(*args, **kwargs):
            should_run = not func.has_run
            if not should_run:
                for i, file_path in enumerate(file_paths):
                    last_mod = func.cache_mod[i]
                    curr_mod = os.path.getmtime(file_path) if os.path.exists(file_path) else 0
                    if curr_mod > last_mod:
                        should_run = True
                        break
            if should_run:
                ret = func(*args, **kwargs)
                func.has_run = True
                for i, file_path in enumerate(file_paths):
                    func.cache_mod[i] = os.path.getmtime(file_path) if os.path.exists(file_path) else 0
                func.cache_val = ret
                return ret
            else:
                return func.cache_val

        return wrapper

    return decorator


class Run:
    log = logging.getLogger("Run")
    run: str
    result: str

    start_time: int

    def __init__(self, run_id: str) -> None:
        arr = run_id.split("/")
        self.run: str = arr[1]
        self.result: str = arr[0]

    def __str__(self) -> str:
        return f"{self.result}/{self.run}"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Run) and self.run == other.run and self.result == other.result

    @property
    def details(self):
        json_file = join(results_dir, self.result, self.run, "data-1.json")

        @run_if_mod([json_file])
        def result():
            with open(json_file) as f:
                return json.load(f)

        return result()

    @property
    def run_config(self):
        run_config_file = join(results_dir, self.result, self.run, "config.json")

        @run_if_mod([run_config_file])
        def result():
            with open(run_config_file) as f:
                return json.load(f)

        return result()

    @property
    def segments_df(self):
        df = pd.DataFrame(self.details["segments"])
        df.set_index("index", inplace=True)
        df["duration"] = df["stop_time"] - df["first_byte_at"]
        df["pending_duration"] = df["last_byte_at"] - df["stop_time"]
        df["first_byte_delay"] = df["first_byte_at"] - df["start_time"]
        return df

    @property
    def events(self):
        event_log_file = join(results_dir, self.result, self.run, "event_logs.txt")

        @run_if_mod([event_log_file])
        def result():
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

        return result()

    @property
    def tc_stats(self) -> List[TcStat]:
        # Trigger reading of event_logs.txt. It sets self.start_time
        self.events
        event_log_file = join(results_dir, self.result, self.run, "event_logs_tc.txt")

        @run_if_mod([event_log_file])
        def result():
            tc_stats = []
            tc_stat_logs = ExpReader(event_log_file)
            max_time = 120 * 1000
            i = 0
            try:
                for event in tc_stat_logs.read_events():
                    if isinstance(event, ExpEvent_TcStat):
                        event.time_rel = int(event.time) - self.start_time
                        tc_stats.append(TcStat(event))
                        if event.time_rel >= max_time:
                            break
            except FileNotFoundError:
                self.log.warn("TC_Stats file not found")
            return tc_stats

        return result()

    @property
    def bandwidth_actual(self) -> List[ExpEvent_BwSwitch]:
        return [ev for ev in self.events if isinstance(ev, ExpEvent_BwSwitch)]

    @property
    def vmaf(self):
        vmaf_files = []
        for index in self.segments_df.index:
            quality = self.segments_df["quality"][index]
            vmaf_files.append(join(self.vmaf_dir, f"vmaf-stream{quality}-{index+1:05d}.json"))

        @run_if_mod(vmaf_files)
        def result():
            vmafs = []
            for vmaf_file in vmaf_files:
                try:
                    with open(vmaf_file) as f:
                        vmaf = json.load(f)
                        vmafs.append(vmaf["pooled_metrics"]["vmaf"]["mean"])
                except Exception:
                    vmafs.append(0)
            return {"segments": vmafs, "mean": np.mean(list(filter(bool, vmafs)) or [0])}

        return result()

    @property
    def micro_stalls(self):
        stall_files = []
        for index in self.segments_df.index:
            quality = self.segments_df["quality"][index]
            stall_files.append(join(self.frames_dir, f"frames-stream{quality}-{index+1:05d}.json"))

        @run_if_mod(stall_files)
        def result():
            stalls = []
            for output_file in stall_files:
                if not os.path.exists(output_file):
                    print(f"{output_file} does not exist")
                    stalls.append(
                        {
                            "play_duration": 0,
                            "stall_duration": 0,
                            "frames_received": 0,
                        }
                    )
                else:
                    with open(output_file) as f:
                        stall = json.load(f)
                        play_duration = 0
                        for frame in stall["frames"]:
                            play_duration += float(frame["pkt_duration_time"])
                        stall_duration = int(self.run_config["length"]) - play_duration
                        frames_received = len(stall["frames"])

                        stalls.append(
                            {
                                "play_duration": round(play_duration, 3),
                                "stall_duration": round(stall_duration, 3),
                                "frames_received": frames_received,
                            }
                        )

            long_stall_duration = sum(map(lambda stall: stall["stall_duration"] if stall["stall_duration"] > 0.43 else 0, stalls))
            total_stall_duration = sum(map(lambda stall: stall["stall_duration"], stalls))
            return {
                "total_stall_duration": total_stall_duration,
                "long_stall_duration": long_stall_duration,
                "total_play_duration": sum(map(lambda stall: stall["play_duration"], stalls)),
                "segments": stalls,
            }

        return result()

    @cached_property
    def run_dir(self):
        return join(results_dir, self.result, self.run)

    @cached_property
    def downloads_dir(self):
        return join(self.run_dir, "downloaded")

    @cached_property
    def segments_dir(self):
        return join(self.run_dir, "downloaded", "segments")

    @cached_property
    def vmaf_dir(self):
        path = join(self.run_dir, "vmaf")
        Path(path).mkdir(exist_ok=True)
        return path

    @cached_property
    def frames_dir(self):
        path = join(self.run_dir, "frames")
        Path(path).mkdir(exist_ok=True)
        return path

    @cached_property
    def original_video_dir(self):
        path = join(dataset_dir, "videos", self.run_config["codec"])
        path += f"-{self.run_config['length']}sec"
        path = join(path, self.run_config["video"])
        return path

    def json(self):
        return {
            "runId": f"{self.result}/{self.run}",
            "run_config": self.run_config,
            **self.details,
            "tc_stats": [tc_stat.json() for tc_stat in self.tc_stats],
            "playback_start_time": self.start_time/1000,
            "bandwidth_actual": [
                {
                    "time": ev.time_rel / 1000,
                    "bw": ev.bw,
                    "latency": ev.latency,
                    "drop": ev.drop,
                }
                for ev in self.bandwidth_actual
            ],
            "vmaf": self.vmaf,
            "micro_stalls": self.micro_stalls,
        }

    def delete(self):
        try:
            shutil.rmtree(Path(f"{results_dir}/{self.result}/{self.run}"))
            if (
                len(list(filter(lambda f: not str(f).endswith("events.txt"), os.listdir(Path(f"{results_dir}/{self.result}")))))
                == 0
            ):
                shutil.rmtree(Path(f"{results_dir}/{self.result}"))
        except Exception as e:
            print(f"Failed to delete {self}")
            raise e

    # def get_logs(self):
    #     logs = []
    #     log_file = join(results_dir, self.result, self.run, "player_logs.txt")
    #     p = re.compile(
    #         '^(\d\d\d\d\-\d\d\-\d\d \d\d:\d\d:\d\d,\d\d\d)\s+(\w+)\s+(INFO|DEBUG|ERROR):(.+)$')

    #     time = 0
    #     tags = []
    #     type = "INFO"

    #     ev_playback_start = self.get_events("PLAYBACK_START")
    #     if len(ev_playback_start) > 0:
    #         time_start = ev_playback_start[0]["time"]
    #     else:
    #         time_start = 0

    #     with open(log_file) as f:
    #         for line in f:
    #             m = p.match(line)
    #             if m:
    #                 time_abs = datetime.strptime(
    #                     m.group(1), '%Y-%m-%d %H:%M:%S,%f').timestamp() * 1000
    #                 if time_start == 0:
    #                     time_start = time_abs
    #                 time = (time_abs - time_start) / 1000
    #                 tags = [m.group(2)]
    #                 type = m.group(3)
    #                 text = m.group(4)
    #             else:
    #                 text = line
    #             logs.append({
    #                 "time": time,
    #                 "tags": tags,
    #                 "type": type,
    #                 "text": text
    #             })

    #     return {
    #         "time_start": time_start / 1000,
    #         "logs": logs
    #     }
