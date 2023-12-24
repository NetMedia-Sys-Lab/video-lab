import { useParams } from "react-router-dom";
import { PageType } from "../../types/page.type";
import { useStateSocket } from "../../common/api";
import { ScriptType } from "../../types/scripts.type";
import { Editor } from "@monaco-editor/react";
import { languages, editor } from "monaco-editor/esm/vs/editor/editor.api";
import { useContext, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Space, Typography, notification } from "antd";
import { PlaySquareFilled, SaveFilled } from "@ant-design/icons";
import { JobManagerContext } from "../../app.context";
import { runScript } from "../../common/job-manager.api";

function debounce<T extends Function>(cb: T, wait = 20) {
    let h: any = undefined;
    let callable = (...args: any) => {
        if (h !== undefined)
            clearTimeout(h);
        h = setTimeout(() => cb(...args), wait);
    };
    return callable as any as T;
}

const ScriptEditorComponent = (props: {}) => {
    let { scriptId } = useParams();
    let [script] = useStateSocket<ScriptType | null>(`SCRIPTS.${scriptId}`, null);
    let [scriptContent, setScriptContent] = useStateSocket<string>(`SCRIPT_CONTENT#${scriptId}`, "");
    let [isSaved, setIsSaved] = useState(true);
    let [autoSave, setAutoSave] = useState(true);

    const { setJobManagerState } = useContext(JobManagerContext);

    const editorRef = useRef<editor.IStandaloneCodeEditor>(null);

    if (!script) {
        return <>Loading</>
    }

    const saveValue = debounce(() => {
        // @ts-ignore
        setScriptContent(editorRef.current?.getValue() || "");
        setIsSaved(true);
    }, 1000)

    const runJob = async () => {
        if (!scriptId) return;
        const response = await runScript(scriptId);
        await notification.success({
            message: response.message || JSON.stringify(response),
            placement: "top"
        });
        if (response.job_ids && response.job_ids.length === 1) {
            setJobManagerState({ selectedJobId: response.job_ids[0], autoRefresh: true })
        }
    }

    return <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
        <Space>
            <Button type="primary" onClick={saveValue} icon={<SaveFilled />} disabled={isSaved}>
                Save
            </Button>
            <Checkbox checked={autoSave} onChange={ev => setAutoSave(ev.target.checked)}>AutoSave</Checkbox>
            <Button type="primary" onClick={runJob} icon={<PlaySquareFilled />}>
                Run
            </Button>
        </Space>
        <br />
        <div style={{ flexGrow: 1 }}>
            <Editor
                height="100%"
                language={{
                    "sh": "shell",
                    "txt": "text",
                    "py": "python",
                }[script.path.split(".").pop()?.toLowerCase() || "txt"]}
                defaultValue={scriptContent}
                // @ts-ignore
                onMount={(editor, monaco) => editorRef.current = editor}
                onChange={(value) => {
                    const isSaved = scriptContent === value
                    setIsSaved(isSaved);
                    if (!isSaved && autoSave) {
                        saveValue();
                    }
                }}
                theme="vs-dark"
            />
        </div>
    </div>
}

const TitleComponent = (props: {}) => {
    let { scriptId } = useParams();
    return <>Edit Scritp: {scriptId}</>
}

export const ScriptEditorPage: PageType = {
    routerPath: '/scripts/:scriptId',
    title: <TitleComponent />,
    component: ScriptEditorComponent
}