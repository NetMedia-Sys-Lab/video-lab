import "./style.scss"

import { Radio, Spin } from "antd"
import { useEffect, useState } from "react"
import { useGetRunsData } from "../../common/api"
import { RunDataType } from "../../types/run-data.type"
import {
    COLORS
} from "../../types/plot.type"
import { DataFrame } from "../plotter/dataframe"
import { D3PlotComponent } from "../plotter/d3-plot.component"
import { D3PlotBase } from "../plotter/d3-plot-base"

export const RunMethodsPlotComponent = ({ runsData }: { runsData: RunDataType[] }) => {
    const [plotType, setPlotType] = useState('durStall')
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([])

    useEffect(() => {
        let plotData: RunDataType[] = runsData
        console.log("Creating plots from data", plotData)

        // Create constant color map for each run
        const runColors: { [runKey: string]: string } = {}
        runsData.forEach((runData, index) => {
            runColors[runData.runId] = COLORS[index % COLORS.length]
        })

        const plots: D3PlotBase<any>[] = []

        const df = new DataFrame<RunDataType>(plotData).mapRows(r => {
            // results-all-087/run_drop-low_long-buffer_hevc_Aspen_1sec_nonbeta_tcp_01
            const [result, run] = r.runId.split("/")
            const [_, bwProfile, bufferSetting, codec, video, length, beta, protocol, logNum] = run.split("_")
            let method = "dash"
            if (beta === "beta") {
                if (protocol === "tcp") {
                    method = "beta"
                } else {
                    method = "quic"
                }
            } else if (protocol !== "tcp") {
                throw Error("Found run over non beta and quic")
            }
            return {
                video,
                method,
                numBuffStall: r.num_stall,
                durBuffStall: r.dur_stall * 1000,
                vmaf: r.vmaf.mean,
                durMicroStall: r.micro_stalls.total_stall_duration * 1000,
                durStall: r.dur_stall * 1000 + r.micro_stalls.total_stall_duration * 1000,
                quality: new DataFrame(r.segments).avgField(r => r.quality)
            }
        })

        df.print()

        const dfGroup = df.groupBy(r => r.method).mapGroups(
            (method, df1) => df1.groupBy(r => r.video)
                .reduce((video, df2) => ({
                    method: method,
                    video: video,
                    numBuffStall: df2.avgField(r => r.numBuffStall),
                    durBuffStall: df2.avgField(r => r.durBuffStall),
                    vmaf: df2.avgField(r => r.vmaf),
                    vmafLoss: df2.avgField(r => 100 - r.vmaf),
                    durMicroStall: df2.avgField(r => r.durMicroStall),
                    durStall: df2.avgField(r => r.durStall),
                    quality: df2.avgField(r => r.quality),
                }), "video"
                )
        )
        dfGroup.col(plotType as any).plotBar(plots)

        setPlots(plots)
    }, [runsData, plotType])

    return <>
        <Radio.Group size="large" onChange={(e) => setPlotType(e.target.value)} value={plotType}>
            <Radio.Button value="durBuffStall">Duration of Buffering Stalls (ms)</Radio.Button>
            <Radio.Button value="durMicroStall">Duration of Micro Stalls (ms)</Radio.Button>
            <Radio.Button value="durStall">Duration of All Stalls (ms)</Radio.Button>
            <Radio.Button value="numBuffStall">Number of Buffering Stalls</Radio.Button>
            <Radio.Button value="vmaf">VMAF (%)</Radio.Button>
            <Radio.Button value="vmafLoss">VMAF Loss (%)</Radio.Button>
            <Radio.Button value="quality">Quality Level</Radio.Button>
        </Radio.Group>
        <D3PlotComponent plots={plots}></D3PlotComponent>
    </>
}