import { Descriptions } from "antd";
import "./av1-analyzer.scss";
import { useMemo, useState } from "react";

const byteToHex: string[] = [];
const hexToBin: {[k:string]: string} = {};

for (let n = 0; n <= 0xff; ++n) {
    const hexOctet = n.toString(16).padStart(2, "0");
    byteToHex.push(hexOctet);
    const bin = n.toString(2).padStart(8, "0");
    hexToBin[hexOctet] = bin;
}

const range = (start: number, end: number, step: number = 1) => {
    const ret = [];
    for (let i = start; i < end; i += step) {
        ret.push(i);
    }
    return ret;
}

export const HexEditor = (props: { buffer: ArrayBuffer, offset?: number, size?: number }) => {
    const { buffer, offset = 0, size = buffer.byteLength } = props;

    const numBytesInRow = 16;
    const hex = useMemo<string[]>(() => {
        const buff = new Uint8Array(buffer);
        const hexOctets = [];
        for (let i = 0; i < buff.length; i += 1)
            hexOctets.push(byteToHex[buff[i]]);
        return hexOctets;
    }, [buffer]);

    const [selected, setSelected] = useState<number>(0);

    return <div style={{ fontFamily: "monospace" }}>
        <div style={{display: "inline-block"}} key="1">{
            range(0, hex.length, numBytesInRow)
                .map(i => <>{byteToHex[(i & 0xFF00) >> 8] + byteToHex[i & 0xFF]}<br/></>)
        }</div>
        <div style={{display: "inline-block", paddingLeft: 30}} key="2">{
            hex.map((byte, i) => {
                return <>
                    {i%numBytesInRow==0 && <br/>}
                    <span onClick={() => setSelected(i)} className="hex-byte">{byte}</span>
                </>
            })  
        }</div>
        <div style={{float: "right", width: "50%"}} key="3">
            <Descriptions title="Selection Info">
                <Descriptions.Item label="Position">{selected}</Descriptions.Item>
                <Descriptions.Item label="Binary">{hexToBin[hex[selected]]}</Descriptions.Item>
            </Descriptions>
        </div>
    </div>
}