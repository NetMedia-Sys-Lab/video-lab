import "./style.scss"
import { Descriptions, Select, Spin, Table, Tabs } from "antd"
import { useEffect, useMemo, useState } from "react"
import ReactJson from "react-json-view"
import { useVideoDetails, videoPlaybackPath } from "../../common/video-inspector.api"
import { D3PlotBase } from "../plotter/d3-plot-base"
import { D3PlotComponent } from "../plotter/d3-plot.component"
import { DataFrame } from "../plotter/dataframe"
import { COLORS } from "../../types/plot.type"
import { ColumnType } from "antd/lib/table"
import { VideoPlayer } from "../player/player.component"

const columns: ColumnType<any>[] = [
    {
        key: "index",
        dataIndex: "index",
        title: "index",
        sorter: (a: any, b: any) => a.index - b.index,
    }, {
        key: "part_index",
        dataIndex: "part_index",
        title: "part_index",
        sorter: (a: any, b: any) => a.part_index - b.part_index,
    }, {
        key: "coded_picture_number",
        dataIndex: "coded_picture_number",
        title: "coded_picture_number",
        sorter: (a: any, b: any) => a.coded_picture_number - b.coded_picture_number,
    }, {
        key: "pict_type",
        dataIndex: "pict_type",
        title: "pict_type",
        sorter: (a: any, b: any) => a.pict_type - b.pict_type,
        onFilter: (value, record) => record.pict_type === value,
        filters: [
            {
                text: 'Intra (I)',
                value: 'I',
            },
            {
                text: 'p',
                value: 'p',
            },
            {
                text: 'P',
                value: 'P',
            },
        ]
    }, {
        key: "key_frame",
        dataIndex: "key_frame",
        title: "key_frame",
        sorter: (a: any, b: any) => a.key_frame - b.key_frame,
    }, {
        key: "pkt_dts_time",
        dataIndex: "pkt_dts_time",
        title: "pkt_dts_time",
        sorter: (a: any, b: any) => a.pkt_dts_time - b.pkt_dts_time,
    }, {
        key: "pkt_pos",
        dataIndex: "pkt_pos",
        title: "pkt_pos",
        sorter: (a: any, b: any) => a.pkt_pos - b.pkt_pos,
    }, {
        key: "pkt_size",
        dataIndex: "pkt_size",
        title: "pkt_size",
        sorter: (a: any, b: any) => a.pkt_size - b.pkt_size,
    }
]

export const FramesListComponent = (props: {
    videoPaths: string,
    refPaths?: string
}) => {
    const { videoPaths, refPaths } = props
    const videoDetails = useVideoDetails(videoPaths, refPaths)
    const [activeKey, setActiveKey] = useState("2");

    const [vqOptions, setVqOptions] = useState<{ value: string, label: string }[]>([]);
    const [vqMetric, setVQMetric] = useState<string>();

    const partPlots = useMemo(() => {
        if (!videoDetails.data?.frames) return
        const partOffsets = videoDetails.data?.part_offsets;

        const plots: D3PlotBase<any>[] = []
        const framesDf = new DataFrame<any>(videoDetails.data?.frames, 'index')

        const parts = [];
        for (let i = 1; i < partOffsets.length - 1; i++) {
            parts.push({ i: i, start: partOffsets[i], span: partOffsets[i + 1] - partOffsets[i] })
        }
        new DataFrame(parts)
            .groupBy(d => d.i)
            .plotBarh(plots, {
                xAcc: d => d.start,
                spanAcc: d => d.span,
                yAcc: 0,
                class: 'part',
                opacity: 0.1
            })

        framesDf
            .groupBy(d => d.part_index)
            .plotBarh(plots, {
                xAcc: d => d.pkt_pos,
                spanAcc: d => d.pkt_size,
                yAcc: 0,
                class: 'frame',
                onSelect: (plotIndex: number, frame: any) => {
                },
            })

        return plots
    }, [videoDetails.data])

    const qualityPlots = useMemo(() => {
        if (!videoDetails.data?.quality) return
        setVqOptions(Object.keys(videoDetails.data.quality[0]).map(k => ({ value: k, label: k })));
        if (!vqMetric) return;

        const plots: D3PlotBase<any>[] = []
        const framesDf = new DataFrame<any>(videoDetails.data?.quality, 'n')
        framesDf.plotBar(plots, {
            yAcc: d => d[vqMetric],
            legendLabels: { null: vqMetric }
        })

        return plots
    }, [videoDetails.data, vqMetric])

    return <Spin spinning={videoDetails.isLoading}>
        <Tabs activeKey={activeKey} onChange={setActiveKey}>
            <Tabs.TabPane tab="Raw" key={"1"}>
                Video URLs: <br />
                {videoPaths.split("\n").map(p => <>{p}<br /></>)}<br />
                <ReactJson src={videoDetails.data} collapsed={2}></ReactJson>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Plot" key={"2"}>
                <D3PlotComponent plots={partPlots || []} height={100} margin={{ top: 10, right: 10, bottom: 30, left: 40 }} />
            </Tabs.TabPane>
            <Tabs.TabPane tab="Table" key={"3"}>
                <Table
                    dataSource={videoDetails.data?.frames}
                    pagination={{ pageSize: 20 }}
                    size="small"
                    sortDirections={['ascend', 'descend']}
                    columns={columns}
                    expandable={{
                        expandedRowRender: (record) => <ReactJson src={record}></ReactJson>,
                    }}
                ></Table>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Playback" key={"4"}>
                <video src={activeKey === "4" ? videoPlaybackPath(videoPaths) : ""} controls style={{maxWidth: "100%"}}/>
            </Tabs.TabPane>
            <Tabs.TabPane tab="Quality" key={"5"}>
                <table>
                    <tr>
                        <th>X-Axis</th>
                        <td>
                            <Select
                                style={{ width: 200 }}
                                options={[{ value: 'frame', label: 'frame' }]}
                                value={'frame'}
                            />
                        </td>
                        <th>Y-Axis</th>
                        <td>
                            <Select
                                style={{ width: 200 }}
                                options={vqOptions}
                                allowClear={false}
                                defaultActiveFirstOption={true}
                                value={vqMetric}
                                onChange={val => setVQMetric(val)}
                            />
                        </td>
                    </tr>
                </table>
                <D3PlotComponent plots={qualityPlots || []} height={100} margin={{ top: 10, right: 10, bottom: 30, left: 40 }} />
            </Tabs.TabPane>
            <Tabs.TabPane tab="Stats" key="6">
                <Descriptions title="Stats" bordered>
                    {videoDetails.data?.stats && Object.entries(videoDetails.data.stats).map(([k, v]) =>
                        <Descriptions.Item label={k.toString()}>{JSON.stringify(v)}</Descriptions.Item>
                    )}
                </Descriptions>
            </Tabs.TabPane>
        </Tabs>
    </Spin>
}

