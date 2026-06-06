import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Card,
  Tag,
  Space,
  Popconfirm,
  message,
  Typography
} from 'antd'
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons'
import { examAPI } from '../../api'

const { Title } = Typography

function ExamList() {
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchExams = async () => {
    setLoading(true)
    try {
      const res = await examAPI.list()
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

  const handleDelete = async (id) => {
    try {
      await examAPI.delete(id)
      message.success('删除成功')
      fetchExams()
    } catch (err) {
      message.error('删除失败')
    }
  }

  const getExamStatus = (exam) => {
    const now = new Date()
    const start = new Date(exam.start_time)
    const end = new Date(exam.end_time)
    if (now < start) return { text: '未开始', color: 'default' }
    if (now > end) return { text: '已结束', color: 'default' }
    return { text: '进行中', color: 'processing' }
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
      width: 100,
      render: (_, record) => {
        const status = getExamStatus(record)
        return <Tag color={status.color}>{status.text}</Tag>
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
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/teacher/exams/${record.id}`)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除该考试？"
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

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>考试管理</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/teacher/exams/create')}>
            创建考试
          </Button>
        </div>
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

export default ExamList
