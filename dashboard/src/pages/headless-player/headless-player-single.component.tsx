import "./style.scss";
import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useLocation} from "react-router-dom";
import {LogLineType} from "../../types/result.type";
import {Button, Layout, PageHeader, Table, Tabs} from "antd";
import {AllRoutes} from "../../common/routes";
import {PlotterGenericComponent} from "./plotter-generic.component";
import {ColumnsType} from "antd/lib/table";
import {
    calculateRunQuality,
    encodePlayback,
    makeKibanaLink,
    openPcapFile,
    playbackVideoUrl,
    useGetLogs,
    useGetRunsData
} from "../../common/api";
import {MarkerUpdateCallback} from "../../types/plot.type";
import {VideoPlayer} from "../../components/player/player.component";

const {Content, Header} = Layout;

export const HeadlessPlayerSingleComponent = () => {
    const {search} = useLocation();
    const runId: string = React.useMemo(() => new URLSearchParams(search).get('run'), [search])!;

    const logs = useGetLogs(runId);
    const runsData = useGetRunsData([runId]);
    const logsTableRef = useRef<HTMLDivElement>(null);

    const [logsTableHeight, setLogsTableHeight] = useState(600);

    const logTableColumns: ColumnsType<LogLineType> = [
        {
            title: 'Time',
            dataIndex: 'time',
            key: 'time',
            width: '100px',
            render: value => value.toFixed(3),
            // fixed: 'left',
        }, {
            title: 'Tags',
            dataIndex: 'tags',
            key: 'tags',
            width: '200px',
            // fixed: 'left',
        }, {
            title: 'Text',
            dataIndex: 'text',
            key: 'text',
            render: value => <pre>{value}</pre>
        }
    ]

    const onMarkerUpdate: MarkerUpdateCallback = (markers) => {
        const getRowElement = (index: number) => logsTableRef.current!.firstElementChild!.firstElementChild!.firstElementChild!.firstElementChild!.childNodes.item(1)
            .firstChild!.childNodes.item(1).childNodes.item(index!)! as HTMLTableRowElement;
        const getRowElementRange = (i1: number, i2: number) => {
            const nodes = logsTableRef.current!.firstElementChild!.firstElementChild!.firstElementChild!.firstElementChild!.childNodes.item(1)
                .firstChild!.childNodes.item(1).childNodes;
            const rows: HTMLTableRowElement[] = [];
            for (let i = i1; i <= i2; i++) {
                rows.push(nodes.item(i) as HTMLTableRowElement);
            }
            return rows;
        }

        const m = markers[0];
        const startRowIndex = logs.data?.logs.findIndex(value => (value.time > m.start))!;
        const endRowIndex = logs.data?.logs.findIndex(value => (value.time > m.end))! - 1;

        console.log(startRowIndex, endRowIndex);

        const startRow = getRowElement(startRowIndex);
        const endRow = getRowElement(endRowIndex);
        const rangeRows = getRowElementRange(startRowIndex, endRowIndex);
        console.log(
            (startRow.childNodes.item(0) as HTMLTableCellElement).innerHTML,
            (endRow.childNodes.item(0) as HTMLTableCellElement).innerHTML
        );
        startRow.style.borderTop = "2px solid red";
        startRow.style.borderCollapse = "collapse";
        startRow.scrollIntoView();
        endRow.style.borderBottom = "2px solid red";
        endRow.style.borderCollapse = "collapse";
        rangeRows.forEach(row => {
            row.style.backgroundColor = "rgba(0,0,0,0.2)"
        })
    }

    useEffect(() => {
        logs.refresh();
        runsData.refresh();
    }, [runId])

    useLayoutEffect(() => {

        const update = () => {
            if (!logsTableRef.current) return;
            const node = logsTableRef.current!;
            const top = node.getBoundingClientRect()!.top || 100;

            // normally TABLE_HEADER_HEIGHT would be 55.
            const TABLE_HEADER_HEIGHT = 55;
            console.log(window.innerHeight, top, TABLE_HEADER_HEIGHT)
            setLogsTableHeight(window.innerHeight - top - TABLE_HEADER_HEIGHT);
        }

        window.addEventListener('resize', update);
        update();

        return () => {
            window.removeEventListener('resize', update);
        }
    }, [logsTableRef.current]);


    // @ts-ignore
    return <>
        <Content style={{margin: '0 16px'}}>
            <PageHeader
                title="Headless Player Run"
                breadcrumb={{routes: [AllRoutes.HeadlessPlayer, AllRoutes.HeadlessPlayerSingle]}}
                subTitle={`${runId}`}
                onBack={() => window.history.back()}
                ghost={false}
                extra={[]}
            >
            </PageHeader>
            <Tabs defaultActiveKey={"2"} size={"small"}>
                <Tabs.TabPane tab={"Logs"} key={"1"}>
                    <span className={`logs`}>
                        <Table
                            ref={logsTableRef}
                            dataSource={logs.data?.logs}
                            columns={logTableColumns}
                            pagination={false}
                            size="small"
                            scroll={{
                                y: logsTableHeight,
                                x: 'max-content'
                            }}
                        />
                    </span>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"Plot"} key={"2"}>
                    <PlotterGenericComponent runIds={[runId]} onMarkerUpdate={onMarkerUpdate}></PlotterGenericComponent>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"Utilities"} key={"3"}>
                    <Button onClick={e => openPcapFile([`${runId}/server_in.pcap`])}>Open Pcap File</Button>
                    <br/>
                    <Button href={makeKibanaLink({runIds: [runId]})} target={"_blank"}>Open Logs</Button>
                    <br/>
                    <Button onClick={e => calculateRunQuality(runId)}>Calculate Quality</Button>

                </Tabs.TabPane>
                <Tabs.TabPane tab={"Playback"} key={"4"}>
                    {runsData.data && <VideoPlayer
                        src={playbackVideoUrl(runId)}
                        states={runsData.data[runId].states}
                    />}
                    <Button onClick={e => encodePlayback(runId)}>Encode Playback File</Button>
                    {playbackVideoUrl(runId)}
                </Tabs.TabPane>
            </Tabs>
            {/*<pre>{JSON.stringify(logs.data || "undefined", null, 4)}</pre>*/}
        </Content>
    </>
}