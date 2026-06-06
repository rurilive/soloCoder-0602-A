import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getBuild } from '../api.js'
import { useWebSocket } from '../hooks/useWebSocket.js'
import ErrorAlert from '../components/ErrorAlert.jsx'

export default function BuildDetail() {
  const { buildId } = useParams()
  const [build, setBuild] = useState(null)
  const [logs, setLogs] = useState([])
  const [steps, setSteps] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const logContainerRef = useRef(null)

  const handleWebSocketMessage = useCallback((data) => {
    if (data.type === 'log') {
      setLogs(prev => [...prev, data.line])
    } else if (data.type === 'status') {
      setStatus(data.status)
      if (data.status === 'success' || data.status === 'failed') {
        closeWs()
      }
    } else if (data.type === 'step_start') {
      setSteps(prev => {
        const newSteps = [...prev]
        if (newSteps[data.step_index]) {
          newSteps[data.step_index] = {
            ...newSteps[data.step_index],
            status: 'running'
          }
        }
        return newSteps
      })
    } else if (data.type === 'step_end') {
      setSteps(prev => {
        const newSteps = [...prev]
        if (newSteps[data.step_index]) {
          newSteps[data.step_index] = {
            ...newSteps[data.step_index],
            status: data.status
          }
        }
        return newSteps
      })
    } else if (data.type === 'step_skip') {
      setSteps(prev => {
        const newSteps = [...prev]
        if (newSteps[data.step_index]) {
          newSteps[data.step_index] = {
            ...newSteps[data.step_index],
            status: 'skipped'
          }
        }
        return newSteps
      })
    }
  }, [])

  const { isConnected, reconnecting, close: closeWs } = useWebSocket(
    (status === 'running' || status === 'pending') ? buildId : null,
    handleWebSocketMessage
  )

  useEffect(() => {
    loadBuild()
  }, [buildId])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  async function loadBuild() {
    setLoading(true)
    setError(null)
    try {
      const res = await getBuild(buildId)
      const b = res.build
      setBuild(b)
      setLogs(b.logs)
      setSteps(b.steps)
      setStatus(b.status)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function getLogClass(line) {
    if (line.includes('[SUCCESS]') || line.includes('success')) return 'success'
    if (line.includes('[INFO]') || line.includes('$')) return 'info'
    return ''
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={loadBuild} />
  }

  if (!build) {
    return null
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">项目列表</Link>
        <span> / </span>
        <Link to={`/projects/${build.project_id}`}>{build.project_name}</Link>
        <span> / </span>
        <span>构建 #{build.id}</span>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>
            {build.project_name} - 构建 #{build.id}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(status === 'running' || status === 'pending') && (
              <span style={{ fontSize: '12px', color: '#8b949e' }}>
                {reconnecting ? '🔄 重新连接中...' : isConnected ? '🟢 实时连接' : '🔴 连接断开'}
              </span>
            )}
            <span className={`status-badge status-${status}`}>
              {status === 'pending' ? '等待中' :
               status === 'running' ? '运行中' :
               status === 'success' ? '成功' : '失败'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '14px', color: '#8b949e', marginBottom: '16px' }}>
          开始于 {formatDate(build.started_at)}
          {build.finished_at && ` · 完成于 ${formatDate(build.finished_at)}`}
        </div>

        <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>构建步骤</h3>
        <div className="steps-container">
          {steps.map((step, index) => (
            <div key={index} className="step-row">
              <span className="step-name">{step.name}</span>
              <span className={`status-badge status-${step.status || 'pending'}`}>
                {(step.status || 'pending') === 'pending' ? '等待中' :
                 (step.status || 'pending') === 'running' ? '运行中' :
                 (step.status || 'pending') === 'success' ? '成功' :
                 (step.status || 'pending') === 'skipped' ? '已跳过' : '失败'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>构建日志</h2>
          {reconnecting && (
            <span style={{ fontSize: '12px', color: '#d29922' }}>
              🔄 WebSocket 正在重新连接...
            </span>
          )}
        </div>
        <div className="log-container" ref={logContainerRef}>
          {logs.length === 0 ? (
            <div style={{ color: '#8b949e' }}>等待日志输出...</div>
          ) : (
            logs.map((line, index) => (
              <div key={index} className={`log-line ${getLogClass(line)}`}>
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
