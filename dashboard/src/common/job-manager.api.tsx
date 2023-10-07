import { JobType } from "../types/job.type";
import { ApiBase, createUseAPI, JobManagerApi } from "./api";

const euc = encodeURIComponent;
export const ScriptsManagerApi = `${ApiBase}/scripts-manager`;

export const useGetJobDetails = createUseAPI<[jobId?: string], JobType>(async (jobId?: string) => {
    if (!jobId) return null;
    const response = await fetch(`${JobManagerApi}/job/details?job=${euc(jobId!)}`);
    return await response.json();
});

export const deleteAllJobs = async () => {
    const response = await fetch(`${JobManagerApi}/deleteAll`);
    return await response.json();
}

export const runScript = async (script_id: string) => {
    const response = await fetch(`${ScriptsManagerApi}/run`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id })
    });
    return await response.json();
}