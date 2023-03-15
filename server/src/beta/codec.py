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
from os.path import join, exists, basename, normpath
from pathlib import Path
from typing import Dict, List, Optional, TypeVar

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

U = TypeVar('U')
def not_none(inst: Optional[U]) -> U:
    """Not-none helper"""
    assert inst is not None
    return inst

@cache
def md5(path, chunk_size = 65536):
    pts = time.process_time()
    ats = time.time()
    m = hashlib.md5()
    with open(path, 'rb') as f:
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

    def get_quality_and_index(self, seg_path):
        r = re.compile("(?:chunk|seg)-stream(\\d)-(\\d{5})(?:-o)?(?:-e)?(?:.mp4|.m4s)$")
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
            yield (quality, index)

    def get_original_segment(self, quality: int, index: int):
        seg_path = join(self.run.original_video_dir,
                        f"chunk-stream{quality}-{index:05d}.m4s")
        init_path = join(self.run.original_video_dir,
                         f"init-stream{quality}.m4s")
        mutex_enc.acquire()
        if not exists(join(self.run.original_video_dir, 'encoded')):
            os.mkdir(join(self.run.original_video_dir, 'encoded'))
        enc_path = join(self.run.original_video_dir, 'encoded',
                        f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            filter = f"scale=1920:1080"
            filter += f",tpad=stop_mode=clone:stop=-1,trim=end={self.run.run_config['length']}"
            Ffmpeg.decode_segment(
                [init_path, seg_path], enc_path, filter)
        mutex_enc.release()
        return enc_path

    def get_encoded_segment(self, quality: int, index: int, overlay = False, extend = False):
        # Optimization: If the whole segment is downloaded, return the orignal segment
        if overlay==False and self.run.details['segments'][index-1]['ratio'] == 1:
            return self.get_original_segment(quality, index)
        enc_path = join(self.run.segments_dir,
                        f"seg-stream{quality}-{index:05d}")
        if overlay:
            enc_path += '-o'
        if extend:
            enc_path += '-e'
        enc_path += ".mp4"
        if not exists(enc_path):
            filter = f"scale=1920:1080"
            if extend:
                filter += f",tpad=stop_mode=clone:stop=-1,trim=end={self.run.run_config['length']}"
            if overlay:
                filter += "," + FfmpegCompose.filter_drawstring(f"Segment\\:{index}, Quality\\: {quality}", 0, 0, box=True)
            print(filter)
            Ffmpeg.decode_segment([
                join(self.run.downloads_dir, f"init-stream{quality}.m4s"),
                join(self.run.downloads_dir,
                     f"chunk-stream{quality}-{index:05d}.m4s")
            ], enc_path, filter)
        return enc_path

    def encode_playback(self):
        playback_path = join(self.run.downloads_dir, "playback.mp4")
        if exists(playback_path):
            return playback_path
        enc_segments = []
        for quality, index in self.get_downloaded_segments():
            enc_segments.append(self.get_encoded_segment(quality, index, overlay=True, extend=True))
        enc_segments.sort(key=lambda s: not_none(self.get_quality_and_index(s)[1]))
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

    def calculate_vmaf_for_segment(self, quality: int, index: int) -> None:
        output_file = join(self.run.vmaf_dir,
                           f"vmaf-stream{quality}-{index:05d}.json")
        if exists(output_file):
            return
        else:
            dis_file = self.get_encoded_segment(quality, index, extend=True)
            ref_file = self.get_original_segment(quality, index)
            with mutex_vmaf:
                Path(CONFIG['cacheDir'], 'vmaf').mkdir(parents=True, exist_ok=True)
                cache_file = join(CONFIG['cacheDir'], 'vmaf',
                            f"vmaf-stream{quality}-{index:05d}-{md5(ref_file)}-{md5(dis_file)}.json")
                vmaf_json: Dict
                if exists(cache_file):
                    with open(cache_file) as cf:
                        vmaf_json = json.load(cf)
                else:
                    docker_job: DockerJob = DockerJob(
                        config={
                            'image': "jrottenberg/ffmpeg:4.4-ubuntu",
                            'mounts': list(set([ref_file, dis_file, CONFIG["vmafDir"]])),
                            'args': ["-i", ref_file, "-i", dis_file,
                                    "-lavfi", f"""[0:v]setpts=PTS-STARTPTS[reference];
                                        [1:v]setpts=PTS-STARTPTS[distorted];
                                        [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path={CONFIG['vmafDir']}/model/vmaf_v0.6.1.json:n_threads=8""",
                                    "-f", "null", "-"]
                        }
                    )
                    docker_job.run()
                    vmaf_json = json.loads(docker_job.output)
                    with open(cache_file, 'w') as f:
                        f.write(json.dumps(vmaf_json, indent=4))
                with open(output_file, 'w') as f:
                    f.write(json.dumps(vmaf_json, indent=4))                

    def calculate_frames_for_segment(self, quality: int, index: int) -> None:
        output_file = join(self.run.frames_dir,
                           f"frames-stream{quality}-{index:05d}.json")
        if exists(output_file):
            return
        else:
            dis_file = self.get_encoded_segment(quality, index)
            with mutex_frames:
                Path(CONFIG['cacheDir'], 'frames').mkdir(parents=True, exist_ok=True)
                cache_file = join(CONFIG['cacheDir'], 'frames',
                            f"frames-stream{quality}-{index:05d}-{md5(dis_file)}.json")
                frames_json: Dict
                if exists(cache_file):
                    with open(cache_file) as cf:
                        frames_json = json.load(cf)
                else:
                    frames_json = json.loads(Ffmpeg.get_frames(dis_file))
                    with open(cache_file, 'w') as f:
                        f.write(json.dumps(frames_json, indent=4))
                with open(output_file, 'w') as f:
                    f.write(json.dumps(frames_json, indent=4))

    def calcualte_vmaf_for_segments(self):
        print("Calculating VMAF")
        segments = list(self.get_downloaded_segments())
        for quality, index in segments:
            self.calculate_vmaf_for_segment(quality, index)

    def calculate_stalls_for_segments(self):
        print("Calculating micro stalls")
        segments = list(self.get_downloaded_segments())
        for quality, index in segments:
            self.calculate_frames_for_segment(quality, index)
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
            compose.add_video(join(run.downloads_dir, 'playback_buffering.mp4'))
        cmd = compose.build(output)
        subprocess.check_call(cmd, stdout=sys.stdout, stderr=sys.stderr)
