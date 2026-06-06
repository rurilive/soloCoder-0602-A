import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Descriptions,
  Table,
  Tag,
  message,
  Typography,
  Space,
  Divider
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { examAPI } from '../../api'

const { Title, Text } = Typography

function ExamDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [participations, setParticipations] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await examAPI.get(id)
      setExam(res.data)
      setParticipations(res.data.participations || [])
    } catch (err) {
      message.error('获取考试详情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const questionColumns = [
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
        const colorMap = { single: 'blue', multiple: 'green', true_false: 'orange' }
        const labelMap = { single: '单选题', multiple: '多选题', true_false: '判断题' }
        return <Tag color={colorMap[type]}>{labelMap[type]}</Tag>
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
    }
  ]

  const participationColumns = [
    {
      title: '学生',
      dataIndex: ['student', 'name'],
      width: 120
    },
    {
      title: '用户名',
      dataIndex: ['student', 'username'],
      width: 120
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          pending: { text: '未开始', color: 'default' },
          started: { text: '进行中', color: 'processing' },
          submitted: { text: '已提交', color: 'success' }
        }
        const info = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      width: 180,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-'
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      width: 180,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-'
    },
    {
      title: '得分',
      dataIndex: 'score',
      width: 100,
      render: (score) => score !== null ? score : '-'
    }
  ]

  if (!exam) return null

  return (
    <div>
      <Card loading={loading}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/teacher/exams')}
          style={{ marginBottom: 16 }}
        >
          返回列表
        </Button>

        <Title level={3} style={{ marginTop: 0 }}>{exam.title}</Title>
        {exam.description && <Text type="secondary">{exam.description}</Text>}

        <Divider />

        <Descriptions bordered column={2} size="small" style={{ marginBottom: 24 }}>
          <Descriptions.Item label="创建者">{exam.creator?.name}</Descriptions.Item>
          <Descriptions.Item label="总分">{exam.total_score} 分</Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {new Date(exam.start_time).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">
            {new Date(exam.end_time).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="考试时长">{exam.duration} 分钟</Descriptions.Item>
          <Descriptions.Item label="题目数量">{exam.questions?.length || 0} 题</Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">题目列表</Divider>
        <Table
          columns={questionColumns}
          dataSource={exam.questions || []}
          rowKey="id"
          pagination={false}
          size="small"
        />

        <Divider orientation="left">考试情况</Divider>
        <Table
          columns={participationColumns}
          dataSource={participations}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  )
}

export default ExamDetail
