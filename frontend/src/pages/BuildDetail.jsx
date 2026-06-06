import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getBuild, getBuildWebSocket } from '../api.js'

export default function BuildDetail() {
  const { buildId } = useParams()
  const [build, setBuild] = useState(null)
  const [logs, setLogs] = useState([])
  const [steps, setSteps] = useState([])
  const [status, setStatus] = useState('pending')
  const logContainerRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    loadBuild()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [buildId])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  async function loadBuild() {
    const res = await getBuild(buildId)
    const b = res.build
    setBuild(b)
    setLogs(b.logs)
    setSteps(b.steps)
    setStatus(b.status)

    if (b.status === 'running' || b.status === 'pending') {
      connectWebSocket()
    }
  }

  function connectWebSocket() {
    const ws = getBuildWebSocket(buildId)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'log') {
        setLogs(prev => [...prev, data.line])
      } else if (data.type === 'status') {
        setStatus(data.status)
        if (data.status === 'success' || data.status === 'failed') {
          ws.close()
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
      }
    }

    ws.onclose = () => {
      wsRef.current = null
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

  if (!build) {
    return <div className="card">加载中...</div>
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
          <span className={`status-badge status-${status}`}>
            {status === 'pending' ? '等待中' :
             status === 'running' ? '运行中' :
             status === 'success' ? '成功' : '失败'}
          </span>
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
                 (step.status || 'pending') === 'success' ? '成功' : '失败'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>构建日志</h2>
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
