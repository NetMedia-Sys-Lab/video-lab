import { index } from "d3";
import { ApiBase, createUseAPI } from "./api";

const DatasetApi = `${ApiBase}/dataset`
const euc = encodeURIComponent

export const useDatasetTree = createUseAPI<[], any>(async () => {
    const response = await fetch(`${DatasetApi}/tree`);
    const data = await response.json();
    return data;
});

export const createBetaMpd = async (paths: string[])  => {
    const response = await fetch(`${DatasetApi}/video/createMpd?paths=${euc(paths.join(","))}`);
    const data = await response.json();
    return data;
}