import * as d3 from "d3";
import { Acc, AccFn, ExtentType, objectMap } from "../../types/plot.type";
import { D3PlotBar, D3PlotBarProps } from "./d3-plot-bar";
import { D3PlotBarh, D3PlotBarhProps } from "./d3-plot-barh";
import { D3PlotBase } from "./d3-plot-base";
import { D3PlotLine, D3PlotLineProps } from "./d3-plot-line";
import { D3PlotRect, D3PlotRectProps } from "./d3-plot-rect";

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export abstract class Plottable<T> {

    abstract getDataFrames(): DataFrame<T>[];

    abstract getIndexAcc(): Acc<T>;

    abstract getAllColAccs(): Record<keyof T, Acc<T>>;

    abstract toDfGroups(): DataFrameGroups<T>;

    plotLine(plots: D3PlotBase<T>[], props: Partial<D3PlotLineProps<T>> = {}) {
        const yAccs: Acc<T>[] = props.yAcc ? [props.yAcc] : Object.values(this.getAllColAccs());
        plots.push(...yAccs.map(yAcc => {
            return new D3PlotLine<T>({
                dfGroups: this.toDfGroups(),
                ...this.toDfGroups().plotParams,
                yAcc,
                ...props
            });
        }));
        return this;
    }

    plotBar(plots: D3PlotBase<T>[], props: Partial<D3PlotBarProps<T>> = {}) {
        const yAccs: Acc<T>[] = props.yAcc ? [props.yAcc] : Object.values(this.getAllColAccs());
        plots.push(...yAccs.map(yAcc => {
            return new D3PlotBar<T>({
                dfGroups: this.toDfGroups(),
                ...this.toDfGroups().plotParams,
                yAcc,
                ...props
            });
        }));
    }

    plotBarh(plots: D3PlotBase<T>[], props: Partial<D3PlotBarhProps<T>> = {}) {
        const yAccs: Acc<T>[] = props.yAcc ? [props.yAcc] : Object.values(this.getAllColAccs());
        plots.push(...yAccs.map(yAcc => {
            return new D3PlotBarh<T>({
                dfGroups: this.toDfGroups(),
                ...this.toDfGroups().plotParams,
                yAcc,
                ...props
            });
        }));
    }

    plotRect(plots: D3PlotBase<T>[], props: Partial<D3PlotRectProps<T>> = {}) {
        const yAccs: Acc<T>[] = props.yAcc ? [props.yAcc] : Object.values(this.getAllColAccs());
        plots.push(...yAccs.map(yAcc => {
            return new D3PlotRect<T>({
                dfGroups: this.toDfGroups(),
                ...this.toDfGroups().plotParams,
                yAcc,
                ...props
            });
        }));
    }
}

export class DataFrame<T> extends Plottable<T> {
    public rows: T[];
    public indexField?: keyof T;

    constructor(rows: T[], indexField?: keyof T) {
        super();
        this.rows = rows;
        this.indexField = indexField; // || ((r: T, i: number) => i);
    }

    getDataFrames(): DataFrame<T>[] {
        return [this];
    }

    getIndexAcc(): Acc<T> {
        return this.indexField
            ? ((r: T, i: number) => r[this.indexField!] as any)
            : ((r: T, i: number) => i);
    }

    getAllColAccs(): Record<keyof T, Acc<T>> {
        const columnNames: (keyof T)[] = [];
        for (const row of this.rows) {
            for (const key in row) {
                if (columnNames.indexOf(key) === -1) {
                    columnNames.push(key);
                }
            }
        }
        if (this.indexField) {
            columnNames.splice(columnNames.indexOf(this.indexField), 1);
        }
        const accs: Record<keyof T, Acc<T>> = {} as Record<keyof T, Acc<T>>;
        for (const col of columnNames) {
            accs[col] = ((r: T) => r[col] as any);
        }
        return accs;
    }

    toDfGroups(): DataFrameGroups<T> {
        return new DataFrameGroups<T>({
            null: this
        });
    }

    toPandasDF(ySuffix: string = "") {
        const indexAcc = this.getIndexAcc();
        const colAccs = this.getAllColAccs();
        const pdDf = {
            [this.indexField ?? "index"]: this.rows.map((r,i) => applyAcc(indexAcc, r, i))
        };
        for (const yField in colAccs)
        {
            pdDf[yField+ySuffix] = this.rows.map((r,i) => applyAcc(colAccs[yField], r, i))
        }
        return pdDf;
    }

    toStep(field: keyof T) {
        const newRows: T[] = [];
        this.rows.forEach((row, i) => {
            if (i > 0) {
                const lastRow = newRows[newRows.length - 1];
                if (lastRow[field] !== row[field]) {
                    newRows.push({
                        ...lastRow,
                        [field]: row[field]
                    });
                }
            }
            newRows.push(row);
        })
        return new DataFrame(newRows, this.indexField);
    }

    getExtent(acc: Acc<T>): ExtentType {
        const values = this.rows.map((r, i) => applyAcc(acc, r, i)).filter(val => val !== undefined && val !== null);
        if (typeof values[0] === "string") {
            return values as string[];
        } else if (typeof values[0] === "number") {
            return d3.extent(values as number[]) as [number, number];
        } else {
            return [];
        }
    }

    applyAccessors<T2>(accs: Partial<Record<keyof T2, Acc<T, any> | undefined>>) {
        const newRows: {
            [colName: string]: (string | number)
        }[] = this.rows.map(() => ({}));

        for (const colName in accs) {
            if (typeof accs[colName] == "function") {
                for (const i in this.rows) {
                    newRows[i][colName] = (accs[colName] as Function)(this.rows[i]);
                }
            } else {
                for (const i in this.rows) {
                    newRows[i][colName] = (accs[colName] as (string | number));
                }
            }
        }
        return new DataFrame<T2>(newRows as any as T2[]);
    }

    sort(sortFn: (a: T, b: T) => any) {
        this.rows.sort(sortFn);
    }

    sortNumerical(field: keyof T) {
        this.rows.sort((a, b) => {
            let i = 0;
            // @ts-ignore
            const numsA = (a[field].toString().match(/\d+/g) || []).map((s) => parseInt(s));
            // @ts-ignore
            const numsB = (b[field].toString().match(/\d+/g) || []).map((s) => parseInt(s));
            numsA.push(0);
            numsB.push(0);
            while (i < numsA.length && i < numsB.length && numsA[i] === numsB[i]) {
                i++;
            }
            if (i === numsA.length && i === numsB.length) return 0;
            else if (i === numsA.length) return -1;
            else if (i === numsB.length) return 1;
            else return numsA[i] - numsB[i];
        });
    }

    extend<T2>(accs: Record<keyof T2, Acc<T> | undefined>) {
        const ext = this.applyAccessors<T2>(accs).rows;
        return new DataFrame(this.rows.map((row, i) => ({
            ...row,
            ...ext[i]
        })), this.indexField);
    }

    mapRows<T2>(mapFn: (r: T) => T2, indexField?: keyof T2) {
        return new DataFrame<T2>(this.rows.map(mapFn), indexField);
    }

    groupBy(acc: Acc<T>): DataFrameGroups<T> {
        const groupIds: (string | number)[] = [];
        const groups: {
            [groupId: (string | number)]: DataFrame<T>
        } = {};

        this.rows.forEach((r, i) => {
            const gId = applyAcc(acc, r, i);
            if (groupIds.indexOf(gId) === -1) {
                groupIds.push(gId);
            }
        });

        groupIds.sort();

        for (const gId of groupIds) {
            groups[gId] = this.filter((r: T, i) => applyAcc(acc, r, i) === gId);
        }

        return new DataFrameGroups(groups);
    }

    filter(acc: AccFn<T, boolean>) {
        return new DataFrame(this.rows.filter((r, i) => applyAcc(acc, r, i)), this.indexField);
    }

    sumField(acc: Acc<T>) {
        let aggr = 0;
        for (let i = 0; i < this.rows.length; i++) {
            aggr += applyAcc(acc, this.rows[i], i);
        }
        return aggr;
    }

    avgField(acc: Acc<T>) {
        return this.sumField(acc) / this.rows.length;
    }

    std(acc: Acc<T>): number {
        const mean = this.avgField(acc)

        return Math.sqrt(this.sumField((r, i) => Math.pow(applyAcc(acc, r, i) - mean, 2)) / this.rows.length)
    }

    col(colName: keyof T) {
        return new DataFrameColumn(this, colName);
    }

    print() {
        console.table(this.rows);
    }

    pushRow(row: T) {
        this.rows.push(row);
        return this;
    }

    max(colName: keyof T) {
        return Math.max(...this.rows.map(r => (r[colName] as any)));
    }
}

export class DataFrameGroups<T> extends Plottable<T> {
    plotParams: Partial<D3PlotBarProps<T> & D3PlotBarhProps<T>>;
    groups: { [p: string]: DataFrame<T> };

    constructor(groups: { [gid: string]: (DataFrame<T> | T[]) },
                indexField ?: keyof T,
                plotParams: Partial<D3PlotBarProps<T> & D3PlotBarhProps<T>> = {}) {
        super();
        this.groups = objectMap(groups, (v, k, i) => {
            if (v instanceof DataFrame) {
                return v;
            } else {
                return new DataFrame<T>(v, indexField);
            }
        });
        this.plotParams = plotParams;
    }

    get length(): number {
        return Object.values(this.groups).length
    }

    getDataFrames(): DataFrame<T>[] {
        return Object.values(this.groups);
    }

    getIndexAcc(): Acc<T> {
        return Object.values(this.groups)[0].getIndexAcc();
    }

    getAllColAccs(): Record<keyof T, Acc<T>> {
        const accs: Record<keyof T, Acc<T>> = {} as Record<keyof T, Acc<T>>;
        for (const gid in this.groups) {
            Object.assign(accs, this.groups[gid].getAllColAccs());
        }
        return accs;
    }

    toDfGroups(): DataFrameGroups<T> {
        return this;
    }

    mapGroups<T2>(mapFn: (gid: string, df: DataFrame<T>) => DataFrame<T2>) {
        const newGroups: {
            [gid: string]: DataFrame<T2>
        } = {};
        for (const gid in this.groups) {
            newGroups[gid] = mapFn(gid, this.groups[gid]);
        }
        const ret = new DataFrameGroups(newGroups)
        return ret;
    }

    reduce<T2>(callback: (gid: string, df: DataFrame<T>) => T2, indexField?: keyof T2) {
        const rows: T2[] = [];
        for (const gid in this.groups) {
            rows.push(callback(gid, this.groups[gid]));
        }
        return new DataFrame(rows, indexField);
    }

    flatten() {
        const rows = [];
        let indexField;
        for (const gid in this.groups) {
            indexField ||= this.groups[gid].indexField as keyof T;
            rows.push(...this.groups[gid].rows);
        }
        return new DataFrame(rows, indexField);
    }

    toList() {
        return Object.values(this.groups);
    }

    toStep(indexField: keyof T) {
        return this.mapGroups((gid, df) => df.toStep(indexField));
    }

    toPandasDF() {
        const pdDf = {};
        this.forEach((gid, df) => {
            Object.assign(pdDf, df.toPandasDF("_"+gid));
        });
        return pdDf;
    }

    forEach(callback: (gid: string, df: DataFrame<T>, dfIndex: number) => void) {
        let i = 0;
        for (const gid in this.groups) {
            callback(gid, this.groups[gid], i);
            i++;
        }
    }

    col(colName: keyof T) {
        return this.mapGroups<T>((gid, df) => df.col(colName));
    }

    getExtent(acc: Acc<T>): ExtentType {
        const extent = [];
        for (const gid in this.groups) {
            extent.push(this.groups[gid].getExtent(acc));
        }
        return mergeExtent(...extent);
    }

    filter(acc: AccFn<T, boolean>) {
        return this.mapGroups((gid, df) => df.filter(acc));
    }

    max(colName: keyof T) {
        return Math.max(...this.getDataFrames().map(df => df.max(colName)));
    }

    dropNa() {
        return this.mapGroups((gid, df) => {
            const accs = df.getAllColAccs();
            for(const colName in accs) {
                df = df.filter((r, i) => applyAcc(accs[colName], r, i) != undefined);
            }
            return df;
        });
    }
}

export class DataFrameColumn<T> extends DataFrame<T> {
    private colName: keyof T;

    constructor(df: DataFrame<T>,
                colName: keyof T) {
        super(df.rows, df.indexField);
        this.colName = colName;
    }

    getAllColAccs(): Record<keyof T, Acc<T>> {
        return {
            [this.colName]: ((r: T) => (r[this.colName] as any))
        } as any;
    }

    max() {
        return super.max(this.colName);
    }

    dropNa() {
        return this.filter((r, i) => r[this.colName]!=undefined);
    }
}

export const mergeExtent = function (...extents: ExtentType[]): ExtentType {
    const values: string[] | number[] = [];
    extents.forEach(extent => {
        for (const e of extent) {
            if ((values as any).indexOf(e) === -1) {
                (values as any).push(e);
            }
        }
    })
    if (typeof values[0] === "string") {
        return values as string[];
    } else if (typeof values[0] === "number") {
        return d3.extent(values as number[]) as [number, number];
    } else {
        return [];
    }
}

export const applyAcc = function <T>(acc: Acc<T>, obj: T, i: number) {
    if (typeof acc == "function") {
        return (acc as Function)(obj, i);
    } else {
        return (acc as (string | number));
    }
}

export const sumAcc = function <T>(...accs: Acc<T>[]) {
    return (r: T, i: number) => {
        let val = 0;
        for (const acc of accs) {
            val += applyAcc(acc, r, i);
        }
        return val;
    }
}

export const subtractAcc = function <T>(acc0: Acc<T>, ...accs: Acc<T>[]) {
    return (r: T, i: number) => {
        let val = applyAcc(acc0, r, i);
        for (const acc of accs) {
            val -= applyAcc(acc, r, i);
        }
        return val;
    }
}

export const multiplyAcc = function <T>(...accs: Acc<T>[]) {
    return (r: T, i: number) => {
        let val = 1;
        for (const acc of accs) {
            val *= applyAcc(acc, r, i);
        }
        return val;
    }
}