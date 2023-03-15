import json
import os
from os.path import join, dirname
from pathlib import Path
import re
import csv 
from collections import defaultdict

runs = {
    'TASQ': "/home/akram/ucalgary/research/runs/results-av1-001/run_drop-low_long-buffer_default_av1_Burn_2sec_beta_quic_01",
    'BETA': "/home/akram/ucalgary/research/runs/results-av1-001/run_drop-low_long-buffer_default_av1_Burn_2sec_beta_tcp_01",
    'DASH': "/home/akram/ucalgary/research/runs/results-av1-001/run_drop-low_long-buffer_default_av1_Burn_2sec_nonbeta_tcp_01",
}

plot_data = defaultdict(dict)

def process_run(run_dir, type = None):

    with open(join(run_dir, 'data-1.json')) as f:
        data = json.load(f)
    with open(join(run_dir, 'config.json')) as f:
        config = json.load(f)
    
    keys = []
    for segment in data['segments']:
        keys.extend(segment.keys())
        row = plot_data[segment['index']]
        row['index'] = segment['index']
        row[f'{type}-bitrate'] = round(segment['bitrate']/1000, 2)
        row[f'{type}-ratio'] = round(segment['ratio']*100, 2)
    keys = list(set(keys))

    with open(join(run_dir, 'data.csv'), 'w', newline='') as output_file:
        dict_writer = csv.DictWriter(output_file, keys)
        dict_writer.writeheader()
        dict_writer.writerows(data['segments'])


for type, run in runs.items():
    process_run(run, type)

plot_data = list(plot_data.values())
plot_data.sort(key=lambda r: r['index'])
print(json.dumps(plot_data, indent=4))

with open('bw-drop.csv', 'w', newline='') as output_file:
        dict_writer = csv.DictWriter(output_file, plot_data[0].keys())
        dict_writer.writeheader()
        dict_writer.writerows(plot_data)