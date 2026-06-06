import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Typography,
  Tag,
  Divider,
  Statistic,
  Row,
  Col,
  message,
  Checkbox,
  Radio
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone
} from '@ant-design/icons'
import { studentAPI } from '../../api'

const { Title, Text } = Typography

function ExamResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchResult = async () => {
    setLoading(true)
    try {
      const res = await studentAPI.getResult(id)
      setResult(res.data)
    } catch (err) {
      message.error('获取成绩失败')
      navigate('/student/exams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResult()
  }, [id, navigate])

  if (!result) return null

  const getScoreColor = () => {
    const ratio = result.score / result.total_score
    if (ratio >= 0.9) return '#52c41a'
    if (ratio >= 0.6) return '#1890ff'
    return '#ff4d4f'
  }

  return (
    <div>
      <Card loading={loading}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/student/exams')}
          style={{ marginBottom: 16 }}
        >
          返回列表
        </Button>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8 }}>{result.exam.title}</Title>
          <Text type="secondary">
            提交时间：{new Date(result.submitted_at).toLocaleString('zh-CN')}
          </Text>
        </div>

        <Row gutter={24} style={{ marginBottom: 32 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="我的得分"
                value={result.score}
                valueStyle={{ color: getScoreColor(), fontSize: 32 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="总分"
                value={result.total_score}
                valueStyle={{ fontSize: 32 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="正确率"
                value={Math.round((result.score / result.total_score) * 100)}
                suffix="%"
                valueStyle={{ color: getScoreColor(), fontSize: 32 }}
              />
            </Card>
          </Col>
        </Row>

        <Divider orientation="left">答题详情</Divider>

        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {result.questions.map((q, idx) => (
            <Card
              key={q.id}
              style={{ marginBottom: 16 }}
              bodyStyle={{ padding: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ marginTop: 4 }}>
                  {q.is_correct ? (
                    <CheckCircleTwoTone twoToneColor="#52c41a" style={{ fontSize: 20 }} />
                  ) : (
                    <CloseCircleTwoTone twoToneColor="#ff4d4f" style={{ fontSize: 20 }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Tag color={q.question_type === 'single' ? 'blue' : q.question_type === 'multiple' ? 'green' : 'orange'}>
                      {q.question_type === 'single' ? '单选' : q.question_type === 'multiple' ? '多选' : '判断'}
                    </Tag>
                    <Text type="secondary">第 {idx + 1} 题</Text>
                    <Text type="secondary">（{q.score}分）</Text>
                    {q.is_correct ? (
                      <Text type="success">正确</Text>
                    ) : (
                      <Text type="danger">错误</Text>
                    )}
                  </div>
                  
                  <Text style={{ fontSize: 15, lineHeight: 1.8 }}>{q.content}</Text>

                  <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>您的答案：</Text>
                      <Text type={q.is_correct ? 'success' : 'danger'}>
                        {q.user_answer.length > 0
                          ? q.user_answer.map(i => String.fromCharCode(65 + i)).join(', ')
                          : '未作答'}
                      </Text>
                    </div>
                    {!q.is_correct && (
                      <div>
                        <Text strong>正确答案：</Text>
                        <Text type="success">
                          {q.correct_answer.map(i => String.fromCharCode(65 + i)).join(', ')}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default ExamResult
