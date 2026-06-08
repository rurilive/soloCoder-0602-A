import { useState, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import MetricChart from './components/MetricChart'
import AlertBanner from './components/AlertBanner'
import ThresholdModal from './components/ThresholdModal'
import TimeRangeSelector from './components/TimeRangeSelector'
import { METRIC_CONFIGS, isInAlert } from './utils/thresholds'

const MAX_DATA_POINTS = 60
const WS_URL = 'ws://localhost:1111/ws'
const API_URL = 'http://localhost:1111'

export default function App() {
  const [data, setData] = useState([])
  const [thresholds, setThresholds] = useState({})
  const [currentAlerts, setCurrentAlerts] = useState([])
  const [showAlerts, setShowAlerts] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isLive, setIsLive] = useState(true)
  const [timeRange, setTimeRange] = useState({ start: null, end: null, downsample: null })
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { isConnected, lastMessage } = useWebSocket(WS_URL)

  useEffect(() => {
    fetch(`${API_URL}/thresholds`)
      .then((res) => res.json())
      .then((data) => setThresholds(data || {}))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLive || !lastMessage) return
    if (lastMessage.type === 'metrics') {
      const newData = lastMessage.data
      setData((prev) => {
        const updated = [...prev, newData]
        if (updated.length > MAX_DATA_POINTS) {
          return updated.slice(updated.length - MAX_DATA_POINTS)
        }
        return updated
      })

      if (lastMessage.alerts && lastMessage.alerts.length > 0) {
        setCurrentAlerts(lastMessage.alerts)
        setShowAlerts(true)
      }
    }
  }, [lastMessage, isLive])

  const fetchHistoryData = async (start, end, downsample) => {
    setLoadingHistory(true)
    setErrorMessage('')
    try {
      const params = new URLSearchParams({
        start_time: start,
        end_time: end,
      })
      if (downsample) {
        params.append('downsample', downsample)
      }
      const res = await fetch(`${API_URL}/metrics/history?${params}`)
      if (res.ok) {
        const result = await res.json()
        setData(result.data || [])
      } else {
        const err = await res.json().catch(() => ({}))
        setErrorMessage(err.detail || `请求失败 (${res.status})`)
      }
    } catch (e) {
      setErrorMessage('网络错误，无法获取历史数据')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleModeChange = (live) => {
    setIsLive(live)
    setErrorMessage('')
    if (live) {
      setData([])
    }
  }

  const handleRangeChange = (start, end, downsample) => {
    setTimeRange({ start, end, downsample })
    fetchHistoryData(start, end, downsample)
  }

  const handleExportCSV = async () => {
    if (!timeRange.start || !timeRange.end) {
      alert('请先选择时间范围')
      return
    }
    try {
      const params = new URLSearchParams({
        start_time: timeRange.start,
        end_time: timeRange.end,
      })
      const url = `${API_URL}/metrics/export?${params}`
      window.open(url, '_blank')
    } catch (e) {
      console.error('Failed to export CSV:', e)
    }
  }

  const saveThresholds = async (newThresholds) => {
    try {
      const res = await fetch(`${API_URL}/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newThresholds),
      })
      if (res.ok) {
        setThresholds(newThresholds)
        setShowModal(false)
      }
    } catch (e) {
      console.error('Failed to save thresholds:', e)
    }
  }

  const checkMetricAlert = (metricKey) => {
    if (data.length === 0) return false
    const latest = data[data.length - 1]
    const minVal = thresholds[`${metricKey}_min`]
    const maxVal = thresholds[`${metricKey}_max`]
    return isInAlert(latest[metricKey], minVal, maxVal)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>📊 实时监控仪表盘</h1>
        <div className="header-actions">
          <span className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● 已连接' : '● 未连接'}
          </span>
          {!isLive && (
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              📥 导出 CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ⚙️ 设置阈值
          </button>
        </div>
      </header>

      <div className="control-bar">
        <TimeRangeSelector
          onRangeChange={handleRangeChange}
          onModeChange={handleModeChange}
          isLive={isLive}
        />
        {loadingHistory && <span className="loading-indicator">加载中...</span>}
        {!isLive && !loadingHistory && (
          <span className="data-count">共 {data.length} 条数据</span>
        )}
        {errorMessage && (
          <span className="error-message">❌ {errorMessage}</span>
        )}
      </div>

      {showAlerts && (
        <AlertBanner
          alerts={currentAlerts}
          onClose={() => setShowAlerts(false)}
        />
      )}

      <main className="dashboard">
        {METRIC_CONFIGS.map((config) => (
          <MetricChart
            key={config.key}
            data={data}
            metricKey={config.key}
            label={config.label}
            unit={config.unit}
            color={config.color}
            thresholds={thresholds}
            hasAlert={checkMetricAlert(config.key)}
          />
        ))}
      </main>

      {showModal && (
        <ThresholdModal
          thresholds={thresholds}
          onSave={saveThresholds}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
