from collections import defaultdict
from curses import nonl
import json
import os
from os.path import join, dirname, basename
from pathlib import Path
from pprint import pprint
import re



def get_quality_and_index(seg_path):
    r = re.compile("(?:chunk|seg|frames)-stream(\\d)-(\\d{5})(?:-o)?(?:-e)?(?:.mp4|.m4s|.json)$")
    s = r.search(seg_path)
    if s is not None:
        return int(s.group(1)), int(s.group(2))
    else:
        raise Exception(f"Invalid frame path: {seg_path}")


def process(frames_path):
    run_dir = dirname(dirname(frames_path))
    with open(frames_path) as f:
        frames = json.load(f)["frames"]
    with open(join(dirname(dirname(frames_path)), "data-1.json")) as f:
        data = json.load(f)
    with open(join(dirname(dirname(frames_path)), "config.json")) as f:
        config = json.load(f)

    run_id = f"{basename(dirname(run_dir))}/{basename(run_dir)}"
    quality, index = get_quality_and_index(frames_path)
    seg_data = next(filter(lambda s: s["index"] == (index - 1), data["segments"]))

    for f in frames:
        f["pkt_pts_time"] = float(f["pkt_pts_time"])
        f["pkt_duration_time"] = float(f["pkt_duration_time"])

    frames.sort(key=lambda f: f["pkt_pts_time"])

    total_gaps_by_run[run_id] += 0
    visible_gaps_by_run[run_id] += 0

    if seg_data["stop_ratio"] < 0.3:
        return

    t = 0
    for i in range(len(frames)):
        f = frames[i]
        gap = round(f["pkt_pts_time"] - t, 5)
        if gap != 0:
            total_gaps_by_run[run_id] += gap
            if gap >= 0.43:
                # print(f"{gap=}\t{frames_path}")
                visible_gaps_by_run[run_id] += gap
            gaps.append({"duration": gap, "path": frames_path, "seg_ratio": seg_data["stop_ratio"]})
            # exit()
        t = f["pkt_pts_time"] + f["pkt_duration_time"]

    end_gap = round(config["length"] - t, 5)
    if end_gap != 0:
        total_gaps_by_run[run_id] += end_gap
        if end_gap >= 0.43:
            # print(f"{end_gap=}\t{frames_path}")
            visible_gaps_by_run[run_id] += end_gap
        gaps.append({"duration": end_gap, "path": frames_path, "seg_ratio": seg_data["stop_ratio"]})
        # print(f'End Gap = {end_gap=}\t\t{frames_path}')


frames_dir = "/home/akram/ucalgary/research/runs/"

globs = {
    "Aspen": "results-exp-hevcvsav1-001/*_av1_Aspen_*_beta_tcp*/frames/*.json",
    "BBB": "results-exp-hevcvsav1-001/*_av1_BBB_*beta_tcp*/frames/*.json",
    "Burn": "results-exp-hevcvsav1-001/*_av1_Burn_*beta_tcp*/frames/*.json",
    "Football": "results-exp-hevcvsav1-001/*_av1_Football_*beta_tcp*/frames/*.json",
}
# buffering_stalls = {
#     "Aspen": 1.05,
#     "BBB": 2.107,
#     "Burn": 2.914,
#     "Football": 1.152
# }
buffering_stalls = {
    "Aspen": 1.365,
    "BBB": 3.212,
    "Burn": 5.538,
    "Football": 3.678
}

gaps = []

for name, glob in globs.items():
    pathlist = Path(frames_dir).glob(glob)

    visible_gaps_by_run = defaultdict(int)
    total_gaps_by_run = defaultdict(int)
    for path in pathlist:
        path_in_str = str(path)
        # print(path_in_str)
        try:
            process(path_in_str)
        except:
            print(f"Error in {path_in_str}")
            raise

    visible_stutter = sum(visible_gaps_by_run.values())/len(visible_gaps_by_run)
    visible_stall = visible_stutter + buffering_stalls[name]
    print("%s : Visible Stutter = %.4f, Visible Stall = %.4f" % (name, visible_stutter, visible_stall))

with open("gaps-quic.json", "w") as f:
    json.dump(gaps, f)
