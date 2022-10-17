import {useCallback, useEffect, useState} from "react";
import {LogLineType, RunConfig} from "../types/result.type";
import {RunDataType} from "../types/run-data.type";
import io from 'socket.io-client';
import {KibanaQuery} from "../types/api.types";

const euc = encodeURIComponent;

// eslint-disable-next-line no-restricted-globals
export const ApiBase = `http://${location.hostname}:3001`;
const HeadlessPlayerApi = `${ApiBase}/headless-player`;
export const StaticApi = `${ApiBase}/static/runs`;
export const JobManagerApi = `${ApiBase}/job-manager`;

// readChunks() reads from the provided reader and yields the results into an async iterable
function readChunks(reader: ReadableStreamDefaultReader) {
    const utf8Decoder = new TextDecoder("utf-8");
    return {
        async* [Symbol.asyncIterator]() {
            let {value: chunk, done: readerDone} = await reader.read();
            console.log(chunk);
            chunk = chunk ? utf8Decoder.decode(chunk, {stream: true}) : "";

            let re = /\r\n|\n|\r/gm;
            let startIndex = 0;

            for (; ;) {
                let result = re.exec(chunk);
                if (!result) {
                    if (readerDone) {
                        break;
                    }
                    let remainder = chunk.substring(startIndex);
                    ({value: chunk, done: readerDone} = await reader.read());
                    chunk = remainder + (chunk ? utf8Decoder.decode(chunk, {stream: true}) : "");
                    startIndex = re.lastIndex = 0;
                    continue;
                }
                yield chunk.substring(startIndex, result.index);
                startIndex = re.lastIndex;
            }
            if (startIndex < chunk.length) {
                // last line didn't end in a newline char
                yield chunk.substring(startIndex);
            }
        },
    };
}

export function createUseAPI<TParameters extends [...args: any] = [], T1 = any>(apiCallback: (...args: TParameters) => Promise<T1>) {
    return (...args: TParameters) => {
        const [isLoading, setIsLoading] = useState<boolean>(false);
        const [error, setError] = useState<any>(null);
        const [data, setData] = useState<T1 | undefined>(undefined);
        const [lastRefreshed, setLastRefreshed] = useState<number>();

        const execute = async () => {
            try {
                setIsLoading(true);
                const data = await apiCallback(...args);
                setIsLoading(false);
                setData(data);
                setError(null)
                setLastRefreshed(Date.now())
                return data;
            } catch (e) {
                setIsLoading(false);
                setData(undefined);
                setError(e);
                throw e;
            }
        }
        
        useEffect(() => {
            execute();
        }, [...args])

        return {
            isLoading,
            error,
            data,
            lastRefreshed,
            refresh: useCallback(execute, [...args]), // to avoid infinite calls when inside a `useEffect`
        };
    }
}

export const useGetAllResults = createUseAPI<[], { results: RunConfig[] }>(async () => {
    const response = await fetch(`${HeadlessPlayerApi}/runs`);
    return await response.json();
});

export const useGetRunsData = createUseAPI<[runIds: string[]],
    { [runKey: string]: RunDataType }>
(async (runIds: string[]) => {
    console.log("Fetching Run Data for ", runIds);
    const response = await fetch(`${HeadlessPlayerApi}/runs/data?runs=${euc(runIds.join(','))}`);
    return await response.json();
})

export const deleteRuns = async (runIds: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/delete`, {
        method: "POST",
        body: JSON.stringify(runIds)
    });
    return await response.json();
}

export const useStateSocket = function<T>(key: string, defaultState: T) {
    const [isConnected, setIsConnected] = useState(false);
    const [state, setState] = useState(defaultState);

    useEffect(() => {
        // eslint-disable-next-line no-restricted-globals
        const socket = io(`http://${location.hostname}:3001`);
        console.log("Connecting")

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit("state_sub", {
                "key": key
            });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('state_update', (data) => {
            if (data.key === key) {
                setState(data.value);
            }
            console.log("Updating state", data);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('state_update');
            socket.disconnect();
        };
    }, [key]);

    return {
        isConnected,
        state
    }
}

export const postNewRunConfig = async (config: any, onProgress: ((chunk: any) => void) | null = null) => {
    const requestOptions = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(config)
    };
    const response = await fetch(`${HeadlessPlayerApi}/runs/new`, requestOptions);
    return await response.json();
}

export const useGetLogs = createUseAPI<[runId: string], { logs: LogLineType[] }>(async (runId: string) => {
    console.log("Fetching logs")
    const response = await fetch(`${HeadlessPlayerApi}/runs/logs?run=${euc(runId)}`);
    return await response.json();
});

export const encodePlayback = async (runIds: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/encode-playback?runs=${euc(runIds.join(","))}`);
    return await response.json();
}

export const openPcapFile = async (files: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/wireshark?files=${euc(files.join(","))}`);
    return await response.json();
}

export const calculateRunQuality = async (runIds: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/playback-quality?runs=${euc(runIds.join(","))}`);
    return await response.json();
}

export const makeKibanaQuery = (options: KibanaQuery) => {
    let query = "";
    query += `run_id:(${options.runIds.join(" or ")})`
    if (options.time_from) {
        query += " and "
        query += `time_since_start >= ${options.time_from}`
    }
    if (options.time_to) {
        query += " and "
        query += `time_since_start <= ${options.time_to}`
    }
    return query;
}

export const makeKibanaLink = (options: KibanaQuery) =>
    `http://localhost:5601/app/logs/stream?logFilter=(language:kuery,query:${euc(`'${makeKibanaQuery(options)}'`)})`;

export const playbackVideoUrl = (runId: string) => `${ApiBase}/static/runs/${runId}/downloaded/playback_buffering.mp4`
