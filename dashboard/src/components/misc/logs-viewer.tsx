import Ansi from "ansi-to-react";
import { Input } from "antd";
import { useEffect, useMemo, useRef, useState } from "react"

export const LogsViewerComponent = (props: {
    hasLineNumbers: boolean,
    data: string
    maxHeadTail?: [number, number]
}) => {
    const { data, maxHeadTail } = props;
    const [filterText, setFilterText] = useState<string>("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const logsRef = useRef<HTMLDivElement>(null);

    const lines = useMemo(() => {
        let lines: string[] = []
        if (typeof data === "string") {
            lines = data.split("\n");
        }
        const filter = filterText.trim()
        if (filter.length > 0) {
            lines = lines.filter(line => line.indexOf(filter) > 0);
        }

        if (maxHeadTail && lines.length > maxHeadTail[0] + maxHeadTail[1]) {
            lines.splice(maxHeadTail[0], lines.length - (maxHeadTail[0] + maxHeadTail[1]));
        }

        return lines;
    }, [data, filterText, maxHeadTail]);

    useEffect(() => {
        if (bottomRef.current !== null) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [lines]);

    return <div>
        <Input.Search
            placeholder="input search text"
            onSearch={(val) => setFilterText(val)}
            style={{
                width: 400,
            }}
        />
        <div
            ref={logsRef}
            style={{ 
                whiteSpace: "pre", 
                height: "calc(100vh - 170px)", 
                overflowY: "auto",
                backgroundColor: "black",
                color: "white"
                // filter: "invert(87%)",
            }}
        >
            {lines.map((line, i) =>
                <>
                    <Ansi key={i} children={line}></Ansi>
                    <br />
                </>
            )}
            <div style={{ clear: "both", width: "100%" }} ref={bottomRef} />
        </div>
    </div>
}