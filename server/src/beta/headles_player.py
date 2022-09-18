import asyncio
from asyncio import subprocess
import json
from threading import Thread
from os.path import join
from flask import Flask, request, jsonify, Response,send_from_directory
from src.job_framework.server.job_manager_server import JobManagerServer
from src.beta.codec import Codec
from src.beta.experiment_runner import ExperimentRunner
from src.beta.player_utils import get_all_results
from src.beta.run import get_run


config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

class HeadlessPlayerApi:
    app: Flask
    job_manager: JobManagerServer
    runner: ExperimentRunner
    loop: asyncio.AbstractEventLoop

    def __init__(self, app: Flask, job_manager: JobManagerServer, runner: ExperimentRunner, loop: asyncio.AbstractEventLoop) -> None:
        self.app = app
        self.job_manager = job_manager
        self.runner = runner
        self.loop = loop

    def init_routes(self):

        @self.app.route('/static/runs/<path:path>')
        def send_report(path):
            return send_from_directory(CONFIG['headlessPlayer']['resultsDir'], path)
            
        @self.app.get('/headless-player/runs')
        def _get_all_results():
            response = jsonify({"results": get_all_results()})
            response.headers.add("Access-Control-Allow-Origin", "*")
            return response


        @self.app.post('/headless-player/runs/new')
        async def _start_new_experiment():
            config = request.get_json(force=True)
            scheduled_runs = self.runner.schedule_runs(config)
            return jsonify({
                'success': True,
                'message': f"Successfully Scheduled {len(scheduled_runs)} runs.",
                'runs': scheduled_runs
            })
            # return Response(stream_with_context(generate()), mimetype='text')


        @self.app.post('/headless-player/runs/delete')
        def _delete_runs():
            run_keys = request.get_json(force=True)
            for run_key in run_keys:
                get_run(run_key).delete()
            return jsonify("Success")
            # return Response(stream_with_context(generate()), mimetype='text')

        # TODO: Replace with job


        @self.app.get('/headless-player/runs/encode-playback')
        def _get_encode_playback():
            run = get_run(request.args["run"])
            codec = Codec(run, self.job_manager)
            return jsonify(codec.encode_playback())


        @self.app.get('/headless-player/runs/playback-quality')
        def _get_quality():
            runs = [get_run(runId) for runId in request.args['runs'].split(",")]
            if len(runs) == 1:
                codec = Codec(runs[0], self.job_manager)
                future = asyncio.run_coroutine_threadsafe(codec.calculate_quality(), self.loop)
                print("Waiting for playback-quality results")
                result = future.result()
                print("Got playback-quality results")
                return jsonify(result)
            else:
                async def await_tasks():
                    tasks = []
                    for run in runs:
                        codec = Codec(run, self.job_manager)
                        tasks.append(codec.calculate_quality())
                    await asyncio.gather(*tasks)
                # Thread(
                #     target=,
                #     args=(await_tasks,),
                #     daemon=True).start()
                asyncio.run_coroutine_threadsafe(await_tasks(), self.loop)
                return jsonify({'message': f"Scheduled {len(runs)} run quality calculations"})

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
            p2 = subprocess.Popen(["wireshark", "-k", "-i", "-"], stdin=p1.stdout)
            p2.communicate()
            return jsonify({"status": "success"})