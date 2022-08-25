import {ExperimentOutlined, UnorderedListOutlined} from "@ant-design/icons";

const euc = encodeURIComponent;

export const AllRoutes = {
    HeadlessPlayer: {
        path: '/headless-player',
        breadcrumbName: 'Headless Player',
        menuitem: {
            key: '1',
            label: 'Headless Player',
            icon: <ExperimentOutlined/>
        }
    },
    HeadlessPlayerCompare: {
        path: '/headless-player/compare',
        makePath: (runIds: string[]) => `/headless-player/compare?runs=${euc(runIds.join(','))}`,
        breadcrumbName: 'Compare'
    },
    HeadlessPlayerSingle: {
        path: '/headless-player/single',
        makePath: (runId: string) => `/headless-player/single?run=${euc(runId)}`,
        breadcrumbName: 'Single Run'
    },
    JobManager: {
        path: '/job-manager',
        breadcrumbName: 'Job Manager',
        menuitem: {
            key: '2',
            label: 'Job Manager',
            icon: <UnorderedListOutlined/>
        }
    }
}