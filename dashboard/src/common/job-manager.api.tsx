import { JobType } from "../types/job.type";
import { createUseAPI, JobManagerApi } from "./api";

const euc = encodeURIComponent;

export const useGetJobDetails = createUseAPI<[jobId?: string], JobType>(async (jobId?: string) => {
    if (!jobId) return null;
    const response = await fetch(`${JobManagerApi}/job/details?job=${euc(jobId!)}`);
    return await response.json();
});

export const deleteAllJobs = async () => {
    const response = await fetch(`${JobManagerApi}/deleteAll`);
    return await response.json();
}