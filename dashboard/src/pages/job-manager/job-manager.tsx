import "./style.scss";
import {Collapse, Descriptions, Drawer, PageHeader} from "antd";
import {AllRoutes} from "../../common/routes";
import React, {useEffect, useState} from "react";
import {Content} from "antd/lib/layout/layout";
import {getJobDetails, useStateSocket} from "../../common/api";
import {JobType} from "../../types/job.type";

export const JobManagerComponent = (props: {}) => {
    const {state: jmState, isConnected: isSocketConnected} = useStateSocket("job_manager_state", {});
    const [selectedJob, setSelectedJob] = useState<JobType | null>(null);
    const [jobDetails, setJobDetails] = useState<JobType | null>(null);


    useEffect(() => {
        if (!selectedJob) return;
        getJobDetails(selectedJob.job_id)
            .then(details => setJobDetails(details));
    }, [selectedJob])

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

    return <>
        <>
            <PageHeader
                title="Job Manager"
                breadcrumb={{routes: [AllRoutes.JobManager]}}
                onBack={() => window.history.back()}
                ghost={false}
                extra={[]}
            >
            </PageHeader>
            <Content style={{margin: '24px 16px 0', overflow: 'initial'}}>
                <Collapse defaultActiveKey={["Scheduled", "Running", "Successful", "Cancelled", "Failed"]}>
                    {JobListPanel("Scheduled", jmState?.scheduled)}
                    {JobListPanel("Running", jmState?.running)}
                    {JobListPanel("Successful", jmState?.successful)}
                    {JobListPanel("Cancelled", jmState?.cancelled)}
                    {JobListPanel("Failed", jmState?.failed)}
                </Collapse>
            </Content>
            <Drawer
                title={"Job: " + selectedJob?.job_name}
                placement="right"
                size={"large"}
                onClose={() => setSelectedJob(null)}
                visible={selectedJob !== null}>
                <Descriptions title="Job Info" bordered column={2} size={"small"}>
                    <Descriptions.Item label="Name">{jobDetails?.job_name}</Descriptions.Item>
                    <Descriptions.Item label="ID">{jobDetails?.job_id}</Descriptions.Item>
                    <Descriptions.Item label="Status" span={2}>{jobDetails?.status}</Descriptions.Item>
                    {
                        jobDetails?.error &&
                        <Descriptions.Item label="Error" span={2}
                                           style={{color: "red"}}>{jobDetails?.error}</Descriptions.Item>
                    }
                </Descriptions>
                <pre>{JSON.stringify(jobDetails, null, 4)}</pre>
            </Drawer>
        </>
    </>
}