import { useState, useEffect } from 'react'
import { Button, Table, Tag, Space, Modal, Form, Input, Switch, message, Popconfirm } from 'antd'
import { PlusOutlined, PlayCircleOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { dagApi } from '../api'
import type { DAG } from '../types'

const DAGList = () => {
  const [dags, setDags] = useState<DAG[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingDag, setEditingDag] = useState<DAG | null>(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const loadDags = async () => {
    try {
      setLoading(true)
      const res = await dagApi.list()
      setDags(res.data)
    } catch (error) {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDags()
  }, [])

  const handleCreate = () => {
    setEditingDag(null)
    form.resetFields()
    form.setFieldsValue({ is_active: false, cron_expression: '*/5 * * * *' })
    setModalVisible(true)
  }

  const handleEdit = (dag: DAG) => {
    setEditingDag(dag)
    form.setFieldsValue(dag)
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingDag) {
        await dagApi.update(editingDag.id, values)
        message.success('更新成功')
      } else {
        await dagApi.create(values)
        message.success('创建成功')
      }
      setModalVisible(false)
      loadDags()
    } catch (error: any) {
      message.error(error.response?.data?.detail || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await dagApi.delete(id)
      message.success('删除成功')
      loadDags()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleToggleActive = async (dag: DAG, checked: boolean) => {
    try {
      await dagApi.update(dag.id, { is_active: checked })
      message.success(checked ? '调度已启用' : '调度已停止')
      loadDags()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleTrigger = async (dag: DAG) => {
    try {
      await dagApi.trigger(dag.id)
      message.success('已触发执行')
    } catch (error) {
      message.error('触发失败')
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: 'Cron 表达式',
      dataIndex: 'cron_expression',
      key: 'cron_expression',
      width: 160,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (active: boolean, record: DAG) => (
        <Switch
          checked={active}
          onChange={(checked) => handleToggleActive(record, checked)}
          checkedChildren="运行"
          unCheckedChildren="停止"
        />
      )
    },
    {
      title: '节点数',
      key: 'nodes',
      width: 80,
      render: (_: any, record: DAG) => record.nodes?.length || 0
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_: any, record: DAG) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate(`/dags/${record.id}`)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => navigate(`/dags/${record.id}/executions`)}>
            历史
          </Button>
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleTrigger(record)}>
            执行
          </Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <h2>DAG 列表</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建 DAG
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={dags}
      />

      <Modal
        title={editingDag ? '编辑 DAG' : '新建 DAG'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="请输入 DAG 名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item name="cron_expression" label="Cron 表达式" rules={[{ required: true }]}>
            <Input placeholder="例如: */5 * * * *" />
          </Form.Item>
          <Form.Item name="is_active" label="启用调度" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DAGList
