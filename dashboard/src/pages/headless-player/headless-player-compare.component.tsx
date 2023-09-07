import { Layout, Spin, Tabs } from "antd";
import { RunTimelinePlotComponent } from "../../components/headless-player/run-timeline-plot.component";
import { PageType } from "../../types/page.type";
import { RunMethodsPlotComponent } from "../../components/headless-player/run-methods-plot.component";
import { useQueryArray, useQueryString } from "../../common/util";
import { useGetRunsData } from "../../common/api";

const { Content } = Layout;
const euc = encodeURIComponent;

export const HeadlessPlayerCompareComponent = () => {
    const runIds: string[] = useQueryArray('runs')!
    const runsData = useGetRunsData(runIds)

    return <>
        <Content style={{ margin: '0 16px' }}>
            <Spin spinning={runsData.isLoading}>
                <Tabs defaultActiveKey={"2"}>
                    <Tabs.TabPane tab={"Timeline Plot"} key={"1"}>
                        <RunTimelinePlotComponent runsData={Object.values(runsData.data || {})}></RunTimelinePlotComponent>
                    </Tabs.TabPane>
                    <Tabs.TabPane tab={"QUIC vs BETA vs DASH"} key={"2"}>
                        <RunMethodsPlotComponent runsData={Object.values(runsData.data || {})}></RunMethodsPlotComponent>
                    </Tabs.TabPane>
                </Tabs>
            </Spin>
        </Content>
    </>
}


export const HeadlessPlayerComparePage: PageType = {
    routerPath: '/headless-player/compare',
    title: 'Compare Runs',
    component: <HeadlessPlayerCompareComponent />
}
export const makeHeadlessPlayerComparePath =
    (runIds: string[]) => `/headless-player/compare?runs=${euc(runIds.join(','))}`