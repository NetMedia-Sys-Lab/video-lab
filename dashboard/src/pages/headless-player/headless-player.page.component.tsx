import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    Badge,
    Button,
    Checkbox,
    Form,
    FormInstance,
    Input,
    InputNumber,
    Layout,
    message,
    notification,
    PageHeader,
    Progress,
    Select,
    Space,
    Spin, Statistic,
    Table,
    Tabs,
    Tag
} from "antd";

import { DeleteOutlined, ExperimentOutlined } from '@ant-design/icons';
import { calculateRunQuality, deleteRuns, postNewRunConfig, useGetAllResults, useStateSocket } from "../../common/api";
import { RunConfig, RunOrResult, RunsFilterType } from "../../types/result.type";
import { ColumnsType } from "antd/lib/table";
import { Link } from "react-router-dom";
import { RunProgressType, RunStateType } from "../../types/run-data.type";
import { PageType } from "../../types/page.type";
import { makeHeadlessPlayerComparePath } from "./headless-player-compare.component";
import { makeHeadlessPlayerSinglePath } from "./headless-player-single.component";
import { useDebouncedState, useDimensions } from "../../common/util";
import { NewRunFormComponent } from "../../components/headless-player/new-run-form.component";
import { useFilterRuns } from "../../common/run-utils";

const { Content, Header } = Layout;


export const HeadlessPlayerComponent = () => {
    const [selectedRuns, setSelectedRuns] = useState<RunOrResult[]>([]);
    const [activeTab, setActiveTab] = useState("runsHistory")

    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

    const { state: runStates } = useStateSocket<{ [runId: string]: RunProgressType }>("run_states", {});

    const results = useGetAllResults();
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const tableHeight = useDimensions(tabsContainerRef).height - 150;
    const [filter, setFilter] = useState<RunsFilterType>({});
    console.log("render", new Date())

    const columns: ColumnsType<RunOrResult> = [
        {
            title: 'Name',
            sorter: (a, b) => a.runId?.localeCompare(b.runId),
            render: (_, run) => <Link to={
                run.runs
                    ? makeHeadlessPlayerComparePath(run.runs!.map(run => run.runId))
                    : makeHeadlessPlayerSinglePath(run.runId)
            }>{run.runId + (run.runs ? ` (${run.runs?.length})` : "")}</Link>,
            defaultSortOrder: "ascend"
        }, {
            title: '',
            width: "100px",
            render: (_: any, run: RunOrResult) => {
                let p = runStates[run.runId]?.progress;
                if (p) {
                    return <Progress percent={Math.round(p * 100)} />;
                } else if (run.runs && run.runs.length > 0) {
                    p = run.runs.map(run => runStates[run.runId]?.progress || 0)
                        .reduce((a, b) => a + b, 0)
                        / run.runs.length;
                    return p > 0 ? <Progress percent={Math.round(p * 100)} /> : '';
                }
            }
        }, {
            title: 'Actions',
            render: (_, run) => <>
                <Button size={"small"} type={"link"} onClick={async e => {
                    await deleteRuns([run.runId]);
                    message.success(`Deleted ${run.runId}`);
                    await results.refresh();
                }}>Delete</Button>
                <Button size={"small"} type={"link"} onClick={async e => {
                    await deleteRuns([run.runId]);
                    message.success(`Deleted ${run.runId}`);
                    await submitRun(run);
                    await results.refresh();
                }}>Rerun</Button>
            </>
        }
    ];

    const onRowSelectionChange = (selectedRowKeys: React.Key[], selectedRows: RunOrResult[]) => {
        setSelectedRuns(selectedRows.filter(row => row.runs == undefined));
    }

    const onDelete = () => {
        deleteRuns(selectedRuns.filter(run => !run.runs).map(run => run.runId))
            .then(value => results.refresh())
    }

    const submitRun = async (run: RunConfig) => {
        const config = {
            "resultId": run.resultId,
            "videos": [run.video],
            "bwProfiles": [run.bwProfile],
            "repeat": 1,
            "serverLogLevel": "none",
            beta: [run.beta],
            protocols: [run.protocol],
            bufferSettings: [run.bufferSetting],
            codecs: [run.codec],
            lengths: [run.length],
            calculateQuality: run.calculateQuality
        }
        await message.info(JSON.stringify(config, null, 4))

        // return values;
    }

    return <>
        <Content style={{ margin: '0 16px', display: 'flex', flexDirection: 'column' }}>
            <Space>
                <Button disabled={selectedRuns.length === 0} key="4" type="primary" danger icon={<DeleteOutlined />} onClick={onDelete}> Delete Selected</Button>
                <Button disabled={selectedRuns.length === 0} key="2" type="primary" onClick={async () => {
                    const response = await calculateRunQuality(selectedRuns.map(run => run.runId));
                    console.log(response)
                    await notification.success({
                        message: response.message || JSON.stringify(response)
                    });
                }}>Calculate VMAF</Button>
                <Button disabled={selectedRuns.length == 0} key="3" type="primary"
                    href={makeHeadlessPlayerComparePath(selectedRuns.map(run => run.runId))}>Plot
                    Selected</Button>
            </Space>
            <div ref={tabsContainerRef} style={{ flexGrow: '1' }}>
                <Tabs defaultActiveKey="1" size={"large"} activeKey={activeTab} onChange={key => setActiveTab(key)}>
                    <Tabs.TabPane tab="Runs History" key="runsHistory">
                        <Input.Search placeholder="Search Run" onSearch={(value) => {
                            setFilter({ ...filter, runId: value })
                        }} style={{ width: 200 }}/>
                        <Table
                            dataSource={useFilterRuns(results.data?.results || [], filter)}
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
                                y: tableHeight,
                                x: 'max-content'
                            }}
                            rowSelection={{
                                type: 'checkbox',
                                onChange: onRowSelectionChange,
                                checkStrictly: false,
                            }}
                            rowKey={"runId"}
                        />
                    </Tabs.TabPane>
                    <Tabs.TabPane tab="New Run" key="newRun">
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