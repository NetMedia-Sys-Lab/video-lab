import "./App.scss";
import { MenuFoldOutlined, MenuUnfoldOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Button, MenuProps, theme } from 'antd';
import { Layout, Menu } from 'antd';
import React, { useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { JobsListDrawerComponent } from "./components/jobs/jobs-list-drawer";
import { Pages } from "./common/routes";
import { JobDrawerComponent } from "./components/jobs/job-drawer";
import { AppContextProvider } from "./app.context";

const { Header, Content, Sider } = Layout;

const App: React.FC = () => {
    const [collapsed, setCollapsed] = useState(true);
    const {
        token: { colorBgContainer },
    } = theme.useToken();

    return (
        <BrowserRouter>
            <AppContextProvider>
                <Layout style={{ height: '100vh' }}>
                    <Sider
                        style={{
                            zIndex: 2,
                            overflow: 'auto',
                            height: '100vh',
                            position: 'fixed',
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
                    <Layout style={{ marginLeft: collapsed ? 80 : 200 }}>
                        <Header
                            style={{
                                padding: 0,
                                background: colorBgContainer,
                                position: 'sticky',
                                top: 0,
                                zIndex: 1
                            }}
                        >
                            <Button
                                type="text"
                                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                                onClick={() => setCollapsed(!collapsed)}
                                style={{
                                    fontSize: '16px',
                                    width: 64,
                                    height: 64,
                                }}
                            />
                            <Routes>{Pages.map((page, i) =>
                                <Route key={i} path={page.routerPath} element={page.title} />
                            )}</Routes>
                            <span style={{ float: "right", paddingRight: 20 }}>
                                <JobsListDrawerComponent key="2" />
                            </span>
                        </Header>
                        <Content
                            style={{
                                margin: '24px 16px',
                                padding: 24,
                                minHeight: 280,
                                background: colorBgContainer,
                                overflow: "auto",
                            }}
                        >
                            <Routes>
                                {Pages.map((page, i) =>
                                    <Route key={i} path={page.routerPath} element={
                                        <page.component />
                                    }>
                                    </Route>
                                )}
                            </Routes>
                        </Content>
                    </Layout>

                    <JobDrawerComponent />
                </Layout>
            </AppContextProvider>
        </BrowserRouter>
    );
};

export default App;