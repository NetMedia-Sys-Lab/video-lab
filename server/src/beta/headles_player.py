import asyncio
import json
import subprocess
from flask import Flask, request, jsonify, send_from_directory
from src.job_framework.jobs.job_python import PythonJob
from src.job_framework.server.job_manager_server import JobManagerServer
from src.beta.codec import Codec
from src.beta.experiment_runner import ExperimentRunner
from src.beta.player_utils import get_all_results, get_configs
from src.beta.run import get_run
from src.state_manager import StateManager


config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


class HeadlessPlayerApi:
    app: Flask
    job_manager: JobManagerServer
    runner: ExperimentRunner
    loop: asyncio.AbstractEventLoop
    state_manager: StateManager

    def __init__(self, app: Flask, job_manager: JobManagerServer, runner: ExperimentRunner, loop: asyncio.AbstractEventLoop, state_manager: StateManager) -> None:
        self.app = app
        self.job_manager = job_manager
        self.runner = runner
        self.loop = loop
        self.state_manager = state_manager

    def init_routes(self):

        @self.app.route('/static/runs/<path:path>')
        def static_runs(path):
            return send_from_directory(CONFIG['headlessPlayer']['resultsDir'], path)
        
        @self.app.route('/static/dataset/<path:path>')
        def static_dataset(path):
            return send_from_directory(CONFIG['dataset']['datasetDir'], path)

        @self.app.get('/headless-player/runs')
        def _get_all_results():
            response = jsonify({"results": get_all_results()})
            response.headers.add("Access-Control-Allow-Origin", "*")
            return response

        @self.app.post('/headless-player/runs/configs')
        def _get_run_configs():
            run_ids = request.get_json(force=True)['run_ids']
            response = jsonify(get_configs(run_ids))
            return response

        @self.app.post('/headless-player/runs/new')
        def _start_new_experiment():
            config = request.get_json(force=True)
            scheduled_runs = self.runner.schedule_runs(config)
            return jsonify({
                'success': True,
                'message': f"Successfully Scheduled {len(scheduled_runs)} runs.",
                'runs': scheduled_runs
            })

        @self.app.post('/headless-player/runs/delete')
        def _delete_runs():
            run_keys = request.get_json(force=True)
            for run_key in run_keys:
                get_run(run_key).delete()
            return jsonify("Success")
            # return Response(stream_with_context(generate()), mimetype='text')

        @self.app.get('/headless-player/runs/encode-playback')
        def _get_encode_playback():
            run_ids = request.args['runs'].split(",")
            asyncio.set_event_loop(self.loop)
            for run_id in run_ids:
                self.job_manager.schedule(PythonJob(config={
                    'callback': Codec.encode_playback_job.__name__,
                    "args": (run_id,),
                    'kwargs': {}
                }))
            return jsonify({'message': f"Scheduled {len(run_ids)} playback encoding"})

        @self.app.get('/headless-player/runs/playback-quality')
        def _get_quality():
            run_ids = request.args['runs'].split(",")
            asyncio.set_event_loop(self.loop)
            for run_id in run_ids:
                self.job_manager.schedule(PythonJob(config={
                    'callback': Codec.calculate_quality.__name__,
                    "args": (run_id,),
                    'kwargs': {}
                }))
            return jsonify({'message': f"Scheduled {len(run_ids)} run quality calculations"})

        @self.app.route('/headless-player/runs/data')
        def _get_run_detail():
            runs = request.args["runs"].split(",")
            print("Getting runs data")
            data = {
                run: get_run(run).json()
                for run in runs
            }
            print("Getting rtuns data over")
            return jsonify(data)

        @self.app.get('/headless-player/runs/wireshark')
        def _open_wireshark():
            files = request.args["files"].split(",")
            p1 = subprocess.Popen(['mergecap', '-w', '-', *[f"{CONFIG['headlessPlayer']['resultsDir']}/{f}" for f in files]],
                                  stdout=subprocess.PIPE)
            p2 = subprocess.Popen(
                ["wireshark", "-k", "-i", "-"], stdin=p1.stdout)
            p2.communicate()
            return jsonify({"status": "success"})
        
        @self.app.get("/headless-player/runs/create-tiles")
        def create_tiles():
            run_ids = request.args['runs'].split(",")
            self.job_manager.schedule(PythonJob(config={
                'callback': Codec.create_tiles_video.__name__,
                "args": (run_ids,),
                'kwargs': {}
            }))
