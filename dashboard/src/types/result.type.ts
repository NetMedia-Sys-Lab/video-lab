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
    K_MAXIMUM_WINDOW: string
    resultId: string
    runId: string
    video: string
    beta: boolean
    codec: string
    protocol: string
    length: number
    bufferSetting: string
    bwProfile: string
    attempt: number
    calculateQuality: boolean

    serverImage?: string
    serverLogLevel?: string
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