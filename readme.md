
# Install on Linux (Debian/Ubuntu)

## Dashboard setup
1. Install nodejs if not installed
    ```bash
    # Install node using NVM
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    source ~/.bashrc
    nvm install v20.8.0
    ```
2. Install the node packages
    ```bash
    cd dashboard
    npm install
    ```
3. Start
    ```bash
    cd dashboard
    npm start
    ```

## Server setup
- Install docker. See: https://docs.docker.com/desktop/install/ubuntu/
    - Make sure user has correct permissions: 
    ```bash
    sudo usermod -aG docker $USER
    ```
- Install istream-player. See: https://github.com/NetMedia-Sys-Lab/istream-player
- Install dependencies
    ```bash
    cd server
    pip install -r requirements.txt
    ```
- Edit config.json
    ```json
    {
        "headlessPlayer": {
            // Experiment data will be stored here. Make empty directory
            "resultsDir": "/PATH/TO/runs",
            // N/A
            "resultDirPrefix": "",
            // Location of docker-compose used for launching experiments
            "dockerCompose": "/PATH/TO/istream-player/docker-compose.yml"
        },
        "jobManager": {
            // Temporary location where jobs data will be stored.
            "jobsDir": "/PATH/TO/jobs",
            // N/A
            "jobManagerServerUrl": "http://localhost:3001"
        },
        "dataset": {
            // Dataset directory
            "datasetDir": "/PATH/TO/dataset"
        },
        "stateManager": {
            // The json states for the UI will be stored here
            "statesDir": "/PATH/TO/saved_states"
        },
        // Temporary cache directory
        "cacheDir": "/PATH/TO/tmp",
        // ssl_keylog file, use this for wireshark
        "SSLKEYLOGFILE": "/PATH/TO/ssl_keylog.txt",
        // font file, make sure it exists
        "fontFile": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    }
    ```
- Build istream_player image
- Build server image
- Start
    ```bash
    cd server
    python main.py
    ```