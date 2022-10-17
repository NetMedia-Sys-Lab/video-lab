import asyncio
import json
import os
from pprint import pprint
import re
from threading import Lock
import subprocess
import sys
import time
from os.path import join, exists, basename
from pathlib import Path
from typing import List

from fs.tempfs import TempFS
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import register_python_job

from src.job_framework.jobs.job_docker import DockerJob
from src.beta.run import Run, get_run
from src.util.ffmpeg import Ffmpeg

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]


mutex = Lock()


class Codec:
    run: Run

    def __init__(self, run: Run):
        self.run = run
        pass

    def get_quality_and_index(self, seg_path):
        r = re.compile("(?:chunk|seg)-stream(\\d)-(\\d{5})\\.(?:mp4|m4s)$")
        s = r.search(seg_path)
        if s is not None:
            return int(s.group(1)), int(s.group(2))
        else:
            return None, None

    def get_downloaded_segments(self):
        Path(self.run.segments_dir).mkdir(exist_ok=True)
        list_dir = os.listdir(self.run.downloads_dir)
        list_dir.sort()
        for seg_name in list_dir:
            quality, index = self.get_quality_and_index(seg_name)
            if not quality or not index:
                continue
            init_name = f"init-stream{quality}.m4s"
            print(seg_name, init_name)
            yield (quality, index)

    def get_original_segment(self, quality: int, index: int):
        seg_path = join(self.run.original_video_dir,
                        f"chunk-stream{quality}-{index:05d}.m4s")
        init_path = join(self.run.original_video_dir,
                         f"init-stream{quality}.m4s")
        mutex.acquire()
        if not exists(join(self.run.original_video_dir, 'encoded')):
            os.mkdir(join(self.run.original_video_dir, 'encoded'))
        mutex.release()
        enc_path = join(self.run.original_video_dir, 'encoded',
                        f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            Ffmpeg.decode_segment(
                [init_path, seg_path], enc_path, "scale=1920:1080")
        return enc_path

    def get_encoded_segment(self, quality: int, index: int):
        enc_path = join(self.run.segments_dir,
                        f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            Ffmpeg.decode_segment([
                join(self.run.downloads_dir, f"init-stream{quality}.m4s"),
                join(self.run.downloads_dir,
                     f"chunk-stream{quality}-{index:05d}.m4s")
            ], enc_path, "scale=1920:1080")
        return enc_path

    def encode_playback(self):
        playback_path = join(self.run.downloads_dir, "playback.mp4")
        if exists(playback_path):
            return playback_path
        enc_segments = []
        for quality, index in self.get_downloaded_segments():
            enc_segments.append(self.get_encoded_segment(quality, index))
        enc_segments.sort(key=lambda s: self.get_quality_and_index(s)[1])
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
                parts.append(Ffmpeg.cut_video(source_path,run_states[i-1]["position"],run_states[i]["position"]))
            else:
                parts.append(Ffmpeg.generate_buffering_segment(frame_rate, run_states[i]["time"]-run_states[i-1]["time"]))
        Ffmpeg.concat_segments(parts, output_path)
        return output_path

    def calculate_vmaf_for_segment(self, quality: int, index: int):
        output_file = join(self.run.vmaf_dir,
                           f"vmaf-stream{quality}-{index:05d}.json")
        if exists(output_file):
            with open(output_file) as f:
                return json.load(f)
        else:
            dis_file = self.get_encoded_segment(quality, index)
            ref_file = self.get_original_segment(quality, index)
            docker_job: DockerJob = DockerJob(
                config={
                    'image': "jrottenberg/ffmpeg:4.4-ubuntu",
                    'mounts': [ref_file, dis_file, CONFIG["vmafDir"]],
                    'args': ["-i", ref_file, "-i", dis_file,
                             "-lavfi", f"""[0:v]setpts=PTS-STARTPTS[reference];
                                [1:v]setpts=PTS-STARTPTS[distorted];
                                [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path={CONFIG['vmafDir']}/model/vmaf_v0.6.1.json:n_threads=4""",
                             "-f", "null", "-"]
                }
            )
            docker_job.run()
            output = json.loads(docker_job.output)
            with open(output_file, 'w') as f:
                f.write(json.dumps(output, indent=4))
            return output

    def calculate_stalls_for_segment(self, quality: int, index: int):
        output_file = join(self.run.frames_dir,
                           f"frames-stream{quality}-{index:05d}.json")
        if exists(output_file):
            with open(output_file) as f:
                return json.load(f)
        else:
            dis_file = self.get_encoded_segment(quality, index)
            output = json.loads(Ffmpeg.get_frames(dis_file))
            with open(output_file, 'w') as f:
                f.write(json.dumps(output, indent=4))
            return output

    def calcualte_vmaf_for_segments(self):
        print("Calculating VMAF")
        segments = list(self.get_downloaded_segments())
        for quality, index in segments:
            self.calculate_vmaf_for_segment(quality, index)

    def calculate_stalls_for_segments(self):
        print("Calculating micro stalls")
        segments = list(self.get_downloaded_segments())
        for quality, index in segments:
            self.calculate_stalls_for_segment(quality, index)
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