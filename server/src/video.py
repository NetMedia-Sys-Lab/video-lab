from __future__ import annotations
from functools import lru_cache
import itertools
import json
from os import path
import subprocess
import sys
import tempfile
from typing import Dict
import requests
from flask import Flask, make_response, request, jsonify
from sortedcontainers import SortedList
import logging
import xml.etree.ElementTree as ET



def read_bytes(filepath: str) -> bytes:
    with open(filepath, "rb") as f:
        return f.read()


class Video:
    log = logging.getLogger("Video")
    video_bytes: bytearray
    part_offsets: SortedList

    def __init__(self, *, parts: list[str]) -> None:
        self.urls = parts

        # Merge all parts with transformations
        self.part_offsets = SortedList()
        self.video_bytes = bytearray()
        for part in parts:
            url, *transforms = part.split(";")
            print(f"Applying transform on {part}")
            if url.startswith("http"):
                content = requests.get(url.strip()).content
            else:
                content = read_bytes(url)
            content = self.apply_transforms(content, transforms)
            self.part_offsets.add(len(self.video_bytes))
            self.video_bytes.extend(content)
        self.part_offsets.add(len(self.video_bytes))

    def apply_transforms(self, content: bytes, transforms):
        src_size = len(content)
        for trans in transforms:
            trans_name = trans.strip().split("=")[0].lower()
            if trans_name == "head":
                cut = self.rel_to_abs(trans.split("=")[1], src_size)
                content = content[:cut]
            elif trans_name == "trim_sample":
                samples = self.get_samples(content, src_size)
                print("Total samples : ", len(samples))
                while samples and (samples[-1][0] + samples[-1][1]) > len(content):
                    samples.pop()
                assert len(samples) > 0, "No sample left"
                print("Valid samples : ", len(samples))
                content = content[: samples[-1][0] + samples[-1][1]]
            elif trans_name == "pad":
                pad_byte = int(trans.split("=")[1], 0)
                content += bytes([pad_byte] * (src_size - len(content)))
            elif trans_name == "remove_sample":
                rem = list(map(int, trans.split("=")[1].split(",")))
                samples = self.get_samples(content, src_size)
                for i in rem:
                    offset, size = samples[i]
                    content = content[:offset] + bytes([0] * size) + content[offset + size :]
        return content

    @staticmethod
    def rel_to_abs(rel: str, total: int):
        if rel[-1] == "%":
            return int(rel[:-1]) * total // 100
        elif rel[-1].isdigit():
            return int(rel)

    @lru_cache
    def get_frames(self):
        frames: list[Dict] = json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-err_detect",
                    "ignore_err",
                    "-show_frames",
                    "-of",
                    "json",
                    "-max_frame_delay",
                    "255",
                    "-alllayers",
                    "true",
                    "-loglevel",
                    "error",
                    "-",
                ],
                input=self.video_bytes,
                stderr=sys.stdout,
            )
        )["frames"]
        # frames.sort(key=lambda f: int(f['best_effort_timestamp']))
        for frame in frames:
            frame["part_index"] = self.part_offsets.bisect_right(int(frame["pkt_pos"])) - 1

        return frames

    def get_quality_psnr(self, ref: Video):
        with tempfile.TemporaryDirectory() as tmpdirname:
            ref_path = path.join(tmpdirname, "reference")
            with open(ref_path, "wb") as f:
                f.write(ref.video_bytes)
            psnr_logs = (
                subprocess.check_output(
                    ["ffmpeg", "-i", "-", "-i", ref_path, "-lavfi", "psnr=stats_file=-", "-f", "null", "-"],
                    input=self.video_bytes,
                    stderr=sys.stdout,
                )
                .decode()
                .split("\n")
            )

        frames = []
        for log in psnr_logs:
            log = log.strip()
            if len(log) == 0:
                continue
            params = [p.split(":") for p in log.split(" ")]
            params = {k: float(v) for k, v in params}
            frames.append(params)
        return frames

    def get_quality_vmaf(self, ref: Video):
        with tempfile.TemporaryDirectory() as tmpdirname:
            ref_path = path.join(tmpdirname, "reference")
            decoded_path = path.join(tmpdirname, "playback.y4m")

            # Decode main video
            subprocess.check_output(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    "-",
                    "-err_detect",
                    "ignore_err",
                    "-y",
                    "-pix_fmt",
                    "yuv420p",
                    decoded_path,
                ],
                input=self.video_bytes,
                stderr=sys.stdout,
            )

            # Copy reference video
            with open(ref_path, "wb") as f:
                f.write(ref.video_bytes)

            vmaf = json.loads(
                subprocess.check_output(
                    [
                        "ffmpeg",
                        "-i",
                        decoded_path,
                        "-err_detect",
                        "ignore_err",
                        "-i",
                        ref_path,
                        "-lavfi",
                        "[0][1]libvmaf=log_path=/dev/stdout:log_fmt=json:ssim=1:psnr=1:n_threads=14",
                        "-f",
                        "null",
                        "-",
                    ],
                    input=self.video_bytes,
                    stderr=sys.stdout,
                )
            )
        frames = []
        for f in vmaf["frames"]:
            f["metrics"]["n"] = f["frameNum"]
            frames.append(f["metrics"])

        stats = {}
        for qual in ("vmaf", "psnr_y", "float_ssim"):
            stats.update(
                {
                    f"{qual}_min": vmaf["pooled_metrics"][qual]["min"],
                    f"{qual}_max": vmaf["pooled_metrics"][qual]["max"],
                    f"{qual}_mean": vmaf["pooled_metrics"][qual]["mean"],
                }
            )

        return frames, stats

    def get_samples(self, content: bytes, src_size: int):
        content += bytes([0] * (src_size - len(content)))
        with tempfile.TemporaryDirectory() as tmpdirname:
            seg_path = path.join(tmpdirname, "segment.mp4")
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

    def get_all_details(self, *, ref):
        details = {"frames": self.get_frames(), "part_offsets": list(self.part_offsets), "stats": {}}
        if ref is not None:
            details["quality"], qual_stats = self.get_quality_vmaf(ref)
            details["stats"].update(qual_stats)
        return details

    def stream_playback(self):
        with tempfile.TemporaryDirectory() as tmpdirname:
            decoded_path = path.join(tmpdirname, "playback.mp4")
            subprocess.check_output(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    "-",
                    "-err_detect",
                    "ignore_err",
                    "-c:v",
                    "libsvtav1",
                    "-crf",
                    "27",
                    "-y",
                    decoded_path,
                ],
                input=self.video_bytes,
                stderr=sys.stdout,
            )
            with open(decoded_path, "rb") as f:
                return bytes(f.read())


class VideoInspector:
    app: Flask

    def __init__(self, app: Flask) -> None:
        self.app = app
        pass

    def init_routes(self):
        @self.app.get("/video-inspector/video/details")
        def _get_video_details():
            parts = list(filter(bool, request.args["urls"].split("\n")))
            ref_parts = list(filter(bool, request.args["refs"].split("\n")))
            if len(ref_parts) > 0:
                ref_video = Video(parts=ref_parts)
            else:
                ref_video = None
            video = Video(parts=parts)
            return jsonify(video.get_all_details(ref=ref_video))

        @self.app.get("/video-inspector/video/playback.mp4")
        def _get_video_playback():
            parts = list(filter(bool, request.args["urls"].split("\n")))
            video = Video(parts=parts)
            r = make_response(video.stream_playback())
            r.mimetype = "video/mp4"
            return r
