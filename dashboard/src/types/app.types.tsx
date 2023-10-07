export type AppState = {
    selectedJobId?: string
}

export type AppActions = {
    type: "JobsScheduled",
    payload: string[]
}