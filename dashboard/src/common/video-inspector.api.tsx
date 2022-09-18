import { index } from "d3";
import { ApiBase, createUseAPI } from "./api";

const VideoInspectorApi = `${ApiBase}/video-inspector`
const euc = encodeURIComponent

export const useVideoDetails = createUseAPI<[videoUrls: string[]], any>(async (videoUrls: string[]) => {
    const response = await fetch(`${VideoInspectorApi}/video/details?urls=${euc(videoUrls.join(","))}`);
    const data = await response.json()
    data.frames = data.frames.map((frame: any, i: number) => ({
        index: i,
        ...frame,
        pkt_pts_time: parseFloat(frame.pkt_pts_time),
        pkt_dts_time: parseFloat(frame.pkt_dts_time),
        best_effort_timestamp_time: parseFloat(frame.best_effort_timestamp_time),
        pkt_duration_time: parseFloat(frame.pkt_duration_time),
        pkt_pos: parseInt(frame.pkt_pos),
        pkt_size: parseInt(frame.pkt_size),
    }))
    return data;
});