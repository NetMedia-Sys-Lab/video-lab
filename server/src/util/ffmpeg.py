from functools import cache
from genericpath import exists
import hashlib
import itertools
import json
from os import mkdir
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from typing import Dict, List, Optional
from os.path import join, dirname
import xml.etree.ElementTree as ET

from src.job_framework.jobs.job_python import register_python_job

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


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


class Ffmpeg:
    @staticmethod
    def decode_segment(input_bytes: bytes, output: str, video_format: str):
        print(["ffmpeg", "-err_detect", "ignore_err", "-i", "-", "-vf", video_format, "-y", output])
        proc = subprocess.Popen(
            ["ffmpeg", "-err_detect", "ignore_err", "-i", "-", "-vf", video_format, "-y", output],
            stdin=subprocess.PIPE,
            # input=input_bytes,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )

        proc.stdin.write(input_bytes)
        proc.stdin.close()
        ret_code = proc.wait()
        if ret_code != 0:
            raise Exception(f"Process failed with return code {ret_code}")

    @staticmethod
    def concat_segments(input_segments: List[str], output: str, filters: List[str] = []):
        tmp_path = f"/tmp/segments-{round(time.time() * 1000)}.txt"
        print(f"Segments list file : {tmp_path}")
        with open(tmp_path, "w") as f:
            for seg in input_segments:
                f.write(f"file '{seg}'\n")
        subprocess.check_call(
            ["ffmpeg", "-f", "concat", "-safe", "0", "-i", tmp_path, "-c", "copy", "-y", output],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )

    @staticmethod
    def generate_buffering_segment(frame_rate: float, duration: float, output_path: Optional[str] = None):
        if output_path is None:
            output_path = f"/tmp/buff-{frame_rate}-{duration}.mp4"
        subprocess.check_call(
            [
                "ffmpeg",
                "-f",
                "lavfi",
                "-i",
                f"color=size=1920x1080:duration={duration}:rate={frame_rate}:color=black",
                "-vf",
                f"drawtext=fontfile={CONFIG['fontFile']}:fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='BUFFERING ...'",
                output_path,
            ],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        return output_path

    @staticmethod
    def cut_video(source_path: str, start: float, end: float, output: str = None):
        if output is None:
            output = f"/tmp/cut-{round(time.time() * 1000)}.mp4"
        subprocess.check_call(
            ["ffmpeg", "-ss", f"{start}", "-i", source_path, "-c", "copy", "-t", f"{end-start}", output],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        return output

    @staticmethod
    def get_frames(video_path) -> Dict:
        Path(CONFIG["cacheDir"], "frames").mkdir(parents=True, exist_ok=True)
        cache_file = join(CONFIG["cacheDir"], "frames", f"{md5(video_path)}.json")
        if exists(cache_file):
            with open(cache_file) as cf:
                frames_json = json.load(cf)
        else:
            frames_json = json.loads(
                subprocess.check_output(
                    ["ffprobe", "-v", "quiet", "-show_frames", "-of", "json", video_path], stderr=sys.stderr
                ).decode()
            )
            with open(cache_file, "w") as f:
                f.write(json.dumps(frames_json, indent=4))
        return frames_json

    @staticmethod
    def get_packets(video_path) -> Dict:
        Path(CONFIG["cacheDir"], "frames").mkdir(parents=True, exist_ok=True)
        cache_file = join(CONFIG["cacheDir"], "frames", f"{md5(video_path)}.json")
        if exists(cache_file):
            with open(cache_file) as cf:
                frames_json = json.load(cf)
        else:
            frames_json = json.loads(
                subprocess.check_output(
                    ["ffprobe", "-v", "quiet", "-show_frames", "-of", "json", video_path], stderr=sys.stderr
                ).decode()
            )
            with open(cache_file, "w") as f:
                f.write(json.dumps(frames_json, indent=4))
        return frames_json

    @staticmethod
    @cache
    def video_details(video_path):
        return json.loads(
            subprocess.check_output(
                ["ffprobe", "-v", "quiet", "-show_streams", "-of", "json", video_path], stderr=sys.stderr
            ).decode()
        )

    @staticmethod
    def get_frame_rate(video_path: str) -> float:
        frame_rate = Ffmpeg.video_details(video_path)["streams"][0]["r_frame_rate"].split("/")
        if len(frame_rate) == 2:
            return float(frame_rate[0]) / float(frame_rate[1])
        elif len(frame_rate) == 1:
            return float(frame_rate[0])
        else:
            raise Exception(f"Unknow frame rate format {frame_rate}")

    @staticmethod
    def get_duration(video_path: str) -> float:
        return float(Ffmpeg.video_details(video_path)["streams"][0]["duration"])

    @staticmethod
    def get_video_with_resolution(source_path: str, resolution: str, output_path: str = None):
        if output_path is None:
            output_path = source_path.rsplit(".", 1)
            output_path[0] += f"_{resolution}"
            output_path = ".".join(output_path)

        if exists(output_path):
            return output_path

        res = {"1080": "1920x1080", "720": "1280x720", "480": "854x480", "360": "640x360", "240": "480x240"}[resolution]

        subprocess.check_call(
            ["ffmpeg", "-y", "-i", source_path, "-s", f"{res}", output_path], stdout=sys.stdout, stderr=sys.stderr
        )

        return output_path

    @staticmethod
    @register_python_job()
    def encode_hevc_video(source_path: str, bitrate: int, resolution: str, seg_length: float, output: str = None):
        if output is None:
            output = join(dirname(source_path), "DROP0", f"{bitrate}bps", "video.hevc")
        Path(dirname(output)).mkdir(parents=True, exist_ok=True)

        scaled_source_path = Ffmpeg.get_video_with_resolution(source_path, resolution)

        frame_rate = Ffmpeg.get_frame_rate(source_path)
        keyint = seg_length * frame_rate

        x265_params = (
            f"no-open-gop=1:no-scenecut=1:preset=veryslow:keyint={keyint}:min-keyint={keyint}:"
            + f"bitrate={bitrate//1000}:strict-cbr=1:vbv-maxrate={bitrate//1000}:vbv-bufsize={bitrate//2000}:b-adapt=0:bframes=16"
        )
        subprocess.check_call(
            ["ffmpeg", "-y", "-i", scaled_source_path, "-c:v", "libx265", "-an", "-x265-params", x265_params, output],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        return output

    @staticmethod
    @register_python_job()
    def create_dash_playlist(source_path: str, seg_length: float, output_dir: str = None):
        if output_dir is None:
            output_dir = join(dirname(source_path), "dash")
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        mp4_path = join(output_dir, "video.mp4")

        if not exists(mp4_path):
            # Convert to mp4
            subprocess.check_call(
                ["ffmpeg", "-y", "-i", source_path, "-c", "copy", mp4_path], stdout=sys.stdout, stderr=sys.stderr
            )

        # MP4Box -dash 1000 -rap -segment-name segment_
        subprocess.check_call(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{output_dir}:/work",
                "sambaiz/mp4box",
                "-dash",
                f"{seg_length*1000}",
                "-rap",
                "-segment-name",
                "segment_",
                "video.mp4",
            ],
            cwd=output_dir,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )

    @staticmethod
    def get_samples(content: bytes, src_size: int):
        content += bytes([0] * (src_size - len(content)))
        with tempfile.TemporaryDirectory() as tmpdirname:
            seg_path = join(tmpdirname, "segment.mp4")
            print("SEGMENT PATH : ", seg_path)
            with open(seg_path, "wb") as segment_file:
                segment_file.write(content)
            xml_str = subprocess.check_output(["MP4Box", seg_path, "-diso", "-std"], stderr=sys.stdout)
        root = ET.fromstring(xml_str)
        for el in root.iter("*"):
            if el.tag.startswith("{"):
                el.tag = el.tag.split("}", 1)[1]
            # loop on element attributes also
            for an in el.attrib.keys():
                if an.startswith("{"):
                    el.attrib[an.split("}", 1)[1]] = el.attrib.pop(an)
        track_entries = root.findall("./MovieFragmentBox/TrackFragmentBox/TrackRunBox/TrackRunEntry")
        sizes = [int(entry.attrib["Size"]) for entry in track_entries]
        mdat_start = 0
        for box in root:
            if box.tag != "MediaDataBox":
                mdat_start += int(box.attrib["Size"])
            else:
                break

        offsets = [(mdat_start + x) for x in itertools.accumulate([0] + sizes[:-1])]
        samples = list(zip(offsets, sizes))
        return samples