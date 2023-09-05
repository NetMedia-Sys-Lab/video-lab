import { Button, Checkbox, Col, Drawer, Form, FormInstance, Input, InputNumber, message, Row, Select, Space, Spin } from "antd"
import { createRef, useEffect, useState } from "react"
import { postNewRunConfig } from "../../common/api"
import { EditOutlined, PlusOutlined, MinusCircleOutlined } from "@ant-design/icons"
import { OptionEditorComponent, OptionType } from "../misc/option-editor.component"
import { getAllInputPaths } from "../../common/dataset.api"
import ReactJson from "react-json-view"

const HEADLESS_PLAYER_SETTING = "HEADLESS_PLAYER_SETTING";
const HEADLESS_PLAYER_LAST_CONFIG = "HEADLESS_PLAYER_LAST_CONFIG";

type HeadlessPlayerSetting = {
    bufferOptions: OptionType[],
    methodOptions: OptionType[],
    // protocolOptions: OptionType[]
    abrOptions: OptionType[]
    serverOptions: OptionType[],
    analyzerOptions: OptionType[],
    networkOptions: OptionType[],
}

type RunConfig = { [key: string]: any }

export const NewRunFormV2Component = (props: {
    onRunScheduled: (resultId: string) => void
}) => {
    const { onRunScheduled } = props
    const [isScheduling, setIsScheduling] = useState(false)
    // const formRef = createRef<FormInstance>()
    // const defaultValues = JSON.parse(localStorage.getItem("new-run-last-values") || "{}")
    const [config, setConfig] = useState<{ [key: string]: any }>({});
    const [runConfigs, setRunConfigs] = useState<RunConfig[]>();

    // Settings
    const [inputOptions, setInputOptions] = useState<OptionType[]>([]);
    const [bufferOptions, setBufferOptions] = useState<OptionType[]>([]);
    const [methodOptions, setMethodOptions] = useState<OptionType[]>([]);
    // const [protocolOptions, setProtocolOptions] = useState<OptionType[]>([]);
    const [abrOptions, setAbrOptions] = useState<OptionType[]>([]);
    const [serverOptions, setServerOptions] = useState<OptionType[]>([]);
    const [analyzerOptions, setAnalyzerOptions] = useState<OptionType[]>([]);
    const [networkOptions, setNetworkOptions] = useState<OptionType[]>([]);

    useEffect(() => {
        setConfig(JSON.parse(localStorage.getItem(HEADLESS_PLAYER_LAST_CONFIG) || "{}"));
        // Load settings
        const setting: HeadlessPlayerSetting = JSON.parse(localStorage.getItem(HEADLESS_PLAYER_SETTING) || "{}");
        setMethodOptions(setting.methodOptions ?? []);
        // setProtocolOptions(setting.protocolOptions ?? []);
        setBufferOptions(setting.bufferOptions ?? []);
        setAbrOptions(setting.abrOptions ?? []);
        setServerOptions(setting.serverOptions ?? []);
        setAnalyzerOptions(setting.analyzerOptions ?? []);
        setNetworkOptions(setting.networkOptions ?? []);
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
        // Save settings
        const setting: HeadlessPlayerSetting = JSON.parse(localStorage.getItem(HEADLESS_PLAYER_SETTING) || "{}");
        setting.bufferOptions = bufferOptions;
        // setting.protocolOptions = protocolOptions;
        setting.methodOptions = methodOptions;
        setting.abrOptions = abrOptions;
        setting.serverOptions = serverOptions;
        setting.analyzerOptions = analyzerOptions;
        setting.networkOptions = networkOptions;
        localStorage.setItem(HEADLESS_PLAYER_SETTING, JSON.stringify(setting, null, 4));
    }, [bufferOptions, methodOptions, abrOptions, serverOptions, analyzerOptions, networkOptions])

    useEffect(() => {
        // Generate run configs
        const prefix = Math.floor(Date.now() / 100);
        let runs: RunConfig[] = [{ run_id: prefix, _selections: {} }];
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
                        if (newRun[key] === undefined) {
                            newRun[key] = option.value[key];
                            continue;
                        }
                        let newVal = option.value[key];
                        if (typeof newVal !== "object") {
                            // @ts-ignore
                            newVal = [newVal];
                        }
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

    // const ConfigParamCheckbox = (label: string, name: string, options: OptionType[], setOptions: (options: OptionType[]) => void) => {
    //     return <tr>
    //         <th>{label}</th>
    //         <td>
    //             <Space>

    //                 <OptionEditorComponent
    //                     name={label + " Settings"}
    //                     options={options}
    //                     onChange={(options) => {
    //                         setOptions(options);
    //                     }}
    //                 />
    //                 <Checkbox.Group value={config[name]} onChange={val => setConfig({ ...config, [name]: val })}>
    //                     {(options ?? []).map(option => <Checkbox value={option}>{option.name}</Checkbox>)}
    //                 </Checkbox.Group>
    //             </Space>
    //         </td>
    //     </tr>
    // }

    // const ConfigParamSelect = (label: string, name: string, options: OptionType[], setOptions: (options: OptionType[]) => void) => {
    //     return <tr>
    //         <th>{label}</th>
    //         <td>
    //             <div style={{ display: "flex" }}>
    //                 <OptionEditorComponent name={label + " Settings"} options={options} onChange={(options) => { setOptions(options) }} />
    //                 <Select mode={"multiple"} placeholder={"Select " + label} allowClear value={(config[name] || []).map((opt: OptionType) => opt.name)}
    //                     onChange={(optNames: string[]) => {
    //                         let values = options.filter(opt => optNames.indexOf(opt.name) >= 0);
    //                         setConfig({ ...config, [name]: values })
    //                     }}
    //                     style={{ flexGrow: 1, marginLeft: 8 }}>
    //                     {(options || []).map(option => <Select.Option value={option.name} key={option.name}>{option.name}</Select.Option>)}
    //                 </Select>
    //             </div>
    //         </td>
    //     </tr>
    // }

    const submit = () => {
        setIsScheduling(true);
        let finalConfig = {
            result_id: config.resultId,
            runs: runConfigs
        };
        localStorage.setItem(HEADLESS_PLAYER_LAST_CONFIG, JSON.stringify(config, null, 4));
        postNewRunConfig(finalConfig).then(res => {
            message.success(res.message);
            onRunScheduled(config.resultId);
        })
            .catch(res => {
                message.error(JSON.stringify(res))
            })
            .finally(() => {
                setIsScheduling(false)
            })
    }

    return <Spin tip="Scheduling" spinning={isScheduling}>

        <table className="new-run-table">
            <tr>
                <th>Result ID</th>
                <td><Input value={config.resultId} onChange={(event) => setConfig({ ...config, resultId: event.target.value })} /></td>
            </tr>

            <ConfigParamSelect label="Inputs" value={config.input} options={inputOptions} setOptions={setInputOptions} onChange={(val) => setConfig({ ...config, input: val })} />
            <ConfigParamCheckbox label="Methods" value={config.method} options={methodOptions} setOptions={setMethodOptions} onChange={(val) => setConfig({ ...config, method: val })} />
            {/* <ConfigParamCheckbox label="Protocols" value={config.protocol} options={protocolOptions} setOptions={setProtocolOptions} onChange={(val) => setConfig({ ...config, protocol: val })} /> */}
            <ConfigParamCheckbox label="Buffer Settings" value={config.buffer} options={bufferOptions} setOptions={setBufferOptions} onChange={(val) => setConfig({ ...config, buffer: val })} />
            <ConfigParamCheckbox label="Adaptation Algorithm" value={config.abr} options={abrOptions} setOptions={setAbrOptions} onChange={(val) => setConfig({ ...config, abr: val })} />
            <ConfigParamCheckbox label="Server" value={config.server} options={serverOptions} setOptions={setServerOptions} onChange={(val) => setConfig({ ...config, server: val })} />
            <ConfigParamCheckbox label="Analyzers" value={config.analyzer} options={analyzerOptions} setOptions={setAnalyzerOptions} onChange={(val) => setConfig({ ...config, analyzer: val })} />
            <ConfigParamCheckbox label="Network" value={config.network} options={networkOptions} setOptions={setNetworkOptions} onChange={(val) => setConfig({ ...config, network: val })} />

            <tr>
                <th>Repeat</th>
                <td><InputNumber min={1} max={100} defaultValue={1} onChange={repeat => setConfig({ ...config, repeat })} /></td>
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

const ConfigParamCheckbox = ({ label, onChange, options, setOptions, value }: {
    label: string, value: OptionType[], onChange: (option: OptionType[]) => void,
    options: OptionType[], setOptions: (options: OptionType[]) => void
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
                        setOptions(options);
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }} />
                <Checkbox.Group
                    value={selectedNames}
                    onChange={(selectedNames) => {
                        onChange(options.filter(opt => selectedNames.indexOf(opt.name) >= 0));
                    }}
                    style={{ marginLeft: 8 }}>
                    {(options ?? []).map(option => <Checkbox value={option.name}>{option.name}</Checkbox>)}
                </Checkbox.Group>
            </div>
        </td>
    </tr>
}

const ConfigParamSelect = ({ label, onChange, options, setOptions, value }: {
    label: string, value: OptionType[], onChange: (option: OptionType[]) => void,
    options: OptionType[], setOptions: (options: OptionType[]) => void
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