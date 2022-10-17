import "./style.scss"

import { Alert, Badge, Button, Card, Collapse, Drawer, Result, Select, Spin, Switch, Tabs, Typography } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { makeKibanaLink, StaticApi, useGetRunsData } from "../../common/api";
import {
    RunBwActualType,
    RunBwEstimatedType,
    RunDataType,
    RunSegmentType,
    RunStateType
} from "../../types/run-data.type";
import { COLORS, MarkerUpdateCallback, objectMap } from "../../types/plot.type";
import { D3PlotComponent } from "../plotter/d3-plot.component";
import { D3PlotBase } from "../plotter/d3-plot-base";
import { DataFrameGroups } from "../plotter/dataframe";
import { SettingOutlined } from '@ant-design/icons';
import { makeVideoInspectorPath, VideoInspectorPage } from "../../pages/video-inspector/video-inspector.component";
import { FramesListComponent } from "../video-tools/frames-list";


const { Panel } = Collapse;

export const RunTimelinePlotComponent = (props: {
    runsData: RunDataType[],
    onMarkerUpdate?: MarkerUpdateCallback
}) => {
    const { runsData, onMarkerUpdate } = props;
    const [plotRuns, setPlotRuns] = useState<{ [key: string]: boolean }>({});
    const [plotData, setPlotData] = useState<RunDataType[]>([]);
    const [selectedSegment, setSelectedSegment] = useState<null | { plotIndex: number, segmentIndex: number }>(null);
    const [plotError, setPlotError] = useState<string>()
    const [allPlotRunsSelected, setAllPlotRunsSelected] = useState<boolean>()

    const [plotConfig, setPlotConfig] = useState({
        plotDownloads: true,
        plotQualityLevels: false,
        plotPosition: true,

        plotDropped: false,
        plotBacklog: false,
        plotEstimatedBw: false,
        backlogQdisc: "1:",
        droppedQdisc: ""
    });

    const qdiscs = ["1:", "1:1", "1:2", "1:3", "2:", "2:1", "3:"];
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([]);
    const [drawerVisible, setDrawerVisible] = useState(false);

    useEffect(() => {
        setPlotData(runsData.filter(d => plotRuns[d.runId]));
    }, [plotRuns, runsData])

    useEffect(() => {
        setAllPlotRuns(true)
    }, [runsData])

    useEffect(() => {
        if (plotData.length > 6) {
            console.error("Select at max 6 runs to compare")
            setPlotError("Select at max 6 runs to compare")
            return;
        }
        if (plotData.length < 1) {
            console.error("Select at least 1 run to plot")
            setPlotError("Select at least 1 run to plot")
            setPlots([]);
            return;
        }
        setPlotError(undefined)

        // Create constant color map for each run
        const runColors: { [runKey: string]: string } = {};
        runsData.forEach((runData, index) => {
            runColors[runData.runId] = COLORS[index % COLORS.length];
        })

        const plots: D3PlotBase<any>[] = [];
        const colors = plotData.map(d => runColors[d.runId]);
        const segments = new DataFrameGroups<RunSegmentType>(
            objectMap(plotData, (d) => d.segments),
            "start", {
            colors,
        });
        const states = new DataFrameGroups<RunStateType & { segmentLength: number }>(
            objectMap(plotData, (d) => d.states),
            "time", { colors }
        ).mapGroups((gid, df) => df.extend({
            segmentLength: () => {
                return (plotData[gid as any].run_config.length) as number
            }
        }));
        const bandwidth_actual = new DataFrameGroups<RunBwActualType>(
            objectMap(plotData, (d) => d.bandwidth_actual.map((bw: RunBwActualType) => ({
                ...bw,
                bw: bw.bw < 500 ? 0 : bw.bw
            }))),
            "time"
        );
        const bandwidth_estimate = new DataFrameGroups<RunBwEstimatedType>(
            objectMap(plotData, (d) => d.bandwidth_estimate),
            "time", { colors }
        );

        if (plotConfig.plotDownloads) {
            segments.plotBarh(plots, {
                xAcc: (r) => r.start,
                spanAcc: (r) => r.first_byte_at - r.start,
                yAcc: (r) => r.index,
                opacity: 0.5
            });
            segments.plotBarh(plots, {
                xAcc: r => r.first_byte_at,
                spanAcc: r => r.end - r.first_byte_at,
                yAcc: r => r.index,
                gridY: true
            });
            segments.filter(r => r.stop_ratio < 0.99)
                .plotBarh(plots, {
                    xAcc: r => r.first_byte_at,
                    spanAcc: r => r.end - r.first_byte_at,
                    yAcc: r => r.index,
                    colors: plotData.map(d => "rgba(0,0,0,0.45)")
                })
            segments.plotBarh(plots, {
                xAcc: r => r.end,
                spanAcc: (r) => r.last_byte_at - r.end,
                yAcc: r => r.index,
                colors: plotData.map(d => "#00000026"),
                text: r => (r.stop_ratio < 0.99
                    ? r.stop_ratio.toFixed(2)
                    + (r.ratio !== r.stop_ratio ? ',' + r.ratio.toFixed(2) : '')
                    : '')
            });
            segments.plotBarh(plots, {
                xAcc: (r) => r.start,
                spanAcc: (r) => r.last_byte_at - r.start,
                yAcc: (r) => r.index,
                opacity: 0,
                onSelect: (plotIndex: number, segment: RunSegmentType) => {
                    setSelectedSegment({ plotIndex, segmentIndex: segment.index })
                }
            })
        }
        if (plotConfig.plotPosition) {
            states.plotLine(plots, {
                yAcc: r => r.position / r.segmentLength,
                colors
            });
        }
        if (plotConfig.plotQualityLevels) {
            segments.plotBar(plots, {
                yAcc: r => (7 - r.quality),
                xAcc: r => r.start,
                axisIndex: 0,
                opacity: 0.5
            });
        }
        // console.log(bandwidth_actual.rows, bandwidth_actual.col("bw").rows)
        const plot = bandwidth_actual
            .col("bw")
            .toStep("time")
            .mapGroups((gid, df) => df.pushRow({
                time: segments.max("last_byte_at"),
                bw: df.rows[df.rows.length - 1].bw
            } as RunBwActualType))
            .col("bw")
            .plotLine(plots, { axisIndex: -1 });

        if (plotConfig.plotEstimatedBw) {
            bandwidth_estimate.col("bandwidth")
                .toStep("time")
                // .filter((r, i) => r.bandwidth < 5000000)
                .plotLine(plots, { axisIndex: 1 });
            segments.col("throughput").plotLine(plots, { axisIndex: 1, lineStyle: "none", text: 'o' });
            bandwidth_estimate.col("bandwidth")
                // .mapGroups((gid, df) => df.toStep("time"))
                // .filter((r, i) => r.bandwidth < 5000000)
                .plotLine(plots, { axisIndex: 1, lineStyle: "none", text: '+' });
        }
        if (plotConfig.plotBacklog && plotConfig.backlogQdisc) {
            type TcStatType = { time: number, backlog: number, dropped: number, type: string, variant: string };
            const tc_stats = new DataFrameGroups<TcStatType>(
                objectMap(plotData, (d) => d.tc_stats.map((stat: any) => ({
                    time: stat.time,
                    ...stat.qdiscs[plotConfig.backlogQdisc]
                }))),
                "time", { colors }
            );
            tc_stats
                .col("backlog").dropNa().col("backlog")
                .plotLine(plots, { axisIndex: 1 });
        }

        if (plotConfig.plotDropped && plotConfig.droppedQdisc) {
            type TcStatType = { time: number, backlog: number, dropped: number, type: string, variant: string };
            const tc_stats = new DataFrameGroups<TcStatType>(
                objectMap(plotData, (d) => d.tc_stats.map((stat: any) => ({
                    time: stat.time,
                    ...stat.qdiscs[plotConfig.droppedQdisc]
                }))),
                "time", { colors }
            );
            console.log("Plotting dropped", tc_stats)
            tc_stats
                .col("dropped").dropNa().col("dropped")
                .plotLine(plots, { axisIndex: 1 });
        }

        setPlots(plots);

    }, [plotData, plotConfig]);

    const setAllPlotRuns = (value: boolean) => {
        setPlotRuns(runsData.reduce((obj, runData) => ({
            ...obj,
            [runData.runId]: value
        }), {}))
        setAllPlotRunsSelected(value)
    }

    const SettingSwitch = (
        label: string,
        key: keyof typeof obj,
        extra: JSX.Element[] = [],
        obj: any = plotConfig,
        setObj: (o: any) => void = setPlotConfig
    ) => {
        return <tr key={label}>
            <td><Switch checked={obj[key] as boolean} onChange={value => {
                setObj({
                    ...obj,
                    [key]: value
                });
            }} /></td>
            <td>{label}</td>
            {extra.map((elem, i) => <td key={i}>{{
                ...elem,
                props: {
                    ...elem.props,
                    disabled: !obj[key]
                }
            }}</td>)}
        </tr>
    }

    const SettingSelect = (placeholder: string, key: keyof typeof plotConfig, values: string[]) => {
        return <Select
            placeholder={placeholder}
            onChange={value => {
                setPlotConfig({ ...plotConfig, [key]: value })
            }}>
            {values.map(value => <Select.Option key={value}>{value}</Select.Option>)}
        </Select>
    }

    const SettingSection = (label: string, children: React.ReactNode) =>
        <Panel header={label} key={label} showArrow={false}>
            <table className="plot-settings">
                {children}
            </table>
        </Panel>;

    return <div className="plot-drawer-wrapper">
        <Drawer
            title="Plot Settings"
            placement="left"
            closable={false}
            onClose={e => setDrawerVisible(false)}
            visible={drawerVisible}
            getContainer={false}
            width={800}
            style={{ position: 'absolute' }}>


            <Collapse defaultActiveKey={["Runs", "Segments", "Playback", "Network"]}>
                {SettingSection("Runs", [
                    <Switch checked={allPlotRunsSelected} onChange={value => {
                        setAllPlotRuns(value)
                    }} />,
                    ...runsData
                        // .sort((a, b) => b.num_stall - a.num_stall)
                        .map((runData, index) => SettingSwitch(runData.runId, runData.runId, [
                            <Badge count={COLORS[index % COLORS.length]}
                                style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        ], plotRuns, setPlotRuns))
                ])}
                {SettingSection("Segments", [
                    SettingSwitch("Plot Segment Download Timeline", 'plotDownloads'),
                    SettingSwitch("Plot Segment Quality Levels", 'plotQualityLevels')
                ])}
                {SettingSection("Playback", [
                    SettingSwitch("Plot Playback Position", 'plotPosition')
                ])}
                {SettingSection("Network", [
                    SettingSwitch("Plot Packets Dropped", 'plotDropped', [
                        SettingSelect("Select QDisc", 'droppedQdisc', qdiscs)
                    ]),
                    SettingSwitch("Plot Backlog", 'plotBacklog', [
                        SettingSelect("Select QDisc", 'backlogQdisc', qdiscs)
                    ]),
                    SettingSwitch("Plot Estimated Bandwidth", 'plotEstimatedBw')
                ])}
            </Collapse>
        </Drawer>

        <Card style={{ border: "1px solid #d9d9d9", 'borderTopStyle': "none" }} className={`plotter-plot`}>
            {
                plotError && <Alert type="error" message={plotError} banner />
            }
            <D3PlotComponent plots={plots} onMarkerUpdate={onMarkerUpdate} onLogsClick={(range) => {
                window.open(makeKibanaLink({
                    runIds: plotData.map(runData => runData.runId),
                    time_from: range.start,
                    time_to: range.end
                }), '_blank')!.focus();
            }} extraControls={
                <Button type="primary" onClick={e => setDrawerVisible(true)} icon={<SettingOutlined />}>
                    Settings
                </Button>
            } />
        </Card>

        <Drawer
            title={`Segment : ${(selectedSegment?.segmentIndex || 0) + 1}`}
            visible={selectedSegment != null}
            onClose={() => setSelectedSegment(null)}
            size="large"
        >
            {
                useMemo(() => {
                    if (!selectedSegment) return "Please Select a segment";
                    const makeVideoPath = (name: string) => `${StaticApi}/${plotData[selectedSegment.plotIndex].runId}/downloaded/${name}`;
                    const segment = plotData[selectedSegment.plotIndex].segments[selectedSegment.segmentIndex]
                    const quality = segment.quality;
                    const index = selectedSegment.segmentIndex;
                    const videoUrls = [
                        makeVideoPath(`init-stream${quality}.m4s`),
                        makeVideoPath(`chunk-stream${quality}-${padWithZero(index + 1, 5)}.m4s`),
                    ]
                    const inspectorPath = makeVideoInspectorPath(videoUrls)
                    return <>
                        <div>
                            <Button href={inspectorPath} className="nav-text">Open Video Inspector</Button>
                        </div>
                        <FramesListComponent videoPaths={videoUrls}></FramesListComponent>
                    </>
                }, [selectedSegment])
            }
        </Drawer>

    </div>
}

function padWithZero(num: number, targetLength: number) {
    return String(num).padStart(targetLength, '0');
}