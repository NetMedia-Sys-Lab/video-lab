import "./option-editor.style.scss";
import { Button, Col, Drawer, Input, List, Modal, Radio, Row, Skeleton, Space, Tabs, Tooltip, Typography } from "antd"
import { useEffect, useMemo, useRef, useState } from "react";
import ReactJson from "react-json-view";
import { EditOutlined, PlusOutlined, SortAscendingOutlined, FilterOutlined, CheckCircleFilled, CheckCircleOutlined, SortDescendingOutlined, MinusCircleOutlined } from "@ant-design/icons"
import Editor from '@monaco-editor/react';
import * as yaml from "js-yaml";

const { Text } = Typography;

export type OptionType = { name: string, value: { [key: string]: string | number | string[] } };
export type ExtraTabType = { title: string, render: (opt: OptionType) => JSX.Element };

export const OptionEditorComponent = ({ name, options, selectedNames, onChange, extraTabs }: {
    name: string,
    options: OptionType[],
    selectedNames: string[],
    onChange: (options: OptionType[], selectedNames: string[]) => void,
    extraTabs?: ExtraTabType[]
}) => {

    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number | null>();
    const [error, setError] = useState<string | null>();
    const [editorType, setEditorType] = useState<string>('json');

    const [searchString, setSearchString] = useState<string>("");
    const [searchBarOpen, setSearchBarOpen] = useState<boolean>(true);

    const filteredOptions = useMemo(() => {
        let searchFor = searchString.trim();
        const optionsMap = options.map((opt, idx) => [opt, idx] as [OptionType, number]);
        if (searchFor.length === 0) return optionsMap;

        searchFor = searchString.toLowerCase();
        try {
            return optionsMap.filter(([opt, idx]) => opt.name.toLowerCase().match(searchFor));
        } catch (e) {
            return optionsMap;
        }
    }, [options, searchString])

    const editorRef = useRef(null);

    const removeOption = (idx: number) => {
        const newOptions = [...options.slice(0, idx), ...options.slice(idx + 1)];
        const newSelectedNames = newOptions.filter(opt => selectedNames.indexOf(opt.name) >= 0).map(opt => opt.name);
        onChange(newOptions, newSelectedNames);
        if (activeIndex === idx) {
            setActiveIndex(null);
        }
    }

    const saveValue = (value: string | undefined, event: any) => {
        let obj: any;
        if (editorType === "json") {
            try {
                obj = JSON.parse(value!);
            } catch (err) {
                setError("Invalid JSON");
                return;
            }
        } else if (editorType === "yaml") {
            try {
                obj = yaml.load(value!);
            } catch (err) {
                setError("Invalid YAML");
                return;
            }
        }

        if (typeof obj !== "object" || !obj.name) {
            return setError("Setting should have type : {name: string, value: any}");
        }

        if (typeof obj.name !== "string") {
            return setError("Name should be of type string");
        }

        if (activeIndex === null) {
            return setError("No option selected to save");
        }

        if (JSON.stringify(options[activeIndex!]) !== JSON.stringify(obj)) {
            const newOptions = [...options.slice(0, activeIndex!), obj, ...options.slice(activeIndex! + 1)];
            const newSelectedNames = newOptions.filter(opt => selectedNames.indexOf(opt.name) >= 0).map(opt => opt.name);
            onChange(newOptions, newSelectedNames);
        }

        setError(null);
    }

    const changeEditorType = (type: "json" | "yaml") => {
        if (editorType === type) return;
        if (type === "json" && editorType === "yaml") {
            // @ts-ignore
            let value = editorRef.current!.getValue();
            value = yaml.load(value);
            // @ts-ignore
            editorRef.current.setValue(JSON.stringify(value, null, 4));
        } else if (type == "yaml" && editorType === "json") {
            // @ts-ignore
            let value = JSON.parse(editorRef.current!.getValue());
            value = yaml.dump(value);
            // @ts-ignore
            editorRef.current.setValue(value);
        }
        setEditorType(type);
    }

    const sortOptions = (asc: boolean) => {
        onChange([...options].sort((a: OptionType, b: OptionType) => {
            let i = 0;
            // @ts-ignore
            const numsA = (a.name.match(/([^\d]+|\d+)/g) || []).map(s => s.toString());
            // @ts-ignore
            const numsB = (b.name.match(/([^\d]+|\d+)/g) || []).map(s => s.toString());
            while (i < numsA.length && i < numsB.length && numsA[i] === numsB[i]) {
                i++;
            }
            const mul = asc ? 1 : -1;
            console.log(numsA, i, numsA[i])
            console.log(numsB, i, numsB[i])
            if (i === numsA.length && i === numsB.length) return 0 * mul;
            else if (i === numsA.length) return -1 * mul;
            else if (i === numsB.length) return 1 * mul;
            else {
                try {
                    return (parseFloat(numsA[i]) - parseFloat(numsB[i])) * mul;
                } catch {
                    return numsA[i].localeCompare(numsB[i]);
                }
            }
        }), selectedNames);
    }

    useEffect(() => {
        if (editorRef.current && activeIndex) {

            let newValue = "";
            // @ts-ignore
            let oldValue = editorRef.current.getValue();

            if (editorType === "json") {
                newValue = JSON.stringify(options[activeIndex], null, 4);
                oldValue = JSON.stringify(JSON.parse(oldValue), null, 4);
            } else if (editorType === "yaml") {
                newValue = yaml.dump(options[activeIndex]);
                oldValue = yaml.dump(yaml.load(oldValue));
            }

            // @ts-ignore
            if (newValue !== oldValue) {
                // @ts-ignore
                editorRef.current.setValue(newValue);
            }
        }
    }, [activeIndex, editorType, options]);

    return <>
        <Modal
            title={name}
            onOk={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            open={open}
            width={1000}
            bodyStyle={{ padding: 0, height: '60vh' }}
            footer={[
                selectedNames.length + " Selected | ",
                error
                    ? <Text type="danger">{error}&nbsp;&nbsp;</Text>
                    : <Text type="success">Saved&nbsp;&nbsp;</Text>,
                <Button type="default" onClick={() => {
                    if (editorRef.current) {
                        // @ts-ignore
                        saveValue(editorRef.current.getValue());
                    }
                }} disabled={activeIndex === null}>Save</Button>
            ]}
        >
            <Row style={{ height: "100%" }}>
                <Col span={8} className="options-col">
                    <div className="options-toolbar">
                        <Tooltip placement="bottom" title="Filter">
                            <Button
                                type={searchString.trim().length === 0 ? "dashed" : "primary"}
                                onClick={() => setSearchBarOpen(!searchBarOpen)}
                                icon={<FilterOutlined />}
                            />
                        </Tooltip>
                        <Tooltip placement="bottom" title="Select Filtered">
                            <Button
                                type="dashed"
                                onClick={() => {
                                    onChange(options, options
                                        .filter(opt =>
                                            selectedNames.indexOf(opt.name) >= 0 ||
                                            filteredOptions.findIndex(([filtOpt, _idx]) => filtOpt.name === opt.name) >= 0
                                        ).map(opt => opt.name)
                                    );
                                }}
                                icon={<CheckCircleFilled />}
                            />
                        </Tooltip>
                        <Tooltip placement="bottom" title="Unselect Filtered">
                            <Button
                                type="dashed"
                                onClick={() => {
                                    onChange(options, selectedNames.filter(
                                        optName => filteredOptions.findIndex(([filtOpt, _idx]) => filtOpt.name === optName) === -1
                                    ));
                                }}
                                icon={<CheckCircleOutlined />}
                            />
                        </Tooltip>
                        <Tooltip placement="bottom" title="Sort Ascending">
                            <Button
                                type="dashed"
                                onClick={() => sortOptions(true)}
                                icon={<SortAscendingOutlined />}
                            />
                        </Tooltip>
                        <Tooltip placement="bottom" title="Sort Descending">
                            <Button
                                type="dashed"
                                onClick={() => sortOptions(false)}
                                icon={<SortDescendingOutlined />}
                            />
                        </Tooltip>
                        <Tooltip placement="bottom" title="Add Option">
                            <Button
                                type="dashed"
                                onClick={() => {
                                    let val = { name: "NEW_OPTION", value: {} };
                                    onChange([...options, val], selectedNames);
                                    setActiveIndex(options.length);
                                }}
                                icon={<PlusOutlined />}
                            />
                        </Tooltip>
                    </div>
                    {searchBarOpen &&
                        <div className="options-toolbar">
                            <Input placeholder="Filter" prefix={<FilterOutlined />} value={searchString} onChange={ev => setSearchString(ev.target.value)} />
                        </div>
                    }
                    <div className="options-table">
                        <table>
                            {filteredOptions.map(([option, idx]) =>
                                <tr
                                    className={[
                                        activeIndex === idx ? "active" : "",
                                        selectedNames.indexOf(option.name) >= 0 ? "selected" : "",
                                    ].join(" ")}
                                >
                                    <td onClick={() => {
                                        if (selectedNames.indexOf(option.name) >= 0) {
                                            onChange(options, selectedNames.filter(name => name !== option.name));
                                        } else {
                                            onChange(options, [...selectedNames, option.name]);
                                        }
                                    }}>
                                        <CheckCircleFilled />
                                    </td>
                                    <td
                                        onClick={() => {
                                            setActiveIndex(idx)
                                        }}
                                    >{option.name}</td>
                                    <td onClick={() => { removeOption(idx) }}><MinusCircleOutlined /></td>
                                </tr>
                            )}
                        </table>
                    </div>

                </Col>
                <Col span={16} className="editor-col">

                    {activeIndex !== null && activeIndex !== undefined ? <>
                        <Radio.Group onChange={ev => changeEditorType(ev.target.value)} value={editorType} style={{ marginBottom: 8 }}>
                            <Radio.Button value="json">JSON</Radio.Button>
                            <Radio.Button value="yaml">YAML</Radio.Button>
                            {
                                (extraTabs || []).map(extraTab => <Radio.Button value={extraTab.title}>{extraTab.title}</Radio.Button>)
                            }
                        </Radio.Group>
                        <Editor
                            height="100%"
                            language={editorType}
                            defaultValue={JSON.stringify(options[activeIndex], null, 4)}
                            onMount={(editor, monaco) => editorRef.current = editor}
                            onChange={saveValue}
                        />;
                    </>
                        : <div style={{padding: 10}}><Skeleton /></div>}
                </Col>
            </Row>
        </Modal>

        <Button
            type="dashed"
            onClick={() => setOpen(true)}
            icon={<EditOutlined />}
            style={{ minWidth: 32 }}
        ></Button>
    </>
}