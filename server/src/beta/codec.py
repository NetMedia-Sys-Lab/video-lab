import asyncio
import json
import os
import re
from threading import Lock
import subprocess
import sys
import time
from os.path import join, exists
from pathlib import Path
from typing import List

from fs.tempfs import TempFS
from src.job_framework.server.job_manager_server import JobManagerServer
from src.job_framework.jobs.job_python import register_python_job

from src.job_framework.jobs.job_docker import DockerJob
from src.beta.run import Run, get_run

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]


mutex = Lock()


class Codec:
    run: Run
    job_manager = JobManagerServer

    def __init__(self, run: Run, job_manager: JobManagerServer):
        self.run = run
        self.job_manager = job_manager
        pass

    @staticmethod
    def ffmpeg_decode_segment(input_segments: List[str], output: str, video_format: str):
        print(f"Joining segments : {input_segments}")
        p_cat = subprocess.Popen(
            ['cat', *input_segments], stdout=subprocess.PIPE)
        subprocess.check_call(
            ['ffmpeg', '-i', '-', '-vf', video_format, '-y', output],
            stdin=p_cat.stdout,
            stdout=sys.stdout,
            stderr=sys.stderr)
        p_cat.communicate()

    @staticmethod
    def ffmpeg_concat_segments(input_segments: List[str], output: str):
        tmp_path = f"/tmp/segments-{round(time.time() * 1000)}.txt"
        print(f"Segments list file : {tmp_path}")
        with open(tmp_path, 'w') as f:
            for seg in input_segments:
                f.write(f"file '{seg}'\n")
        subprocess.check_call(
            ['ffmpeg', '-f', 'concat', '-safe', '0', '-i',
                tmp_path, '-c', 'copy', '-y', output],
            stdout=sys.stdout,
            stderr=sys.stderr
        )

    @staticmethod
    @register_python_job()
    def ffprobe_get_frames(video_path):
        return subprocess.check_output([
            "ffprobe", "-v", "quiet", "-show_frames", "-of", "json",
            video_path
        ], stderr=sys.stderr).decode()

    @staticmethod
    def get_quality_and_index(seg_path):
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
            # yield join(self.run.downloads_dir, seg_name), join(self.run.downloads_dir, init_name)
            yield (quality, index)

    @staticmethod
    @register_python_job()
    def get_original_segment(quality: int, index: int, run_id: str):
        run = get_run(run_id)
        seg_path = join(run.original_video_dir,
                        f"chunk-stream{quality}-{index:05d}.m4s")
        init_path = join(run.original_video_dir,
                         f"init-stream{quality}.m4s")
        mutex.acquire()
        if not exists(join(run.original_video_dir, 'encoded')):
            os.mkdir(join(run.original_video_dir, 'encoded'))
        mutex.release()
        enc_path = join(run.original_video_dir, 'encoded',
                        f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            Codec.ffmpeg_decode_segment(
                [init_path, seg_path], enc_path, "scale=1920:1080")
        return enc_path

    @staticmethod
    @register_python_job()
    def get_encoded_segment(quality: int, index: int, run_id: str):
        run = get_run(run_id)
        enc_path = join(run.segments_dir,
                        f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            Codec.ffmpeg_decode_segment([
                join(run.downloads_dir, f"init-stream{quality}.m4s"),
                join(run.downloads_dir,
                     f"chunk-stream{quality}-{index:05d}.m4s")
            ], enc_path, "scale=1920:1080")
        return enc_path

    def encode_playback(self):
        playback_path = join(self.run.downloads_dir, "playback.mp4")
        enc_segments = []
        for quality, index in self.get_downloaded_segments():
            enc_segments.append(self.get_encoded_segment(quality, index, str(self.run)))
        enc_segments.sort()
        self.ffmpeg_concat_segments(enc_segments, playback_path)
        return playback_path

    
    async def calculate_vmaf_for_segment(self, quality: int, index: int):
        output_file = join(self.run.vmaf_dir, f"vmaf-stream{quality}-{index:05d}.json")
        if exists(output_file):
            with open(output_file) as f:
                return json.load(f)
        else:
            dis_file = await self.job_manager.run_with_output(self.get_encoded_segment, quality, index, str(self.run))
            ref_file = await self.job_manager.run_with_output(self.get_original_segment, quality, index, str(self.run))
            docker_job: DockerJob = self.job_manager.schedule(DockerJob(
                config={
                    'image': "jrottenberg/ffmpeg:4.4-ubuntu",
                    'mounts': [ref_file, dis_file, CONFIG["vmafDir"]],
                    'args': ["-i", ref_file, "-i", dis_file,
                             "-lavfi", f"""[0:v]setpts=PTS-STARTPTS[reference];
                                [1:v]setpts=PTS-STARTPTS[distorted];
                                [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path={CONFIG['vmafDir']}/model/vmaf_v0.6.1.json:n_threads=4""",
                             "-f", "null", "-"]
                }
            ))
            output = json.loads(await docker_job.wait_for_output())
            with open(output_file, 'w') as f:
                f.write(json.dumps(output, indent=4))
            return output

    async def calculate_stalls_for_segment(self, quality: int, index: int):
        output_file = join(self.run.frames_dir,
                           f"frames-stream{quality}-{index:05d}.json")
        if exists(output_file):
            with open(output_file) as f:
                return json.load(f)
        else:
            dis_file = await self.job_manager.run_with_output(self.get_encoded_segment, quality, index, str(self.run))
            output = json.loads(await self.job_manager.run_with_output(self.ffprobe_get_frames, dis_file))
            with open(output_file, 'w') as f:
                f.write(json.dumps(output, indent=4))
            return output

    async def calcualte_vmaf_for_segments(self):
        print("Calculating VMAF")
        segments = list(self.get_downloaded_segments())
        tasks = []
        for quality, index in segments:
            tasks.append(self.calculate_vmaf_for_segment(quality, index))
        print("Scheduling VMAF for segments")
        await asyncio.gather(*tasks)
        print("Vmaf calculated")
        return {
            "vmaf": self.run.vmaf
        }

    async def calculate_stalls_for_segments(self):
        print("Calculating micro stalls")
        segments = list(self.get_downloaded_segments())
        tasks = []
        for quality, index in segments:
            tasks.append(self.calculate_stalls_for_segment(quality, index))
        await asyncio.gather(*tasks)
        print("Micro Stalls calculated")
        return {
            "micro_stalls": self.run.micro_stalls
        }

    async def calculate_quality(self, methods=['vmaf', 'micro_stalls']):
        return {
            **(await self.calcualte_vmaf_for_segments() if 'vmaf' in methods else {}),
            **(await self.calculate_stalls_for_segments() if 'micro_stalls' in methods else {})
        }
