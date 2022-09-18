import "./App.scss";
import { ExperimentOutlined, UnorderedListOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Button, MenuProps, PageHeader } from 'antd';
import { Layout, Menu } from 'antd';
import React, { useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { HeadlessPlayerComponent } from "./pages/headless-player/headless-player.page.component";
import { JobManagerComponent } from "./pages/job-manager/job-manager.page";
import { JobsListDrawerComponent } from "./components/jobs/jobs-list-drawer";
import { HeadlessPlayerCompareComponent } from "./pages/headless-player/headless-player-compare.component";
import { HeadlessPlayerSingleComponent } from "./pages/headless-player/headless-player-single.component";
import { VideoInspectorPageComponent } from "./pages/video-inspector/video-inspector.component";
import { Pages } from "./common/routes";

const { Header, Content, Sider } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

const App: React.FC = () => {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <BrowserRouter>
            <Layout style={{ height: '100vh' }}>
                <Sider style={{
                    zIndex: 1001,
                    // overflow: 'auto',
                    // height: '100vh',
                    // position: 'fixed',
                    // left: 0,
                    // top: 0,
                    // bottom: 0,
                }} collapsible collapsed={collapsed}
                    onCollapse={value => setCollapsed(value)}>
                    <a href="/">
                        <div className={`logo ${collapsed && 'collapsed'}`}>
                            <VideoCameraOutlined />
                            <span className="title">
                                <span style={{ fontWeight: "bold" }}>Video</span> Lab
                            </span>
                        </div>
                    </a>
                    <Menu theme="dark" mode="inline" defaultSelectedKeys={["1"]}>
                        {Pages
                            .filter(page => page.menuitem)
                            .map((page, i) =>
                                <Menu.Item key={i} icon={page.menuitem!.icon}>
                                    <Link to={page.routerPath} className="nav-text">{page.menuitem!.label}</Link>
                                </Menu.Item>
                            )}
                    </Menu>
                </Sider>
                <div style={{ overflow: "scroll", height: "100vh", width: "100%" }}>
                    <Layout style={{ backgroundColor: "white", maxWidth: 1400, margin: "auto", minHeight: '100vh' }} className="site-layout">
                        <PageHeader
                            title={<Routes>{Pages.map((page, i) =>
                                <Route key={i} path={page.routerPath} element={page.title} />
                            )}</Routes>}
                            onBack={() => window.history.back()}
                            extra={[
                                <JobsListDrawerComponent key="2" />
                            ]}>
                        </PageHeader>
                        <Routes>
                            {Pages.map((page, i) =>
                                <Route key={i} path={page.routerPath} element={page.component}>
                                </Route>
                            )}
                        </Routes>
                    </Layout>
                </div>
            </Layout>
        </BrowserRouter>
    );
};

export default App;