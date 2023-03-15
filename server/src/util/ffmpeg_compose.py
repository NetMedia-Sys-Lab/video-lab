from itertools import groupby
import math
from typing import List

from src.util.ffmpeg import Ffmpeg

FONTFILE="/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
           

class FfmpegCompose:
    videos: List[str]

    def __init__(self) -> None:
        self.videos = []

    def add_video(self, video_path):
        self.videos.append(video_path)
    
    @staticmethod
    def filter_drawstring(text, x, y, box=False):
        ret  = f"drawtext=fontfile={FONTFILE}:text='{text}'"
        ret += f":fontcolor=white:fontsize=24"
        if box:
            ret += f":box=1:boxcolor=black@0.5:boxborderw=5"
        ret += f":x={x}:y={y}"
        return ret

    def build(self, output_path: str):
        cmd = ['ffmpeg', '-y']

        rows = math.ceil(math.sqrt(len(self.videos)))
        cols = math.ceil(len(self.videos)/rows)
        print(rows, cols)

        # Add Video inputs
        for video in self.videos:
            cmd.extend(['-i', video])
        
        # Create background
        duration = math.ceil(max(map(Ffmpeg.get_duration, self.videos)))+1
        filter = f"color=c=black:{1920*cols}x{1080*rows}:d={duration}[vid]"
        # Add Video tiles
        for index, video in enumerate(self.videos):
            c = index % cols
            r = index // cols
            # filter += f";[vid]{self.filter_drawstring('ENDED')}[vid]"
            filter += f";[vid]drawtext=fontfile={FONTFILE}:text='ENDED':fontcolor=white:fontsize=80:x={1920*c}+(1920-text_w)/2:y={1080*r}+(1080-text_h)/2[vid]"
            filter += f";[vid][{index}:v]overlay={1920*c}:{1080*r}:eof_action=pass[vid]"
            filter += f";[vid]drawtext=fontfile={FONTFILE}:text='{video.split('/')[-3]}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=5:x={1920*c}+(1920-text_w)/2:y={1080*r}+405+(1080-text_h)/2[vid]"

        cmd.extend(['-filter_complex', filter])
        cmd.extend(['-map', '[vid]', output_path])
        print(cmd)
        return cmd