import copy
import json
import os
from os.path import join
from pprint import pprint
import subprocess
import sys
from typing import List
import xml.etree.ElementTree as ET
from xml.etree.ElementTree import Element

from src.job_framework.jobs.job_python import register_python_job


def get_frames(init_path, chunk_path):
    init_bytes = None
    chunk_bytes = None
    with open(init_path, 'rb') as f:
        init_bytes = f.read()
    with open(chunk_path, 'rb') as f:
        chunk_bytes = f.read()

    frames = json.loads(subprocess.check_output([
        "ffprobe", "-v", "quiet", "-show_frames", "-of", "json", "-"
    ], input=bytearray([*init_bytes, *chunk_bytes]), stderr=sys.stdout))

    return frames['frames'], len(init_bytes), len(chunk_bytes)


def get_last_iframe(frames: List):
    frames.sort(key=lambda frame: frame['pkt_pos'])
    for frame in frames[:-1]:
        if frame['pict_type'] == "I":
            return frame


def update_cutoffs(mpd: Element, quality, segment_cutoffs):
    # print(mpd)
    it = mpd.iter()
    for el in it:
        prefix, has_namespace, postfix = el.tag.partition('}')
        if has_namespace:
            el.tag = postfix  # strip all namespaces
    root = mpd.getroot()
    parent = {c: p for p in root.iter() for c in p}
    segment_timelines = []
    for node in root.findall(".//SegmentTimeline"):
        q = parent[parent[node]].attrib['id']
        if q == quality:
            segment_timelines.append(node)
    if len(segment_timelines) > 1:
        raise Exception(
            f"Found multiple segment timelines for quality {quality}")
    if len(segment_timelines) == 0:
        raise Exception(f"Found 0 segment timelines for quality {quality}")

    segments = []
    for i, segment in enumerate(segment_timelines[0].findall(".//*")):
        if segment.tag != 'S':
            raise Exception(f"Found invalid segment {segment}")
        segment_timelines[0].remove(segment)
        segment = copy.deepcopy(segment)
        if 't' in segment.attrib:
            del segment.attrib['t']
        repeat = segment.attrib.get('r')
        if repeat is None:
            segments.append(segment)
        else:
            del segment.attrib['r']
            segments.append(segment)
            for i in range(int(repeat)):
                segments.append(copy.deepcopy(segment))
    if len(segments) != len(segment_cutoffs):
        raise Exception(f"cutoff values ({len(segment_cutoffs)}) and segments ({len(segments)}) in mpd do not match for quality {quality}")
    for segment, cutoff in zip(segments, segment_cutoffs):
        segment_timelines[0].append(segment)
        segment.set('betaMrp', str(cutoff))

@register_python_job()
def replace_beta_parameters(dataset_path):
    mpd = ET.parse(join(dataset_path, 'output.mpd'))
    init_stream_files = [join(dataset_path, f) for f in os.listdir(
        dataset_path) if f.startswith("init-stream")]
    init_stream_files.sort()
    for init_path in init_stream_files:
        print(init_path)
        quality = init_path.rsplit(".", 1)[-2][-1]
        chunk_files = [join(dataset_path, f) for f in os.listdir(
            dataset_path) if f.startswith(f"chunk-stream{quality}-")]
        chunk_files.sort()
        segment_cutoffs = []
        for chunk_path in chunk_files:
            print(f"\t{chunk_path}")
            index = int(chunk_path.rsplit(".", 1)[-2].rsplit("-", 1)[-1])
            frames, init_size, chunk_size = get_frames(init_path, chunk_path)
            iframe = get_last_iframe(frames)
            if iframe is not None:
                min_ref_pos = int(iframe['pkt_pos']) + \
                    int(iframe['pkt_size'])+1 - init_size
            else:
                min_ref_pos = chunk_size
            segment_cutoffs.append(min_ref_pos)
        update_cutoffs(mpd, quality, segment_cutoffs)

    mpd.write(join(dataset_path, 'output-beta.mpd'))
