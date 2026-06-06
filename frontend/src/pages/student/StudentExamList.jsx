import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Card,
  Tag,
  Space,
  message,
  Typography,
  Tooltip
} from 'antd'
import { PlayCircleOutlined, EyeOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { studentAPI } from '../../api'

const { Title } = Typography

function StudentExamList() {
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchExams = async () => {
    setLoading(true)
    try {
      const res = await studentAPI.getExams()
      setExams(res.data)
    } catch (err) {
      message.error('获取考试列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExams()
  }, [])

  const statusMap = {
    not_started: { text: '未开始', color: 'default', icon: <ClockCircleOutlined /> },
    available: { text: '可参加', color: 'success', icon: <PlayCircleOutlined /> },
    in_progress: { text: '进行中', color: 'processing', icon: <PlayCircleOutlined /> },
    ended: { text: '已结束', color: 'default', icon: null },
    submitted: { text: '已提交', color: 'success', icon: <EyeOutlined /> }
  }

  const handleStartExam = (exam) => {
    if (exam.status === 'submitted') {
      navigate(`/student/exams/${exam.id}/result`)
    } else if (['available', 'in_progress'].includes(exam.status)) {
      navigate(`/student/exams/${exam.id}`)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60
    },
    {
      title: '考试名称',
      dataIndex: 'title',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status) => {
        const info = statusMap[status] || { text: status, color: 'default' }
        return <Tag color={info.color} icon={info.icon}>{info.text}</Tag>
      }
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 180,
      render: (t) => new Date(t).toLocaleString('zh-CN')
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 180,
      render: (t) => new Date(t).toLocaleString('zh-CN')
    },
    {
      title: '时长(分钟)',
      dataIndex: 'duration',
      width: 100
    },
    {
      title: '总分',
      dataIndex: 'total_score',
      width: 80
    },
    {
      title: '得分',
      dataIndex: 'score',
      width: 80,
      render: (score) => score !== null && score !== undefined ? score : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => {
        const canStart = ['available', 'in_progress'].includes(record.status)
        const canView = record.status === 'submitted'
        const canNotStart = record.status === 'not_started' || record.status === 'ended'
        
        if (canStart) {
          return (
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleStartExam(record)}
            >
              {record.status === 'in_progress' ? '继续答题' : '开始考试'}
            </Button>
          )
        }
        
        if (canView) {
          return (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleStartExam(record)}
            >
              查看成绩
            </Button>
          )
        }

        if (canNotStart) {
          return (
            <Tooltip title={record.status === 'not_started' ? '考试尚未开始' : '考试已结束'}>
              <Button size="small" disabled>
                {record.status === 'not_started' ? '未开始' : '已结束'}
              </Button>
            </Tooltip>
          )
        }

        return null
      }
    }
  ]

  return (
    <div>
      <Card>
        <Title level={3} style={{ margin: '0 0 16px 0' }}>我的考试</Title>
        <Table
          columns={columns}
          dataSource={exams}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  )
}

export default StudentExamList
