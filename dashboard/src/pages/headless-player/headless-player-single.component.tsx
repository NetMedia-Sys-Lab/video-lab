import { useMemo, useState } from "react";
import { Button, Layout, Modal, Tabs } from "antd";
import { RunTimelinePlotComponent } from "../../components/headless-player/run-timeline-plot.component";
import {
    calculateRunQuality,
    encodePlayback,
    makeKibanaLink,
    openPcapFile,
    playbackVideoUrl,
    useGetRunsData
} from "../../common/api";
import ReactJson from 'react-json-view'
import { PageType } from "../../types/page.type";
import { useQueryString } from "../../common/util";
import { VideoPlayer } from "../../components/player/player.component";

const { Content, Header } = Layout;
const euc = encodeURIComponent;

export const HeadlessPlayerSingleComponent = () => {
    const runId: string = useQueryString('run')!
    const runsData = useGetRunsData(useMemo(() => [runId], [runId]));

    const [qualityData, setQualityData] = useState();

    return <>
        <Content style={{ margin: '0 16px' }}>
            <Tabs defaultActiveKey={"2"} size={"small"}>
                <Tabs.TabPane tab="Raw" key={"0"}>
                    <ReactJson collapsed={2} src={useGetRunsData(useMemo(() => [runId], [runId])).data!}></ReactJson>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"Plot"} key={"2"}>
                    <RunTimelinePlotComponent runsData={Object.values(runsData.data || {})} ></RunTimelinePlotComponent>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"Utilities"} key={"3"}>
                    <Button onClick={e => openPcapFile([`${runId}/server_in.pcap`])}>Open Pcap File</Button>
                    <br />
                    <Button href={makeKibanaLink({ runIds: [runId] })} target={"_blank"}>Open Logs</Button>
                    <br />
                    <Button onClick={e => {
                        calculateRunQuality([runId]).then((res) => {
                            setQualityData(res);
                        });
                    }}>Calculate Quality</Button>

                </Tabs.TabPane>
                <Tabs.TabPane tab={"Playback"} key={"4"}>
                    {/* {runsData.data && <VideoPlayer src={playbackVideoUrl(runId)}/>} */}
                    <Button onClick={e => encodePlayback([runId])}>Encode Playback File</Button>
                    <br/>
                    {playbackVideoUrl(runId)}
                    <video style={{width: "100%"}} controls>
                        <source src={playbackVideoUrl(runId)} type="video/mp4" />
                    </video>
                </Tabs.TabPane>
            </Tabs>
            <Modal
                title="Quality"
                centered
                open={qualityData}
                onOk={() => setQualityData(undefined)}
                onCancel={() => setQualityData(undefined)}
                width={1000}
            >
                <ReactJson src={qualityData!} style={{ maxHeight: '80vh', overflow: 'scroll' }} collapsed={3} />
            </Modal>
        </Content>
    </>
}

export const HeadlessPlayerSinglePage: PageType = {
    routerPath: '/headless-player/single',
    title: 'Single Run',
    component: HeadlessPlayerSingleComponent
}
export const makeHeadlessPlayerSinglePath =
    (runId: string) => `/headless-player/single?run=${euc(runId)}`