import "./style.scss";

import { Button, Descriptions, Divider, Drawer, Progress, Spin, Switch, Tabs, Typography } from "antd"
import { useContext, useEffect, useRef, useState } from "react"
import ReactJson from "react-json-view";
import { useGetJobDetails } from "../../common/job-manager.api"
import { TimeAgoComponent } from "../misc/time-ago";
import { LogsViewerComponent } from "../misc/logs-viewer";
import { BaseType } from "antd/lib/typography/Base";
import { JobManagerContext } from "../../app.context";


const { Title, Text } = Typography;

export const JobDrawerComponent = (props: {}) => {
    const [activeTab, setactiveTab] = useState<string>("3");
    const { jobManagerState, setJobManagerState } = useContext(JobManagerContext);

    const jobDetails = useGetJobDetails(jobManagerState.selectedJobId);
    // const [autoRefresh, setAutoRefresh] = useState(false);
    const [prevStatus, setPrevStatus] = useState<string | undefined>();

    useEffect(() => {
        if (jobManagerState.autoRefresh) {
            console.log("Enabling auto refresh for jobId: " + jobManagerState.selectedJobId)
            setactiveTab("3");
            let interval = setInterval(async () => {
                if (!jobDetails.data || jobDetails.data?.status == "RUNNING") {
                    await jobDetails.refresh();
                }
            }, 2000);
            if (!jobDetails.data || jobDetails.data?.status == "RUNNING") {
                jobDetails.refresh();
            }
            return () => {
                console.log("Disabling auto refresh for jobId: " + jobManagerState.selectedJobId)
                clearInterval(interval);
            }
        }
    }, [jobManagerState.autoRefresh]);

    useEffect(() => {
        const status = jobDetails.data?.status;
        if (prevStatus === "RUNNING" && status !== prevStatus && jobManagerState.autoRefresh) {
            setJobManagerState({ ...jobManagerState, autoRefresh: false });
        }
        setPrevStatus(status);
    }, [jobDetails.data]);

    if (jobDetails.data && jobDetails.data.stdouterr.length > 1000_000) {
        jobDetails.data.stdouterr = "[TRUNCATED]\n" + jobDetails.data.stdouterr.substring(jobDetails.data.stdouterr.length - 1000_000);
    }

    return <Drawer
        className="job-drawer"
        title={<>
            {"Job: " + jobDetails.data?.job_name}
            <span style={{ float: "right" }}>
                <Text type={({
                    "SCHEDULED": "secondary",
                    "RUNNING": "warning",
                    "FAILED": "danger",
                    "SUCCESSFUL": "success",
                    "": "secondary"
                }[jobDetails.data?.status || ""] as BaseType)} style={{ fontSize: 15, fontWeight: "normal" }}>
                    {jobDetails.data?.status}
                </Text> | &nbsp;
                <Progress percent={Math.floor(100 * (jobDetails.data?.progress || 0))} size="small" style={{width: 100}}/> | &nbsp;
                <Text type="secondary" style={{ fontSize: 15, fontWeight: "normal" }}>
                    {jobDetails.isLoading ? "Refreshing ..." :
                        <>Last Refreshed: <TimeAgoComponent time={jobDetails.lastRefreshed} /></>
                    }
                </Text> |
                Auto Refresh <Switch onChange={(autoRefresh) => setJobManagerState({ ...jobManagerState, autoRefresh })} checked={jobManagerState.autoRefresh} />
                &nbsp;|&nbsp;<Button onClick={jobDetails.refresh}>Refresh</Button>
            </span>
        </>
        }
        placement="right"
        size={"large"}
        width={"75vw"}
        open={jobManagerState.selectedJobId !== undefined}
        closable={true}
        onClose={() => {
            setJobManagerState({ ...jobManagerState, selectedJobId: undefined });
        }}>

        <Tabs activeKey={activeTab} onChange={tabKey => setactiveTab(tabKey)}>
            <Tabs.TabPane tab="Table" key="1">
                <Descriptions title="Job Info" bordered column={2} size={"small"}>
                    <Descriptions.Item label="Name">{jobDetails.data?.job_name}</Descriptions.Item>
                    <Descriptions.Item label="ID">{jobDetails.data?.job_id}</Descriptions.Item>
                    <Descriptions.Item label="Status" span={2}>{jobDetails.data?.status}</Descriptions.Item>
                    {
                        jobDetails.data?.error &&
                        <Descriptions.Item
                            label="Error" span={2}
                            style={{ color: "red" }}>
                            <pre style={{ whiteSpace: "break-spaces" }}>
                                {jobDetails.data?.error}
                            </pre>
                        </Descriptions.Item>
                    }
                </Descriptions>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Raw" key="2">
                <ReactJson src={jobDetails.data || {}}></ReactJson>
            </Tabs.TabPane>
            <Tabs.TabPane tab="STDOUT, STDERR" key="3">
                <LogsViewerComponent
                    hasLineNumbers={false}
                    data={jobDetails.data?.stdouterr || ""}
                />
            </Tabs.TabPane>
        </Tabs>
    </Drawer>
}