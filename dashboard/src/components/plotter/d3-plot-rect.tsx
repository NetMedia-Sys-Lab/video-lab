import { D3PlotBase, D3PlotBaseProps } from "./d3-plot-base";
import { Acc, COLORS, D3RectParams, D3TextParams, ExtentType, PlotItemSelectCallback, RectStyle } from "../../types/plot.type";
import { mergeExtent, subtractAcc, sumAcc } from "./dataframe";
import * as d3 from "d3";
import { D3Plot } from "./d3-plot";

export declare type D3PlotRectProps<T> = D3PlotBaseProps<T> & {
    xAcc?: Acc<T>
    yAcc: Acc<T>
    widthAcc?: Acc<T>
    heightAcc?: Acc<T>

    colors?: Acc<T, string>[]
    opacity?: Acc<T, number>
    text?: Acc<T, string>,
    style?: Acc<T, RectStyle>
    class?: Acc<T, string>

    xLabel?: string
    yLabel?: string

    onSelect?: PlotItemSelectCallback<T>
}

export class D3PlotRect<T> extends D3PlotBase<T> {
    xAcc: Acc<T>
    yAcc: Acc<T>
    widthAcc: Acc<T>
    heightAcc: Acc<T>
    style: Acc<T, RectStyle>
    class: Acc<T, string>

    opacity?: Acc<T>
    text?: Acc<T>

    onSelect?: PlotItemSelectCallback<T>;


    constructor(props: D3PlotRectProps<T>) {
        super(props as D3PlotBaseProps<T>);
        this.xAcc = props.xAcc || this.dfGroups.getIndexAcc();
        this.yAcc = props.yAcc;
        this.widthAcc = props.widthAcc!;
        this.heightAcc = props.heightAcc!;
        this.colors = props.colors || COLORS;
        this.opacity = props.opacity;
        this.text = props.text;
        this.style = props.style || {}
        this.class = props.class || ''

        this.onSelect = props.onSelect;
    }

    draw(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>) {
        // const yScaleExtent = yScale.domain();
        // const xScaleExtent = plot.xScale!.domain();
        // const barWidth = 0.8 / this.dfGroups.length; 
        // const barWidth = Math.max(0.8 / this.dfGroups.length, Math.abs(xScaleExtent[1]-xScaleExtent[0])*0.01);
        this.dfGroups.forEach((gid, df, dfIndex) => {
            const plotDfRect = df.applyAccessors<D3RectParams>({
                x: this.xAcc,
                xOffset: 0,
                y: this.yAcc,
                yOffset: 0,
                width: this.widthAcc,
                opacity: this.opacity,
                color: this.colors[dfIndex],
                height: this.heightAcc,
                style: this.style,
                class: this.class,
                ref: (d: any) => d,
            });
            // @ts-ignore
            this.drawRect(plot, yScale, plotDfRect, this.onSelect && this.onSelect.bind(this, gid));

            if (this.text) {
                const plotDfText = df.applyAccessors<D3TextParams>({
                    x: this.xAcc,
                    y: this.yAcc,
                    text: this.text
                });
                this.drawText(plot, yScale, plotDfText);
            }
        })
    }

    getXScaleExtent(): ExtentType {
        return mergeExtent(
            this.dfGroups.getExtent(this.xAcc),
            this.dfGroups.getExtent(sumAcc(this.xAcc, this.widthAcc))
        );
    }

    getYScaleExtent(): ExtentType {
        return mergeExtent(
            [0, 0],
            this.dfGroups.getExtent(this.yAcc),
            this.dfGroups.getExtent(subtractAcc(this.yAcc, this.heightAcc))
        );
    }
}