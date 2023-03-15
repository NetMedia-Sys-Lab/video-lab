import json
import os
from os.path import join, dirname
from pathlib import Path
import re

gaps = []

def get_quality_and_index(seg_path):
    r = re.compile("(?:chunk|seg|frames)-stream(\\d)-(\\d{5})(?:-o)?(?:-e)?(?:.mp4|.m4s|.json)$")
    s = r.search(seg_path)
    if s is not None:
        return int(s.group(1)), int(s.group(2))
    else:
        raise Exception(f"Invalid frame path: {seg_path}")

def process(frames_path):
    with open(frames_path) as f:
        frames = json.load(f)['frames']
    with open(join(dirname(dirname(frames_path)), 'data-1.json')) as f:
        data = json.load(f)
    with open(join(dirname(dirname(frames_path)), 'config.json')) as f:
        config = json.load(f)

    quality, index = get_quality_and_index(frames_path)
    seg_data = next(filter(lambda s: s['index']==(index-1),data['segments']))

    for f in frames:
        f['pkt_pts_time'] = float(f['pkt_pts_time'])
        f['pkt_duration_time'] = float(f['pkt_duration_time'])

    frames.sort(key=lambda f: f['pkt_pts_time'])

    t = 0
    for i in range(len(frames)):
        f = frames[i]
        gap = round(f['pkt_pts_time'] - t,5)
        if gap != 0:
            print(f'{gap=}')
            gaps.append({
                'duration': gap,
                'seg_ratio': seg_data['stop_ratio']
            })
            # exit()
        t = f['pkt_pts_time'] + f['pkt_duration_time']
    
    end_gap = round(config['length']-t,5)
    if end_gap != 0:
        gaps.append({
            'duration': end_gap,
            'seg_ratio': seg_data['stop_ratio']
        })
        # print(f'End Gap = {end_gap=}\t\t{frames_path}')


frames_dir = "/home/akram/ucalgary/research/runs/"

# process(frames_dir)

# for filename in os.listdir(frames_dir):
#     if filename.endswith(".json"):
#         print(filename)
#         process(join(frames_dir, filename))

pathlist = Path(frames_dir).glob('*/*_av1_*quic*/frames/*.json')
for path in pathlist:
     # because path is object not string
     path_in_str = str(path)
    #  print(path_in_str)
     process(path_in_str)
     # print(path_in_str)
print(len(gaps))
with open('gaps-quic.json', 'w') as f:
    json.dump(gaps, f)
# print(json.dumps(gaps, indent=4))