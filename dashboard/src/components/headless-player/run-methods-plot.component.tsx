import "./style.scss"

import { Radio, Select, Spin } from "antd"
import { useEffect, useMemo, useState } from "react"
import { useGetRunsData } from "../../common/api"
import { RunDataType } from "../../types/run-data.type"
import {
    COLORS
} from "../../types/plot.type"
import { DataFrame } from "../plotter/dataframe"
import { D3PlotComponent } from "../plotter/d3-plot.component"
import { D3PlotBase } from "../plotter/d3-plot-base"

function commonPrefixIndex(strs: string[]) {
    const tokens = strs.map(s => s.split("_"))
    const minLength = Math.min(...tokens.map(t => t.length))
    for (let i = 0; i < minLength; i++) {
        for(let j=0;j<tokens.length;j++) {
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
    for (let i = minLength-1; i >= 0; i--) {
        for(let j=0;j<tokens.length;j++) {
            if (tokens[j][i] !== tokens[0][i]) {
                return i+1;
            }
        }
    }
    return minLength;
}


type PlotFields = {
    name?: string
    video?: string
    bufferSetting?: string
    codec?: string
    segLength?: number
    method: string
    numBuffStall?: number
    durBuffStall?: number
    vmaf?: number
    durMicroStall?: number
    durStall?: number
    quality?: number
}


export const RunMethodsPlotComponent = ({ runsData }: { runsData: RunDataType[] }) => {
    const [plotType, setPlotType] = useState('durStall (ms)')
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([])
    const [xAxis, setGroupBy] = useState<string | null>("video");

    const df: DataFrame<PlotFields> | undefined = useMemo(() => {
        if (runsData.length === 0) return
        let plotData: RunDataType[] = runsData
        console.log("Creating plots from data", plotData)

        // Create constant color map for each run
        const runColors: { [runKey: string]: string } = {}
        runsData.forEach((runData, index) => {
            runColors[runData.runId] = COLORS[index % COLORS.length]
        })
        
        const names = plotData.map(r => r.run_config.runId.split("/").join("_"))
        const cpi = commonPrefixIndex(names)
        const csi = commonSuffixIndex(names)
        // const cpi = 0
        // const csi = plotData[0].run_config.runId.split("/").join("_").split("_").length
        return new DataFrame<RunDataType>(plotData).mapRows(r => {
            let method = "dash"
            if (r.run_config.beta) {
                if (r.run_config.protocol === "tcp") {
                    method = "beta"
                } else {
                    method = "quic"
                }
            } else if (r.run_config.protocol !== "tcp") {
                throw Error("Found run over non beta and quic")
            }
            return {
                name: r.run_config.runId.replace("/", "_").split("_").slice(cpi, csi).join("_"),
                resultId: r.run_config.resultId,
                video: r.run_config.video,
                bufferSetting: r.run_config.bufferSetting,
                codec: r.run_config.codec,
                segLength: r.run_config.length,
                method,
                numBuffStall: r.num_stall,
                durBuffStall: r.dur_stall * 1000,
                vmaf: r.vmaf.mean,
                vmafLoss: (100 - r.vmaf.mean),
                durMicroStall: r.micro_stalls.total_stall_duration * 1000,
                durStall: r.dur_stall * 1000 + r.micro_stalls.total_stall_duration * 1000,
                durStallPerc: (r.dur_stall + r.micro_stalls.total_stall_duration)*100/(r.segments.length*r.run_config.length),
                quality: new DataFrame(r.segments).avgField(r => r.quality)
            } as PlotFields
        }, "name")
    }, [runsData])

    useEffect(() => {
        if (!df) return

        const plots: D3PlotBase<any>[] = []

        if (xAxis === null) {
            df.col(plotType.split(" ")[0] as any).plotBar(plots, {yLabel: plotType});
        } else {
            const indexField = xAxis.split(" ")[0] as keyof PlotFields
            const plotField = plotType.split(" ")[0]
            const dfGroup = df.groupBy(r => r.method).mapGroups(
                (method, df1) => df1.groupBy(r => r[indexField]!)
                    .reduce((groupByValue, df2) => ({
                        method: method,
                        [indexField]: groupByValue,
                        [plotField]: df2.avgField(r => r[plotField as keyof PlotFields]!)
                    }), indexField)
            )
            dfGroup.col(plotField as any).plotBar(plots, {xLabel: xAxis, yLabel: plotType})
        }

        setPlots(plots)
    }, [plotType, xAxis, df])

    return <>
        X Axis &nbsp;&nbsp;&nbsp;
        <Select style={{width: "200px"}} placeholder="X Axis" defaultValue={xAxis} onChange={e => setGroupBy(e)}>
            <Select.Option value={null}>None</Select.Option>
            <Select.Option value={"resultId"}>Result ID</Select.Option>
            <Select.Option value={"video"}>Video</Select.Option>
            <Select.Option value={"bufferSetting"}>Buffer Setting</Select.Option>
            <Select.Option value={"codec"}>Codec</Select.Option>
            <Select.Option value={"segLength (s)"}>Segment Length</Select.Option>
        </Select> <br />
        Y Axis &nbsp;&nbsp;&nbsp;
        <Radio.Group size="large" onChange={(e) => setPlotType(e.target.value)} value={plotType}>
            <Radio.Button value="durBuffStall (ms)">Duration of Buffering Stalls (ms)</Radio.Button>
            <Radio.Button value="durMicroStall (ms)">Duration of Micro Stalls (ms)</Radio.Button>
            <Radio.Button value="durStall (ms)">Duration of All Stalls (ms)</Radio.Button>
            <Radio.Button value="durStallPerc (%)">Duration of All Stalls (%)</Radio.Button>
            <Radio.Button value="numBuffStall">Number of Buffering Stalls</Radio.Button>
            <Radio.Button value="vmaf (%)">VMAF (%)</Radio.Button>
            <Radio.Button value="vmafLoss (%)">VMAF Loss (%)</Radio.Button>
            <Radio.Button value="quality">Quality Level</Radio.Button>
        </Radio.Group>
        <D3PlotComponent plots={plots}></D3PlotComponent>
    </>
}