import { RunConfig } from "./result.type"

export type RunSegmentType = {
    adap_set_id: number
    adaptation_throughput: number
    bitrate: number
    first_byte_at: number
    index: number
    last_byte_at: number
    quality: number
    received_bytes: number
    repr_id: number
    segment_throughput: number
    start_time: number
    stop_time: number
    stopped_bytes: number
    total_bytes: number
    url: string
    init_url: string
    duration: number
}

export type RunStateType = {
    position: number
    state: string
    time: number
}
export type RunBwActualType = {
    bw: number
    drop: number
    latency: number
    time: number
}
export type RunBwEstimatedType = {
    bandwidth: number
    time: number
}
export type RunVmafType = {
    mean: number,
    segments: number[]
}
export type RunMicroStallsType = {
    segments: {
        play_duration: number,
        stall_duration: number
    }[],
    total_play_duration: number
    total_stall_duration: number
    long_stall_duration: number
}
export type RunStallType = {
    time_start: number
    time_end: number
}

export type RunDataType = {
    run_id: string
    run_config: RunConfig
    num_stall: number
    num_quality_switches: number
    dur_stall: number
    states: [RunStateType]
    buffer_level: [{ level: number, time: number }]
    playback_start_time: number
    tc_stats: [{
        time: number
        qdiscs: {
            [handle: string]: {
                backlog: number
                dropped: number
                type: string
                variant: string
            }
        }
    }]
    stalls: [RunStallType]
    segments: RunSegmentType[]
    bandwidth_actual: [RunBwActualType]
    bandwidth_estimate: [RunBwEstimatedType]
    vmaf: RunVmafType
    // micro_stalls: RunMicroStallsType
}

export type RunProgressType = {
    progress: number
}