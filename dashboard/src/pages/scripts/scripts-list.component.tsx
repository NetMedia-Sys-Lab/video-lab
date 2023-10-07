import { PlaySquareOutlined } from "@ant-design/icons"
import { Button, Form, Input, List } from "antd"
import { Link } from "react-router-dom"
import { useStateSocket } from "../../common/api"
import { PageType } from "../../types/page.type"
import { ScriptType } from "../../types/scripts.type"

const ScriptsListComponent = (props: {}) => {
    const [scriptsList, setScriptsList] = useStateSocket<Record<string, ScriptType>>('SCRIPTS', {});

    const addScript = (script: ScriptType) => {
        if (scriptsList[script.id]) {
            alert("Script ID exists");
            return;
        }
        setScriptsList({ ...scriptsList, [script.id]: script });
    }

    return <>
        <List
            itemLayout="horizontal"
            dataSource={Object.values(scriptsList)}
            renderItem={(script, index) => (
                <List.Item>
                    <List.Item.Meta
                        title={<Link to={script.id}>{script.name}</Link>}
                        description={script.description}
                    />
                </List.Item>
            )}
        />

        <Form
            name="new-script"
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
            style={{ maxWidth: 600 }}
            initialValues={{ remember: true }}
            onFinish={addScript}
        // onFinishFailed={onFinishFailed}
        // autoComplete="off"
        >
            <Form.Item<ScriptType>
                label="ID"
                name="id"
                rules={[{ required: true, message: 'Please input unique id' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item<ScriptType>
                label="Name"
                name="name"
                rules={[{ required: true, message: 'Please input script name' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item<ScriptType>
                label="Path"
                name="path"
                rules={[{ required: true, message: 'Please input script path' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                <Button type="primary" htmlType="submit">
                    Submit
                </Button>
            </Form.Item>
        </Form>
    </>
}


export const ScriptsListPage: PageType = {
    routerPath: '/scripts',
    title: 'Scripts',
    menuitem: {
        label: 'Scripts',
        icon: <PlaySquareOutlined />
    },
    component: ScriptsListComponent
}