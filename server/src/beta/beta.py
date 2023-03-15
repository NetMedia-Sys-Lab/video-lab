import copy
import glob
import json
import os
from os.path import join, exists, basename, dirname
from pprint import pprint
import shutil
import subprocess
import sys
from typing import List
from xml.dom import minidom
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

def copy_stream_files(dash_dir: str, quality: int, target_dir: str):
    seg_paths = []
    shutil.copyfile(join(dash_dir, "segment_init.mp4"), join(target_dir, f"init-stream{quality}.m4s"))
    for segment_file in glob.glob(join(dash_dir, "segment_*.m4s")):
        index = int(basename(segment_file).split("_")[1].split(".")[0])
        output_file = join(target_dir, f"chunk-stream{quality}-{index:05d}.m4s")
        seg_paths.append(output_file)
        shutil.copyfile(segment_file, output_file)
    return ET.parse(join(dash_dir, "video_dash.mpd")), seg_paths

def _pretty_print(current, parent=None, index=-1, depth=0):
    for i, node in enumerate(current):
        _pretty_print(node, current, i, depth + 1)
    if parent is not None:
        if index == 0:
            parent.text = '\n' + ('\t' * depth)
        else:
            parent[index - 1].tail = '\n' + ('\t' * depth)
        if index == len(parent) - 1:
            current.tail = '\n' + ('\t' * (depth - 1))

def merge_mpd(path, merged_path):
    dash_dirs = glob.glob(join(path, "DROP0", "*", "dash"))
    dash_dirs.sort(key=lambda d: int(d.rsplit("/", 2)[-2].rstrip("bps")), reverse=True)
    merged_xml = ET.parse(join(dash_dirs[0], "video_dash.mpd")).getroot()
    for el in merged_xml.iter():
        prefix, has_namespace, postfix = el.tag.partition('}')
        if has_namespace:
            el.tag = postfix  # strip all namespaces
    merged_xml.find(".//AdaptationSet").remove(merged_xml.find(".//Representation"))
    for quality, dash_dir in enumerate(dash_dirs):
        print(quality, dash_dir)
        stream_xml, seg_paths = copy_stream_files(dash_dir, quality, dirname(merged_path))
        for el in stream_xml.iter():
            prefix, has_namespace, postfix = el.tag.partition('}')
            if has_namespace:
                el.tag = postfix  # strip all namespaces
        representation = stream_xml.getroot().find(".//Representation")
        segList = representation.find('./SegmentList')    
        timescale = segList.attrib["timescale"]
        duration = segList.attrib["duration"]
        representation.remove(segList)
        print(timescale, duration)
        representation.append(ET.fromstring(f'''
        <SegmentTemplate 
            timescale="{timescale}" 
            initialization="init-stream$RepresentationID$.m4s" 
            media="chunk-stream$RepresentationID$-$Number%05d$.m4s" 
            startNumber="1">
                <SegmentTimeline>
                    {"".join([f'<S d="{duration}" />' for seg in seg_paths])}
                </SegmentTimeline>
        </SegmentTemplate>
        '''))
        representation.attrib["id"] = str(quality)
        merged_xml.find(".//AdaptationSet").append(representation)
    _pretty_print(merged_xml)
    xmlstr = ET.tostring(merged_xml).decode()
    print(xmlstr)
    with open(join(merged_path), 'w') as f:
        f.write(xmlstr)
        

@register_python_job()
def replace_beta_parameters(dataset_path):
    merged_mpd_path = join(dataset_path, 'output.mpd')
    merge_mpd(dataset_path, merged_mpd_path)
    mpd = ET.parse(merged_mpd_path)
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

