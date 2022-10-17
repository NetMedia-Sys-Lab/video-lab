import { Button, Checkbox, Form, FormInstance, Input, InputNumber, message, Select, Spin } from "antd"
import { createRef, useState } from "react"
import { postNewRunConfig } from "../../common/api"

export const NewRunFormComponent = (props: {
    onRunScheduled: (resultId: string) => void
}) => {
    const { onRunScheduled } = props
    const [isScheduling, setIsScheduling] = useState(false)
    const formRef = createRef<FormInstance>()
    const defaultValues = JSON.parse(localStorage.getItem("new-run-last-values") || "{}")

    const onNewRunSubmit = (values: any) => {
        const betas: boolean[] = values.methods.map((v: string) => v.split(",")[0] === "beta")
        const protocols: string[] = values.methods.map((v: string) => v.split(",")[1])
        const newResultId: string = values.resultId
        const config = {
            ...values,
            beta: betas.filter((v, i) => betas.indexOf(v) === i),
            protocols: protocols.filter((v, i) => protocols.indexOf(v) === i),
            codecs: values.codecs.split(","),
            calculateVmaf: values.calculateQuality.indexOf("vmaf") >= 0
        }
        localStorage.setItem('new-run-last-values', JSON.stringify(values))
        console.log(config)
        setIsScheduling(true)
        postNewRunConfig(config)
            .then(res => {
                console.log(res)
                message.success(res.message)
                setIsScheduling(false)
                // results.refresh().then(res => {
                //     setExpandedRowKeys([
                //         ...expandedRowKeys,
                //         newResultId
                //     ])
                // })
                onRunScheduled(newResultId)
            })
            .catch(res => {
                message.error(JSON.stringify(res))
                setIsScheduling(false)
            })
    }

    const resetForm = () => {
        const values = {
            ...defaultValues,
            resultId: defaultValues.resultId.replace(/\d+$/, '')
                + (parseInt((defaultValues.resultId.match(/\d+$/) || [0])[0], 10) + 1).toString().padStart(3, '0')
        }
        console.log(values)
        formRef.current?.setFieldsValue(values)
    }

    return <Spin tip="Scheduling" spinning={isScheduling}>
        <Form
            id="new-run-form"
            ref={formRef}
            name="newRunForm"
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 8 }}
            // initialValues={{remember: true}}
            onFinish={onNewRunSubmit}
            onReset={resetForm}
            // onFinishFailed={onFinishFailed}
            autoComplete="on"
        >
            <Form.Item
                label="Result ID"
                name="resultId"
                rules={[{ required: true }]}
            >
                <Input />
            </Form.Item>
            <Form.Item
                label="Videos"
                name="videos"
                rules={[{ required: true, message: 'Please select videos!' }]}
            >
                <Select mode="multiple" placeholder="Select Videos">
                    {["Aspen", "BBB", "Burn", "Football"].map(video => <Select.Option
                        key={video}>{video}</Select.Option>)}
                </Select>
            </Form.Item>
            <Form.Item label="Methods" name="methods" rules={[{ required: true }]}>
                <Checkbox.Group>
                    {/*<Checkbox.Group options={[*/}
                    {/*    {label: "QUIC", value: "beta,quic"},*/}
                    {/*    {label: "BETA", value: "beta,tcp"},*/}
                    {/*    {label: "DASH", value: "nonbeta,tcp"},*/}
                    {/*]} defaultValue={defaultValues.methods}/>*/}
                    <Checkbox value={"beta,quic"}>QUIC</Checkbox>
                    <Checkbox value={"beta,tcp"}>BETA</Checkbox>
                    <Checkbox value={"nonbeta,tcp"}>DASH</Checkbox>
                </Checkbox.Group>
            </Form.Item>

            <Form.Item label="Codecs" name="codecs" rules={[{ required: true }]}>
                <Select placeholder="Select Codecs" allowClear>
                    <Select.Option value={"hevc"}>HEVC</Select.Option>
                    <Select.Option value={"av1"}>AV1</Select.Option>
                    <Select.Option value={"hevc,av1"}>HEVC & AV1</Select.Option>
                </Select>
            </Form.Item>

            <Form.Item label="Segment Lengths" name="lengths" rules={[{ required: true }]}>
                {/* <Select placeholder="Select Lengths for segments" allowClear>
                    <Select.Option value={"1"}>1 sec</Select.Option>
                    <Select.Option value={"2"}>2 sec</Select.Option>
                    <Select.Option value={"1,2"}>1 sec & 2 sec</Select.Option>
                </Select> */}

                <Checkbox.Group>
                    <Checkbox value={1}>1 sec</Checkbox>
                    <Checkbox value={2}>2 sec</Checkbox>
                </Checkbox.Group>
            </Form.Item>

            <Form.Item label="Buffer Setting" name="bufferSettings" rules={[{ required: true }]}>
                <Checkbox.Group>
                    <Checkbox value={"long-buffer"}>long-buffer</Checkbox>
                    <Checkbox value={"long-buffer-7"}>long-buffer-7</Checkbox>
                    <Checkbox value={"long-buffer-9"}>long-buffer-9</Checkbox>
                    <Checkbox value={"short-buffer"}>short-buffer</Checkbox>
                </Checkbox.Group>
            </Form.Item>

            <Form.Item label="Adaptation Algorithm" name="abr" rules={[{ required: true }]}>
                <Checkbox.Group>
                    <Checkbox value={"default"}>Default</Checkbox>
                    <Checkbox value={"buffer-based"}>Buffer Based</Checkbox>
                    <Checkbox value={"bandwidth-based"}>Bandwidth Based</Checkbox>
                    <Checkbox value={"hybrid"}>Hybrid</Checkbox>
                </Checkbox.Group>
            </Form.Item>

            <Form.Item label="Bandwidth Profiles" name="bwProfiles" rules={[{ required: true }]}>
                <Select mode={"multiple"} placeholder="Select Bandwidth Profiles" allowClear>
                    <Select.Option value={"drop"}>Drop</Select.Option>
                    <Select.Option value={"drop-low"}>Drop Low</Select.Option>
                    <Select.Option value={"multi-drop"}>Multi Drop</Select.Option>
                </Select>
            </Form.Item>

            <Form.Item label="Calculate Quality" name="calculateQuality" rules={[{ required: true }]}>
                <Checkbox.Group>
                    <Checkbox value={"vmaf"}>VMAF</Checkbox>
                </Checkbox.Group>
            </Form.Item>


            <Form.Item label="Repeat" name="repeat" rules={[{ required: true }]}>
                <InputNumber min={1} max={20} />
            </Form.Item>

            <Form.Item label="Server Log Level" name="serverLogLevel" rules={[{ required: true }]}>
                <Select defaultValue="none">
                    <Select.Option value={"none"}>None</Select.Option>
                    <Select.Option value={"debug"}>Debug</Select.Option>
                </Select>
            </Form.Item>

            <Form.Item wrapperCol={{
                offset: 8,
                span: 8
            }}>
                <Button type="primary" htmlType="submit">
                    Submit
                </Button>
                <Button htmlType="reset">
                    Reset
                </Button>
            </Form.Item>
        </Form>
    </Spin>
}