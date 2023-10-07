from functools import cache
import hashlib
import json
import os
import re
from threading import Lock
import subprocess
import sys
import time
from os.path import join, exists, basename, splitext
from pathlib import Path
from typing import List, Optional, Set, Tuple, TypeVar
from urllib.parse import urlparse

from src.job_framework.jobs.job_python import register_python_job

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
        playback_path = join(self.run.run_dir, "playback.mp4")

        proc = subprocess.Popen(
            f"ffmpeg -i - -err_detect ignore_err -c copy -y {playback_path}",
            shell=True,
            stdin=subprocess.PIPE,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        assert proc.stdin is not None

        init_paths: Set[str] = set()

        for seg in self.run.details()["segments"]:
            init_path = join(self.run.downloads_dir, basename(urlparse(seg["init_url"]).path))
            seg_path = join(self.run.downloads_dir, basename(urlparse(seg["url"]).path))
            if init_path not in init_paths:
                init_paths.add(init_path)
                sys.stdout.write(f"Writing to ffmpeg process: {init_path}\n")
                proc.stdin.write(read_bytes(init_path))
            sys.stdout.write(f"Writing to ffmpeg process: {seg_path}\n")
            proc.stdin.write(read_bytes(seg_path))

        proc.communicate()
        assert proc.returncode == 0, f"FFmpeg returned with non-zero code {proc.returncode}"

        return playback_path

    def encode_playback_with_buffering(self):
        source_path = join(self.run.downloads_dir, "playback.mp4")
        output_path = join(self.run.downloads_dir, "playback_buffering.mp4")

        if exists(output_path):
            return output_path

        frame_rate = Ffmpeg.get_frame_rate(source_path)

        run_states = self.run.details()["states"]
        parts = []
        for i in range(1, len(run_states)):
            if run_states[i]["state"] in ("State.BUFFERING", "State.END"):
                parts.append(Ffmpeg.cut_video(source_path, run_states[i - 1]["position"], run_states[i]["position"]))
            else:
                parts.append(Ffmpeg.generate_buffering_segment(frame_rate, run_states[i]["time"] - run_states[i - 1]["time"]))
        Ffmpeg.concat_segments(parts, output_path)
        return output_path

    def calculate_vmaf(self):
        raw_video_path, fps = self.run.raw_video_path()
        num_frames: int = int(self.run.total_duration() * fps)

        vmaf_path = join(self.run.run_dir, "vmaf.json")
        if os.path.exists(vmaf_path):
            return

        print(f"JOB_MAX_PROGRESS = {num_frames}")

        proc = subprocess.Popen(
            f'ffmpeg -i - -i "{raw_video_path}" -frames {num_frames} \
                -err_detect ignore_err \
                -lavfi "[0][1]libvmaf=log_path={vmaf_path}:log_fmt=json:ssim=1:psnr=1:n_threads=3:n_subsample=3" -f null -',
            shell=True,
            stdin=subprocess.PIPE,
            stderr=sys.stderr,
            stdout=sys.stdout,
        )
        assert proc.stdin is not None

        init_paths: Set[str] = set()

        for seg in self.run.details()["segments"]:
            init_path = join(self.run.downloads_dir, basename(urlparse(seg["init_url"]).path))
            seg_path = join(self.run.downloads_dir, basename(urlparse(seg["url"]).path))
            if init_path not in init_paths:
                init_paths.add(init_path)
                sys.stdout.write(f"Writing to ffmpeg process: {init_path}\n")
                proc.stdin.write(read_bytes(init_path))

            sys.stdout.write(f"Writing to ffmpeg process: {seg_path}\n")
            seg_bytes = read_bytes(seg_path)
            seg_bytes += b"\0" * (seg["total_bytes"] - len(seg_bytes))
            proc.stdin.write(seg_bytes)

        proc.communicate()
        assert proc.returncode == 0, f"FFmpeg returned with non-zero code {proc.returncode}"

    @staticmethod
    @register_python_job()
    def calculate_quality(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        codec.calculate_vmaf()

    @staticmethod
    @register_python_job()
    def encode_playback_job(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        codec.encode_playback()
        # codec.encode_playback_with_buffering()

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
