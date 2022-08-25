import {D3PlotBase, D3PlotBaseProps} from "./d3-plot-base";
import {Acc, COLORS, D3RectParams, D3TextParams, ExtentType, PlotItemSelectCallback} from "../types/plot.type";
import {mergeExtent, sumAcc} from "./dataframe";
import * as d3 from "d3";
import {D3Plot} from "./d3-plot";

export declare type D3PlotBarhProps<T> = D3PlotBaseProps<T> & {
    xAcc?: Acc<T>
    yAcc: Acc<T>
    spanAcc?: Acc<T>
    colors?: Acc<T>[]
    opacity?: Acc<T>
    text?: Acc<T>
    gridY?: boolean
    onSelect?: PlotItemSelectCallback
}

export class D3PlotBarh<T> extends D3PlotBase<T> {
    xAcc: Acc<T>
    yAcc: Acc<T>
    spanAcc: Acc<T>
    colors: Acc<T>[]

    opacity?: Acc<T>
    text?: Acc<T>
    gridY?: boolean;
    onSelect?: PlotItemSelectCallback;

    constructor(props: D3PlotBarhProps<T>) {
        super(props as D3PlotBaseProps<T>);
        this.xAcc = props.spanAcc ? (props.xAcc || this.dfGroups.getIndexAcc()) : 0;
        this.yAcc = props.yAcc;
        this.spanAcc = props.spanAcc || props.xAcc || this.dfGroups.getIndexAcc();
        this.colors = props.colors || COLORS;
        this.opacity = props.opacity;
        this.text = props.text;
        this.gridY = props.gridY;
        this.onSelect = props.onSelect;
    }

    getXScaleExtent(): ExtentType {
        return mergeExtent(this.dfGroups.getExtent(this.xAcc), this.dfGroups.getExtent(sumAcc(this.xAcc, this.spanAcc)));
    }

    getYScaleExtent(): ExtentType {
        return this.dfGroups.getExtent(this.yAcc);
    }

    draw(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>) {
        const yScaleExtent = yScale.domain();
        if (this.gridY) {
            const yAxisGrid = d3
                .axisLeft(yScale)
                .tickSize(-plot.innerWidth!)
                .tickFormat(() => '')
                .tickValues(d3.range(yScaleExtent[0] + 1, yScaleExtent[1]));
            plot.clipArea!.append('g')
                .attr('class', 'y axis-grid')
                .call(yAxisGrid);
        }

        const barHeight = 0.8 / this.dfGroups.length;
        this.dfGroups.forEach((gid, df, dfIndex) => {

            const plotDfRect = df.applyAccessors<D3RectParams>({
                x: this.xAcc,
                xOffset: 0,
                y: this.yAcc,
                yOffset: barHeight * (dfIndex+1),
                width: this.spanAcc,
                opacity: this.opacity,
                color: this.colors[dfIndex],
                height: barHeight
            });
            this.drawRect(plot, yScale, plotDfRect);

            if (this.text) {
                const plotDfText = df.applyAccessors<D3TextParams>({
                    x: sumAcc(this.xAcc, this.spanAcc),
                    y: sumAcc(this.yAcc, barHeight * dfIndex),
                    text: this.text,
                    opacity: 1
                });
                this.drawText(plot, yScale, plotDfText);
            }
        })
    }
}