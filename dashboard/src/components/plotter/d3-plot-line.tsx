import {D3PlotBase, D3PlotBaseProps} from "./d3-plot-base";
import {Acc, COLORS, D3LineParams, D3RectParams, D3TextParams, ExtentType} from "../../types/plot.type";
import {mergeExtent, sumAcc} from "./dataframe";
import * as d3 from "d3";
import {D3Plot} from "./d3-plot";

export declare type D3PlotLineProps<T> = D3PlotBaseProps<T> & {
    xAcc?: Acc<T>
    yAcc: Acc<T>
    colors?: Acc<T, string>[]
    opacity?: Acc<T, number>
    text?: Acc<T, string>
    lineStyle?: string

    xLabel?: string
    yLabel?: string

}

export class D3PlotLine<T> extends D3PlotBase<T> {
    xAcc: Acc<T>
    yAcc: Acc<T>
    colors: Acc<T>[]

    opacity?: Acc<T>
    text?: Acc<T>
    lineStyle?: string

    constructor(props: D3PlotLineProps<T>) {
        super(props as D3PlotBaseProps<T>);
        this.xAcc = props.xAcc || this.dfGroups.getIndexAcc();
        this.yAcc = props.yAcc;
        this.colors = props.colors || COLORS;
        this.opacity = props.opacity;
        this.text = props.text;
        this.lineStyle = props.lineStyle;
    }

    draw(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>) {
        this.dfGroups.forEach((gid, df, dfIndex) => {
            if (this.lineStyle !== 'none') {
                const plotDfLine = df.applyAccessors<D3LineParams>({
                    x: this.xAcc,
                    y: this.yAcc,
                    color: this.colors[dfIndex],
                    opacity: this.opacity
                });
                this.drawLine(plot, yScale, plotDfLine);
            }
            if (this.text) {
                const plotDfText = df.applyAccessors<D3TextParams>({
                    x: this.xAcc,
                    y: this.yAcc,
                    xShift: -5,
                    yShift: 4,
                    text: this.text,
                    opacity: 0.4
                });
                this.drawText(plot, yScale, plotDfText);
            }
        })
    }

    getXScaleExtent(): ExtentType {
        return this.dfGroups.getExtent(this.xAcc);
    }

    getYScaleExtent(): ExtentType {
        return this.dfGroups.getExtent(this.yAcc);
    }
}