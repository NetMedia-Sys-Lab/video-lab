import json
import subprocess
import sys
import requests
from flask import Flask, request, jsonify

class Video:
    video_bytes: bytearray

    def __init__(self, *, urls) -> None:
        self.urls = urls
        if urls is not None:
            self.video_bytes = bytearray()
            for url in urls:
                self.video_bytes.extend(requests.get(url).content)

    def get_frames(self):
        return json.loads(subprocess.check_output([
            "ffprobe", "-show_frames", "-of", "json",
            "-"
        ], input=self.video_bytes, stderr=sys.stdout))["frames"]

    def get_all_details(self):
        return {
            'frames': self.get_frames()
        }


class VideoInspector:

    @staticmethod
    def init_routes(app: Flask):

        @app.get('/video-inspector/video/details')
        def _get_video_details():
            urls = request.args['urls'].split(",")
            video = Video(urls=urls)
            return jsonify(video.get_all_details())
