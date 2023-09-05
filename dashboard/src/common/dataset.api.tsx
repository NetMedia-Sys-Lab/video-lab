import { index } from "d3";
import { ApiBase, createUseAPI } from "./api";

const DatasetApi = `${ApiBase}/dataset`
const euc = encodeURIComponent

export const useDatasetTree = createUseAPI<[], any>(async () => {
    const response = await fetch(`${DatasetApi}/tree`);
    const data = await response.json();
    return data;
});

export const getAllInputPaths = async () => {
    const response = await fetch(`${DatasetApi}/allInputs`);
    const data: string[] = await response.json();
    return data;
}

export const createBetaMpd = async (paths: string[])  => {
    const response = await fetch(`${DatasetApi}/video/createMpd?paths=${euc(paths.join(","))}`);
    const data = await response.json();
    return data;
}

export const encodeHevcVideos = async (paths: string[], bitrates: number[], resolutions: string[], segLength: number)  => {
    const response = await fetch(`${DatasetApi}/video/encode/hevc`, {
        method: "POST",
        body: JSON.stringify({paths, bitrates, segLength, resolutions})
    });
    const data = await response.json();
    return data;
}

export const createDashPlaylist = async (paths: string[], segLength: number)  => {
    const response = await fetch(`${DatasetApi}/video/dash`, {
        method: "POST",
        body: JSON.stringify({paths, segLength})
    });
    const data = await response.json();
    return data;
}