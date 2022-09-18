import { Layout } from "antd";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { PageType } from "../../types/page.type";
import { FileSearchOutlined } from "@ant-design/icons";

const euc = encodeURIComponent;

export const VideoInspectorPageComponent = (props: {}) => {
    const { search } = useLocation();
    const videoPaths: string[] = useMemo(() => new URLSearchParams(search).get('videos')?.split(","), [search])!;
    return <>
        <Layout.Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
            <h3>Video Inspector Page Under Construction</h3>
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
    component: <VideoInspectorPageComponent />
}

export const makeVideoInspectorPath =
    (videoPaths: string[]) => `/video-inspector?videos=${euc(videoPaths.join(","))}`