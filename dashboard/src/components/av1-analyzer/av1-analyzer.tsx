import { useEffect, useMemo, useState } from "react";
import { videoPlaybackPath } from "../../common/video-inspector.api";
import { HexEditor } from "./hex-editor";
import { Tree } from "antd";
import { DataNode } from "antd/es/tree";
import { AV1, Bitstream } from "./av1-bitstream";

export const Av1Analyzer = (props: { videoPaths: string }) => {
    const { videoPaths } = props;

    const [buffer, setBuffer] = useState<ArrayBuffer>(new ArrayBuffer(0));

    useEffect(() => {
        fetch(videoPlaybackPath(videoPaths, "bin"))
            .then(resp => {
                if (!resp.ok) {
                    throw new Error(`${resp.status} ${resp.statusText}`);
                }
                return resp.arrayBuffer()
            })
            .then(setBuffer);
    }, [videoPaths]);

    const syntaxTree: DataNode[] = useMemo(() => {
        const bs = new Bitstream(buffer);
        AV1(bs);
        return bs.getCurrent().children as any;
    }, [buffer]);

    return <>
        <Tree
            treeData={syntaxTree}
        />
        <HexEditor buffer={buffer}></HexEditor>
    </>
}
