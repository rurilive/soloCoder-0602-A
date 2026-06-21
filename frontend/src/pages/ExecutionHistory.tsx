import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Table, Tag, Space, Card, Row, Col, Typography, Empty, BackTop } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { executionApi, dagApi } from '../api'
import type { TaskExecution, DAG } from '../types'

const { Title, Text } = Typography

const ExecutionHistory = () => {
  const { id } = useParams<{ id: string }>()
  const dagId = Number(id)
  const navigate = useNavigate()

  const [dag, setDag] = useState<DAG | null>(null)
  const [executions, setExecutions] = useState<TaskExecution[]>([])
  const [selectedExecution, setSelectedExecution] = useState<TaskExecution | null>(null)
  const [loading, setLoading] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logs, setLogs] = useState<any[]>([])

  const loadExecutions = async () => {
    try {
      setLoading(true)
      const res = await executionApi.listByDag(dagId)
      setExecutions(res.data)
      if (res.data.length > 0 && !selectedExecution) {
        setSelectedExecution(res.data[0])
      }
    } catch (error) {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const loadDag = async () => {
    try {
      const res = await dagApi.get(dagId)
      setDag(res.data)
    } catch (error) {
      // silent
    }
  }

  const loadLogs = async (executionId: number) => {
    try {
      setLogsLoading(true)
      const res = await executionApi.getLogs(executionId)
      setLogs(res.data)
    } catch (error) {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    loadDag()
    loadExecutions()
  }, [dagId])

  useEffect(() => {
    if (selectedExecution) {
      loadLogs(selectedExecution.id)
    }
  }, [selectedExecution])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'success'
      case 'failed': return 'error'
      case 'running': return 'processing'
      case 'skipped': return 'warning'
      default: return 'default'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success': return '成功'
      case 'failed': return '失败'
      case 'running': return '运行中'
      case 'skipped': return '已跳过'
      case 'pending': return '等待中'
      default: return status
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      )
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 180,
      render: (text: string | null) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '结束时间',
      dataIndex: 'finished_at',
      key: 'finished_at',
      width: 180,
      render: (text: string | null) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
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
      width: 100,
      render: (_: any, record: TaskExecution) => (
        <Button
          type="link"
          size="small"
          onClick={() => setSelectedExecution(record)}
        >
          查看日志
        </Button>
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/dags/${dagId}`)}>
            返回编辑器
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {dag?.name} - 执行历史
          </Title>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={loadExecutions}>
          刷新
        </Button>
      </div>

      <Row gutter={16}>
        <Col span={10}>
          <Card title="执行记录" size="small">
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={executions}
              pagination={{ pageSize: 10 }}
              onRow={(record) => ({
                onClick: () => setSelectedExecution(record),
                style: {
                  cursor: 'pointer',
                  background: selectedExecution?.id === record.id ? '#e6f7ff' : undefined
                }
              })}
            />
          </Card>
        </Col>

        <Col span={14}>
          <Card
            title={
              selectedExecution
                ? `执行 #${selectedExecution.id} 日志`
                : '日志详情'
            }
            size="small"
            extra={
              selectedExecution && (
                <Tag color={getStatusColor(selectedExecution.status)}>
                  {getStatusText(selectedExecution.status)}
                </Tag>
              )
            }
          >
            {selectedExecution ? (
              <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                {logsLoading ? (
                  <Empty description="加载中..." />
                ) : logs.length > 0 ? (
                  logs.map((log, idx) => (
                    <Card
                      key={idx}
                      size="small"
                      style={{ marginBottom: 12 }}
                      title={
                        <Space>
                          <Text strong>{log.node_name}</Text>
                          <Tag color={getStatusColor(log.status)}>
                            {getStatusText(log.status)}
                          </Tag>
                          {log.started_at && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(log.started_at).format('HH:mm:ss')}
                              {log.finished_at && ` → ${dayjs(log.finished_at).format('HH:mm:ss')}`}
                            </Text>
                          )}
                        </Space>
                      }
                    >
                      <div className="log-panel">
                        {log.log || '(无日志输出)'}
                      </div>
                    </Card>
                  ))
                ) : (
                  <Empty description="暂无日志" />
                )}
              </div>
            ) : (
              <Empty description="请选择一个执行记录查看日志" />
            )}
          </Card>
        </Col>
      </Row>

      <BackTop />
    </div>
  )
}

export default ExecutionHistory
