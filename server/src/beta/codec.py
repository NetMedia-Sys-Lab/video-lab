from functools import cache
import hashlib
import json
import os
from threading import Lock
import subprocess
import sys
import time
from os.path import join, exists, basename
from pathlib import Path
from typing import List, Optional, Set, Tuple, TypeVar
from urllib.parse import urlparse

from src.job_framework.jobs.job_python import register_python_job

from src.video import Video
from src.beta.run import Run, get_run
from src.util.ffmpeg import Ffmpeg
from src.util.ffmpeg_compose import FfmpegCompose
from src.filler import Filler

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
            seg_bytes = read_bytes(seg_path)
            try:
                seg_bytes = Video.apply_transforms(seg_bytes, ["trim_sample"], seg["total_bytes"])
            except Exception:
                print(f"Failed to trim segment. {seg_path=}")
                print("Content Length: ", len(seg_bytes), ", Samples: ", Video.get_samples(seg_bytes, len(seg_bytes)))
            seg_bytes += b'\0' * (seg["total_bytes"]-len(seg_bytes))
            proc.stdin.write(seg_bytes)

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
                -lavfi "[0][1]libvmaf=log_path={vmaf_path}:log_fmt=json:feature=name=float_ssim:n_threads=3:n_subsample=3" -f null -',
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
            try:
                seg_bytes = Video.apply_transforms(seg_bytes, ["trim_sample"], seg["total_bytes"])
            except Exception:
                print(f"Failed to trim segment. {seg_path=}")
                print("Content Length: ", len(seg_bytes), ", Samples: ", Video.get_samples(seg_bytes, len(seg_bytes)))
            seg_bytes += b"\0" * (seg["total_bytes"] - len(seg_bytes))
            proc.stdin.write(seg_bytes)

        proc.communicate()
        assert proc.returncode == 0, f"FFmpeg returned with non-zero code {proc.returncode}"

    def calculate_microstalls(self):
        microstalls_path = join(self.run.run_dir, "microstalls.json")
        frame_offset = 0
        microstalls = []
        skipped_frame_nums = []
        for seg in self.run.details()["segments"]:
            seg_path = join(self.run.downloads_dir, basename(urlparse(seg["url"]).path))
            seg_bytes = read_bytes(seg_path)
            total_frames, skipped_frames = Video.get_frame_stats(seg_bytes, seg["total_bytes"])
            skipped_frame_nums.extend([frame_offset+f for f in range(total_frames-skipped_frames, total_frames)])
            
            if skipped_frames > 0:
                print(skipped_frames)
                microstalls.append(skipped_frames)
            frame_offset += total_frames
        print(microstalls, skipped_frame_nums)
        with open(microstalls_path, 'w') as f:
            json.dump({
                "groups": microstalls,
                "frame_nums": skipped_frame_nums
            }, f)
    
    def fill_frames(self):
        playback_path = join(self.run.run_dir, "playback.mp4")
        if not exists(playback_path):
            self.encode_playback()
        microstalls_path = join(self.run.run_dir, "microstalls.json")
        if not exists(microstalls_path):
            self.calculate_microstalls()
        frames_dir = join(self.run.run_dir, "frames")
        if not exists(frames_dir):
            Path(frames_dir).mkdir()
            time.sleep(0.1)
            subprocess.check_call(f"ffmpeg -i {playback_path} {frames_dir}/$filename%04d.png", shell=True)
        
        with open(microstalls_path) as file:
            predict_frames = [f + 1 for f in json.load(file)["frame_nums"]]
            
        filler = Filler(self.run.run_dir)
        filler.generate_replacements(predict_frames)
        filler.merge_original_frames()
            
        subprocess.check_call(
            "ffmpeg -framerate 24 -pattern_type glob -i 'replaced/*.png' -c:v libx264 -pix_fmt yuv420p -y filled.mp4",
            shell=True,
            cwd=self.run.run_dir
        )
        
    @staticmethod
    @register_python_job()
    def calculate_quality(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        print("Calculating VMAF")
        codec.calculate_vmaf()
        print("Calculating Microstalls")
        codec.calculate_microstalls()

    @staticmethod
    @register_python_job()
    def fill_frames_job(run_id: str):
        run = get_run(run_id)
        codec = Codec(run)
        codec.fill_frames()
        
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
