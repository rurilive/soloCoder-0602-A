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
  Radio,
  Collapse
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone
} from '@ant-design/icons'
import { studentAPI } from '../../api'
import CodeEditor from '../../components/CodeEditor'

const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

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

        <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
                    <Tag color={
                      q.question_type === 'single' ? 'blue' :
                      q.question_type === 'multiple' ? 'green' :
                      q.question_type === 'programming' ? 'purple' : 'orange'
                    }>
                      {
                        q.question_type === 'single' ? '单选' :
                        q.question_type === 'multiple' ? '多选' :
                        q.question_type === 'programming' ? '编程' : '判断'
                      }
                    </Tag>
                    <Text type="secondary">第 {idx + 1} 题</Text>
                    <Text type="secondary">（{q.score}分）</Text>
                    {q.question_type === 'programming' ? (
                      <Text type={q.is_correct ? 'success' : 'danger'}>
                        得分: {q.user_score || 0} / {q.score}
                      </Text>
                    ) : (
                      q.is_correct ? (
                        <Text type="success">正确</Text>
                      ) : (
                        <Text type="danger">错误</Text>
                      )
                    )}
                  </div>
                  
                  <Text style={{ fontSize: 15, lineHeight: 1.8 }}>{q.content}</Text>

                  {q.question_type === 'programming' ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong>您的代码：</Text>
                      </div>
                      <CodeEditor
                        height="250px"
                        value={q.user_answer || ''}
                        readOnly={true}
                      />
                      
                      {q.judge_details && (
                        <Collapse style={{ marginTop: 12 }}>
                          <Panel header="判题详情" key="1">
                            {q.judge_details.results.map((result, ridx) => (
                              <Card key={ridx} size="small" style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <Tag color={result.passed ? 'green' : 'red'}>
                                    测试用例 {ridx + 1}: {result.passed ? '通过' : '失败'}
                                  </Tag>
                                  <Text type="secondary">状态: {result.status}</Text>
                                  <Text type="secondary">得分: {result.score}</Text>
                                </div>
                                <div>
                                  <Text type="secondary">输入：</Text>
                                  <pre style={{ background: '#f5f5f5', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                    {result.input || '（无）'}
                                  </pre>
                                </div>
                                <div style={{ marginTop: 4 }}>
                                  <Text type="secondary">期望输出：</Text>
                                  <pre style={{ background: '#f5f5f5', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                    {result.expected_output}
                                  </pre>
                                </div>
                                <div style={{ marginTop: 4 }}>
                                  <Text type="secondary">实际输出：</Text>
                                  <pre style={{ background: result.passed ? '#f6ffed' : '#fff2f0', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                    {result.actual_output || '（无）'}
                                  </pre>
                                </div>
                                {result.error && (
                                  <div style={{ marginTop: 4 }}>
                                    <Text type="secondary">错误信息：</Text>
                                    <pre style={{ color: '#ff4d4f', background: '#fff1f0', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                      {result.error}
                                    </pre>
                                  </div>
                                )}
                              </Card>
                            ))}
                          </Panel>
                        </Collapse>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong>您的答案：</Text>
                        <Text type={q.is_correct ? 'success' : 'danger'}>
                          {q.user_answer && q.user_answer.length > 0
                            ? q.user_answer.map(i => String.fromCharCode(65 + i)).join(', ')
                            : '未作答'}
                        </Text>
                      </div>
                      {!q.is_correct && (
                        <div>
                          <Text strong>正确答案：</Text>
                          <Text type="success">
                            {q.correct_answer && q.correct_answer.map(i => String.fromCharCode(65 + i)).join(', ')}
                          </Text>
                        </div>
                      )}
                    </div>
                  )}
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
