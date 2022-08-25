import "./style.scss";
import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
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
    PageHeader,
    Progress,
    Select,
    Spin, Statistic,
    Table,
    Tabs,
    Tag
} from "antd";
import {DeleteOutlined} from '@ant-design/icons';
import {AllRoutes} from "../../common/routes";
import {deleteRuns, postNewRunConfig, useGetAllResults, useStateSocket} from "../../common/api";
import {RunConfig, RunOrResult} from "../../types/result.type";
import {ColumnsType} from "antd/lib/table";
import useDeepCompareEffect from 'use-deep-compare-effect'
import {Link} from "react-router-dom";

const {Content, Header} = Layout;

export const HeadlessPlayerComponent = () => {
    const [tableHeight, setTableHeight] = useState(600);
    const [selectedRuns, setSelectedRuns] = useState<RunOrResult[]>([]);
    const [activeTab, setActiveTab] = useState("runsHistory")
    const [isScheduling, setIsScheduling] = useState(false)
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

    const {state: runStates, isConnected: isSocketConnected} = useStateSocket("run_states", {});
    const {state: executorStats} = useStateSocket("executor_stats", {});

    const results = useGetAllResults();
    const tableRef = useRef<HTMLDivElement>(null);
    const defaultValues = JSON.parse(localStorage.getItem("new-run-last-values") || "{}");
    const formRef = React.createRef<FormInstance>();

    const columns: ColumnsType<RunOrResult> = [
        {
            title: 'Name',
            sorter: (a, b) => a.runId?.localeCompare(b.runId),
            render: (_, run) => <Link to={
                run.runs
                    ? AllRoutes.HeadlessPlayerCompare.makePath(run.runs!.map(run => run.runId))
                    : AllRoutes.HeadlessPlayerSingle.makePath(run.runId)
            }>{run.runId + (run.runs ? ` (${run.runs?.length})` : "")}</Link>,
            defaultSortOrder: "ascend"
        }, {
            title: '',
            width: "100px",
            render: (_: any, run: RunOrResult) => {
                let p = runStates[run.runId]?.progress;
                if (p) {
                    return <Progress percent={Math.round(p * 100)}/>;
                } else if (run.runs && run.runs.length > 0) {
                    p = run.runs.map(run => runStates[run.runId]?.progress || 0)
                            .reduce((a, b) => a + b, 0)
                        / run.runs.length;
                    return p > 0 ? <Progress percent={Math.round(p * 100)}/> : '';
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

                    await results.refresh();
                }}>Rerun</Button>
            </>
        },
        /*{
            title: 'Video',
            dataIndex: 'video',
            key: 'video'
        }, {
            title: 'Protocol',
            dataIndex: 'protocol',
            key: 'protocol'
        }, {
            title: 'Beta',
            dataIndex: 'beta',
            key: 'beta',
            render: (_: any, run: RunOrResult) => {
                if (run.beta === undefined) return <></>
                else return <Tag color={run.beta ? "green" : "red"}>{run.beta ? "Yes" : "No"}</Tag>
            }
        }, {
            title: 'Codec',
            dataIndex: 'codec',
            key: 'codec'
        }, {
            title: 'Length',
            dataIndex: 'length',
            key: 'length'
        }, {
            title: 'Buffer',
            dataIndex: 'bufferSetting',
            key: 'bufferSetting'
        }, {
            title: 'BW Profile',
            dataIndex: 'bwProfile',
            key: 'bwProfile'
        }, {
            title: 'Try',
            dataIndex: 'logNum',
            key: 'logNum'
        }*/
    ];

    const rowSelection = {
        onChange: (selectedRowKeys: React.Key[], selectedRows: RunOrResult[]) => {
            setSelectedRuns(selectedRows.filter(row => row.runs == undefined));
        },
    };

    useEffect(() => {
        results.refresh().then(r => {
            console.log(r);
        });
    }, []);

    useLayoutEffect(() => {
        // resetForm();
    }, [formRef])

    useLayoutEffect(() => {
        const node = tableRef.current;
        const top = node?.getBoundingClientRect()?.top || 100;

        // normally TABLE_HEADER_HEIGHT would be 55.
        const TABLE_HEADER_HEIGHT = 55;
        setTableHeight(window.innerHeight - top - TABLE_HEADER_HEIGHT);
    }, [tableRef]);

    const onNewRunSubmit = (values: any) => {
        const betas: boolean[] = values.methods.map((v: string) => v.split(",")[0] === "beta");
        const protocols: string[] = values.methods.map((v: string) => v.split(",")[1]);
        const newResultId: string = values.resultId;
        const config = {
            ...values,
            beta: betas.filter((v, i) => betas.indexOf(v) === i),
            protocols: protocols.filter((v, i) => protocols.indexOf(v) === i),
            bufferSettings: values.bufferSettings.split(","),
            codecs: values.codecs.split(","),
            lengths: values.lengths.split(",").map(parseInt)
        }
        localStorage.setItem('new-run-last-values', JSON.stringify(values));
        console.log(config);
        setIsScheduling(true);
        postNewRunConfig(config)
            .then(res => {
                console.log(res)
                message.success(res.message)
                setActiveTab('runsHistory')
                setIsScheduling(false);
                results.refresh().then(res => {
                    setExpandedRowKeys([
                        ...expandedRowKeys,
                        newResultId
                    ])
                });
            })
            .catch(res => {
                message.error(JSON.stringify(res))
                setIsScheduling(false);
            });
    };

    const onDelete = () => {
        deleteRuns(selectedRuns.filter(run => !run.runs).map(run => run.runId))
            .then(value => results.refresh())
    }

    const resetForm = () => {
        const values = {
            ...defaultValues,
            resultId: defaultValues.resultId.replace(/\d+$/, '')
                + (parseInt((defaultValues.resultId.match(/\d+$/) || [0])[0], 10) + 1).toString().padStart(3, '0')
        };
        console.log(values);
        formRef.current?.setFieldsValue(values);
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
            lengths: [run.length]
        }

        // return values;
    }

    return <>
        <Content style={{margin: '0 16px'}}>
            <PageHeader
                title="Headless Player"
                breadcrumb={{routes: [AllRoutes.HeadlessPlayer]}}
                subTitle="All Runs"
                onBack={() => window.history.back()}
                ghost={false}
                extra={[
                    <Statistic title="Scheduled" value={executorStats.scheduled} valueStyle={{fontSize: '15px'}}/>,
                    <Statistic title="Running" value={executorStats.running}  valueStyle={{fontSize: '15px'}}/>,
                    <Statistic title="Cancelled" value={executorStats.cancelled}  valueStyle={{fontSize: '15px'}}/>,
                    <Statistic title="Failed" value={executorStats.failed}  valueStyle={{fontSize: '15px'}}/>,
                    <Statistic title="Successful" value={executorStats.successful}  valueStyle={{fontSize: '15px'}}/>,
                    <Badge
                        key="1"
                        count={isSocketConnected ? 'Connected' : 'Disconnected'}
                        style={{backgroundColor: isSocketConnected ? '#52c41a' : undefined}}
                    />,
                    <Button key="2" type="primary" danger icon={<DeleteOutlined/>} onClick={onDelete}> Delete
                        Selected</Button>,
                    <Button key="3" type="primary"
                            href={AllRoutes.HeadlessPlayerCompare.makePath(selectedRuns.map(run => run.runId))}>Plot
                        Selected</Button>,
                ]}
            >
            </PageHeader>
            <Tabs defaultActiveKey="1" size={"large"} activeKey={activeTab} onChange={key => setActiveTab(key)}>
                <Tabs.TabPane tab="Runs History" key="runsHistory">
                    <Table
                        ref={tableRef}
                        dataSource={results.data?.results}
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
                            ...rowSelection,
                            checkStrictly: false,
                        }}
                        rowKey={"runId"}
                    />
                </Tabs.TabPane>
                <Tabs.TabPane tab="New Run" key="newRun">
                    <Spin tip="Scheduling" spinning={isScheduling}>
                        <Form
                            id="new-run-form"
                            ref={formRef}
                            name="newRunForm"
                            labelCol={{span: 8}}
                            wrapperCol={{span: 8}}
                            // initialValues={{remember: true}}
                            onFinish={onNewRunSubmit}
                            onReset={resetForm}
                            // onFinishFailed={onFinishFailed}
                            autoComplete="on"
                        >
                            <Form.Item
                                label="Result ID"
                                name="resultId"
                                rules={[{required: true}]}
                            >
                                <Input/>
                            </Form.Item>
                            <Form.Item
                                label="Videos"
                                name="videos"
                                rules={[{required: true, message: 'Please select videos!'}]}
                            >
                                <Select mode="multiple" placeholder="Select Videos">
                                    {["Aspen", "BBB", "Burn", "Football"].map(video => <Select.Option
                                        key={video}>{video}</Select.Option>)}
                                </Select>
                            </Form.Item>
                            <Form.Item label="Methods" name="methods" rules={[{required: true}]}>
                                <Checkbox.Group>
                                    {/*<Checkbox.Group options={[*/}
                                    {/*    {label: "QUIC", value: "beta,quic"},*/}
                                    {/*    {label: "BETA", value: "beta,tcp"},*/}
                                    {/*    {label: "DASH", value: "nonbeta,tcp"},*/}
                                    {/*]} defaultValue={defaultValues.methods}/>*/}
                                    <Checkbox value={"beta,quic"}>QUIC</Checkbox>
                                    <Checkbox value={"beta,tcp"}>BETA</Checkbox>
                                    <Checkbox value={"nonbeta,tcp"}>DASH</Checkbox>
                                </Checkbox.Group>
                            </Form.Item>

                            <Form.Item label="Codecs" name="codecs" rules={[{required: true}]}>
                                <Select placeholder="Select Codecs" allowClear>
                                    <Select.Option value={"hevc"}>HEVC</Select.Option>
                                    <Select.Option value={"av1"}>AV1</Select.Option>
                                    <Select.Option value={"hevc,av1"}>HEVC & AV1</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item label="Segment Lengths" name="lengths" rules={[{required: true}]}>
                                <Select placeholder="Select Lengths for segments" allowClear>
                                    <Select.Option value={"1"}>1 sec</Select.Option>
                                    <Select.Option value={"2"}>2 sec</Select.Option>
                                    <Select.Option value={"1,2"}>1 sec & 2 sec</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item label="Buffer Setting" name="bufferSettings" rules={[{required: true}]}>
                                <Select placeholder="Select Buffer Settings" allowClear>
                                    <Select.Option value={"long-buffer"}>Long Buffer</Select.Option>
                                    <Select.Option value={"short-buffer"}>Short Buffer</Select.Option>
                                    <Select.Option value={"long-buffer,short-buffer"}>Long Buffer & Short
                                        Buffer</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item label="Bandwidth Profiles" name="bwProfiles" rules={[{required: true}]}>
                                <Select mode={"multiple"} placeholder="Select Bandwidth Profiles" allowClear>
                                    <Select.Option value={"drop"}>Drop</Select.Option>
                                    <Select.Option value={"drop-low"}>Drop Low</Select.Option>
                                    <Select.Option value={"multi-drop"}>Multi Drop</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item label="Repeat" name="repeat" rules={[{required: true}]}>
                                <InputNumber min={1} max={20}/>
                            </Form.Item>

                            <Form.Item label="Server Log Level" name="serverLogLevel" rules={[{required: true}]}>
                                <Select defaultValue="none">
                                    <Select.Option value={"none"}>None</Select.Option>
                                    <Select.Option value={"debug"}>Debug</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item wrapperCol={{
                                offset: 8,
                                span: 8
                            }}>
                                <Button type="primary" htmlType="submit">
                                    Submit
                                </Button>
                                <Button htmlType="reset">
                                    Reset
                                </Button>
                            </Form.Item>
                        </Form>
                    </Spin>
                </Tabs.TabPane>
            </Tabs>

        </Content>
    </>
}