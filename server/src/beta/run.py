import json
import logging
import os
import re
import shutil
from functools import cache, cached_property
from os.path import join, basename, dirname
from pathlib import Path
from typing import List, TypedDict
from urllib.parse import urlparse

import pandas as pd
from istream_player.modules.analyzer.exp_events import ExpEvent_BwSwitch, ExpEvent_TcStat
from istream_player.modules.analyzer.exp_recorder import ExpReader

# from src.beta.experiment_runner import RunConfig
from src.beta.tc_stat import TcStat

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]
dataset_dir = CONFIG["dataset"]["datasetDir"]


class RunSegment(TypedDict):
    index: int
    url: str
    repr_id: int
    adap_set_id: int
    bitrate: int
    duration: float
    init_url: str
    start_time: float
    stop_time: float
    first_byte_at: float
    last_byte_at: float
    quality: int
    segment_throughput: float
    adaptation_throughput: float
    total_bytes: int
    received_bytes: int
    stopped_bytes: int


class RunDetails(TypedDict):
    segments: List[RunSegment]
    stalls: List
    num_stall: int
    dur_stall: float
    startup_delay: float
    avg_bitrate: int
    num_quality_switches: int
    states: List
    bandwidth_estimate: List
    buffer_level: List


class RunConfig(TypedDict):
    run_id: str
    input: str
    server_image: str
    live_log: str
    run_dir: str


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

    def details(self) -> RunDetails:
        json_file = join(results_dir, self.result, self.run, "data-1.json")
        with open(json_file) as f:
            return json.load(f)

    def run_config(self) -> RunConfig:
        run_config_file = join(results_dir, self.result, self.run, "config.json")

        with open(run_config_file) as f:
            return json.load(f)

    def total_duration(self) -> float:
        return sum(seg["duration"] for seg in self.details()["segments"])

    def raw_video_path(self):
        DATASET_BASE = join(CONFIG["dataset"]["datasetDir"], "videos-raw", "full")
        RAW_VID = {
            "bbb": join(DATASET_BASE, "big_buck_bunny_1080p24.y4m"),
            "burn": join(DATASET_BASE, "controlled_burn_1080p.y4m"),
            "elephant": join(DATASET_BASE, "elephants_dream_1080p24.y4m"),
            "kristen": join(DATASET_BASE, "KristenAndSara_1280x720_60.y4m"),
            "sintel": join(DATASET_BASE, "sintel_1080p24.y4m"),
            "sintrail": join(DATASET_BASE, "sintel_trailer_1080p24.y4m"),
            "tos": join(DATASET_BASE, "tearsofsteel_1080p24.y4m"),
            "football": join(DATASET_BASE, "touchdown_pass_1080p.y4m"),
        }
        video_dir = self.run_config()["input"].rsplit(os.path.sep, 2)[-2]
        name = re.search(r"^[a-z]+", video_dir)
        assert name is not None, f"Cannot find video name from: {video_dir}"
        assert name.group() in RAW_VID, f"Cannot find video with name: {name.group()}"
        return RAW_VID[name.group()], 24

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

    def tc_stats(self) -> List[TcStat]:
        # Trigger reading of event_logs.txt. It sets self.start_time
        self.events()
        event_log_file = join(results_dir, self.result, self.run, "event_logs_tc.txt")

        tc_stats = []
        tc_stat_logs = ExpReader(event_log_file)
        max_time = 180 * 1000  # 180 seconds
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

    def bandwidth_actual(self) -> List[ExpEvent_BwSwitch]:
        return [ev for ev in self.events() if isinstance(ev, ExpEvent_BwSwitch)]

    def vmaf(self):
        vmaf_file = join(self.run_dir, "vmaf.json")
        try:
            with open(vmaf_file) as f:
                return json.load(f)
        except Exception:
            return None

    # def micro_stalls(self):
    #     stall_files = []
    #     for index in self.segments_df.index:
    #         filename: str = basename(urlparse(self.segments_df["url"][index]).path)
    #         stall_files.append(join(self.frames_dir, f"{splitext(filename)[0]}.json"))

    #     @run_if_mod(stall_files)
    #     def result():
    #         stalls = []
    #         for output_file in stall_files:
    #             if not os.path.exists(output_file):
    #                 print(f"{output_file} does not exist")
    #                 stalls.append(
    #                     {
    #                         "play_duration": 0,
    #                         "stall_duration": 0,
    #                         "frames_received": 0,
    #                     }
    #                 )
    #             else:
    #                 with open(output_file) as f:
    #                     stall = json.load(f)
    #                     play_duration = 0
    #                     for frame in stall["frames"]:
    #                         play_duration += float(frame["pkt_duration_time"])
    #                     stall_duration = int(self.run_config()["length"]) - play_duration
    #                     frames_received = len(stall["frames"])

    #                     stalls.append(
    #                         {
    #                             "play_duration": round(play_duration, 3),
    #                             "stall_duration": round(stall_duration, 3),
    #                             "frames_received": frames_received,
    #                         }
    #                     )

    #         long_stall_duration = sum(map(lambda stall: stall["stall_duration"] if stall["stall_duration"] > 0.43 else 0, stalls))
    #         total_stall_duration = sum(map(lambda stall: stall["stall_duration"], stalls))
    #         return {
    #             "total_stall_duration": total_stall_duration,
    #             "long_stall_duration": long_stall_duration,
    #             "total_play_duration": sum(map(lambda stall: stall["play_duration"], stalls)),
    #             "segments": stalls,
    #         }

    #     return result()

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
        vmaf_path = join(self.run_dir, "vmaf")
        Path(vmaf_path).mkdir(exist_ok=True)
        return vmaf_path

    @cached_property
    def frames_dir(self):
        frames_path = join(self.run_dir, "frames")
        print(f"{frames_path=}")
        Path(frames_path).mkdir(exist_ok=True)
        return frames_path

    @cached_property
    def original_video_dir(self):
        # path = join(dataset_dir, "videos", self.run_config["codec"])
        # path += f"-{self.run_config['length']}sec"
        # path = join(path, self.run_config["video"])
        print(f"{dataset_dir=}", dirname(urlparse(self.run_config()["input"]).path).lstrip(os.path.sep))
        return join(dataset_dir, dirname(urlparse(self.run_config()["input"]).path).lstrip(os.path.sep))

    def get_segment_details(self, seg_path: str) -> RunSegment:
        for segment in self.details()["segments"]:
            if basename(urlparse(segment["url"]).path) == seg_path:
                return segment
        raise Exception(f"Segment not found for {seg_path}")

    def json(self):
        return {
            "runId": f"{self.result}/{self.run}",
            "run_config": self.run_config(),
            **self.details(),
            "tc_stats": [tc_stat.json() for tc_stat in self.tc_stats()],
            "playback_start_time": self.start_time / 1000,
            "bandwidth_actual": [
                {
                    "time": ev.time_rel / 1000,
                    "bw": ev.bw,
                    "latency": ev.latency,
                    "drop": ev.drop,
                }
                for ev in self.bandwidth_actual()
            ],
            "vmaf": self.vmaf(),
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
