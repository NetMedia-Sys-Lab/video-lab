import "./style.scss";
import { useElementSize } from "usehooks-ts";
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { D3PlotDimensionsType, MarkerUpdateCallback, Range } from "../../types/plot.type";
import { D3Plot } from "./d3-plot";
import { Button, Space, Tooltip } from "antd";
import { ClearOutlined, ColumnWidthOutlined, FullscreenOutlined, ZoomInOutlined } from '@ant-design/icons';
import { D3PlotBase } from "./d3-plot-base";
import * as d3 from "d3";

export const D3PlotComponent = (props: {
    plots: D3PlotBase<any>[];
    onMarkerUpdate?: MarkerUpdateCallback,
    onLogsClick?: (range: Range) => void,
    extraControls?: ReactNode,
    height?:number,
    width?:number,
    margin?: { top: number, right: number, bottom: number, left: number }
}) => {

    const { plots, onMarkerUpdate, onLogsClick, extraControls } = props;

    const svgRef = useRef(null);
    const [svgContainerRef, containerDimensions] = useElementSize<HTMLDivElement>();
    const [dimensions, setDimensions] = useState<D3PlotDimensionsType>({
        width: props.width || 600,
        height: props.height || 900,
        margin: props.margin ||{ top: 30, right: 60, bottom: 30, left: 60 }
    });
    const [plot, setPlot] = useState<D3Plot | null>(null);
    const [isBrushing, setIsBrushing] = useState(false);
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);

    useEffect(() => {
        setDimensions(d => ({
            ...d,
            width: containerDimensions.width || 1000,
            // height: rect?.height || 500
        }));
    }, [containerDimensions.width]);

    useEffect(() => {
        const plot = new D3Plot(svgRef, dimensions, plots);
        plot.clear();
        plot.draw();
        setPlot(plot);
        plot.onMarkerUpdate(onMarkerUpdate);
    }, [dimensions, plots, svgRef])

    return <>
        <Space style={{ width: "100%", padding: "5px" }}>
            {extraControls}
            <Tooltip title="Select Area to Zoom">
                <Button disabled={isBrushing} type="primary" icon={<ZoomInOutlined />} onClick={() => {
                    setIsBrushing(true);
                    plot!.startBrush("xy", (extents) => {
                        plot?.clearBrush()
                        plot!.zoomToExtent(extents);
                        setIsBrushing(false)
                    });
                }} />
            </Tooltip>
            <Tooltip title="Zoom out">
                <Button disabled={isBrushing} type="primary" icon={<FullscreenOutlined />} onClick={() => {
                    plot!.resetZoom();
                }} />
            </Tooltip>
            <Tooltip title="Add Marker">
                <Button disabled={isBrushing} type="primary" icon={<ColumnWidthOutlined />} onClick={() => {
                    plot!.clearTemp();
                    setIsBrushing(true);
                    plot!.startBrush("x", (extents) => {
                        plot?.clearBrush()
                        setIsBrushing(false)
                        plot!.addTempRect(extents);
                        const invert = (plot!.xScale as d3.ScaleLinear<any, any>).invert;
                        const range = {
                            start: invert(extents[0][0]),
                            end: invert(extents[1][0]),
                        }
                        setSelectedRange(range);
                        if (onMarkerUpdate) {
                            onMarkerUpdate([range]);
                        }
                    });
                }} />
            </Tooltip>
            <Tooltip title="Clear Markers">
                <Button disabled={isBrushing} type="primary" icon={<ClearOutlined />} onClick={() => {
                    plot!.clearTemp();
                }} />
            </Tooltip>
            <Button disabled={isBrushing} type="link" onClick={e => onLogsClick && onLogsClick(selectedRange!)}
                target="_blank">Open Selected Logs
            </Button>
        </Space>

        <div style={{ border: "1pX solid red" }} ref={svgContainerRef}>
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
        </div>
    </>;
}