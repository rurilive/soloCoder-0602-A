import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Radio,
  Checkbox,
  message,
  Typography,
  Space,
  Divider,
  Modal,
  Statistic,
  Row,
  Col
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { studentAPI } from '../../api'

const { Title, Text } = Typography
const { Group: RadioGroup } = Radio
const { Group: CheckboxGroup } = Checkbox

function ExamPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [examData, setExamData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)

  const fetchExam = useCallback(async () => {
    setLoading(true)
    try {
      const res = await studentAPI.startExam(id)
      setExamData(res.data)
      setTimeLeft(res.data.exam.duration * 60)
    } catch (err) {
      message.error(err.response?.data?.detail || '获取考试信息失败')
      navigate('/student/exams')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    fetchExam()
  }, [fetchExam])

  useEffect(() => {
    if (timeLeft <= 0 || !examData) return
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [examData, timeLeft])

  const handleSubmit = async (auto = false) => {
    if (submitting) return
    
    Modal.confirm({
      title: auto ? '考试时间结束，自动提交' : '确认提交',
      content: `您已完成 ${Object.keys(answers).length} / ${examData?.questions?.length || 0} 道题目，确认提交吗？`,
      okText: '确认提交',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true)
        try {
          const res = await studentAPI.submitExam(id, { answers })
          message.success(`提交成功！您的得分：${res.data.score} / ${res.data.total_score}`)
          navigate(`/student/exams/${id}/result`)
        } catch (err) {
          message.error(err.response?.data?.detail || '提交失败')
          setSubmitting(false)
        }
      }
    })
  }

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }))
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!examData) return null

  const questions = examData.questions || []
  const currentQuestion = questions[currentIndex]

  return (
    <div>
      <Card loading={loading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/student/exams')}
          >
            返回列表
          </Button>
          <Statistic
            title="剩余时间"
            value={formatTime(timeLeft)}
            prefix={<ClockCircleOutlined style={{ color: timeLeft < 300 ? '#ff4d4f' : '#1890ff' }} />}
            valueStyle={{ color: timeLeft < 300 ? '#ff4d4f' : undefined, fontSize: 20 }}
          />
        </div>

        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          {examData.exam.title}
        </Title>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Text type="secondary">
            共 {questions.length} 题，总分 {examData.exam.total_score} 分
          </Text>
        </div>

        <Row gutter={24}>
          <Col span={18}>
            <Card
              title={`第 ${currentIndex + 1} 题 / 共 ${questions.length} 题`}
              extra={
                <Tag color={currentQuestion.question_type === 'single' ? 'blue' : currentQuestion.question_type === 'multiple' ? 'green' : 'orange'}>
                  {currentQuestion.question_type === 'single' ? '单选题' : currentQuestion.question_type === 'multiple' ? '多选题' : '判断题'}
                </Tag>
              }
            >
              <div style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 16, lineHeight: 1.8 }}>
                  {currentQuestion.content}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  （{currentQuestion.score}分）
                </Text>
              </div>

              <Divider />

              <div style={{ padding: '0 16px' }}>
                {currentQuestion.question_type === 'multiple' ? (
                  <CheckboxGroup
                    value={answers[currentQuestion.id] || []}
                    onChange={(checkedValues) => handleAnswer(currentQuestion.id, checkedValues)}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {currentQuestion.options.map((opt, idx) => (
                        <Checkbox key={idx} value={idx} style={{ fontSize: 15, lineHeight: 2 }}>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </Checkbox>
                      ))}
                    </Space>
                  </CheckboxGroup>
                ) : (
                  <RadioGroup
                    value={answers[currentQuestion.id] !== undefined ? answers[currentQuestion.id][0] : undefined}
                    onChange={(e) => handleAnswer(currentQuestion.id, [e.target.value])}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {currentQuestion.options.map((opt, idx) => (
                        <Radio key={idx} value={idx} style={{ fontSize: 15, lineHeight: 2 }}>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </Radio>
                      ))}
                    </Space>
                  </RadioGroup>
                )}
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <Button
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
              >
                上一题
              </Button>
              {currentIndex < questions.length - 1 ? (
                <Button type="primary" onClick={() => setCurrentIndex(prev => prev + 1)}>
                  下一题
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleSubmit(false)}
                  loading={submitting}
                >
                  交卷
                </Button>
              )}
            </div>
          </Col>

          <Col span={6}>
            <Card title="答题卡">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {questions.map((q, idx) => (
                  <Button
                    key={q.id}
                    type={currentIndex === idx ? 'primary' : answers[q.id] ? 'default' : 'text'}
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      width: 36,
                      height: 36,
                      padding: 0,
                      borderColor: answers[q.id] ? '#52c41a' : undefined
                    }}
                  >
                    {idx + 1}
                  </Button>
                ))}
              </div>
              <Divider />
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <div>
                  <Text type="secondary">已答</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: '#52c41a' }}>
                    {Object.keys(answers).length}
                  </div>
                </div>
                <div>
                  <Text type="secondary">未答</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ff4d4f' }}>
                    {questions.length - Object.keys(answers).length}
                  </div>
                </div>
              </div>
              <Divider />
              <Button
                type="primary"
                block
                icon={<CheckCircleOutlined />}
                onClick={() => handleSubmit(false)}
                loading={submitting}
              >
                交卷
              </Button>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default ExamPage
