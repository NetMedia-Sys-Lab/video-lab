import asyncio
import base64
from functools import cache
import hashlib
import json
import os
from pprint import pprint
import re
from threading import Lock
import subprocess
import sys
import time
from os.path import join, exists, basename, normpath, splitext
from pathlib import Path
from typing import Dict, Generator, List, Optional, Tuple, TypeVar

from fs.tempfs import TempFS
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import register_python_job

from src.job_framework.jobs.job_docker import DockerJob
from src.beta.run import Run, get_run
from src.util.ffmpeg import Ffmpeg
from src.util.ffmpeg_compose import FfmpegCompose

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


mutex_enc = Lock()
mutex_vmaf = Lock()
mutex_frames = Lock()

U = TypeVar("U")


def not_none(inst: Optional[U]) -> U:
    """Not-none helper"""
    assert inst is not None
    return inst


def read_bytes(filepath: str) -> bytes:
    with open(filepath, "rb") as f:
        return f.read()


@cache
def md5(path, chunk_size=65536):
    # pts = time.process_time()
    # ats = time.time()
    m = hashlib.md5()
    with open(path, "rb") as f:
        b = f.read(chunk_size)
        while len(b) > 0:
            m.update(b)
            b = f.read(chunk_size)
    return m.hexdigest()


class Codec:
    run: Run

    def __init__(self, run: Run):
        self.run = run
        pass

    def get_quality_and_index(self, seg_path) -> Tuple[int, int] | Tuple[None, None]:
        filename = basename(splitext(seg_path)[0])
        nums = re.findall(r"\d+", filename)
        if len(nums) >= 2:
            return int(nums[-2]), int(nums[-1])
        elif len(nums) == 1:
            return 1, int(nums[-1])
        else:
            return None, None

    def get_downloaded_segments(self) -> List[str]:
        Path(self.run.segments_dir).mkdir(exist_ok=True)
        list_dir = os.listdir(self.run.downloads_dir)
        list_dir.sort()
        seg_paths = []
        for seg_path in list_dir:
            quality, index = self.get_quality_and_index(seg_path)
            if not quality or not index:
                continue
            seg_paths.append((index, join(self.run.downloads_dir, seg_path)))
        seg_paths.sort()
        seg_paths = list(map(lambda x: x[1], seg_paths))
        return seg_paths

    def get_original_segment(self, seg_path) -> str:
        mutex_enc.acquire()

        filename = basename(seg_path)
        seg_path = join(self.run.original_video_dir, filename)
        init_path = join(self.run.original_video_dir, basename(self.run.get_segment_details(filename)["init_url"]))
        print(f"{self.run.original_video_dir=}")
        enc_dir = join(self.run.original_video_dir, "encoded")
        enc_path = join(enc_dir, splitext(filename)[0] + ".mp4")

        if not exists(enc_dir):
            os.mkdir(enc_dir)

        if not exists(enc_path):
            filter = "scale=1920:1080"
            Ffmpeg.decode_segment(read_bytes(init_path) + read_bytes(seg_path), enc_path, filter)

        mutex_enc.release()
        return enc_path

    def get_encoded_segment(self, seg_path: str, overlay=False, extend=False) -> str:
        filename = basename(seg_path)
        seg_details = self.run.get_segment_details(filename)
        init_path = join(self.run.downloads_dir, basename(seg_details["init_url"]))
        quality, index = self.get_quality_and_index(seg_path)

        # Optimization: If the whole segment is downloaded, return the orignal segment
        if not overlay and seg_details["received_bytes"] == seg_details["total_bytes"]:
            return self.get_original_segment(seg_path)

        # Make encoded video path
        enc_path = join(self.run.segments_dir, splitext(filename)[0])
        if overlay:
            enc_path += "-o"
        if extend:
            enc_path += "-e"
        enc_path += ".mp4"

        if not exists(enc_path):
            filter = "scale=1920:1080"
            if extend:
                filter += f",tpad=stop_mode=clone:stop=-1,trim=end={seg_details['duration']}"
            if overlay:
                filter += "," + FfmpegCompose.filter_drawstring(f"Segment\\:{index}, Quality\\: {quality}", 0, 0, box=True)
            print(seg_path)

            seg_bytes = read_bytes(seg_path)
            samples = Ffmpeg.get_samples(seg_bytes, seg_details["total_bytes"])
            print(len(seg_bytes), samples)
            while samples and (samples[-1][0] + samples[-1][1]) > len(seg_bytes):
                samples.pop()
            assert len(samples) > 0, f"No sample left for {seg_path}"
            print("Samples left : ", len(samples))
            seg_bytes = seg_bytes[: samples[-1][0] + samples[-1][1]]
            seg_bytes += b"\0" * (seg_details["total_bytes"] - len(seg_bytes))

            Ffmpeg.decode_segment(read_bytes(init_path) + seg_bytes, enc_path, filter)
        return enc_path

    def encode_playback(self) -> str:
        playback_path = join(self.run.downloads_dir, "playback.mp4")
        if exists(playback_path):
            return playback_path
        enc_segments = []
        for seg_path in self.get_downloaded_segments():
            enc_segments.append(self.get_encoded_segment(seg_path, overlay=True, extend=True))
        Ffmpeg.concat_segments(enc_segments, playback_path)
        return playback_path

    def encode_playback_with_buffering(self):
        source_path = join(self.run.downloads_dir, "playback.mp4")
        output_path = join(self.run.downloads_dir, "playback_buffering.mp4")

        if exists(output_path):
            return output_path

        frame_rate = Ffmpeg.get_frame_rate(source_path)

        run_states = self.run.details["states"]
        parts = []
        for i in range(1, len(run_states)):
            if run_states[i]["state"] in ("State.BUFFERING", "State.END"):
                parts.append(Ffmpeg.cut_video(source_path, run_states[i - 1]["position"], run_states[i]["position"]))
            else:
                parts.append(Ffmpeg.generate_buffering_segment(frame_rate, run_states[i]["time"] - run_states[i - 1]["time"]))
        Ffmpeg.concat_segments(parts, output_path)
        return output_path

    def calculate_vmaf_for_segment(self, seg_path) -> None:
        filename = basename(seg_path)
        # index, quality = self.get_quality_and_index(seg_path)
        output_file = join(self.run.vmaf_dir, f"{splitext(filename)[0]}.json")
        if exists(output_file):
            return
        else:
            dis_file = self.get_encoded_segment(seg_path, extend=True)
            ref_file = self.get_original_segment(seg_path)
            with mutex_vmaf:
                Path(CONFIG["cacheDir"], "vmaf").mkdir(parents=True, exist_ok=True)
                cache_file = join(CONFIG["cacheDir"], "vmaf", f"vmaf-{md5(ref_file)}-{md5(dis_file)}.json")
                vmaf_json: Dict
                if exists(cache_file):
                    with open(cache_file) as cf:
                        vmaf_json = json.load(cf)
                else:
                    docker_job: DockerJob = DockerJob(
                        config={
                            "image": "jrottenberg/ffmpeg:4.4-ubuntu",
                            "mounts": list(set([ref_file, dis_file, CONFIG["vmafDir"]])),
                            "args": [
                                "-i",
                                ref_file,
                                "-i",
                                dis_file,
                                "-lavfi",
                                f"""[0:v]setpts=PTS-STARTPTS[reference];
                                        [1:v]setpts=PTS-STARTPTS[distorted];
                                        [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path={CONFIG['vmafDir']}/model/vmaf_v0.6.1.json:n_threads=8""",
                                "-f",
                                "null",
                                "-",
                            ],
                        }
                    )
                    docker_job.run()
                    vmaf_json = json.loads(docker_job.output)
                    with open(cache_file, "w") as f:
                        f.write(json.dumps(vmaf_json, indent=4))
                with open(output_file, "w") as f:
                    f.write(json.dumps(vmaf_json, indent=4))

    def calculate_frames_for_segment(self, seg_path) -> None:
        output_file = join(self.run.frames_dir, f"{splitext(basename(seg_path))[0]}.json")
        if exists(output_file):
            return
        else:
            dis_file = self.get_encoded_segment(seg_path)
            with mutex_frames:
                frames_json = Ffmpeg.get_frames(dis_file)
                with open(output_file, "w") as f:
                    f.write(json.dumps(frames_json, indent=4))

    def calcualte_vmaf_for_segments(self):
        print("Calculating VMAF")
        for seg_path in self.get_downloaded_segments():
            self.calculate_vmaf_for_segment(seg_path)

    def calculate_stalls_for_segments(self):
        print("Calculating micro stalls")
        for seg_path in self.get_downloaded_segments():
            self.calculate_frames_for_segment(seg_path)
        print("Micro Stalls calculated")

    @staticmethod
    @register_python_job()
    def calculate_quality(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        codec.calcualte_vmaf_for_segments()
        codec.calculate_stalls_for_segments()

    @staticmethod
    @register_python_job()
    def encode_playback_job(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        codec.encode_playback()
        codec.encode_playback_with_buffering()

    @staticmethod
    @register_python_job()
    def create_tiles_video(run_ids: str):
        output = f"/tmp/tiles-{round(time.time() * 1000)}.mp4"
        compose = FfmpegCompose()
        for run_id in run_ids:
            run = get_run(run_id)
            compose.add_video(join(run.downloads_dir, "playback_buffering.mp4"))
        cmd = compose.build(output)
        subprocess.check_call(cmd, stdout=sys.stdout, stderr=sys.stderr)
