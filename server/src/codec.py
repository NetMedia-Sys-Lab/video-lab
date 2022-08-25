import asyncio
import json
import os
import re
import subprocess
import time
from os.path import join, exists
from pathlib import Path
from typing import List

from fs.tempfs import TempFS

from src.job_framework.job_manager import JOB_MANAGER, python_job
from src.job_framework.jobs.job_docker import DockerJobConfig, DockerJob
from src.run import Run

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()
results_dir = CONFIG["headlessPlayer"]["resultsDir"]
dataset_dir = CONFIG["headlessPlayer"]["datasetDir"]


class Codec:
    run: Run

    def __init__(self, run: Run):
        self.run = run
        pass

    @python_job
    def ffmpeg_decode_segment(self, input_segments: List[str], output: str, video_format: str):
        print(f"Joining segments : {input_segments}")
        p_cat = subprocess.Popen(['cat', *input_segments], stdout=subprocess.PIPE)
        subprocess.check_call(['ffmpeg', '-i', '-', '-vf', video_format, '-y', output], stdin=p_cat.stdout)
        p_cat.communicate()

    @python_job
    def ffmpeg_concat_segments(self, input_segments: List[str], output: str):
        tmp_path = f"/tmp/segments-{round(time.time() * 1000)}.txt"
        print(f"Segments list file : {tmp_path}")
        with open(tmp_path, 'w') as f:
            for seg in input_segments:
                f.write(f"file '{seg}'\n")
        subprocess.check_call(['ffmpeg', '-f', 'concat', '-safe', '0', '-i', tmp_path, '-c', 'copy', '-y', output])

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
            yield join(self.run.downloads_dir, seg_name), join(self.run.downloads_dir, init_name)

    async def get_original_segment(self, seg_quality: int, seg_index: int, temp_dir: str):
        seg_path = join(self.run.original_video_dir, f"chunk-stream{seg_quality}-{seg_index:05d}.m4s")
        init_path = join(self.run.original_video_dir, f"init-stream{seg_quality}.m4s")
        enc_path = join(temp_dir, f"seg-stream{seg_quality}-{seg_index:05d}.mp4")
        if not exists(enc_path):
            await self.ffmpeg_decode_segment([init_path, seg_path], enc_path, "scale=1920:1080")
        return enc_path

    async def get_encoded_segment(self, quality: int, index: int):
        enc_path = join(self.run.segments_dir, f"seg-stream{quality}-{index:05d}.mp4")
        if not exists(enc_path):
            seg_path = join(self.run.downloads_dir, f"chunk-stream{quality}-{index:05d}.m4s")
            init_path = join(self.run.downloads_dir, f"init-stream{quality}.m4s")
            await self.ffmpeg_decode_segment([init_path, seg_path], enc_path, "scale=1920:1080")
        return enc_path

    def get_encoded_segments_tasks(self):
        tasks = []
        for seg_path, init_path in self.get_downloaded_segments():
            quality, index = self.get_quality_and_index(seg_path)
            tasks.append(self.get_encoded_segment(quality, index))
        return tasks

    async def encode_playback(self):
        playback_path = join(self.run.downloads_dir, "playback.mp4")
        enc_segments = list(await asyncio.gather(*self.get_encoded_segments_tasks()))
        enc_segments.sort()
        self.ffmpeg_concat_segments(enc_segments, playback_path)
        return playback_path

    async def calculate_vmaf_for_segment(self, dis_file: str, temp_dir: str):
        quality, index = self.get_quality_and_index(dis_file)
        output_file = join(self.run.vmaf_dir, f"vmaf-stream{quality}-{index:05d}.json")
        if exists(output_file):
            with open(output_file) as f:
                output = json.load(f)
        else:
            ref_file = await self.get_original_segment(quality, index, temp_dir=temp_dir)
            docker_job: DockerJob = JOB_MANAGER.schedule(DockerJobConfig(
                image="jrottenberg/ffmpeg:4.4-ubuntu",
                mounts=[ref_file, dis_file, CONFIG["vmafDir"]],
                args=["-i", ref_file, "-i", dis_file,
                      "-lavfi", f"""[0:v]setpts=PTS-STARTPTS[reference];
                                [1:v]setpts=PTS-STARTPTS[distorted];
                                [distorted][reference]libvmaf=log_fmt=json:log_path=/dev/stdout:model_path={CONFIG['vmafDir']}/model/vmaf_v0.6.1.json:n_threads=4""",
                      "-f", "null", "-"]))
            output = json.loads(await docker_job.wait_for_output())
            with open(output_file, 'w') as f:
                f.write(json.dumps(output, indent=4))
        return output

    async def calcualte_quality_vmaf(self):
        segments = []
        tasks = []
        with TempFS(auto_clean=True, temp_dir=CONFIG['tempDir']) as temp_dir:
            async def vmaf_task(enc_task):
                dis_file = await enc_task
                return await self.calculate_vmaf_for_segment(dis_file, temp_dir.root_path)

            for enc_task in self.get_encoded_segments_tasks():
                tasks.append(vmaf_task(enc_task))
        return {
            "vmaf": {
                "segments": await asyncio.gather(*tasks)
            }
        }

    async def calculate_quality(self):
        return {
            **(await self.calcualte_quality_vmaf())
        }
