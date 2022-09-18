import { DatabaseOutlined } from '@ant-design/icons';
import { Button, Layout, Spin, Tree, TreeDataNode } from 'antd';
import { useState } from 'react';
import { createBetaMpd, useDatasetTree } from '../../common/dataset.api';
import { PageType } from '../../types/page.type';

export const DatasetPageComponent = (props: {}) => {

    const tree = useDatasetTree();
    const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);


    return <>
        <Layout.Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
            <Button onClick={() => createBetaMpd(checkedKeys as string[])}>Create BETA MPD files</Button>
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
    </>
}

export const DatasetPage: PageType = {
    routerPath: '/dataset',
    title: 'Dataset',
    menuitem: {
        label: 'Dataset',
        icon: <DatabaseOutlined />
    },
    component: <DatasetPageComponent />
}