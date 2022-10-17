import json
import re
import subprocess
import sys
import time
from typing import List


class Ffmpeg:
    
    @staticmethod
    def decode_segment(input_segments: List[str], output: str, video_format: str):
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
    def concat_segments(input_segments: List[str], output: str, filters: List[str] = []):
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
    def generate_buffering_segment(frame_rate: str, duration: float, output: str = None):
        if output is None:
            output = f"/tmp/buff-{frame_rate}-{duration}.mp4"
        subprocess.check_call(
            ['ffmpeg', '-f', 'lavfi', '-i', f'color=size=1920x1080:duration={duration}:rate={frame_rate}:color=black', 
                '-vf', "drawtext=fontfile=$FONTFILE:fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='BUFFERING ...'",
                output],
            stdout=sys.stdout,
            stderr=sys.stderr
        )
        return output

    @staticmethod
    def cut_video(source_path: str, start: float, end: float, output: str = None):
        if output is None:
            output = f"/tmp/cut-{round(time.time() * 1000)}.mp4"
        subprocess.check_call(
            ["ffmpeg", "-ss", f"{start}", "-i", source_path, "-c", "copy", "-t", f"{end-start}", output],
            stdout=sys.stdout,
            stderr=sys.stderr
        )
        return output

    @staticmethod
    def get_frames(video_path):
        return subprocess.check_output([
            "ffprobe", "-v", "quiet", "-show_frames", "-of", "json",
            video_path
        ], stderr=sys.stderr).decode()
    
    @staticmethod
    def video_details(video_path):
        return json.loads(subprocess.check_output([
            "ffprobe", "-v", "quiet", "-show_streams", "-of", "json",
            video_path
        ], stderr=sys.stderr).decode())

    @staticmethod
    def get_frame_rate(video_path) -> float:
        frame_rate = Ffmpeg.video_details(video_path)["streams"][0]["r_frame_rate"].split("/")
        if len(frame_rate) == 2:
            return float(frame_rate[0])/float(frame_rate[1])
        elif len(frame_rate) == 1:
            return float(frame_rate[0])
        else:
            raise Exception(f"Unknow frame rate format {frame_rate}")
