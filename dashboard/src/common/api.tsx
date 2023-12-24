import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LogLineType, RunConfig } from "../types/result.type";
import { RunDataType } from "../types/run-data.type";
import io from 'socket.io-client';
import { KibanaQuery } from "../types/api.types";
import { AppContext } from "../app.context";

const euc = encodeURIComponent;

// eslint-disable-next-line no-restricted-globals
export const ApiBase = `http://${location.hostname}:3001`;
const HeadlessPlayerApi = `${ApiBase}/headless-player`;
export const StaticApi = `${ApiBase}/static/runs`;
export const JobManagerApi = `${ApiBase}/job-manager`;

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

export const useStateWebSocket = function <T>(key: string, defaultState: T): [T, (newState: T, newId?: number) => void] {
    type MessageType = {
        key: string,
        value: T,
        id: number
    }
    const { appState, setAppState } = useContext(AppContext);
    const [state, setState] = useState(defaultState);
    const [valueId, setValueId] = useState(0);

    useEffect(() => {
        const { stateKeys } = appState;
        if (!stateKeys[key]) setAppState(st => ({ ...st, stateKeys: { ...st.stateKeys, [key]: true } }))

        return () => {
            if (stateKeys[key]) setAppState(st => ({ ...st, stateKeys: { ...st.stateKeys, [key]: false } }))
        }
    }, [appState.stateKeys, key, setAppState]);

    useEffect(() => {
        if (!appState.ws) return;
        const { ws } = appState;


        // socket.emit("state_sub", { key });

        // socket.on('state_update', (data: MessageType) => {
        //     setValueId(prevId => {
        //         console.log(`StateManager received state for key: ${data.key}, id: ${data.id}, prevId: ${prevId}`);
        //         if (data.key === key && data.id > prevId) {
        //             setState(data.value);
        //             console.log(`StateManager updated state for key: ${data.key}, id: ${data.id}`);
        //             return data.id;
        //         } else {
        //             return prevId;
        //         }
        //     })
        // });

        return () => {
            // socket.emit("state_unsub", { key });
        };
    }, [appState.ws, key, setState]);

    return [
        state,
        (newState: T, newId?: number) => {
            newId = newId !== undefined ? newId : Date.now();
            setState(newState);
            setValueId(newId);
            // appState.socket?.emit('state_update', { key, value: newState, id: newId });
        }
    ]
}

export const useStateSocket = function <T>(key: string, defaultState: T): [T, (newState: T, newId?: number) => void] {
    type MessageType = {
        key: string,
        value: T,
        id: number
    }
    const { appState } = useContext(AppContext);
    const [state, setState] = useState(defaultState);
    const [valueId, setValueId] = useState(0);

    useEffect(() => {
        if (!appState.socket) return;
        const { socket } = appState;

        socket.on("connected", () => {
            socket.emit("state_sub", { key });
        });

        socket.emit("state_sub", { key });

        socket.on('state_update', (data: MessageType) => {
            setValueId(prevId => {
                console.log(`StateManager received state for key: ${data.key}, id: ${data.id}, prevId: ${prevId}`);
                if (data.key === key && data.id > prevId) {
                    setState(data.value);
                    console.log(`StateManager updated state for key: ${data.key}, id: ${data.id}`);
                    return data.id;
                } else {
                    return prevId;
                }
            })
        });

        return () => {
            socket.emit("state_unsub", { key });
        };
    }, [appState.socket, key, setState]);

    return [
        state,
        (newState: T, newId?: number) => {
            newId = newId !== undefined ? newId : Date.now();
            setState(newState);
            setValueId(newId);
            appState.socket?.emit('state_update', { key, value: newState, id: newId });
        }
    ]
}

export const getRunConfigs = async (runIds: string[]): Promise<RunConfig[]> => {
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_ids: runIds })
    };
    const response = await fetch(`${HeadlessPlayerApi}/runs/configs`, requestOptions);
    return await response.json();
}

export const postNewRunConfig = async (configs: RunConfig[]) => {
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs)
    };
    const response = await fetch(`${HeadlessPlayerApi}/runs/new`, requestOptions);
    return await response.json();
}

export const useGetLogs = createUseAPI<[runId: string], { logs: LogLineType[] }>(async (runId: string) => {
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

export const fillFrames = async (runIds: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/fill-frames?runs=${euc(runIds.join(","))}`);
    return await response.json();
}

export const createTilesVideo = async (runIds: string[]) => {
    const response = await fetch(`${HeadlessPlayerApi}/runs/create-tiles?runs=${euc(runIds.join(","))}`);
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

export const playbackVideoUrl = (runId: string) => `${ApiBase}/static/runs/${runId}/playback.mp4`