import { Socket } from "socket.io-client"

export declare type JobType = {
    job_name: string
    job_id: string
    status: "SCHEDULED" | "RUNNING" | "FAILED" | "SUCCESSFUL"
    error: string
    stdouterr: string
    scheduled_at?: number
    run_at?: number
    finished_at?: number
    progress: number
}

export type JobManagerStateType = {
    selectedJobId?: string,
    autoRefresh: boolean,
}

export type JobManagerContextType = {
    jobManagerState: JobManagerStateType,
    setJobManagerState: React.Dispatch<React.SetStateAction<JobManagerStateType>>
}

export type AppStateType = {
    socket?: Socket

    ws?: WebSocket

    stateKeys: {[key: string]: any}
    stateValues: {[key: string]: any}
}

export type AppContextType = {
    appState: AppStateType,
    setAppState: React.Dispatch<React.SetStateAction<AppStateType>>
}