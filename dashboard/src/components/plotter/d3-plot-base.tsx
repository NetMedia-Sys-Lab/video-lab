import { DataFrame, DataFrameGroups } from "./dataframe";
import { D3LineParams, D3RectParams, D3SelectionType, D3TextParams, ExtentType, PlotItemSelectCallback } from "../../types/plot.type";
import * as d3 from "d3";
import { D3Plot } from "./d3-plot";

export declare type D3PlotBaseProps<T> = {
    dfGroups: DataFrameGroups<T>,
    axisIndex?: number,
    fix?: boolean,
    xLabel?: string
    yLabel?: string
}

export abstract class D3PlotBase<T> {
    // Before plotting
    dfGroups: DataFrameGroups<T>;
    axisIndex: number;
    fix: boolean;
    xLabel: string;
    yLabel: string;

    // After plotting
    plotSelections: {
        bars: D3SelectionType[],
        barh: D3SelectionType[],
        text: D3SelectionType[],
        lines: D3SelectionType[],
    } = {
            bars: [],
            barh: [],
            text: [],
            lines: []
        };

    constructor(props: D3PlotBaseProps<T>) {
        this.dfGroups = props.dfGroups;
        this.axisIndex = props.axisIndex || 0;
        this.fix = props.fix || false;
        this.xLabel = props.xLabel || "";
        this.yLabel = props.yLabel || "";
    }

    abstract draw(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>): void;

    abstract getYScaleExtent(): ExtentType;

    abstract getXScaleExtent(): ExtentType;

    protected drawRect(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>, plotDf: DataFrame<D3RectParams>, clickHandler?: PlotItemSelectCallback<T>) {
        const yScaleUnit = plot.scaleUnit(yScale);
        const xScaleUnit = plot.scaleUnit(plot.xScale!);
        const selection = plot.clipArea!.selectAll("rects")
            .data(plotDf.rows)
            .enter()
            .append("rect")
            .attr("x", d => plot.xScale!(d.x as any) + xScaleUnit * d.xOffset)
            .attr("width", d => d.width * xScaleUnit)
            .attr("y", d => yScale(d.y) - yScaleUnit * d.yOffset)
            .attr("height", d => d.height * yScaleUnit)
            .attr("fill", d => d.color)
            .attr("opacity", d => d.opacity)
            .attr('class', d => d.class || '')
        
        if (clickHandler) {
            selection.on("click", (row) => (clickHandler as any)(row.ref))
                .on('mouseover', ((d: T, i: number, rows: any) => {
                    d3.select(rows[i])
                        .attr("opacity", 1)
                        .style("cursor", "pointer")
                        .style('filter', 'brightness(0.4)')
                }) as any)
                .on('mouseout', ((d: T, i: number, rows: any) => {
                    d3.select(rows[i])
                        .attr("opacity", (d: any) => d.opacity)
                        .style("cursor", "default")
                        .style('filter', '')
                }) as any)
        }
        this.plotSelections.barh.push(selection);
    }

    protected drawText(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>, plotDf: DataFrame<D3TextParams>) {
        // const yScaleUnit = plot.scaleUnit(yScale);
        // const xScaleUnit = plot.scaleUnit(plot.xScale!);
        const selection = plot.clipArea!.selectAll("texts")
            .data(plotDf.rows)
            .enter()
            .append("text")
            .text(d => d.text)
            .attr("x", d => plot.xScale!(d.x as any) + (d.xShift || 0))
            .attr("y", d => yScale(d.y) + (d.yShift || 0))
            .attr('opacity', d => d.opacity)
        this.plotSelections.text.push(selection);
    }

    protected drawLine(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>, plotDf: DataFrame<D3LineParams>) {
        // console.log("Plotting line", plotDf, (d3.line()
        //     .x((d: any) => plot.xScale!(d.x))
        //     .y((d: any) => yScale(d.y))));
        if (plotDf.rows.length === 0) return;
        const selection = plot.clipArea!
            .append("path")
            .datum(plotDf.rows)
            .attr("class", "line")
            .attr("fill", "none")
            .attr("stroke", d => d[0].color)
            .attr("stroke-width", 1)
            .attr("stroke-opacity", d => d[0].opacity)
            // @ts-ignore
            .attr("d", d3.line()
                .x((d: any) => plot.xScale!(d.x))
                .y((d: any) => yScale(d.y))
            )
        this.plotSelections.lines.push(selection);
    }
}