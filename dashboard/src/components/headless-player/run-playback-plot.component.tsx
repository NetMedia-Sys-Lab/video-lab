import "./style.scss";

import { SettingOutlined } from '@ant-design/icons';
import { Alert, Badge, Button, Card, Collapse, Drawer, Select, Switch } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { StaticApi, makeKibanaLink } from "../../common/api";
import { makeVideoInspectorPath } from "../../pages/video-inspector/video-inspector.component";
import { COLORS, MarkerUpdateCallback, objectMap } from "../../types/plot.type";
import {
    RunBwActualType,
    RunBwEstimatedType,
    RunDataType,
    RunSegmentType,
    RunStallType,
    RunStateType
} from "../../types/run-data.type";
import { D3PlotBase } from "../plotter/d3-plot-base";
import { D3PlotComponent } from "../plotter/d3-plot.component";
import { DataFrameGroups } from "../plotter/dataframe";
import { FramesListComponent } from "../video-tools/frames-list";


const { Panel } = Collapse;

export const RunPlaybackPlotComponent = (props: {
    runsData: RunDataType[],
    onMarkerUpdate?: MarkerUpdateCallback
}) => {
    const { runsData, onMarkerUpdate } = props;
    const [plotRuns, setPlotRuns] = useState<{ [key: string]: boolean }>({});
    const [plotData, setPlotData] = useState<RunDataType[]>([]);
    const [selectedSegment, setSelectedSegment] = useState<null | { plotIndex: number, segment: RunSegmentType }>(null);
    const [plotError, setPlotError] = useState<string>()
    const [allPlotRunsSelected, setAllPlotRunsSelected] = useState<boolean>()

    const [plotConfig, setPlotConfig] = useState({
        plotDownloads: true,
        plotTotalSegmentSize: false,
        plotQualityLevels: true,
        plotPosition: false,
        plotBufferLevel: false,
        plotStalls: true,
        plotDropped: false,
        plotBacklog: false,
        plotActualBw: false,
        plotEstimatedBw: false,
        backlogQdisc: "1:",
        droppedQdisc: "",
        plotVmaf: true
    });

    const qdiscs = ["1:", "1:1", "1:2", "1:3", "2:", "2:1", "3:"];
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([]);
    const [drawerVisible, setDrawerVisible] = useState(false);

    useEffect(() => {
        setPlotData(runsData.filter(d => plotRuns[d.run_id]));
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
        const runColors: { [runKey: string]: string } = {}
        const legendLabels: { [k: string]: string } = {}
        runsData.forEach((runData, index) => {
            runColors[runData.run_id] = COLORS[index % COLORS.length];
            legendLabels[index] = runData.run_id
        })

        const plots: D3PlotBase<any>[] = [];
        const colors = plotData.map(d => runColors[d.run_id]);
        const segments = new DataFrameGroups<RunSegmentType>(
            objectMap(plotData, (d: RunDataType) => {
                const segs = d.segments;
                if (segs[0].start_time < 100000) return segs;
                const zero_time = d.playback_start_time;
                segs.forEach(seg => {
                    seg.start_time -= zero_time;
                    seg.stop_time -= zero_time;
                    seg.first_byte_at -= zero_time;
                    seg.last_byte_at -= zero_time;
                })
                return segs;
            }),
            "start_time", {
            colors,
        });


        if (plotConfig.plotDownloads) {

            // Waiting time 
            segments.plotBarh(plots, {
                xAcc: (r) => r.start_time,
                spanAcc: (r) => r.first_byte_at - r.start_time,
                yAcc: (r) => r.index,
                opacity: 0.5
            });

            // Downloading
            segments.plotBarh(plots, {
                xAcc: r => r.first_byte_at,
                spanAcc: r => r.stop_time - r.first_byte_at,
                yAcc: r => r.index,
                gridY: true,
                xLabel: "Time (s)",
                yLabel: "Segment index"
            });

            // Flushed
            segments.filter(r => r.stopped_bytes / r.total_bytes < 0.99)
                .plotBarh(plots, {
                    xAcc: r => r.first_byte_at,
                    spanAcc: r => r.stop_time - r.first_byte_at,
                    yAcc: r => r.index,
                    colors: plotData.map(d => "rgba(0,0,0,0.45)")
                })
            segments.plotBarh(plots, {
                xAcc: r => r.stop_time,
                spanAcc: (r) => r.last_byte_at - r.stop_time,
                yAcc: r => r.index,
                colors: plotData.map(d => "#00000026"),
                text: r => (r.stopped_bytes / r.total_bytes < 0.99
                    ? (r.stopped_bytes / r.total_bytes).toFixed(2)
                    + (r.received_bytes / r.total_bytes !== r.stopped_bytes / r.total_bytes ? ',' + (r.received_bytes / r.total_bytes).toFixed(2) : '')
                    : '')
            });
            segments.plotBarh(plots, {
                xAcc: (r) => r.start_time,
                spanAcc: (r) => r.last_byte_at - r.start_time,
                yAcc: (r) => r.index,
                opacity: 0,
                onSelect: (plotIndex: number, segment: RunSegmentType) => {
                    setSelectedSegment({ plotIndex, segment })
                }
            })
        }
        if (plotConfig.plotBufferLevel) {
            const bufferLevel = new DataFrameGroups<{ time: number, level: number }>(
                objectMap(plotData, (d) => d.buffer_level),
                "time", { colors }
            );
            bufferLevel.plotLine(plots, {
                yAcc: r => r.level,
                colors
            });
        }

        if (plotConfig.plotPosition) {
            const states = new DataFrameGroups<RunStateType & { segmentLength: number }>(
                objectMap(plotData, (d) => d.states),
                "time", { colors }
            )
                .mapGroups((gid, df) => df.extend({
                    segmentLength: () => {
                        return (plotData[gid as any].segments[0].duration || 1) as number
                    }
                }));
            states.plotLine(plots, {
                yAcc: r => r.position / r.segmentLength,
                colors
            });
        }

        if (plotConfig.plotStalls) {
            const df = new DataFrameGroups<RunStallType>(objectMap(plotData, (d) => d.stalls), "time_start");
            const height = segments.max("index") + 1;
            df.plotRect(plots, {
                xAcc: r => r.time_start,
                yAcc: height,
                widthAcc: r => r.time_end - r.time_start,
                heightAcc: height,
                opacity: 0.1,
                axisIndex: 0
            })
        }

        if (plotConfig.plotQualityLevels) {
            segments.plotBar(plots, {
                yAcc: r => (7 - r.quality),
                xAcc: r => r.start_time,
                axisIndex: 0,
                opacity: 0.5
            });
        }

        if (plotConfig.plotVmaf) {
            // TODO: Change to dynamic from MPD
            const fps = 24
            const vmaf = new DataFrameGroups(
                objectMap(plotData, (d: RunDataType) => (d.vmaf?.frames || []).map(f => ({
                    time: f.frameNum / fps,
                    vmaf: f.metrics.vmaf,
                    psnr: f.metrics.psnr_y,
                    ssim: f.metrics.float_ssim
                }))), "time");
            vmaf.plotLine(plots, {
                yAcc: r => r.vmaf,
                axisIndex: 1
            });
        }

        if (plotConfig.plotTotalSegmentSize) {
            segments.plotBar(plots, {
                yAcc: r => r.total_bytes,
                xAcc: r => r.start_time,
                axisIndex: 2
            });
        }

        if (plotConfig.plotActualBw) {
            const bandwidth_actual = new DataFrameGroups<RunBwActualType>(
                objectMap(plotData, (d) => d.bandwidth_actual.map((bw: RunBwActualType) => ({
                    ...bw,
                    bw: bw.bw < 500 ? 0 : bw.bw
                }))),
                "time"
            );
            bandwidth_actual
                .col("bw")
                .toStep("time")
                .mapGroups((gid, df) => df.pushRow({
                    time: segments.max("last_byte_at"),
                    bw: df.rows.length > 0 ? df.rows[df.rows.length - 1].bw : 0
                } as RunBwActualType))
                .col("bw")
                .plotLine(plots, { axisIndex: -1 });
        }

        if (plotConfig.plotEstimatedBw) {
            const bandwidth_estimate = new DataFrameGroups<RunBwEstimatedType>(
                objectMap(plotData, (d) => d.bandwidth_estimate),
                "time", { colors }
            );
            bandwidth_estimate.col("bandwidth")
                .toStep("time")
                .plotLine(plots, { axisIndex: 1 });
            bandwidth_estimate.col("bandwidth")
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
            tc_stats
                .col("dropped").dropNa().col("dropped")
                .plotLine(plots, { axisIndex: 1 });
        }

        setPlots(plots);

    }, [plotData, plotConfig]);

    const setAllPlotRuns = (value: boolean) => {
        setPlotRuns(runsData.reduce((obj, runData) => ({
            ...obj,
            [runData.run_id]: value
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
            open={drawerVisible}
            getContainer={false}
            width={800}
            style={{ position: 'absolute' }}>


            <Collapse defaultActiveKey={["Runs", "Segments", "Playback", "Network"]}>
                {SettingSection("Runs", [
                    <Switch checked={allPlotRunsSelected} onChange={value => {
                        setAllPlotRuns(value)
                    }} />,
                    ...runsData
                        .map((runData, index) => SettingSwitch(runData.run_config.run_id, runData.run_config.run_id, [
                            <Badge count={COLORS[index % COLORS.length]}
                                style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        ], plotRuns, setPlotRuns))
                ])}
                {SettingSection("Segments", [
                    SettingSwitch("Plot Segment Download Timeline", 'plotDownloads'),
                    SettingSwitch("Plot Segment Quality Levels", 'plotQualityLevels'),
                    SettingSwitch("Plot Total Segment Size", 'plotTotalSegmentSize')
                ])}
                {SettingSection("Playback", [
                    SettingSwitch("Plot Position", 'plotPosition'),
                    SettingSwitch("Plot Buffer Level", 'plotBufferLevel'),
                    SettingSwitch("Plot Buffering Stalls", 'plotStalls'),
                    SettingSwitch("Plot VMAF", 'plotVmaf'),
                ])}
                {SettingSection("Network", [
                    SettingSwitch("Plot Packets Dropped", 'plotDropped', [
                        SettingSelect("Select QDisc", 'droppedQdisc', qdiscs)
                    ]),
                    SettingSwitch("Plot Backlog", 'plotBacklog', [
                        SettingSelect("Select QDisc", 'backlogQdisc', qdiscs)
                    ]),
                    SettingSwitch("Plot Actual Bandwidth", 'plotActualBw'),
                    SettingSwitch("Plot Estimated Bandwidth", 'plotEstimatedBw')
                ])}
            </Collapse>
        </Drawer>

        <Card className={`plotter-plot`}>
            {
                plotError && <Alert type="error" message={plotError} banner />
            }
            <D3PlotComponent plots={plots}
                margin={{ top: 20, right: 70, bottom: 60, left: 60 }}
                onMarkerUpdate={onMarkerUpdate} onLogsClick={(range) => {
                    window.open(makeKibanaLink({
                        runIds: plotData.map(runData => runData.run_id),
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
            title={`Segment : ${(selectedSegment?.segment.index || 0) + 1}`}
            open={selectedSegment != null}
            onClose={() => setSelectedSegment(null)}
            size="large"
        >
            {
                useMemo(() => {
                    if (!selectedSegment) return "Please Select a segment";
                    const makeVideoPath = (name: string) => `${StaticApi}/${plotData[selectedSegment.plotIndex].run_id}/downloaded/${name}`;
                    const index = selectedSegment.segment.index;
                    const videoUrls = [
                        makeVideoPath(selectedSegment.segment.init_url.split('/').pop()!),
                        makeVideoPath(selectedSegment.segment.url.split('/').pop()!),
                    ]
                    const inspectorPath = makeVideoInspectorPath(videoUrls)
                    return <>
                        <div>
                            <Button href={inspectorPath} className="nav-text">Open Video Inspector</Button>
                        </div>
                        <FramesListComponent videoPaths={videoUrls.join("\n")}></FramesListComponent>
                    </>
                }, [selectedSegment])
            }
        </Drawer>

    </div>
}

function padWithZero(num: number, targetLength: number) {
    return String(num).padStart(targetLength, '0');
}