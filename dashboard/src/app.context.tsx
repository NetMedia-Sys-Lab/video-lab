import { ReactNode, createContext, useEffect, useState } from "react";
import { AppContextType, AppStateType, JobManagerContextType, JobManagerStateType } from "./types/job.type";
import { io } from "socket.io-client";

export const AppContext = createContext<AppContextType>({
    appState: {
        stateKeys: [],
        stateValues: {}
    },
    setAppState: () => { }
});

export const JobManagerContext = createContext<JobManagerContextType>({
    jobManagerState: { autoRefresh: false },
    setJobManagerState: (...args) => {
        throw Error("Dummy setState called")
    }
});

export const AppContextProvider = (props: { children: ReactNode }) => {

    const [jobManagerState, setJobManagerState] = useState<JobManagerStateType>({ autoRefresh: false });
    const [appState, setAppState] = useState<AppStateType>({
        stateKeys: [],
        stateValues: {}
    });

    useEffect(() => {
        const socket = io(`http://${location.hostname}:3001`);
        socket.connect();
        setAppState(state => ({ ...state, socket }));
        return () => {
            socket.disconnect();
        }
    }, []);


    useEffect(() => {
        console.log("Connecting")
        const ws = new WebSocket(`ws://${location.hostname}:3002`);
        setAppState(state => ({ ...state, ws }));
        ws.addEventListener('open', () => {
            console.log("WebSocket opened");
        })
        return () => {
            ws.close();
        }
    }, []);

    useEffect(() => {
        if (!appState.ws) return;

        const {ws} = appState;
        
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                type: "stateKeys",
                message: Object.keys(appState.stateKeys)
            }));
            console.log("Sent message");
        })
            
        
    }, [appState.stateKeys, appState.ws]);



    return <>
        <AppContext.Provider value={{ appState, setAppState }}>
            <JobManagerContext.Provider value={{ jobManagerState, setJobManagerState }}>
                {props.children}
            </JobManagerContext.Provider>
        </AppContext.Provider>
    </>

}