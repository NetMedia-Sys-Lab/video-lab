import { Button, Descriptions, Divider, Drawer, Spin, Switch, Tabs, Typography } from "antd"
import { nextTick } from "process";
import { useEffect, useRef, useState } from "react"
import ReactJson from "react-json-view";
import { useGetJobDetails } from "../../common/job-manager.api"
import { TimeAgoComponent } from "../misc/time-ago";

const { Title, Text } = Typography;

export const JobDrawerComponent = (props: {
    jobId?: string,
    onClose: ((e: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element>) => void) | undefined
}) => {
    const { jobId, onClose } = props;
    const jobDetails = useGetJobDetails(jobId);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [prevStatus, setPrevStatus] = useState<string | undefined>();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoRefresh) {
            let interval = setInterval(async () => {
                await jobDetails.refresh();
                setTimeout(() => {
                    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
                }, 10);
            }, 3000);
            jobDetails.refresh();
            scrollRef.current?.scrollIntoView({ behavior: "smooth" })
            return () => {
                clearInterval(interval);
            }
        }
    }, [autoRefresh]);

    useEffect(() => {
        const status = jobDetails.data?.status;
        if (prevStatus === "JobStatus.RUNNING" && status !== prevStatus && autoRefresh) {
            setAutoRefresh(false);
        }
        setPrevStatus(status);
    }, [jobDetails.data]);

    return <Drawer
        title={<>
            {"Job: " + jobId}
            <span style={{ float: "right" }}>
                <Text type="secondary" style={{ fontSize: 15, fontWeight: "normal" }}>
                    {jobDetails.isLoading ? "Refreshing ..." :
                        <>Last Refreshed: <TimeAgoComponent time={jobDetails.lastRefreshed} /></>
                    }
                </Text> |
                Auto Refresh <Switch onChange={(checked) => setAutoRefresh(checked)} checked={autoRefresh} />
                &nbsp;|&nbsp;<Button onClick={jobDetails.refresh}>Refresh</Button>
            </span>
        </>
        }
        placement="right"
        size={"large"}
        width={1200}
        visible={jobId != null}
        closable={true}
        onClose={onClose}>

        <Tabs defaultActiveKey="2">
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
            <Tabs.TabPane tab="STDOUT,STDERR" key="3">
                <pre style={{}}>{jobDetails.data?.stdouterr}</pre>
            </Tabs.TabPane>
        </Tabs>

        {/* <Title level={5}>STDOUT, STDERR</Title>
        <Divider /> */}
        <div ref={scrollRef}></div>
    </Drawer>
}