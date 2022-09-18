import argparse
import asyncio
import json
from threading import Thread
from time import sleep

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from src.job_framework.worker.job_worker import JobWorker
from src.job_framework.worker.job_manager_queues_remote import RemoteJobManagerQueues
from src.beta.headles_player import HeadlessPlayerApi

from src.job_framework.server.job_manager_queues import JobManagerQueues
from src.job_framework.server.job_manager_server import JobManagerServer
from src.dataset import Dataset
from src.beta.experiment_runner import ExperimentRunner
from src.run_watcher import RunsWatcher
from src.state_manager import StateManager

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()

loop = asyncio.new_event_loop()
Thread(
    target=loop.run_forever,
    daemon=True
).start()

def main():
    global runner

    parser = argparse.ArgumentParser(description="Video Lab Server")
    parser.add_argument('--workers', help="Start Job Workers", type=int, required=False)
    parser.add_argument('--server', help="Start Job Workers", action=argparse.BooleanOptionalAction)
    args = parser.parse_args()

    if args.workers:
        remote_job_manager_queues = RemoteJobManagerQueues(CONFIG['jobManager']['jobManagerServerUrl'], loop)
        for worker_id in range(1, args.workers+1):
            worker = JobWorker(worker_id, remote_job_manager_queues, loop)
            worker.start()
        

    if args.server:
        # Init Server
        app = Flask(__name__)
        cors = CORS(app)
        socketio = SocketIO(app, cors_allowed_origins="*")

        # Create utilities
        state_manager = StateManager(socketio=socketio, app=app, default_states={
            'run_states': {},
            'executor_stats': {},
            'job_manager_state': {}
        })
        job_manager_queues = JobManagerQueues(app, state_manager, loop)
        job_manager = JobManagerServer(app, state_manager, job_manager_queues, loop)
        runs_watcher = RunsWatcher(app, state_manager)
        runner = ExperimentRunner(app, state_manager, job_manager)
        dataset = Dataset(app, job_manager, loop)
        headless_player_api = HeadlessPlayerApi(app, job_manager, runner, loop)

        # Init routes
        state_manager.init_routes()
        job_manager_queues.init_routes()
        job_manager.init_routes()
        dataset.init_routes()
        headless_player_api.init_routes()

        # Run Background services
        runs_watcher.start_background()

        # Start Server
        socketio.run(app, host="0.0.0.0", port=3001)
    else:
        while True:
            sleep(100000)
        


if __name__ == "__main__":
    main()
