import "./style.scss"
import { Table, Tabs } from "antd"
import { useEffect, useMemo } from "react"
import ReactJson from "react-json-view"
import { useVideoDetails } from "../../common/video-inspector.api"
import { D3PlotBase } from "../plotter/d3-plot-base"
import { D3PlotComponent } from "../plotter/d3-plot.component"
import { DataFrame } from "../plotter/dataframe"
import { COLORS } from "../../types/plot.type"

export const FramesListComponent = (props: {
    videoPaths: string[]
    fullVideoSize?: number
}) => {
    const { videoPaths, fullVideoSize } = props
    const videoDetails = useVideoDetails(videoPaths)

    const plots = useMemo(() => {
        if (!videoDetails.data?.frames) return

        const plots: D3PlotBase<any>[] = []
        const framesDf = new DataFrame<any>(videoDetails.data?.frames, 'index')

        framesDf.plotBarh(plots, {
            xAcc: d => d.pkt_pos,
            spanAcc: d => d.pkt_size,
            yAcc: 0,
            class: 'frame',
            onSelect: (plotIndex: number, frame: any) => {

            }
        })
        if (fullVideoSize) {
            new DataFrame([{start: 0, end: fullVideoSize!}])
                .plotBarh(plots, {
                    xAcc: d => d.start,
                    spanAcc: d => d.end-d.start,
                    yAcc: 0,
                    opacity: 0.1
                })
        }
        return plots
    }, [videoDetails.data])

    return <Tabs defaultActiveKey="2">
        <Tabs.TabPane tab="Raw" key={"1"}>
            Video URLs: <br />
            {videoPaths.map(p => <>{p}<br /></>)}<br />
            <ReactJson src={videoDetails.data} collapsed={2}></ReactJson>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Table" key={"2"}>
            <D3PlotComponent plots={plots || []} height={100} margin={{top: 10, right: 10, bottom: 30, left: 30}}/>
            <Table
                dataSource={videoDetails.data?.frames}
                pagination={false}
                size="small"
                sortDirections={['ascend', 'descend']}
                columns={[...["index", "coded_picture_number", "pict_type", "key_frame", "pkt_dts_time", "pkt_pos", "pkt_size"].map((key => ({
                    key,
                    dataIndex: key,
                    title: key,
                    sorter: (a: any, b: any) => a[key] - b[key]
                })))]}
            ></Table>
        </Tabs.TabPane>
    </Tabs>
}

