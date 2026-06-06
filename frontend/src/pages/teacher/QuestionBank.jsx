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
  Card,
  Tabs,
  Switch,
  Typography
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons'
import { questionAPI } from '../../api'
import CodeEditor from '../../components/CodeEditor'

const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs
const { Text } = Typography

const questionTypeMap = {
  single: { label: '单选题', color: 'blue' },
  multiple: { label: '多选题', color: 'green' },
  true_false: { label: '判断题', color: 'orange' },
  programming: { label: '编程题', color: 'purple' }
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
      answer: [],
      code_template: '',
      test_cases: [{ input: '', output: '', score: 0, is_sample: false }],
      time_limit: 5,
      memory_limit: 256
    })
    setModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingId(record.id)
    setQuestionType(record.question_type)
    form.setFieldsValue({
      ...record,
      options: record.options || ['', '', '', ''],
      answer: record.answer || [],
      code_template: record.code_template || '',
      test_cases: record.test_cases || [{ input: '', output: '', score: 0, is_sample: false }],
      time_limit: record.time_limit || 5,
      memory_limit: record.memory_limit || 256
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
    } else if (value === 'programming') {
      form.setFieldsValue({
        options: [],
        answer: [],
        code_template: form.getFieldValue('code_template') || '',
        test_cases: form.getFieldValue('test_cases') || [{ input: '', output: '', score: 0, is_sample: false }],
        time_limit: form.getFieldValue('time_limit') || 5,
        memory_limit: form.getFieldValue('memory_limit') || 256
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
        width={questionType === 'programming' ? 900 : 600}
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
              <Option value="programming">编程题</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="content"
            label="题目内容"
            rules={[{ required: true, message: '请输入题目内容' }]}
          >
            <TextArea rows={3} placeholder="请输入题目内容" />
          </Form.Item>

          {questionType !== 'programming' ? (
            <>
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
            </>
          ) : (
            <>
              <Form.Item
                label="代码模板（可选，提供给学生的初始代码）"
                name="code_template"
              >
                <CodeEditor
                  height="200px"
                  value={form.getFieldValue('code_template') || ''}
                  onChange={(value) => form.setFieldsValue({ code_template: value })}
                />
              </Form.Item>

              <Form.Item label="测试用例">
                <Form.List name="test_cases">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Card
                          key={key}
                          size="small"
                          title={`测试用例 ${name + 1}`}
                          style={{ marginBottom: 12 }}
                          extra={
                            fields.length > 1 ? (
                              <Button danger size="small" onClick={() => remove(name)}>删除</Button>
                            ) : null
                          }
                        >
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <Form.Item
                              {...restField}
                              name={[name, 'input']}
                              label="输入"
                              style={{ marginBottom: 8 }}
                            >
                              <TextArea rows={2} placeholder="输入数据" />
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, 'output']}
                              label="期望输出"
                              rules={[{ required: true, message: '请输入期望输出' }]}
                              style={{ marginBottom: 8 }}
                            >
                              <TextArea rows={2} placeholder="期望输出结果" />
                            </Form.Item>
                            <div style={{ display: 'flex', gap: 16 }}>
                              <Form.Item
                                {...restField}
                                name={[name, 'score']}
                                label="分值"
                                rules={[{ required: true, message: '请输入分值' }]}
                                style={{ marginBottom: 0 }}
                              >
                                <InputNumber min={0} style={{ width: 120 }} />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[name, 'is_sample']}
                                label="样例用例"
                                valuePropName="checked"
                                style={{ marginBottom: 0 }}
                              >
                                <Switch />
                              </Form.Item>
                              <Text type="secondary" style={{ alignSelf: 'center' }}>
                                （样例用例会在答题时展示给学生）
                              </Text>
                            </div>
                          </Space>
                        </Card>
                      ))}
                      <Button type="dashed" onClick={() => add({ input: '', output: '', score: 0, is_sample: false })} block icon={<PlusOutlined />}>
                        添加测试用例
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form.Item>

              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item
                  name="time_limit"
                  label="时间限制（秒）"
                  rules={[{ required: true, message: '请输入时间限制' }]}
                  style={{ flex: 1 }}
                >
                  <InputNumber min={1} max={60} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="memory_limit"
                  label="内存限制（MB）"
                  rules={[{ required: true, message: '请输入内存限制' }]}
                  style={{ flex: 1 }}
                >
                  <InputNumber min={16} max={1024} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </>
          )}

          <Form.Item
            name="score"
            label="总分"
            rules={[{ required: true, message: '请输入总分' }]}
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
