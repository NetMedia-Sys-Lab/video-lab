import "./style.scss"

import { Button, Checkbox, Select, Space } from "antd"
import { useEffect, useMemo, useState } from "react"
import {
    COLORS
} from "../../types/plot.type"
import { RunDataType } from "../../types/run-data.type"
import { D3PlotBase } from "../plotter/d3-plot-base"
import { D3PlotComponent } from "../plotter/d3-plot.component"
import { DataFrame } from "../plotter/dataframe"
import ReactJson from "react-json-view"
import { useSavedState } from "../../common/util"

function commonPrefixIndex(strs: string[]) {
    const tokens = strs.map(s => s.split("_"))
    const minLength = Math.min(...tokens.map(t => t.length))
    for (let i = 0; i < minLength; i++) {
        for (let j = 0; j < tokens.length; j++) {
            if (tokens[j][i] !== tokens[0][i]) {
                return i;
            }
        }
    }
    return minLength;
}

function commonSuffixIndex(strs: string[]) {
    const tokens = strs.map(s => s.split("_"))
    const minLength = Math.min(...tokens.map(t => t.length))
    for (let i = minLength - 1; i >= 0; i--) {
        for (let j = 0; j < tokens.length; j++) {
            if (tokens[j][i] !== tokens[0][i]) {
                return i + 1;
            }
        }
    }
    return minLength;
}

type GroupOptions = "method" | "resultId" | "bufferSelection" | "networkSelection" | "segDuration" | "crf" | "segmentType" | "segmentTypeDur";

type XAxisOptions = "resultId" | "videoName" | "video" | "bufferSelection" | "segLength" | "K_MAXIMUM_WINDOW" | "crf" | "networkSelection" | "segDuration";

type YAxisOptions = "name" | "video" | "bufferSelection" | "segLength" | "method" | "numBuffStall"
    | "durBuffStall" | "vmaf" | "durStall" | "quality" | "durIdle" | "bitrate" | "numMicroStall" | "durMicroStall" | "avgDurMicroStall";

type DataRow = Record<GroupOptions | XAxisOptions | YAxisOptions, string | number>;

function sum(vals?: number[]) {
    if (!vals) return 0;
    let total = 0;
    for (const num of vals) {
        total += num;
    }
    return total;
}

function mean(vals?: number[]) {
    if (!vals?.length) return 0;
    let total = 0;
    for (const num of vals) {
        total += num;
    }
    return total/vals.length;
}

export const RunMethodsPlotComponent = ({ runsData }: { runsData: RunDataType[] }) => {
    const [plotType, setPlotType] = useSavedState<"line" | "bar">('METHOD_PLOT_TYPE', "line");
    const [xAxis, setXAxis] = useSavedState<keyof DataRow>('METHOD_PLOT_XAXIS', "video");
    const [group, setGroup] = useSavedState<keyof DataRow>('METHOD_PLOT_GROUP', 'method');
    const [yAxis, setYAxis] = useSavedState<keyof DataRow>('METHOD_PLOT_YAXIS', 'durStall')
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([])
    const [selectedData, setSelectedData] = useState({});

    const df: DataFrame<DataRow> | undefined = useMemo(() => {
        if (runsData.length === 0) return
        let plotData: RunDataType[] = runsData

        // Create constant color map for each run
        const runColors: { [runKey: string]: string } = {}
        runsData.forEach((runData, index) => {
            runColors[runData.run_id] = COLORS[index % COLORS.length]
        })

        const names = plotData.map(r => r.run_config.run_id.split("/").join("_"))
        const cpi = commonPrefixIndex(names)
        const csi = commonSuffixIndex(names)
        return new DataFrame<RunDataType>(plotData).mapRows(r => {
            let beta = r.run_config.mod_beta === "beta" ? "BETA" : "DASH";
            let method = beta + "_" + r.run_config.mod_downloader;
            const totalDuration = r.segments.map(seg => seg.duration).reduce((prevSum, d) => prevSum + d, 0);
            const name = r.run_config.run_id.replace("/", "_").split("_").slice(cpi, csi).join("_");
            const video = r.run_config.input.startsWith("https://server:443/") ? r.run_config.input.slice(19) : r.run_config.input;
            
            let crfMatches = /crf(\d+)/g.exec(r.run_config.run_id);
            let segDurMatches = /\/[a-z]+_(\d+)ms/g.exec(r.run_config.input);
            let videoNameMatches = /\/([a-z]+)_\d+ms/g.exec(r.run_config.input);
            let segmentTypeMatches = /\/[a-z]+_\d+ms_\d+s_((?:i|s)+)_/g.exec(r.run_config.input);
            return {
                name,
                resultId: r.run_config.run_id.split('/', 1)[0],
                video,
                bufferSelection: r.run_config._selections?.buffer || r.run_config.buffer_duration.toString(),
                segLength: r.segments[0].duration || 1,
                method,
                numBuffStall: r.num_stall,
                durBuffStall: Math.round(r.dur_stall * 1000)/1000,
                durIdle: Math.round(r.dur_idle * 1000)/1000,
                
                vmaf: r.vmaf?.pooled_metrics.vmaf.mean,
                vmafMin: r.vmaf?.pooled_metrics.vmaf.min,
                numSwitches: r.num_quality_switches,
                quality: new DataFrame(r.segments).avgField(r => r.quality),
                quality_std: new DataFrame(r.segments).std(r => r.quality),
                bitrate: new DataFrame(r.segments).avgField(r => r.bitrate),
                bitrate_std: new DataFrame(r.segments).std(r => r.bitrate),
                K_MAXIMUM_WINDOW: parseInt(r.run_config.K_MAXIMUM_WINDOW),
                networkSelection: r.run_config._selections.network,
                numMicroStall: r.micro_stalls?.groups.length,
                durMicroStall: sum(r.micro_stalls?.groups),
                avgDurMicroStall: mean(r.micro_stalls?.groups),

                // Optional Fields
                crf: crfMatches ? crfMatches[1] : undefined,
                videoName: videoNameMatches ? videoNameMatches[1] : undefined,
                segDuration: segDurMatches ? segDurMatches[1] : undefined,
                segmentType: segmentTypeMatches ? segmentTypeMatches[1] : undefined,
                segmentTypeDur: segmentTypeMatches && segDurMatches ? `${segmentTypeMatches[1]}/${segDurMatches[1]}ms` : undefined,
            } as any
        }, "name")
    }, [runsData])

    useEffect(() => {
        const indexField: keyof DataRow = "videoName";
        if (!df) return;
        const dfGroup = df!.groupBy(r=>r.segmentTypeDur).mapGroups(
            (segmentType, df1) => {
                const ret = df1.groupBy(r => r[indexField]!)
                    .reduce((groupByValue, df2) => ({
                        segmentType,
                        [indexField]: isNaN(groupByValue as any) ? groupByValue : parseInt(groupByValue),
                        durBuffStall: Math.round(df2.avgField(r => r.durBuffStall)*1000)/1000,
                        durIdle: Math.round(df2.avgField(r=>r.durIdle)*1000)/1000,
                        vmaf: Math.round(df2.avgField(r=>r.vmaf)*1000)/1000,
                        quality: Math.round(df2.avgField(r=>r.quality)*1000)/1000,
                        bitrate: Math.round(df2.avgField(r=>r.bitrate)*1000)/1000,
                        avgDurMicroStall: Math.round(df2.avgField(r=>r.avgDurMicroStall)*1000)/1000,
                        durMicroStall: Math.round(df2.avgField(r=>r.durMicroStall)*1000)/1000,
                    }), indexField);
                ret.sortNumerical(indexField);
                return ret
            }
        )
        console.log(dfGroup.toPandasDF());
    }, [df]);

    const getDfGroup = (g: keyof DataRow, x: keyof DataRow, y: keyof DataRow) => {
        return df!.groupBy(r => r[g]).mapGroups(
            (groupId, df1) => {
                const ret = df1.groupBy(r => r[x]!)
                    .reduce((groupByValue, df2) => ({
                        [g]: groupId,
                        [x]: isNaN(groupByValue as any) ? groupByValue : parseInt(groupByValue),
                        [y]: df2.avgField(r => r[y]!),
                        // "durBuffStall": df2.avgField(r => r.durBuffStall!),
                    }), x);
                ret.sortNumerical(x);
                return ret
            }
        )
    }

    useEffect(() => {
        if (!df) return

        const plots: D3PlotBase<any>[] = []
        const dfGroup = getDfGroup(group, xAxis, yAxis);
        if (plotType === "bar") {

            dfGroup.col(yAxis).plotBar(plots, {
                xLabel: xAxis,
                yLabel: yAxis,
                onSelect: (idx, data) => setSelectedData(data)
            })
        } else if (plotType === "line") {
            dfGroup.col(yAxis).plotLine(plots, {
                xLabel: xAxis,
                yLabel: yAxis,
                text: '+'
            })
        }

        setPlots(plots)
    }, [yAxis, xAxis, df, plotType, group])

    function downloadJson() {
        const columns = ["durBuffStall", "durMicroStall", "durStall", "durStallPerc", "numBuffStall", "numSwitches", "vmaf", "vmafLoss", "quality", "quality_std", "bitrate", "bitrate_std"];
        const result = df!.groupBy(r => r[xAxis]!)
            .reduce((groupByValue, df2) => columns.reduce((o, key) => Object.assign(o, {
                [key]: df2.avgField(r => r[key as keyof DataRow]!),
            }), {
                [xAxis]: isNaN(groupByValue as any) ? groupByValue : parseInt(groupByValue),
            }), xAxis).rows

        const fileName = "data.json";
        const json = JSON.stringify(result, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const href = URL.createObjectURL(blob);

        // create "a" HTLM element with href to file
        const link = document.createElement("a");
        link.href = href
        link.download = fileName
        document.body.appendChild(link);
        link.click();

        // clean up "a" element & remove ObjectURL
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
    }

    return <>
        Plot Type &nbsp;&nbsp;&nbsp;
        <Select placeholder="Plot Type" value={plotType} onChange={setPlotType}>
            <Select.Option value={"line"}>Line</Select.Option>
            <Select.Option value={"bar"}>Bar</Select.Option>
        </Select>
        &nbsp;&nbsp; Group By &nbsp;&nbsp;&nbsp;
        <Select placeholder="Group By" style={{width: 200}} value={group} onChange={setGroup}>
            <Select.Option value={"method"}>Method</Select.Option>
            <Select.Option value={"resultId"}>Result ID</Select.Option>
            <Select.Option value={"bufferSelection"}>Buffer Selection</Select.Option>
            <Select.Option value={"segDuration"}>Segment Duration</Select.Option>
            <Select.Option value={"networkSelection"}>Network Selection</Select.Option>
            <Select.Option value={"crf"}>CRF</Select.Option>
            <Select.Option value={"videoName"}>Video Name</Select.Option>
            <Select.Option value={"video"}>Video</Select.Option>
            <Select.Option value={"segmentType"}>Segment Type</Select.Option>
            <Select.Option value={"segmentTypeDur"}>Segment Type/Duration</Select.Option>
        </Select>
        &nbsp;&nbsp; X Axis &nbsp;&nbsp;&nbsp;
        <Select style={{ width: 200 }} placeholder="X Axis" value={xAxis} onChange={setXAxis}>
            {/* <Select.Option value={null}>None</Select.Option> */}
            <Select.Option value={"method"}>Method</Select.Option>
            <Select.Option value={"resultId"}>Result ID</Select.Option>
            <Select.Option value={"video"}>Video</Select.Option>
            <Select.Option value={"bufferSelection"}>Buffer Selection</Select.Option>
            <Select.Option value={"networkSelection"}>Network Selection</Select.Option>
            <Select.Option value={"segLength"}>Segment Length (s)</Select.Option>
            <Select.Option value={"K_MAXIMUM_WINDOW"}>K_MAXIMUM_WINDOW (bytes)</Select.Option>
            <Select.Option value={"crf"}>CRF</Select.Option>
            <Select.Option value={"segDuration"}>Segment Duration</Select.Option>
            <Select.Option value={"videoName"}>Video Name</Select.Option>
            <Select.Option value={"segmentType"}>Segment Type</Select.Option>
        </Select>
        &nbsp;&nbsp;Y Axis &nbsp;&nbsp;&nbsp;
        <Space>
            <Select style={{ width: 300 }} placeholder="Y Axis" onChange={setYAxis} value={yAxis}>
                <Select.Option value="durBuffStall">Duration of Buffering Stalls (ms)</Select.Option>
                <Select.Option value="numMicroStall">Number of Micro Stalls</Select.Option>
                <Select.Option value="durMicroStall">Duration of Micro Stalls (frames)</Select.Option>
                <Select.Option value="avgDurMicroStall">Avg. Duration of Micro Stalls (frames)</Select.Option>
                <Select.Option value="durStall">Duration of All Stalls (s)</Select.Option>
                <Select.Option value="durIdle">Duration of Idle Network (s)</Select.Option>
                <Select.Option value="durStallPerc">Duration of All Stalls (%)</Select.Option>
                <Select.Option value="numBuffStall">Number of Buffering Stalls</Select.Option>
                <Select.Option value="numSwitches">Number of Switches</Select.Option>
                <Select.Option value="vmaf">VMAF</Select.Option>
                <Select.Option value="vmafMin">VMAF Min</Select.Option>
                <Select.Option value="vmafLoss">VMAF Loss</Select.Option>
                <Select.Option value="quality">Quality Level</Select.Option>
                <Select.Option value="quality_std">Quality Level Std. Dev.</Select.Option>
                <Select.Option value="bitrate">Bitrate</Select.Option>
                <Select.Option value="bitrate_std">Bitrate Std. Dev.</Select.Option>
            </Select>
            <Button onClick={downloadJson}>Download JSON</Button>
        </Space>
        <div className="methods-plot" style={{maxWidth: '1900px'}}>
            <D3PlotComponent
                plots={plots}
                // margin={{ top: 70, right: 80, bottom: 200, left: 100 }}
                // height={700}
            ></D3PlotComponent>
        </div>
        <ReactJson src={selectedData}></ReactJson>
    </>
}