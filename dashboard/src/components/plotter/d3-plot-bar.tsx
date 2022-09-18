import { D3PlotBase, D3PlotBaseProps } from "./d3-plot-base";
import { Acc, COLORS, D3RectParams, D3TextParams, ExtentType, RectStyle} from "../../types/plot.type";
import { mergeExtent, sumAcc } from "./dataframe";
import * as d3 from "d3";
import { D3Plot } from "./d3-plot";

export declare type D3PlotBarProps<T> = D3PlotBaseProps<T> & {
    xAcc?: Acc<T>
    yAcc: Acc<T>
    colors?: Acc<T, string>[]
    opacity?: Acc<T, number>
    text?: Acc<T, string>,
    style?: Acc<T, RectStyle>
    class?: Acc<T, string>
}

export class D3PlotBar<T> extends D3PlotBase<T> {
    xAcc: Acc<T>
    yAcc: Acc<T>
    colors: Acc<T>[]
    style: Acc<T, RectStyle>
    class: Acc<T, string>

    opacity?: Acc<T>
    text?: Acc<T>

    constructor(props: D3PlotBarProps<T>) {
        super(props as D3PlotBaseProps<T>);
        this.xAcc = props.xAcc || this.dfGroups.getIndexAcc();
        this.yAcc = props.yAcc;
        this.colors = props.colors || COLORS;
        this.opacity = props.opacity;
        this.text = props.text;
        this.style = props.style || {}
        this.class = props.class || ''
    }

    draw(plot: D3Plot, yScale: d3.ScaleLinear<any, any, any>) {
        // const yScaleExtent = yScale.domain();

        const barWidth = 0.8 / this.dfGroups.length;
        this.dfGroups.forEach((gid, df, dfIndex) => {
            const plotDfRect = df.applyAccessors<D3RectParams>({
                x: this.xAcc,
                xOffset: barWidth * dfIndex,
                y: this.yAcc,
                yOffset: 0,
                width: barWidth,
                opacity: this.opacity,
                color: this.colors[dfIndex],
                height: this.yAcc,
                style: this.style,
                class: this.class
            });
            this.drawRect(plot, yScale, plotDfRect);

            if (this.text) {
                const plotDfText = df.applyAccessors<D3TextParams>({
                    x: sumAcc(this.xAcc, barWidth * dfIndex),
                    y: this.yAcc,
                    text: this.text,
                    opacity: 1
                });
                this.drawText(plot, yScale, plotDfText);
            }
        })
    }

    getXScaleExtent(): ExtentType {
        return mergeExtent(this.dfGroups.getExtent(this.xAcc));
    }

    getYScaleExtent(): ExtentType {
        return mergeExtent([0, 0], this.dfGroups.getExtent(this.yAcc));
    }
}