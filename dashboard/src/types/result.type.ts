/*class RunConfig(TypedDict):
    resultId: str
    runId: str
    runDir: str
    video: str
    beta: bool
    codec: str
    protocol: str
    length: int
    bufferSetting: str
    bwProfile: str
    attempt: int
    target: str
    env: str
    serverImage: str
    serverLogLevel: str*/

export declare type RunConfig =  {
    resultId: string
    runId: string
    _selections: {
        analyzer: string
        buffer: string
        input: string
        method: string
        network: string
        server: string
    }

    K_MAXIMUM_WINDOW: string
    buffer_duration: number
    bw_profile: string
    input: string
    live_log: string
    min_rebuffer_duration: string
    min_start_duration: string
    mod_beta: string
    mod_downloader: string
    mod_vq: string
    panic_buffer_level: string
    run_dir: string
    run_id: string
    safe_buffer_level: string
    server_image: string
}

export declare type RunOrResult = RunConfig & {
    runs?: RunConfig[]
}

export declare type LogLineType = {
    time: number
    tags: string[]
    text: string
}

export type RunsFilterType = {
    runId?: string
}