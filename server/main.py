import asyncio
import json
import subprocess
from os.path import join

from flask import Flask, Response, request, stream_with_context, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

from src.codec import Codec
from src.experiment_runner import ExperimentRunner
from src.job_framework.job_manager import JobManager, JOB_MANAGER
from src.player_utils import get_all_results, stream_file
from src.run import Run
from src.run_watcher import RunsWatcher
from src.state_manager import init_routes, StateManager

app = Flask(__name__)
cors = CORS(app)

# app.config['CORS_HEADERS'] = 'Content-Type'
# app.config['SECRET_KEY'] = "akram_secret"

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

socketio = SocketIO(app, cors_allowed_origins="*")
# app.debug = True
app.host = "localhost"
loop = asyncio.get_event_loop()

state_manager: StateManager
runner: ExperimentRunner


@app.route('/static/runs/<path:path>')
def send_report(path):
    return send_from_directory(CONFIG['headlessPlayer']['resultsDir'], path)


@app.get('/headless-player/runs')
def _get_all_results():
    response = jsonify({"results": get_all_results()})
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response


@app.post('/headless-player/runs/new')
def _start_new_experiment():
    config = request.get_json(force=True)
    scheduled_runs = runner.schedule_runs(config)
    return jsonify({
        'success': True,
        'message': f"Successfully Scheduled {len(scheduled_runs)} runs.",
        'runs': scheduled_runs
    })
    # return Response(stream_with_context(generate()), mimetype='text')


@app.post('/headless-player/runs/delete')
def _delete_runs():
    run_keys = request.get_json(force=True)
    for run_key in run_keys:
        Run(run_key).delete()
    return jsonify("Success")
    # return Response(stream_with_context(generate()), mimetype='text')

# TODO: Replace with job
@app.get('/headless-player/runs/encode-playback')
def _get_encode_playback():
    run = Run(request.args["run"])
    codec = Codec(run)
    return jsonify(codec.encode_playback())

# TODO: Replace with job
@app.get('/headless-player/runs/playback-quality')
def _get_quality():
    run = Run(request.args["run"])
    codec = Codec(run)
    return jsonify(loop.run_until_complete(codec.calculate_quality()))

# @app.get('/headless-player/runs/logs')
# def _get_run_logs():
#     run = Run(request.args["run"])
#     return jsonify(run.get_logs())


@app.route('/headless-player/runs/data')
def _get_run_detail():
    runs_query = request.args["runs"]
    runs = [{"result": runId.split("/")[0], "run": runId.split("/")[1], "key": runId} for runId in
            runs_query.split(",")]
    data = {
        run["key"]: Run(run).json()
        for run in runs
    }
    return jsonify(data)


@app.get('/headless-player/runs/wireshark')
def _open_wireshark():
    files = request.args["files"].split(",")
    p1 = subprocess.Popen(['mergecap', '-w', '-', *[f"{CONFIG['headlessPlayer']['resultsDir']}/{f}" for f in files]],
                          stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["wireshark", "-k", "-i", "-"], stdin=p1.stdout)
    p2.communicate()
    return jsonify({"status": "success"})


@app.route('/headless-player/runs/stream-file')
def _stream_file():
    result = request.args["result"]
    run = request.args["run"]
    file_name = request.args["file"]

    results_dir = CONFIG["headlessPlayer"]["resultsDir"]
    file = join(results_dir, result, run, file_name)
    return Response(stream_with_context(stream_file(file)), content_type="text/plain")


@app.route('/headless-player/runs/read-file')
def _read_file():
    result = request.args["result"]
    run = request.args["run"]
    file_name = request.args["file"]

    results_dir = CONFIG["headlessPlayer"]["resultsDir"]
    file = join(results_dir, result, run, file_name)
    return Response(stream_with_context(stream_file(file, stream=False)), content_type="text/plain")


def main():
    global runner
    # Create utilities
    state_manager = StateManager(socketio=socketio, app=app, default_states={
        'run_states': {},
        'executor_stats': {},
        'job_manager_stats': {}
    })
    runs_watcher = RunsWatcher(state_manager=state_manager, app=app)
    runner = ExperimentRunner(app=app, state_manager=state_manager)
    JOB_MANAGER.init(app, state_manager, loop)

    # Init routes
    init_routes(app=app, socketio=socketio, state_manager=state_manager)
    JOB_MANAGER.init_routes()

    # Run
    runs_watcher.start_background()
    state_manager.start_background()
    JOB_MANAGER.start_background()
    socketio.run(app, port=3001)


if __name__ == "__main__":
    main()
