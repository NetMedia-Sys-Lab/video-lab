import "./style.scss";
import { Button, Collapse, Layout, message, Typography } from "antd";
import { useState } from "react";
import { Content } from "antd/lib/layout/layout";
import { useStateSocket } from "../../common/api";
import { JobType } from "../../types/job.type";
import { JobDrawerComponent } from "../../components/jobs/job-drawer";
import { deleteAllJobs } from "../../common/job-manager.api";
import { PageType } from "../../types/page.type";
import { UnorderedListOutlined } from "@ant-design/icons";

const { Title } = Typography;

export const JobManagerComponent = (props: {}) => {
    const { state: jmState, isConnected: isSocketConnected } = useStateSocket("job_manager_state", {
        scheduled: [] as JobType[],
        running: [] as JobType[],
        successful: [] as JobType[],
        cancelled: [] as JobType[],
        failed: [] as JobType[]
    });
    const [selectedJob, setSelectedJob] = useState<JobType | null>(null);

    const JobListPanel = (name: string, jobs: JobType[] = []) => {
        return <Collapse.Panel key={name} header={name}>
            {
                jobs.length > 0 &&
                <table className="jobs-table">
                    {jobs.map(job => <tr className={`${job === selectedJob ? "selected" : ''}`}
                        onClick={e => setSelectedJob(job)}>
                        <td>{job.job_name}</td>
                    </tr>)}
                </table>
            }
        </Collapse.Panel>
    }

    return <Layout.Content>
            <Button danger onClick={async () => {
                try {
                    const resp = await deleteAllJobs();
                    await message.success(JSON.stringify(resp));
                } catch (err: any) {
                    await message.error(JSON.stringify(err));
                }
            }}>Delete All Jobs</Button>
            <Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
                <Collapse defaultActiveKey={["Scheduled", "Running", "Successful", "Cancelled", "Failed"]}>
                    {JobListPanel("Scheduled", jmState.scheduled)}
                    {JobListPanel("Running", jmState.running)}
                    {JobListPanel("Successful", jmState.successful)}
                    {JobListPanel("Cancelled", jmState.cancelled)}
                    {JobListPanel("Failed", jmState.failed)}
                </Collapse>
            </Content>
            <JobDrawerComponent jobId={selectedJob?.job_id} onClose={() => setSelectedJob(null)} />
    </Layout.Content>
}

export const JobManagerPage: PageType = {
    routerPath: '/job-manager',
    title: 'Job Manager',
    menuitem: {
        label: 'Job Manager',
        icon: <UnorderedListOutlined />
    },
    component: <JobManagerComponent />
}