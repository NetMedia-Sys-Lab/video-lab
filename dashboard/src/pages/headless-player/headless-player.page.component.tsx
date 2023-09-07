import React, { useMemo, useRef, useState } from "react";
import {
    Button,
    Input,
    Layout,
    notification,
    Progress,
    Space,
    Table,
    Tabs
} from "antd";

import { calculateRunQuality, createTilesVideo, deleteRuns, encodePlayback, getRunConfigs, postNewRunConfig, useStateSocket } from "../../common/api";
import { RunsFilterType } from "../../types/result.type";
import { ColumnsType } from "antd/lib/table";
import { Link } from "react-router-dom";
import { RunProgressType } from "../../types/run-data.type";
import { PageType } from "../../types/page.type";
import { makeHeadlessPlayerComparePath } from "./headless-player-compare.component";
import { makeHeadlessPlayerSinglePath } from "./headless-player-single.component";
import { NewRunFormComponent } from "../../components/headless-player/new-run-form.component";
import { DeleteOutlined, ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";

const { Content } = Layout;


type RunOrResultType = {
    key: string,
    progress: number,
    runId: string
} & {
    key: string,
    resultId: string,
    runs: RunOrResultType[]
}

export const HeadlessPlayerComponent = () => {
    const [selectedRuns, setSelectedRuns] = useState<RunOrResultType[]>([]);
    const [activeTab, setActiveTab] = useState("runsHistory")

    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
    const [filter, setFilter] = useState<RunsFilterType>({});

    const { state: runStates } = useStateSocket<{ [runId: string]: RunProgressType }>("run_states", {});

    const runRows = useMemo((): RunOrResultType[] => {
        const results: {
            [resultId: string]: {
                runId: string
                progress: number,
                key: string,
            }[]
        } = {}

        for (const runId in runStates) {
            if (filter.runId && !runId.match(filter.runId)) continue;
            const resultId = runId.split('/', 1)[0];
            if (!results[resultId]) results[resultId] = [];
            results[resultId].push({
                runId,
                progress: runStates[runId].progress,
                key: runId,
            });
        }

        return Object.keys(results).map(resultId => ({
            key: resultId,
            resultId,
            runs: results[resultId]
        }) as RunOrResultType);
    }, [runStates, filter])

    const columns: ColumnsType<RunOrResultType> = [
        {
            title: 'Name',
            sorter: (a, b) => a.runId?.localeCompare(b.runId),
            render: (_, run) => <Link to={
                run.runs
                    ? makeHeadlessPlayerComparePath(run.runs.map(run => run.runId))
                    : makeHeadlessPlayerSinglePath(run.runId)
            }>{(run.runId || run.resultId) + (run.runs ? ` (${run.runs?.length})` : "")}</Link>,
            defaultSortOrder: "ascend"
        }, {
            title: '',
            width: "100px",
            render: (_: any, run: RunOrResultType) => {
                let p = runStates[run.runId]?.progress;
                if (p) {
                    return <Progress percent={Math.round(p * 100)} style={{ marginBottom: 0 }} />;
                } else if (run.runs && run.runs.length > 0) {
                    p = run.runs.map(run => runStates[run.runId]?.progress || 0)
                        .reduce((a, b) => a + b, 0)
                        / run.runs.length;
                    return p > 0 ? <Progress percent={Math.round(p * 100)} /> : '';
                }
            }
        },
        // {
        //     title: 'Actions',
        //     render: (_, run) => <>
        //         <Button size={"small"} type={"link"} onClick={async e => {
        //             await deleteRuns([run.runId]);
        //             message.success(`Deleted ${run.runId}`);
        //             await results.refresh();
        //         }}>Delete</Button>
        //         {/* <Button size={"small"} type={"link"} onClick={async e => {
        //             await deleteRuns([run.runId]);
        //             message.success(`Deleted ${run.runId}`);
        //             await submitRun(run);
        //             await results.refresh();
        //         }}>Rerun</Button> */}
        //     </>
        // }
    ];

    const onRowSelectionChange = (selectedRowKeys: React.Key[], selectedRows: RunOrResultType[]) => {
        setSelectedRuns(selectedRows.filter(row => row.runs === undefined));
    }

    return <>
        <Content style={{ margin: '0 16px', display: 'flex', flexDirection: 'column' }}>
            <Space>
                {/* <Button key="7" type="primary" icon={<ReloadOutlined />} onClick={results.refresh} /> */}
                <Button disabled={selectedRuns.length === 0} key="4" type="primary" danger
                    icon={<DeleteOutlined />}
                    onClick={async () => {
                        await deleteRuns(selectedRuns.filter(run => !run.runs).map(run => run.runId))
                        // await results.refresh()
                    }}
                > Delete Selected</Button>
                <Button disabled={selectedRuns.length === 0} key="2" type="primary" onClick={async () => {
                    const response = await calculateRunQuality(selectedRuns.map(run => run.runId))
                    await notification.success({
                        message: response.message || JSON.stringify(response)
                    });
                }}>Calculate VMAF</Button>
                <Button disabled={selectedRuns.length === 0} key="5" type="primary" onClick={async () => {
                    const response = await encodePlayback(selectedRuns.map(run => run.runId))
                    await notification.success({
                        message: response.message || JSON.stringify(response)
                    });
                }}>Encode Playback</Button>
                <Button disabled={selectedRuns.length === 0} key="3" type="primary"
                    href={makeHeadlessPlayerComparePath(selectedRuns.map(run => run.runId))}>Plot
                    Selected</Button>
                <Button disabled={selectedRuns.length === 0} key="6" type="primary"
                    onClick={async () => {
                        const response = createTilesVideo(selectedRuns.map(run => run.runId))
                        await notification.success({
                            message: "Success " + JSON.stringify(response)
                        });
                    }}>Create Video Tiles</Button>
                <Button disabled={selectedRuns.length === 0} key="7" type="primary"
                    onClick={async () => {
                        const runs = selectedRuns.filter(run => !run.runs);
                        // try {
                            const runConfigs = await getRunConfigs(runs.map(run => run.runId));
                            const res = await postNewRunConfig(runConfigs);
                            notification.success({ message: res.message });
                        // } catch (err) {
                            // notification.error({ message: JSON.stringify(err) });
                        // }
                    }}>Rerun</Button>
            </Space>
            <div style={{ flexGrow: '1' }}>
                <Tabs defaultActiveKey="1" size={"large"} activeKey={activeTab} onChange={key => setActiveTab(key)}>
                    <Tabs.TabPane tab="Runs History" key="runsHistory">
                        <Input.Search placeholder="Search Run" onSearch={(value) => {
                            setFilter({ ...filter, runId: value })
                        }} style={{ width: 500 }} />
                        <Table
                            dataSource={runRows}
                            columns={columns}
                            pagination={false}
                            size="small"
                            bordered
                            expandable={{
                                childrenColumnName: "runs",
                                expandedRowKeys: expandedRowKeys,
                                onExpandedRowsChange: expandedKeys => setExpandedRowKeys(expandedKeys as any)
                            }}
                            scroll={{
                                // y: tableHeight,
                                // x: 'max-content'
                            }}
                            rowSelection={{
                                type: 'checkbox',
                                onChange: onRowSelectionChange,
                                checkStrictly: false,
                            }}
                            rowKey={"key"}
                        />
                    </Tabs.TabPane>
                    <Tabs.TabPane tab="New Run V2" key="newRunV2">

                        <NewRunFormComponent onRunScheduled={(newResultId) => {
                            setExpandedRowKeys(val => [...val, newResultId])
                        }}></NewRunFormComponent>

                    </Tabs.TabPane>
                </Tabs>
            </div>
        </Content>
    </>
}

export const HeadlessPlayerPage: PageType = {
    routerPath: '/headless-player',
    title: 'Headless Player Runs',
    menuitem: {
        label: 'Headless Player',
        icon: <ExperimentOutlined />
    },
    component: <HeadlessPlayerComponent />
}