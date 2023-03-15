import json
from os import listdir
from os.path import basename, dirname, isdir, join
from time import sleep

config_file = open("config.json")
CONFIG = json.load(config_file)
config_file.close()


def stream_file(file, stream=True):
    with open(file, "r") as file:
        i = 0
        slept = 0
        delay = 0.5
        sleep_timeout = 10
        while True:
            line = file.readline()
            if not line:
                if not stream:
                    return
                if slept >= sleep_timeout:
                    return
                sleep(delay)
                slept += delay
                continue
            else:
                slept = 0
                yield line


def get_run_params(run_dir):
    with open(join(run_dir, "config.json")) as f:
        config = json.load(f)
    
    fixed = False
    # Fix run config
    if "runId" not in config:
        config['runId'] = basename(dirname(run_dir)) + "/" + basename(run_dir)
        fixed = True
    if "resultId" not in config:
        config['resultId'] = basename(dirname(run_dir))
        fixed = True
        
    # Resave config file if fixed
    if fixed:
        with open(join(run_dir, "config.json"), 'w') as f:
            json.dump(config, f)

    return config



def get_all_results():
    results_dir = CONFIG["headlessPlayer"]["resultsDir"]
    result_dir_prefix = CONFIG["headlessPlayer"]["resultDirPrefix"]

    dirs = [f for f in listdir(results_dir)
            if isdir(join(results_dir, f))]
    if result_dir_prefix is not None:
        dirs = [f for f in dirs if f.startswith(result_dir_prefix)]

    results = [{
        "runId": dir,
        "runs": [
            get_run_params(join(results_dir, dir, run))
            for run in listdir(join(results_dir, dir))
            if isdir(join(results_dir, dir, run))
        ]
    } for dir in dirs]
    return results
