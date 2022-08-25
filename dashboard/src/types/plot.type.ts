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

export declare type Range = {start: number, end: number};

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

export declare type BoolAccFn<T> =  ((r: T, i: number) => boolean)// | ((r: T) => boolean);
export declare type NumAccFn<T> =  ((r: T, i: number) => number)// | ((r: T) => number);
export declare type StrAccFn<T> =  ((r: T, i: number) => string)// | ((r: T) => string);
export declare type BoolAcc<T> =  BoolAccFn<T> | boolean;
export declare type NumAcc<T> =  NumAccFn<T> | number;
export declare type StrAcc<T> =  StrAccFn<T> | string;
export declare type AccFn<T> = NumAccFn<T> | StrAccFn<T> | BoolAccFn<T>;
export declare type Acc<T> = NumAcc<T> | StrAcc<T> | BoolAcc<T>;

export declare type ExtentType = [number, number] | string[]

export declare type D3RectParams = {
    x: number
    xOffset: number
    y: number
    yOffset: number
    width: number
    height: number
    opacity: number
    color: string
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
export declare type PlotItemSelectCallback = () => void;

export declare type MarkerUpdateCallback = (markers: { start: number, end: number }[]) => void;

export const objectMap = function <T, T2>(obj: T, fn: (v: any, k: keyof T, i: number) => T2) {
    return Object.fromEntries(
        Object.entries(obj).map(
            ([k, v], i) => [k, fn(v, k as keyof T, i)]
        )
    ) as Record<keyof T, T2>;
}