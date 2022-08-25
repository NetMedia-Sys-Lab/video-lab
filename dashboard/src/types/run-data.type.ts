import {RunConfig} from "./result.type";

export type RunSegmentType = {
    bitrate: number;
    end: number;
    first_byte_at: number;
    index: number;
    last_byte_at: number;
    quality: number;
    ratio: number;
    start: number;
    stop_ratio: number;
    throughput: number;
    url: string;
};
export type RunStateType = {
    position: number;
    state: string;
    time: number;
}
export type RunBwActualType = {
    bw: number;
    drop: number;
    latency: number;
    time: number;
};
export type RunBwEstimatedType = {
    bandwidth: number;
    time: number;
};

export type RunDataType = {
    runId: string;
    run_config: RunConfig;
    num_stall: number;
    dur_stall: number;
    states: [RunStateType];
    tc_stats: [{
        time: number;
        qdiscs: {
            [handle: string]: {
                backlog: number;
                dropped: number;
                type: string;
                variant: string;
            }
        }
    }];
    segments: RunSegmentType[];
    bandwidth_actual: [RunBwActualType]
    bandwidth_estimate: [RunBwEstimatedType]

}