export declare type JobType = {
    job_name: string
    job_id: string
    status: string
    error: string
    stdouterr: string
    scheduled_at?: number
    run_at?: number
    finished_at?: number
}