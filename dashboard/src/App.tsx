import "./App.scss";
import {ExperimentOutlined, UnorderedListOutlined, VideoCameraOutlined} from '@ant-design/icons';
import type {MenuProps} from 'antd';
import {Layout, Menu} from 'antd';
import React, {useState} from 'react';
import {BrowserRouter, Link, Route, Routes} from "react-router-dom";
import {HeadlessPlayerComponent} from "./pages/headless-player/headless-player.component";
import {AllRoutes} from "./common/routes"
import {HeadlessPlayerCompareComponent} from "./pages/headless-player/headless-player-compare.component";
import {HeadlessPlayerSingleComponent} from "./pages/headless-player/headless-player-single.component";
import {JobManagerComponent} from "./pages/job-manager/job-manager";

const {Header, Content, Sider} = Layout;

type MenuItem = Required<MenuProps>['items'][number];

const App: React.FC = () => {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <BrowserRouter>
            <Layout style={{height: '100vh'}}>
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
                    <div className={`logo ${collapsed && 'collapsed'}`}>
                        <VideoCameraOutlined/>
                        <span className="title">
                            <span style={{fontWeight: "bold"}}>Video</span> Lab
                        </span>
                    </div>
                    <Menu theme="dark" mode="inline" defaultSelectedKeys={["1"]}>
                        <Menu.Item key="1" icon={<ExperimentOutlined/>}>
                            <Link to="/headless-player" className="nav-text">Headless Player</Link>
                        </Menu.Item>
                        <Menu.Item key="2" icon={<UnorderedListOutlined/>}>
                            <Link to="/job-manager" className="nav-text">Job Manager</Link>
                        </Menu.Item>
                    </Menu>
                </Sider>
                <div style={{overflow: "scroll", height: "100vh", width: "100%"}}>
                    <Layout style={{backgroundColor: "white", maxWidth: 1400, margin: "auto", minHeight: '100vh'}} className="site-layout">
                        <Routes>
                            <Route path={AllRoutes.HeadlessPlayer.path} element={<HeadlessPlayerComponent/>}>
                            </Route>
                            <Route path={AllRoutes.HeadlessPlayerCompare.path} element={<HeadlessPlayerCompareComponent/>}>
                            </Route>
                            <Route path={AllRoutes.HeadlessPlayerSingle.path} element={<HeadlessPlayerSingleComponent/>}>
                            </Route>
                            <Route path={AllRoutes.JobManager.path} element={<JobManagerComponent/>}>
                            </Route>
                        </Routes>
                    </Layout>
                </div>
            </Layout>
        </BrowserRouter>
    );
};

export default App;