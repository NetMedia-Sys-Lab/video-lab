import "./style.scss"

import {Card, Collapse, Tabs} from "antd";
import {useEffect, useState} from "react";
import {useGetRunsData} from "../../common/api";
import {RunConfig} from "../../types/result.type";
import {RunDataType} from "../../types/run-data.type";
import {
    COLORS
} from "../../types/plot.type";
import {DataFrame} from "../../plotter/dataframe";
import {D3PlotComponent} from "../../plotter/d3-plot.component";
import {D3PlotBase} from "../../plotter/d3-plot-base";

const {TabPane} = Tabs;
const {Panel} = Collapse;

export const PlotterMethodCompareComponent = ({runIds = []}: { runIds: string[] }) => {
    const runsData = useGetRunsData(runIds);
    const [plots, setPlots] = useState<D3PlotBase<any>[]>([]);

    useEffect(() => {
        if (!runsData.data) return;
        let plotData: RunDataType[] = runIds.map(runId => runsData.data![runId]);
        // console.clear();
        console.log("Creati ng plots from data", plotData);

        // Create constant color map for each run
        const runColors: { [runKey: string]: string } = {};
        runIds.forEach((runId, index) => {
            runColors[runId] = COLORS[index % COLORS.length];
        })

        const plots: D3PlotBase<any>[] = [];

        const df = new DataFrame<RunDataType>(plotData).mapRows(r => {
            // results-all-087/run_drop-low_long-buffer_hevc_Aspen_1sec_nonbeta_tcp_01
            const [result, run] = r.runId.split("/");
            const [_, bwProfile, bufferSetting, codec, video, length, beta, protocol, logNum] = run.split("_");
            let method = "dash";
            if (beta === "beta") {
                if (protocol === "tcp") {
                    method = "beta";
                } else {
                    method = "quic";
                }
            } else if (protocol !== "tcp") {
                throw Error("Found run over non beta and quic");
            }
            return {
                video,
                method,
                numStall: r.num_stall,
                durStall: r.dur_stall
            }
        });

        df.print();


        console.clear();
        const dfGroup = df.groupBy(r => r.method).mapGroups(
            (method, df1) => df1.groupBy(r => r.video)
                .reduce((video, df2) => ({
                        method: method,
                        video: video,
                        numStall: df2.avgField(r => r.numStall),
                        durStall: df2.avgField(r => r.durStall),
                    }), "video"
                )
        );
        dfGroup.col("durStall").plotBar(plots);


        // plots.push({
        //     type: "bar",
        //     df: dfGroup.toList(),
        //     colors: dfGroup.toList().map((d, i) => COLORS[i]),
        //     opacity: 1,
        //     yAcc: r => r.durStall,
        //     xAcc: r => r.video,
        //     axisIndex: 0
        // });

        setPlots(plots);


    }, [runsData.data]);

    useEffect(() => {
        runsData.refresh();
    }, []);

    return <>
        <Collapse defaultActiveKey={[]} className={`plotter-settings`}>
            <Panel header="Plot Config" key="1">
                <Tabs defaultActiveKey="1" type="card" size={"small"}>
                    <TabPane tab="Common" key="1">

                    </TabPane>
                </Tabs>
            </Panel>
        </Collapse>

        <Card style={{border: "1px solid #d9d9d9", 'borderTopStyle': "none"}} className={`plotter-plot`}>
            <D3PlotComponent plots={plots}></D3PlotComponent>
        </Card>
    </>
}