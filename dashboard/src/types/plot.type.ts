import * as d3 from "d3";

export declare type D3SelectionType = d3.Selection<any, any, null, undefined>;

export declare type PlotterConfigType = {
    markBwDropTime: boolean,
    xAxis: {
        minLimit: number,
        maxLimit: number,
        maxValue: number,
    }
}

export const COLORS = ["#ff0000", "#00ff00", "#0000ff", "#008f5d", "#72e06a", "#bce931", "#f68511", "#7326d3", "#7e84fa", "#4046ca", "#0fb5ae", "#cb5d00"];

export declare type Range = { start: number, end: number };

export declare type D3PlotDimensionsType = {
    width: number
    height: number
    margin: {
        top: number
        right: number
        bottom: number
        left: number
    }
}

export declare type AccFn<T, T2> = (r: T, i: number) => T2
export declare type Acc<T,T2=(string | number | boolean)> = AccFn<T,T2> | T2;

export declare type ExtentType = [number, number] | string[]
export declare type LegendType = {[id: string]: {label: string, color: string, opacity: number}}

export declare type D3RectParams = {
    x: number
    xOffset: number
    y: number
    yOffset: number
    width: number
    height: number
    opacity: number
    color: string
    ref: any
    style: RectStyle
    class: string
}
export declare type D3TextParams = {
    x: number
    y: number
    text: string
    opacity: string
    xShift?: number
    yShift?: number
}
export declare type D3LineParams = {
    x: number
    y: number
    opacity: number
    color: string
}
export declare type PlotItemSelectCallback<T> = (plotIndex: number, plotData: T) => void;

export declare type MarkerUpdateCallback = (markers: { start: number, end: number }[]) => void;

export const objectMap = function <T, T2>(obj: T, fn: (v: any, k: keyof T, i: number) => T2) {
    return Object.fromEntries(
        Object.entries(obj).map(
            ([k, v], i) => [k, fn(v, k as keyof T, i)]
        )
    ) as Record<keyof T, T2>;
}

export type RectStyle = {
    stroke?: string
}