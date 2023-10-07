import {ExperimentOutlined, UnorderedListOutlined, FileSearchOutlined} from "@ant-design/icons";
import { DatasetPage } from "../pages/dataset/dataset.page";
import { HeadlessPlayerComparePage } from "../pages/headless-player/headless-player-compare.component";
import { HeadlessPlayerSinglePage } from "../pages/headless-player/headless-player-single.component";
import { HeadlessPlayerPage } from "../pages/headless-player/headless-player.page.component";
import { ScriptsListPage } from "../pages/scripts/scripts-list.component";
import { VideoInspectorPage } from "../pages/video-inspector/video-inspector.component";
import { PageType } from "../types/page.type";
import { ScriptEditorPage } from "../pages/scripts/script-editor.component";

const euc = encodeURIComponent;

export const Pages: PageType[] = [
    HeadlessPlayerPage,
    DatasetPage,
    VideoInspectorPage,
    HeadlessPlayerComparePage,
    HeadlessPlayerSinglePage,
    ScriptsListPage,
    ScriptEditorPage
]