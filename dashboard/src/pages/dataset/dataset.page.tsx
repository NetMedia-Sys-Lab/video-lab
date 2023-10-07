import "./style.scss"
import { DatabaseOutlined } from '@ant-design/icons';
import { Button, Input, InputNumber, Layout, Modal, Spin, Tree } from 'antd';
import { useState } from 'react';
import ReactJson from 'react-json-view';
import { createBetaMpd, createDashPlaylist, encodeHevcVideos, useDatasetTree } from '../../common/dataset.api';
import { PageType } from '../../types/page.type';

export const DatasetPageComponent = (props: {}) => {

    const tree = useDatasetTree();
    const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);

    const [showEncodeForm, setShowEncodeForm] = useState(false);
    const [encodeProps, setEncodeProps] = useState<{
        codec: string
        bitrates: string,
        resolutions: string,
        segLength: number
    }>({
        codec: 'hevc',
        bitrates: '400000,650000,1000000,1500000,2300000,3500000,5300000',
        resolutions: "240,360,480,720,720,1080,1080",
        segLength: 2
    });


    const [showDashForm, setShowDashForm] = useState(false);
    const [dashProps, setDashProps] = useState<{
        segLength: number
    }>({
        segLength: 2
    });


    return <>
        <Layout.Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
            <Button onClick={() => createBetaMpd(checkedKeys as string[])}>Create BETA MPD files</Button>
            &nbsp;
            <Button onClick={() => setShowEncodeForm(true)}>Encode Videos</Button>
            &nbsp;
            <Button onClick={() => setShowDashForm(true)}>Create DASH</Button>
            <br />
            <br />
            <Spin spinning={tree.isLoading}>
                <Tree
                    checkable
                    checkStrictly={true}
                    onCheck={keys => setCheckedKeys((keys as any).checked as React.Key[])}
                    checkedKeys={checkedKeys}
                    treeData={tree.data}
                />
            </Spin>
        </Layout.Content>
        <Modal
            title="Encode HEVC"
            centered
            open={showEncodeForm}
            onOk={() => {
                encodeHevcVideos(checkedKeys as string[], encodeProps.bitrates.split(",").map(parseFloat), encodeProps.resolutions.split(','), encodeProps.segLength)
            }}
            onCancel={() => setShowEncodeForm(false)}
            width={1000}
            okText="Schedule"
        >
            <ReactJson src={encodeProps} style={{ maxHeight: '80vh', overflow: 'scroll' }} collapsed={3} />
            <table>
                <tr>
                    <th>Bitrates</th>
                    <td>
                        <Input 
                            placeholder="Comma Separated bitrates in bps" 
                            value={encodeProps.bitrates} 
                            onChange={e => setEncodeProps(ep => ({...ep, bitrates: e.target.value}))}
                        />
                    </td>
                </tr>
                <tr>
                    <th>Resolutions</th>
                    <td>
                        <Input 
                            placeholder="Comma Separated Resolutions" 
                            value={encodeProps.resolutions} 
                            onChange={e => setEncodeProps(ep => ({...ep, resolutions: e.target.value}))}
                        />
                    </td>
                </tr>
                <tr>
                    <th>Segment Length</th>
                    <td>
                        <InputNumber 
                            placeholder="Segment length in seconds" 
                            value={encodeProps.segLength} 
                            min={1}
                            max={100}
                            onChange={val => setEncodeProps(ep => ({...ep, segLength: val || 1}))}
                        />
                    </td>
                </tr>
            </table>
        </Modal>


        <Modal
            title="Create DASH"
            centered
            open={showDashForm}
            onOk={() => {
                createDashPlaylist(checkedKeys as string[], dashProps.segLength)
            }}
            onCancel={() => setShowDashForm(false)}
            width={1000}
            okText="Schedule"
        >
            <ReactJson src={dashProps} style={{ maxHeight: '80vh', overflow: 'scroll' }} collapsed={3} />
            <table>
                <tr>
                    <th>Segment Length</th>
                    <td>
                        <InputNumber 
                            placeholder="Segment length in seconds" 
                            value={dashProps.segLength} 
                            onChange={val => setDashProps(ep => ({...ep, segLength: val || 1}))}
                        />
                    </td>
                </tr>
            </table>
        </Modal>
    </>
}

export const DatasetPage: PageType = {
    routerPath: '/dataset',
    title: 'Dataset',
    menuitem: {
        label: 'Dataset',
        icon: <DatabaseOutlined />
    },
    component: DatasetPageComponent
}