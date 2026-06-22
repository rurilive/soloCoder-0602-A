import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Table, Tag, Space, Card, Row, Col, Typography, Empty, BackTop, message, Tooltip } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { executionApi, dagApi } from '../api'
import type { TaskExecution, DAG, NodeLog, WsMessage, WsLogMessage, WsStatusUpdateMessage, WsExecutionCompleteMessage } from '../types'

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
  const [logs, setLogs] = useState<NodeLog[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const wsExecutionIdRef = useRef<number | null>(null)
  const logsRef = useRef<NodeLog[]>([])
  const selectedExecutionRef = useRef<TaskExecution | null>(null)
  const executionsRef = useRef<TaskExecution[]>([])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  useEffect(() => {
    selectedExecutionRef.current = selectedExecution
  }, [selectedExecution])

  useEffect(() => {
    executionsRef.current = executions
  }, [executions])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'success'
      case 'failed': return 'error'
      case 'running': return 'processing'
      case 'skipped': return 'warning'
      case 'cancelled': return 'default'
      default: return 'default'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success': return '成功'
      case 'failed': return '失败'
      case 'running': return '运行中'
      case 'skipped': return '已跳过'
      case 'cancelled': return '已取消'
      case 'pending': return '等待中'
      default: return status
    }
  }

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

  const getTimelineData = (nodeLogs: NodeLog[]) => {
    if (!nodeLogs || nodeLogs.length === 0) return null

    const sortedLogs = [...nodeLogs].sort((a, b) => {
      if (!a.started_at) return 1
      if (!b.started_at) return -1
      return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    })

    const times = sortedLogs.flatMap(l => [l.started_at, l.finished_at]).filter(Boolean) as string[]
    if (times.length === 0) return null

    const minTime = Math.min(...times.map(t => new Date(t).getTime()))
    const maxTime = Math.max(
      ...times.map(t => new Date(t).getTime()),
      selectedExecution?.finished_at ? new Date(selectedExecution.finished_at).getTime() : Date.now()
    )
    const totalDuration = maxTime - minTime || 1

    const timelineItems = sortedLogs.map(log => {
      const start = log.started_at ? new Date(log.started_at).getTime() : null
      const end = log.finished_at ? new Date(log.finished_at).getTime() : null
      const left = start ? ((start - minTime) / totalDuration) * 100 : 0
      const width = start && end ? ((end - start) / totalDuration) * 100 : (log.status === 'running' ? ((Date.now() - minTime) / totalDuration) * 100 - left : 5)

      return {
        ...log,
        left: Math.max(0, Math.min(100, left)),
        width: Math.max(2, Math.min(100 - left, width))
      }
    })

    return {
      minTime,
      maxTime,
      totalDuration,
      items: timelineItems
    }
  }

  const renderTimeline = () => {
    const timelineData = getTimelineData(logs)
    if (!timelineData || timelineData.items.length === 0) return null

    const { items, minTime, maxTime } = timelineData

    const timeMarkers = []
    const markerCount = 5
    for (let i = 0; i <= markerCount; i++) {
      const time = minTime + (maxTime - minTime) * (i / markerCount)
      timeMarkers.push({
        left: (i / markerCount) * 100,
        label: dayjs(time).format('HH:mm:ss')
      })
    }

    return (
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>执行时间轴（并行视图）</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            总耗时: {((maxTime - minTime) / 1000).toFixed(1)}s
          </Text>
        </div>
        <div style={{ position: 'relative', height: `${items.length * 24 + 20}px`, marginBottom: 8 }}>
          {timeMarkers.map((marker, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: `${marker.left}%`,
                top: 0,
                bottom: 0,
                borderLeft: '1px dashed #e8e8e8',
                fontSize: 10,
                color: '#999',
                paddingLeft: 4,
                zIndex: 0
              }}
            >
              {marker.label}
            </div>
          ))}
          {items.map((item, idx) => (
            <Tooltip
              key={item.node_id}
              title={`${item.node_name} - ${getStatusText(item.status)}`}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${item.left}%`,
                  top: `${idx * 24 + 16}px`,
                  width: `${item.width}%`,
                  height: 18,
                  borderRadius: 3,
                  background: item.status === 'success' ? '#52c41a'
                    : item.status === 'failed' ? '#ff4d4f'
                    : item.status === 'running' ? '#1890ff'
                    : item.status === 'cancelled' ? '#bfbfbf'
                    : item.status === 'skipped' ? '#faad14'
                    : '#d9d9d9',
                  cursor: 'pointer',
                  opacity: 0.85,
                  transition: 'opacity 0.2s',
                  zIndex: 1
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.85' }}
              >
                <div style={{
                  padding: '0 6px',
                  fontSize: 11,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '18px',
                  fontWeight: 500
                }}>
                  {item.node_name}
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    )
  }

  const loadLogs = async (executionId: number) => {
    try {
      setLogsLoading(true)
      const res = await executionApi.getLogs(executionId)
      setLogs(res.data)
      logsRef.current = res.data
    } catch (error) {
      setLogs([])
      logsRef.current = []
    } finally {
      setLogsLoading(false)
    }
  }

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (_) {
        // ignore
      }
      wsRef.current = null
    }
    wsExecutionIdRef.current = null
    setWsConnected(false)
  }, [])

  const updateExecutionInList = (executionId: number, patch: Partial<TaskExecution>) => {
    setExecutions(prev => {
      const updated = prev.map(e =>
        e.id === executionId ? { ...e, ...patch } : e
      )
      executionsRef.current = updated
      return updated
    })

    setSelectedExecution(prev => {
      if (prev && prev.id === executionId) {
        const updated = { ...prev, ...patch }
        selectedExecutionRef.current = updated
        return updated
      }
      return prev
    })
  }

  const handleWsMessage = (event: MessageEvent) => {
    try {
      const msg: WsMessage = JSON.parse(event.data)
      const currentExecution = selectedExecutionRef.current

      if (msg.type === 'log') {
        const logMsg = msg as WsLogMessage
        setLogs(prevLogs => {
          const existingIdx = prevLogs.findIndex(l => l.node_id === logMsg.node_id)
          if (existingIdx >= 0) {
            const updated = [...prevLogs]
            const item = { ...updated[existingIdx] }
            item.log = item.log
              ? `${item.log}\n${logMsg.message}`
              : logMsg.message
            updated[existingIdx] = item
            logsRef.current = updated
            return updated
          } else {
            const newItem: NodeLog = {
              node_id: logMsg.node_id,
              node_name: logMsg.node_name,
              status: 'pending',
              skip_reason: '',
              output_vars: {},
              started_at: null,
              finished_at: null,
              log: logMsg.message
            }
            const updated = [...prevLogs, newItem]
            logsRef.current = updated
            return updated
          }
        })
      }

      if (msg.type === 'status_update') {
        const statusMsg = msg as WsStatusUpdateMessage
        const nodeId = statusMsg.node_id
        if (nodeId !== null && nodeId !== undefined) {
          setLogs(prevLogs => {
            const existingIdx = prevLogs.findIndex(l => l.node_id === nodeId)
            if (existingIdx >= 0) {
              const updated = [...prevLogs]
              updated[existingIdx] = {
                ...updated[existingIdx],
                status: statusMsg.status,
                node_name: statusMsg.node_name || updated[existingIdx].node_name,
                started_at: statusMsg.started_at ?? updated[existingIdx].started_at,
                finished_at: statusMsg.finished_at ?? updated[existingIdx].finished_at
              }
              logsRef.current = updated
              return updated
            } else {
              const newItem: NodeLog = {
                node_id: nodeId,
                node_name: statusMsg.node_name || `节点#${nodeId}`,
                status: statusMsg.status,
                skip_reason: '',
                output_vars: {},
                started_at: statusMsg.started_at,
                finished_at: statusMsg.finished_at,
                log: ''
              }
              const updated = [...prevLogs, newItem]
              logsRef.current = updated
              return updated
            }
          })
        }
      }

      if (msg.type === 'execution_complete') {
        const completeMsg = msg as WsExecutionCompleteMessage
        if (currentExecution && currentExecution.id === completeMsg.execution_id) {
          updateExecutionInList(completeMsg.execution_id, {
            status: completeMsg.status as any,
            finished_at: completeMsg.finished_at
          })
          setTimeout(() => {
            loadExecutions()
            loadLogs(completeMsg.execution_id)
          }, 300)
        }
        closeWebSocket()
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }

  const openWebSocket = useCallback((executionId: number) => {
    if (wsExecutionIdRef.current === executionId && wsRef.current) {
      return
    }
    closeWebSocket()

    try {
      const wsUrl = executionApi.getWsUrl(executionId)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setWsConnected(true)
      }

      ws.onmessage = handleWsMessage

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setWsConnected(false)
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        wsExecutionIdRef.current = null
      }

      wsRef.current = ws
      wsExecutionIdRef.current = executionId
    } catch (err) {
      console.error('Failed to create WebSocket:', err)
    }
  }, [closeWebSocket])

  useEffect(() => {
    loadDag()
    loadExecutions()
    return () => {
      closeWebSocket()
    }
  }, [dagId])

  useEffect(() => {
    if (!selectedExecution) return

    loadLogs(selectedExecution.id)

    if (selectedExecution.status === 'running') {
      openWebSocket(selectedExecution.id)
    } else {
      closeWebSocket()
    }
  }, [selectedExecution?.id, selectedExecution?.status])

  const handleRetry = async () => {
    if (!selectedExecution) return
    if (selectedExecution.status === 'running') {
      message.warning('执行正在运行中，无法重试')
      return
    }

    try {
      setRetrying(true)
      const res = await executionApi.retry(selectedExecution.id)
      message.success(`已触发重试，当前重试次数: ${res.data.retry_count}`)
      updateExecutionInList(selectedExecution.id, {
        status: 'running',
        retry_count: res.data.retry_count,
        started_at: res.data.started_at || dayjs().toISOString(),
        finished_at: null
      })
      loadLogs(selectedExecution.id)
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '重试失败')
    } finally {
      setRetrying(false)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70
    },
    {
      title: '重试',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 60,
      render: (count: number) => count > 0 ? <Tag color="orange">{count}</Tag> : <Text type="secondary">-</Text>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
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
      width: 160,
      render: (text: string | null) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '结束时间',
      dataIndex: 'finished_at',
      key: 'finished_at',
      width: 160,
      render: (text: string | null) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
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
        <Space>
          {wsConnected && (
            <Tag icon={<SyncOutlined spin />} color="processing">
              实时连接
            </Tag>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadExecutions}>
            刷新
          </Button>
        </Space>
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
                ? `执行 #${selectedExecution.id}${selectedExecution.retry_count > 0 ? ` (重试 ${selectedExecution.retry_count} 次)` : ''} 日志`
                : '日志详情'
            }
            size="small"
            extra={
              selectedExecution && (
                <Space>
                  {selectedExecution.status !== 'running' && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<SyncOutlined spin={retrying} />}
                      onClick={handleRetry}
                      loading={retrying}
                      disabled={retrying}
                    >
                      重新执行
                    </Button>
                  )}
                  <Tag color={getStatusColor(selectedExecution.status)}>
                    {getStatusText(selectedExecution.status)}
                  </Tag>
                </Space>
              )
            }
          >
            {selectedExecution ? (
              <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                {logsLoading ? (
                  <Empty description="加载中..." />
                ) : logs.length > 0 ? (
                  <>
                    {renderTimeline()}
                    {[...logs]
                      .sort((a, b) => {
                        if (!a.started_at) return 1
                        if (!b.started_at) return -1
                        return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
                      })
                      .map((log, idx) => (
                    <Card
                      key={`${log.node_id}-${idx}`}
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
                              {log.started_at && log.finished_at && (
                                <span style={{ marginLeft: 4 }}>
                                  ({((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000).toFixed(1)}s)
                                </span>
                              )}
                            </Text>
                          )}
                        </Space>
                      }
                    >
                      {log.status === 'skipped' && log.skip_reason && (
                        <div style={{
                          padding: '8px 12px',
                          marginBottom: 8,
                          background: '#fff7e6',
                          border: '1px solid #ffd591',
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#d46b08'
                        }}>
                          <strong>⏭ 跳过原因:</strong> {log.skip_reason}
                        </div>
                      )}

                      {log.output_vars && Object.keys(log.output_vars).length > 0 && (
                        <div style={{
                          padding: '8px 12px',
                          marginBottom: 8,
                          background: '#e6f7ff',
                          border: '1px solid #91d5ff',
                          borderRadius: 4
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#096dd9', marginBottom: 4 }}>
                            📤 输出变量 ({Object.keys(log.output_vars).length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {Object.entries(log.output_vars).map(([key, value]) => (
                              <Tag key={key} color="blue" style={{ margin: 0, fontSize: 11 }}>
                                {key} = {String(value)}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="log-panel">
                        {log.log || '(无日志输出)'}
                      </div>
                    </Card>
                  ))}
                  </>
                ) : (
                  <Empty description={selectedExecution.status === 'running' ? '等待日志输出...' : '暂无日志'} />
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
