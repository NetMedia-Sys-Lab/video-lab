import { Button, Checkbox, Col, Drawer, Form, FormInstance, Input, InputNumber, message, Row, Select, Space, Spin } from "antd"
import { createRef, useEffect, useState } from "react"
import { postNewRunConfig, useStateSocket } from "../../common/api"
import { EditOutlined, PlusOutlined, MinusCircleOutlined } from "@ant-design/icons"
import { ExtraTabType, OptionEditorComponent, OptionType } from "../misc/option-editor.component"
import { getAllInputPaths } from "../../common/dataset.api"
import ReactJson from "react-json-view"
import { RunConfig } from "../../types/result.type"

const HEADLESS_PLAYER_SETTING = "HEADLESS_PLAYER_SETTING";
const HEADLESS_PLAYER_LAST_CONFIG = "HEADLESS_PLAYER_LAST_CONFIG";
const HEADLESS_PLAYER_CONFIG = "HEADLESS_PLAYER_CONFIG";

type HeadlessPlayerSetting = {
    bufferOptions?: OptionType[],
    methodOptions?: OptionType[],
    abrOptions?: OptionType[]
    serverOptions?: OptionType[],
    analyzerOptions?: OptionType[],
    networkOptions?: OptionType[],
}

export const NewRunFormComponent = (props: {
    onRunScheduled: (resultId: string) => void
}) => {
    const { onRunScheduled } = props
    const [isScheduling, setIsScheduling] = useState(false)
    const [config, setConfig] = useStateSocket<{ [key: string]: any }>(HEADLESS_PLAYER_CONFIG, {});
    const [runConfigs, setRunConfigs] = useState<RunConfig[]>([]);

    // Settings
    const [setting, setSetting] = useStateSocket<HeadlessPlayerSetting>(HEADLESS_PLAYER_SETTING, {});
    const [inputOptions, setInputOptions] = useState<OptionType[]>([]);

    useEffect(() => {
        getAllInputPaths().then(inputPaths => {
            setInputOptions(inputPaths.map(path => {
                let name = path;
                if (name.endsWith("output.mpd")) {
                    name = name.split("/").slice(0, -1).join("/");
                }
                return { name, value: { "input": path } }
            }));
        })
    }, []);

    useEffect(() => {
        // Generate run configs
        let runs: RunConfig[] = [{
            run_id: config.resultId + "/" + Math.floor(Date.now() / 100).toString(),
            _selections: {}
        } as any];
        const permutate = (options: OptionType[], optionName: string, addToId: boolean = true) => {
            if (!options || options.length === 0) return;
            const prevRuns = [...runs];
            runs = [];
            for (const option of options) {
                for (const run of prevRuns) {
                    let newRun: RunConfig = { ...run, _selections: { ...run._selections, [optionName]: option.name } };
                    if (addToId) {
                        newRun.run_id += '_' + option.name.replaceAll("/", '_').replaceAll("-", '_');
                    }
                    for (const key in option.value) {
                        // @ts-ignore
                        if (newRun[key] === undefined) {
                            // @ts-ignore
                            newRun[key] = option.value[key];
                            continue;
                        }
                        let newVal = option.value[key];
                        if (typeof newVal !== "object") {
                            // @ts-ignore
                            newVal = [newVal];
                        }
                        // @ts-ignore
                        let oldVal = newRun[key];
                        if (typeof oldVal !== "object") {
                            // @ts-ignore
                            oldVal = [oldVal];
                        }
                        // @ts-ignore
                        newRun[key] = [...oldVal, ...newVal];
                    }
                    runs.push(newRun);
                }
            }
        }
        permutate(config.input, "input");
        permutate(config.method, "method");
        permutate(config.buffer, "buffer");
        permutate(config.abr, "abr");
        permutate(config.server, "server", false);
        permutate(config.analyzer, "analyzer", false);
        permutate(config.network, "network");

        const repeatedRuns = [];
        for (let i = 1; i <= config.repeat; i++) {
            for (const run of runs) {
                repeatedRuns.push({ ...run, run_id: run.run_id + "_" + i })
            }
        }

        setRunConfigs(repeatedRuns);
    }, [config]);

    const submit = () => {
        setIsScheduling(true);
        localStorage.setItem(HEADLESS_PLAYER_LAST_CONFIG, JSON.stringify(config, null, 4));
        postNewRunConfig(runConfigs).then(res => {
            message.success(res.message);
            onRunScheduled(config.resultId);
        })
            .catch(res => {
                message.error(JSON.stringify(res))
            })
            .finally(() => {
                setIsScheduling(false);
                setConfig({ ...config });
            })
    }

    const setSettingOptions = (key: keyof HeadlessPlayerSetting, value: OptionType[]) => {
        console.log(`Setting ${key} =`, value);
        setSetting({ ...setting, [key]: value });
    }

    return <Spin tip="Scheduling" spinning={isScheduling}>

        <table className="new-run-table">
            <tr>
                <th>Result ID</th>
                <td><Input value={config.resultId} onChange={(event) => setConfig({ ...config, resultId: event.target.value })} /></td>
            </tr>

            <ConfigParamSelect label="Inputs" value={config.input} options={inputOptions} setOptions={setInputOptions} onChange={(val) => setConfig({ ...config, input: val })} extraTabs={[
            ]} />
            <ConfigParamCheckbox label="Methods" selectedOptions={config.method} options={setting.methodOptions || []} setOptions={setSettingOptions.bind(this, "methodOptions")} onChange={(val) => setConfig({ ...config, method: val })} />
            <ConfigParamCheckbox label="Buffer Settings" selectedOptions={config.buffer} options={setting.bufferOptions || []} setOptions={setSettingOptions.bind(this, "bufferOptions")} onChange={(val) => setConfig({ ...config, buffer: val })} />
            <ConfigParamCheckbox label="Adaptation Algorithm" selectedOptions={config.abr} options={setting.abrOptions || []} setOptions={setSettingOptions.bind(this, "abrOptions")} onChange={(val) => setConfig({ ...config, abr: val })} />
            <ConfigParamCheckbox label="Server" selectedOptions={config.server} options={setting.serverOptions || []} setOptions={setSettingOptions.bind(this, "serverOptions")} onChange={(val) => setConfig({ ...config, server: val })} />
            <ConfigParamCheckbox label="Analyzers" selectedOptions={config.analyzer} options={setting.analyzerOptions || []} setOptions={setSettingOptions.bind(this, "analyzerOptions")} onChange={(val) => setConfig({ ...config, analyzer: val })} />
            <ConfigParamSelect label="Network" value={config.network} options={setting.networkOptions || []} setOptions={setSettingOptions.bind(this, "networkOptions")} onChange={(val) => setConfig({ ...config, network: val })} />

            <tr>
                <th>Repeat</th>
                <td><InputNumber min={1} max={100} value={config.repeat} onChange={repeat => setConfig({ ...config, repeat })} /></td>
            </tr>

            <tr>
                <th></th>
                <td>
                    <Button type="primary" onClick={submit}>
                        Submit
                    </Button>
                    <Button>
                        Reset
                    </Button>
                </td>
            </tr>

            <tr>
                <th></th>
                <td><ReactJson src={runConfigs ?? {}} collapsed={1} /></td>
            </tr>
        </table>

    </Spin>
}

const ConfigParamCheckbox = ({ label, onChange, options, setOptions, selectedOptions }: {
    label: string, selectedOptions: OptionType[], onChange: (option: OptionType[]) => void,
    options: OptionType[], setOptions: (options: OptionType[]) => void
}) => {
    const optionNames = (options || []).map((opt: OptionType) => opt.name);
    const selectedNames = (selectedOptions || []).map((opt: OptionType) => opt.name);
    return <tr>
        <th>{label} ({selectedNames.length})</th>
        <td>
            <div>
                <OptionEditorComponent
                    name={label + " Settings"}
                    options={options}
                    selectedNames={selectedNames}
                    onChange={(options, selectedNames) => {
                        setOptions(options);
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }} />
                <Checkbox.Group
                    value={selectedNames}
                    options={optionNames}
                    onChange={(selectedNames) => {
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }}
                    style={{ marginLeft: 8 }}
                />
            </div>
        </td>
    </tr>
}

const ConfigParamSelect = ({ label, onChange, options, setOptions, value, extraTabs }: {
    label: string, value: OptionType[], onChange: (option: OptionType[]) => void,
    options: OptionType[], setOptions: (options: OptionType[]) => void,
    extraTabs?: ExtraTabType[]
}) => {
    const selectedNames = (value || []).map((opt: OptionType) => opt.name);
    return <tr>
        <th>{label} ({selectedNames.length})</th>
        <td>
            <div style={{ display: "flex" }}>
                <OptionEditorComponent
                    name={label + " Settings"}
                    options={options}
                    selectedNames={selectedNames}
                    onChange={(options, selectedNames) => {
                        setOptions(options)
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }}
                    extraTabs={extraTabs}
                />
                <Select
                    mode={"multiple"}
                    placeholder={"Select " + label}
                    allowClear
                    value={selectedNames}
                    onChange={(selectedNames: string[]) => {
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }}
                    style={{ flexGrow: 1, marginLeft: 8 }}>
                    {(options || []).map(option => <Select.Option value={option.name} key={option.name}>{option.name}</Select.Option>)}
                </Select>
            </div>
        </td>
    </tr>
}