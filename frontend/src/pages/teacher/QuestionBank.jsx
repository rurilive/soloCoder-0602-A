import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Popconfirm,
  Tag,
  Space,
  Card
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { questionAPI } from '../../api'

const { TextArea } = Input
const { Option } = Select

const questionTypeMap = {
  single: { label: '单选题', color: 'blue' },
  multiple: { label: '多选题', color: 'green' },
  true_false: { label: '判断题', color: 'orange' }
}

function QuestionBank() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form] = Form.useForm()
  const [questionType, setQuestionType] = useState('single')

  const fetchQuestions = async () => {
    setLoading(true)
    try {
      const res = await questionAPI.list()
      setQuestions(res.data)
    } catch (err) {
      message.error('获取题目列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setQuestionType('single')
    form.resetFields()
    form.setFieldsValue({
      question_type: 'single',
      score: 10,
      options: ['', '', '', ''],
      answer: []
    })
    setModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingId(record.id)
    setQuestionType(record.question_type)
    form.setFieldsValue({
      ...record,
      options: record.options,
      answer: record.answer
    })
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await questionAPI.delete(id)
      message.success('删除成功')
      fetchQuestions()
    } catch (err) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await questionAPI.update(editingId, values)
        message.success('更新成功')
      } else {
        await questionAPI.create(values)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchQuestions()
    } catch (err) {
      message.error(err.response?.data?.detail || '操作失败')
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60
    },
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 100,
      render: (type) => {
        const info = questionTypeMap[type] || { label: type, color: 'default' }
        return <Tag color={info.color}>{info.label}</Tag>
      }
    },
    {
      title: '题目内容',
      dataIndex: 'content',
      ellipsis: true
    },
    {
      title: '分值',
      dataIndex: 'score',
      width: 80
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该题目？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const handleTypeChange = (value) => {
    setQuestionType(value)
    if (value === 'true_false') {
      form.setFieldsValue({
        options: ['正确', '错误'],
        answer: []
      })
    } else if (value === 'single') {
      form.setFieldsValue({
        options: ['', '', '', ''],
        answer: []
      })
    } else {
      form.setFieldsValue({
        options: ['', '', '', ''],
        answer: []
      })
    }
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>题库管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加题目
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={questions}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑题目' : '添加题目'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="question_type"
            label="题型"
            rules={[{ required: true, message: '请选择题型' }]}
          >
            <Select onChange={handleTypeChange}>
              <Option value="single">单选题</Option>
              <Option value="multiple">多选题</Option>
              <Option value="true_false">判断题</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="content"
            label="题目内容"
            rules={[{ required: true, message: '请输入题目内容' }]}
          >
            <TextArea rows={3} placeholder="请输入题目内容" />
          </Form.Item>

          <Form.Item label="选项">
            <Form.List name="options">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <div key={key} style={{ display: 'flex', marginBottom: 8, gap: 8 }}>
                      <Form.Item
                        {...restField}
                        name={name}
                        rules={[{ required: true, message: '请输入选项内容' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Input placeholder={`选项 ${name + 1}`} disabled={questionType === 'true_false'} />
                      </Form.Item>
                      {questionType !== 'true_false' && fields.length > 2 && (
                        <Button danger onClick={() => remove(name)}>删除</Button>
                      )}
                    </div>
                  ))}
                  {questionType !== 'true_false' && (
                    <Button type="dashed" onClick={() => add()} block>
                      添加选项
                    </Button>
                  )}
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item
            name="answer"
            label={questionType === 'multiple' ? '正确答案（可多选）' : '正确答案'}
            rules={[{ required: true, message: '请选择正确答案' }]}
          >
            <Select
              mode={questionType === 'multiple' ? 'multiple' : undefined}
              placeholder="请选择正确答案"
            >
              {form.getFieldValue('options')?.map((opt, idx) => (
                <Option key={idx} value={idx}>
                  {opt || `选项 ${idx + 1}`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="score"
            label="分值"
            rules={[{ required: true, message: '请输入分值' }]}
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingId ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default QuestionBank
