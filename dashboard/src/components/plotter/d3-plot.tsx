import {D3PlotDimensionsType, D3SelectionType, ExtentType, MarkerUpdateCallback, objectMap} from "../../types/plot.type";
import * as d3 from "d3";
import {BrushBehavior} from "d3";
import React from "react";
import {mergeExtent} from "./dataframe";
import {D3PlotBase} from "./d3-plot-base";

export class D3Plot {
    xScale?: d3.ScaleBand<any> | d3.ScaleLinear<any, any>
    innerWidth?: number
    innerHeight?: number
    clipArea?: D3SelectionType
    private svg?: D3SelectionType
    private brush?: BrushBehavior<any>
    private xAxisGroup?: D3SelectionType;
    private idleTimeout?: NodeJS.Timeout;
    private xrule?: D3SelectionType;
    private ruleText?: D3SelectionType;

    private yScales: d3.ScaleLinear<number, number, any>[] = [];
    private yAxisGroups: D3SelectionType[] = [];

    // Props
    private svgRef: React.RefObject<SVGSVGElement>;
    private dimensions: D3PlotDimensionsType;
    private plots: D3PlotBase<any>[];
    private markerUpdateCallback?: MarkerUpdateCallback;

    constructor(svgRef: React.RefObject<SVGSVGElement>, dimensions: D3PlotDimensionsType, plots: D3PlotBase<any>[]) {
        this.svgRef = svgRef;
        this.dimensions = dimensions;
        this.plots = plots;
    }

    clear() {
        d3.select(this.svgRef.current).selectAll("*").remove();

        this.innerWidth = this.dimensions.width - this.dimensions.margin.left - this.dimensions.margin.right;
        this.innerHeight = this.dimensions.height - this.dimensions.margin.top - this.dimensions.margin.bottom;
        this.yScales = [];
        this.yAxisGroups = [];

        this.svg = d3.select(this.svgRef.current)
            .append("g")
            .attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.clipArea = this.svg!.append('g')
            .attr("clip-path", "url(#clip)");

        this.svg!.append("defs").append("svg:clipPath")
            .attr("id", "clip")
            .append("svg:rect")
            .attr("width", this.innerWidth)
            .attr("height", this.innerHeight)
            .attr("x", 0)
            .attr("y", 0);

        this.xrule = this.svg!.append('line')
            .attr('class', 'rule')
            .style("stroke", "rgba(0,0,0,0.35)")
            .style("stroke-width", 1)
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', 0)
            .attr('y2', this.innerHeight + 25)
        this.ruleText = this.svg!.append('text')
            .attr('class', 'rule-text')
            .text("")
            .attr('x', 0)
            .attr('y', this.innerHeight + 25)

        this.svg!.on('mousemove', this.updateRuler.bind(this));
        this.svg!.on('wheel', this.zoom.bind(this));
    }

    draw() {
        const xScaleExtent = this.getXScaleExtent();
        if (typeof xScaleExtent[0] === "number") {
            this.xScale = d3.scaleLinear()
                .domain(xScaleExtent as [number, number])
                .range([0, this.innerWidth!]);
            this.xAxisGroup = this.svg!.append("g")
                .attr("transform", `translate(0, ${this.innerHeight!})`)
                .call(d3.axisBottom(this.xScale));
        } else {
            this.xScale = d3.scaleBand()
                .domain(xScaleExtent as string[])
                .range([0, this.innerWidth!]);
            this.xAxisGroup = this.svg!.append("g")
                .style("font-size", "14px")
                .attr("transform", `translate(0, ${this.innerHeight})`)
                .call(d3.axisBottom(this.xScale));
        }


        this.yScales = [];
        this.yAxisGroups = [];
        const maxAxisIndex = Math.max(...this.plots.map(plot => plot.axisIndex));
        const minAxisIndex = Math.min(...this.plots.map(plot => plot.axisIndex));
        for (let axisIndex = minAxisIndex; axisIndex <= maxAxisIndex; axisIndex++) {
            const plots = this.getPlotsByAxisIndex(axisIndex);
            const extents: ExtentType[] = [];
            plots.forEach(plot => {
                extents.push(this.getYScaleExtent(plot));
            });
            const yScaleExtent = mergeExtent(...extents) as [number, number];

            this.yScales[axisIndex] = d3.scaleLinear()
                .domain(yScaleExtent)
                .range([this.innerHeight!, 0]);
            let ticks = 10;
            if (Math.abs(yScaleExtent[1] - yScaleExtent[0]) < 25) {
                ticks = Math.abs(yScaleExtent[1] - yScaleExtent[0]);
            }
            if (axisIndex === 0) {
                this.yAxisGroups[axisIndex] = this.svg!.append("g")
                    .style("font-size", "14px")
                    .attr("transform", `translate(0, 0)`)
                    .call(d3.axisLeft(this.yScales[axisIndex])
                        .ticks(ticks)
                        .tickSize(3));
            } else if (axisIndex > 0) {
                this.yAxisGroups[axisIndex] = this.svg!.append("g")
                    .style("font-size", "14px")
                    .attr("transform", `translate(${this.innerWidth! + (axisIndex - 1) * 20}, 0)`)
                    .call(d3.axisRight(this.yScales[axisIndex])
                        .ticks(ticks)
                        .tickSize(0));
            }
            plots.forEach((plot, plotIndex) => {
                plot.draw(this, this.yScales[axisIndex]);
                /*if (plot.type === "barh") {
                    this.drawBarhChart(plot as D3PlotBaseBarh<any>, this.yScales[axisIndex]);
                } else if (plot.type === "line") {
                    this.drawLineChart(plot as D3PlotBaseLine<any>, this.yScales[axisIndex]);
                } else if (plot.type === "bar") {
                    this.drawBarChart(plot as D3PlotBaseBar<any>, this.yScales[axisIndex]);
                }*/
            })
        }

    }

    onMarkerUpdate(markerUpdateCallback?: MarkerUpdateCallback) {
        this.markerUpdateCallback = markerUpdateCallback;
    }

    startBrush(axis: "x" | "y" | "xy", onBrushEnd: (extents: [[number, number], [number, number]]) => void) {
        console.log("Enable brush");
        switch (axis) {
            case "x":
                this.brush = d3.brushX()
                    .extent([[0, 0], [this.innerWidth!, this.innerHeight!]])
                    .on("end", () => {
                        // @ts-ignore
                        let e = d3.event.selection;
                        if(!e) {
                            // @ts-ignore
                            var [xpos, ypos] = d3.mouse(this.svg!.node());
                            e = [xpos, xpos+1];
                        }
                        onBrushEnd([[e[0], 0], [e[1], this.innerHeight!]])
                    })
                break;
            case "y":
                this.brush = d3.brushY()
                    .extent([[0, 0], [this.innerWidth!, this.innerHeight!]])
                    .on("end", () => {
                        // @ts-ignore
                        let e = d3.event.selection;
                        if(!e) {
                            // @ts-ignore
                            var [xpos, ypos] = d3.mouse(this.svg!.node());
                            e = [ypos, ypos];
                        }
                        onBrushEnd([[0, e[0]], [this.innerWidth!, e[1]]]);
                    })
                break;
            case "xy":
                this.brush = d3.brush()
                    .extent([[0, 0], [this.innerWidth!, this.innerHeight!]])
                    .on("end", () => {
                        // @ts-ignore
                        let e = d3.event.selection;
                        if(!e) {
                            // @ts-ignore
                            var me = d3.mouse(this.svg!.node());
                            e = [me,me];
                        }
                        onBrushEnd(e);
                    })
                break;
        }
        this.svg!.append("g")
            .attr("class", "brush")
            .call(this.brush!);
    }

    clearBrush() {
        this.svg!.selectAll("g.brush").remove();
    }

    addTempRect(extents: [[number, number], [number, number]]) {
        const [[left, top], [right, bottom]] = extents;
        const selection = this.clipArea!
            .append("rect")
            .attr('class', 'temp')
            .attr("x", d => left)
            .attr("width", right-left)
            .attr("y", top)
            .attr("height", bottom-top)
            .attr("fill", "grey")
            .attr("opacity", 0.2)
            .attr('stroke', 'black')
    }

    clearTemp() {
        this.clipArea!.selectAll('.temp')
            .remove();
    }

    resetZoom() {
        this.xScale!.range([0, this.innerWidth]);
        this.yScales.forEach(yScale => {
            yScale.range([this.innerHeight!, 0]);
        });
        this.updateChart();
    }

    scaleUnit(scale: d3.ScaleLinear<any, any, any> | d3.ScaleBand<any>): number {
        if (!scale) throw Error("YScale is null");
        const extent = scale.domain();
        if (typeof extent[0] === "number") {
            return Math.abs((scale(extent[0]) - scale(extent[1])) / (extent[0] - extent[1]));
        } else {
            return (scale((scale as d3.ScaleBand<any>).domain()[1]) || this.innerWidth)
                - (scale((scale as d3.ScaleBand<any>).domain()[0]) || 0);
        }
    }

    addAlpha(color: string, opacity: number): string {
        if (opacity === 1) return color;
        // coerce values so ti is between 0 and 1.
        const _opacity = Math.round(Math.min(Math.max(opacity || 1, 0), 1) * 255);
        return color + _opacity.toString(16).toUpperCase();
    }

    private getXScaleExtent() {
        const extents: ExtentType[] = [];
        for (const plot of this.plots) {
            extents.push(plot.getXScaleExtent());
        }
        let xScaleExtent = mergeExtent(...extents);
        if (typeof xScaleExtent[1] === "number") {
            xScaleExtent[1] += 2
            xScaleExtent = mergeExtent(xScaleExtent, [0, 0]);
        }
        return xScaleExtent
    }

    private getYScaleExtent(plot: D3PlotBase<any>) {
        const extents: ExtentType[] = [];
        extents.push(plot.getYScaleExtent());
        let yScaleExtent = mergeExtent(...extents);
        if (typeof yScaleExtent[1] === "number") {
            yScaleExtent[1] += 2
            yScaleExtent = mergeExtent(yScaleExtent, [0, 0]);
        }
        return yScaleExtent;
    }

    private getPlotsByAxisIndex(axisIndex: number) {
        return this.plots.filter(plot => plot.axisIndex === axisIndex);
    }

    private updateChart() {

        const xScaleUnit = this.scaleUnit(this.xScale!);
        const duration = 1000;

        this.xAxisGroup?.transition().duration(duration).call(d3.axisBottom(this.xScale!))
        this.yScales.forEach((yScale, i) => {
            if (i === 0) {
                this.yAxisGroups[i].transition().duration(duration).call(d3.axisLeft(yScale));
            } else if (i > 0) {
                this.yAxisGroups[i].transition().duration(duration).call(d3.axisRight(yScale));
            }
        });

        this.plots.forEach(plot => {
            if (plot.fix) return;
            const yScale = this.yScales[plot.axisIndex];
            const yScaleUnit = this.scaleUnit(yScale);
            plot.plotSelections.lines.forEach(selection => {
                selection.transition().duration(duration)
                    //@ts-ignore
                    .attr('d', d3.line()
                        .x((d: any) => this.xScale!(d.x))
                        .y((d: any) => yScale(d.y)))
            });
            plot.plotSelections.barh.forEach(selection => {
                selection.transition().duration(duration)
                    .attr("x", d => this.xScale!(d.x as any) + xScaleUnit * d.xOffset)
                    .attr("width", d => d.width * xScaleUnit)
                    .attr("y", d => yScale(d.y) - yScaleUnit * d.yOffset)
                    .attr("height", d => d.height * yScaleUnit)
                    .attr("width", (d: any) => xScaleUnit * d.width);
            });
            plot.plotSelections.text.forEach(selection => {
                selection.transition().duration(duration)
                    .attr("x", d => this.xScale!(d.x as any)+ (d.xShift || 0))
                    .attr("y", d => yScale(d.y)+ (d.yShift || 0));
            });
            plot.plotSelections.bars.forEach(selection => {
                selection.transition().duration(duration)
                    .attr("x", d => this.xScale!(d.x as any) + xScaleUnit * d.xOffset)
                    .attr("width", d => d.width * xScaleUnit)
                    .attr("y", d => yScale(d.y) + yScaleUnit * d.yOffset)
                    .attr("height", d => d.height * yScaleUnit)
                    .attr("width", (d: any) => xScaleUnit * d.width);
            });
        });
    }

    public zoomToExtent(extents: any) {
        if (!extents) {
            if (this.idleTimeout) return;
            this.xScale!.range([0, this.innerWidth]);
        } else {
            this.idleTimeout = setTimeout(() => {
                this.idleTimeout = undefined;
            }, 350);
            const [pl, pr] = this.xScale!.range();
            const [[el, et], [er, eb]] = extents;
            const left = -(this.innerWidth! / (er - el)) * (el - pl);
            const right = this.innerWidth! + (this.innerWidth! / (er - el)) * (pr - er);
            this.xScale!.range([left, right])

            this.yScales.forEach(yScale => {
                const [pt, pb] = yScale.range();
                const top = -(this.innerHeight! / (eb - et)) * (et - pt);
                const bottom = this.innerHeight! + (this.innerHeight! / (eb - et)) * (pb - eb);
                yScale.range([top, bottom])
            });

            // @ts-ignore
            // this.svg!.select(".brush").call(this.brush.move, null) // This remove the grey brush area
        }
        // console.log("Chart brushed", extent);

        this.updateChart();
    }

    private updateRuler() {
        // @ts-ignore
        var [xpos] = d3.mouse(this.svg!.node());

        this.xrule?.attr('x1', xpos - 2).attr('x2', xpos - 2)
        if (typeof this.xScale!.domain()[0] === "number") {
            // this.svg!.selectAll('.rule-text')
            const xVal = (this.xScale as d3.ScaleLinear<any, any>).invert(xpos);
            this.ruleText!.text(xVal.toFixed(3))
                .attr('x', xpos + 1);
        }
        
    }

    private zoom() {
        // @ts-ignore
        var [xpos, ypos] = d3.mouse(this.svg!.node());


        const [left, right] = this.xScale!.range();
        // @ts-ignore
        const factor = d3.event.wheelDelta < 0 ? 0.8 : 1.2;
        const extent = [
            xpos - (xpos - left) * factor,
            xpos + (right - xpos) * factor,
        ]
        this.xScale!.range(extent)
        this.yScales.forEach(yScale => {
            const [top, bottom] = yScale.range();
            const extent = [
                ypos - (ypos - top) * factor,
                ypos + (bottom - ypos) * factor,
            ]
            yScale.range(extent);
        })

        this.updateChart();
    }
}