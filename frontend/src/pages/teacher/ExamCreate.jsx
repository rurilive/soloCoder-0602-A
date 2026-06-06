import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  Button,
  DatePicker,
  InputNumber,
  Select,
  Transfer,
  message,
  Space,
  Row,
  Col,
  Tag
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { questionAPI, examAPI, studentAPI } from '../../api'

const { TextArea } = Input
const { Option } = Select
const { RangePicker } = DatePicker

function ExamCreate() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [questions, setQuestions] = useState([])
  const [students, setStudents] = useState([])
  const [selectedQuestions, setSelectedQuestions] = useState([])
  const [selectedStudents, setSelectedStudents] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [qRes, sRes] = await Promise.all([
          questionAPI.list(),
          studentAPI.listStudents()
        ])
        setQuestions(qRes.data)
        setStudents(sRes.data)
      } catch (err) {
        message.error('获取数据失败')
      }
    }
    fetchData()
  }, [])

  const handleSubmit = async (values) => {
    if (selectedQuestions.length === 0) {
      message.error('请至少选择一道题目')
      return
    }
    if (selectedStudents.length === 0) {
      message.error('请至少选择一名学生')
      return
    }

    setLoading(true)
    try {
      const data = {
        title: values.title,
        description: values.description,
        start_time: values.time_range[0].toISOString(),
        end_time: values.time_range[1].toISOString(),
        duration: values.duration,
        total_score: selectedQuestions.reduce((sum, qId) => {
          const q = questions.find(item => item.id === qId)
          return sum + (q?.score || 0)
        }, 0),
        question_ids: selectedQuestions,
        student_ids: selectedStudents
      }
      await examAPI.create(data)
      message.success('创建考试成功')
      navigate('/teacher/exams')
    } catch (err) {
      message.error(err.response?.data?.detail || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const questionDataSource = questions.map(q => ({
    key: q.id,
    title: `[${q.id}] ${q.content}`,
    description: `${q.question_type === 'single' ? '单选' : q.question_type === 'multiple' ? '多选' : '判断'} - ${q.score}分`,
    type: q.question_type,
    score: q.score
  }))

  const studentDataSource = students.map(s => ({
    key: s.id,
    title: s.name,
    description: s.username
  }))

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/teacher/exams')}
          >
            返回列表
          </Button>
          <h2 style={{ margin: '16px 0 0 0' }}>创建考试</h2>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ duration: 60 }}
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="title"
                label="考试名称"
                rules={[{ required: true, message: '请输入考试名称' }]}
              >
                <Input placeholder="请输入考试名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="time_range"
                label="考试时间"
                rules={[{ required: true, message: '请选择考试时间' }]}
              >
                <RangePicker
                  showTime
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD HH:mm"
                  minuteStep={15}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="duration"
                label="考试时长（分钟）"
                rules={[{ required: true, message: '请输入考试时长' }]}
              >
                <InputNumber min={1} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="考试说明"
          >
            <TextArea rows={3} placeholder="请输入考试说明（可选）" />
          </Form.Item>

          <Form.Item label="选择题目">
            <Transfer
              dataSource={questionDataSource}
              targetKeys={selectedQuestions}
              onChange={setSelectedQuestions}
              render={(item) => (
                <span>
                  <Tag color={item.type === 'single' ? 'blue' : item.type === 'multiple' ? 'green' : 'orange'} style={{ marginRight: 8 }}>
                    {item.type === 'single' ? '单选' : item.type === 'multiple' ? '多选' : '判断'}
                  </Tag>
                  {item.title}
                  <span style={{ color: '#999', marginLeft: 8 }}>({item.score}分)</span>
                </span>
              )}
              listStyle={{ width: '100%', height: 300 }}
              showSearch
              titles={['可选题目', '已选题目']}
            />
            <div style={{ marginTop: 8, color: '#666' }}>
              已选 {selectedQuestions.length} 题，总分 {selectedQuestions.reduce((sum, qId) => {
                const q = questions.find(item => item.id === qId)
                return sum + (q?.score || 0)
              }, 0)} 分
            </div>
          </Form.Item>

          <Form.Item label="选择学生">
            <Transfer
              dataSource={studentDataSource}
              targetKeys={selectedStudents}
              onChange={setSelectedStudents}
              render={(item) => (
                <span>
                  {item.title}
                  <span style={{ color: '#999', marginLeft: 8 }}>({item.description})</span>
                </span>
              )}
              listStyle={{ width: '100%', height: 200 }}
              showSearch
              titles={['可选学生', '已选学生']}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button onClick={() => navigate('/teacher/exams')}>取消</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                创建考试
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default ExamCreate
