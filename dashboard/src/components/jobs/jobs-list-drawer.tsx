import "./style.scss";
import { Badge, Button, Collapse, Drawer, List, message, Progress, Space, Spin } from "antd";
import { ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useStateSocket } from "../../common/api";
import { JobType } from "../../types/job.type";
import { JobDrawerComponent } from "./job-drawer";
import { deleteAllJobs } from "../../common/job-manager.api";
import { TimeAgoComponent } from "../misc/time-ago";
import { IndexType } from "typescript";
import { AppContext, JobManagerContext } from "../../app.context";

export const JobsListDrawerComponent = (props: {}) => {
    const [drawerVisible, setDrawerVisible] = useState(false);
    const { jobManagerState, setJobManagerState } = useContext(JobManagerContext);
    const { appState } = useContext(AppContext);
    const [jmState] = useStateSocket("job_manager_state", {
        scheduled: [] as JobType[],
        running: [] as JobType[],
        successful: [] as JobType[],
        cancelled: [] as JobType[],
        failed: [] as JobType[]
    });
    const [serverState] = useStateSocket("SERVER_STATE", {
        num_socket_clients: 0
    });
    const [activeDrawerKeys, setActiveDrawerKeys] = useState<string | string[]>([]);
    const finished = useMemo(() => {
        const jobs = [...jmState.successful, ...jmState.cancelled, ...jmState.failed];
        jobs.sort((a: JobType, b: JobType) => (a.finished_at || 0) - (b.finished_at || 0))
        return jobs;
    }, [jmState.successful, jmState.cancelled, jmState.failed])

    const isSocketConnected = appState.socket?.connected;

    const JobListPanel = (key: string, jobs: JobType[], header: ReactNode) => {
        const timeAgo = (job: JobType) => {
            return {
                "SCHEDULED": job.scheduled_at,
                "RUNNING": job.run_at,
                "SUCCESSFUL": job.finished_at,
                "CANCELLED": job.finished_at,
                "FAILED": job.finished_at,
            }[job.status.split(".").pop() as string]! * 1000
        };
        return <Collapse.Panel header={header} key={key}>
            <List
                size="small"
                dataSource={jobs}
                renderItem={job => <List.Item
                    className={`${job.status.split(".").pop()?.toLowerCase()}`}
                    onClick={() => setJobManagerState({ ...jobManagerState, selectedJobId: job.job_id })}>
                    {job.job_name}
                    <span style={{ float: 'right' }}>
                        <TimeAgoComponent time={timeAgo(job)} />
                    </span>
                </List.Item>}
            />
        </Collapse.Panel>
    }

    return <>

        <Badge
            count={isSocketConnected ? `Connected (${serverState.num_socket_clients} clients)` : 'Disconnected'}
            style={{ backgroundColor: isSocketConnected ? '#52c41a' : undefined }}
        />
        &nbsp;
        &nbsp;
        <Button onClick={() => setDrawerVisible(true)}>
            Jobs: {jmState.scheduled.length} Scheduled | {jmState.running.length} Running
            {jmState.running.length > 0 ? <Spin />
                : <> &nbsp;| <Badge count={jmState.failed.length} style={{ backgroundColor: "red" }} /></>}
        </Button>
        <Drawer
            className="job-list-drawer"
            open={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            size="large"
            width={"50vw"}
            title={<div style={{ display: "flex", alignItems: "center" }}>
                Job Manager
                <div style={{ flexGrow: 1 }}></div>
                <Button danger onClick={async () => {
                    try {
                        const resp = await deleteAllJobs();
                        await message.success(JSON.stringify(resp));
                    } catch (err: any) {
                        await message.error(JSON.stringify(err));
                    }
                }}>Delete All Jobs</Button>
            </div>}>
            <Collapse bordered={false} activeKey={activeDrawerKeys} onChange={keys => setActiveDrawerKeys(keys)}>
                {JobListPanel("1", jmState.scheduled, <>Scheduled
                    <Badge count={jmState.scheduled.length} style={{ backgroundColor: "grey" }} overflowCount={10000} />
                </>)}
                {JobListPanel("2", jmState.running, <>Running
                    <Badge count={jmState.running.length} style={{ backgroundColor: "blue" }} overflowCount={10000} />
                </>)}
                {JobListPanel("3", finished, <>Finished
                    <Badge count={jmState.successful.length} style={{ backgroundColor: "green" }} overflowCount={10000} />
                    <Badge count={jmState.cancelled.length} style={{ backgroundColor: "orange" }} overflowCount={10000} />
                    <Badge count={jmState.failed.length} style={{ backgroundColor: "red" }} overflowCount={10000} />
                </>)}
            </Collapse>
        </Drawer>
    </>
}