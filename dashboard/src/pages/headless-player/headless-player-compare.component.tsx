import React, {useMemo} from "react";
import {useLocation} from "react-router-dom";
import {RunConfig} from "../../types/result.type";
import {Layout, PageHeader, Tabs} from "antd";
import {AllRoutes} from "../../common/routes";
import {PlotterGenericComponent} from "./plotter-generic.component";
import {PlotterMethodCompareComponent} from "./plotter-method-compare.component";

const {Content} = Layout;

export const HeadlessPlayerCompareComponent = () => {
    const {search} = useLocation();
    const runIds: string[] = useMemo(() => new URLSearchParams(search).get('runs')!.split(","), [search]);

    return <>
        <Content style={{margin: '0 16px'}}>

            <PageHeader
                title="Compare Headless Player Runs"
                breadcrumb={{routes: [AllRoutes.HeadlessPlayer, AllRoutes.HeadlessPlayerCompare]}}
                subTitle={`Compare ${runIds.length} runs`}
                onBack={() => window.history.back()}
                ghost={false}
                extra={[]}
            >
            </PageHeader>
            <Tabs defaultActiveKey={"1"}>
                <Tabs.TabPane tab={"Timeline Plot"} key={"1"}>
                    <PlotterGenericComponent runIds={runIds}></PlotterGenericComponent>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"QUIC vs BETA vs DASH"} key={"2"}>
                    <PlotterMethodCompareComponent runIds={runIds}></PlotterMethodCompareComponent>
                </Tabs.TabPane>
            </Tabs>

        </Content>
    </>
}
