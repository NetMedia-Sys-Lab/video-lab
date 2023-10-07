import { Button, Collapse, Form, Layout, Tabs } from "antd";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageType } from "../../types/page.type";
import { FileSearchOutlined } from "@ant-design/icons";
import { FramesListComponent } from "../../components/video-tools/frames-list";
import TextArea from "antd/lib/input/TextArea";
import CollapsePanel from "antd/lib/collapse/CollapsePanel";

const euc = encodeURIComponent;
const supportedFormats = ['mp4', 'm4s', 'y4m']
const LS_LAST_SUBMIT_KEY = "VIDEO_INSP_LAST_SUBMIT_CACHE";

export const VideoInspectorPageComponent = (props: {}) => {
    const [videoPaths, setVideoPaths] = useState("");
    const [refPaths, setRefPaths] = useState("");

    function submitVideoPaths(values: any) {
        setVideoPaths(values.videoPaths);
        setRefPaths(values.refPaths);
        localStorage.setItem(LS_LAST_SUBMIT_KEY, JSON.stringify(values));
    }

    function segmentsValidator(_: any, value: string) {
        if (!value) return Promise.resolve();
        const videos = value.split("\n").map(val => val.trim()).filter(val => val !== "");
        if (videos.every(val => supportedFormats.indexOf(val.substring(val.lastIndexOf('.') + 1).toLowerCase()) === -1)) {
            return Promise.reject(`Only ${supportedFormats.join(",")} videos are supported`)
        }
        return Promise.resolve();
    }

    return <>
        <Layout.Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
            <Collapse defaultActiveKey={"1"}>
                <CollapsePanel header={`Video (${videoPaths.split("\n").filter(Boolean).length}) and Reference (${refPaths.split("\n").filter(Boolean).length})`} key="1">
                    <Form
                        onFinish={submitVideoPaths}
                        labelCol={{ span: 3 }}
                        wrapperCol={{ span: 16 }}
                        initialValues={JSON.parse(localStorage.getItem(LS_LAST_SUBMIT_KEY) || "{}")}
                    >
                        <Form.Item
                            label="Video Paths"
                            name="videoPaths"
                            rules={[
                                { required: true, message: 'Please enter video paths!' },
                                { validator: segmentsValidator }
                            ]}
                        >
                            <TextArea rows={4} />
                        </Form.Item>
                        <Form.Item
                            label="Reference Paths"
                            name="refPaths"
                            rules={[
                                { validator: segmentsValidator }
                            ]}
                        >
                            <TextArea rows={1} />
                        </Form.Item>
                        <Form.Item wrapperCol={{ offset: 3, span: 16 - 3 }}>
                            <Button type="primary" htmlType="submit">
                                Submit
                            </Button>
                        </Form.Item>
                    </Form>
                </CollapsePanel>
            </Collapse>

            {
                videoPaths && <FramesListComponent videoPaths={videoPaths} refPaths={refPaths}></FramesListComponent>
            }
        </Layout.Content>
    </>
}

export const VideoInspectorPage: PageType = {
    routerPath: '/video-inspector',
    title: 'Video Inspector',
    menuitem: {
        label: 'Video Inspector',
        icon: <FileSearchOutlined />
    },
    component: VideoInspectorPageComponent
}

export const makeVideoInspectorPath =
    (videoPaths: string[]) => `/video-inspector?videos=${euc(videoPaths.join(","))}`