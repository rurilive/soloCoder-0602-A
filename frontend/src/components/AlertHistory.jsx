import { useState, useEffect, useCallback } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

const API_URL = 'http://localhost:1111'

const METRIC_LABEL_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.label])
)

function formatDateTime(timestamp) {
  const d = new Date(timestamp * 1000)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function AlertHistory({ isOpen, onClose }) {
  const [alerts, setAlerts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filterMetric, setFilterMetric] = useState('')
  const [filterAck, setFilterAck] = useState('')
  const [alertStats, setAlertStats] = useState(null)
  const pageSize = 20

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: pageSize,
        offset: page * pageSize,
      })
      if (filterMetric) params.append('metric', filterMetric)
      if (filterAck !== '') params.append('acknowledged', filterAck)
      const res = await fetch(`${API_URL}/alerts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.data || [])
        setTotal(data.total || 0)
      }
    } catch (e) {
      console.error('Failed to fetch alerts:', e)
    }
  }, [page, filterMetric, filterAck])

  const fetchAlertStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/alerts/stats`)
      if (res.ok) {
        const data = await res.json()
        setAlertStats(data)
      }
    } catch (e) {
      console.error('Failed to fetch alert stats:', e)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchAlerts()
      fetchAlertStats()
    }
  }, [isOpen, fetchAlerts, fetchAlertStats])

  const handleAcknowledge = async (id) => {
    try {
      const res = await fetch(`${API_URL}/alerts/${id}/acknowledge`, {
        method: 'PUT',
      })
      if (res.ok) {
        fetchAlerts()
        fetchAlertStats()
      }
    } catch (e) {
      console.error('Failed to acknowledge alert:', e)
    }
  }

  const handleAcknowledgeAll = async () => {
    try {
      const res = await fetch(`${API_URL}/alerts/acknowledge-all`, {
        method: 'PUT',
      })
      if (res.ok) {
        fetchAlerts()
        fetchAlertStats()
      }
    } catch (e) {
      console.error('Failed to acknowledge all:', e)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('确认清除所有告警记录？此操作不可撤销。')) return
    try {
      const res = await fetch(`${API_URL}/alerts`, { method: 'DELETE' })
      if (res.ok) {
        setPage(0)
        fetchAlerts()
        fetchAlertStats()
      }
    } catch (e) {
      console.error('Failed to clear alerts:', e)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal alert-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alert-history-header">
          <h2>🔔 告警历史</h2>
          <button className="alert-banner-close" onClick={onClose}>×</button>
        </div>

        {alertStats && (
          <div className="alert-stats-overview">
            <div className="alert-stat-card">
              <span className="alert-stat-value">{alertStats.overview.total_count || 0}</span>
              <span className="alert-stat-label">总告警</span>
            </div>
            <div className="alert-stat-card warning">
              <span className="alert-stat-value">{alertStats.overview.unacknowledged_count || 0}</span>
              <span className="alert-stat-label">未确认</span>
            </div>
            <div className="alert-stat-card success">
              <span className="alert-stat-value">{alertStats.overview.acknowledged_count || 0}</span>
              <span className="alert-stat-label">已确认</span>
            </div>
            {alertStats.by_metric.length > 0 && (
              <div className="alert-stat-card">
                <span className="alert-stat-value">{alertStats.by_metric[0].metric}</span>
                <span className="alert-stat-label">最频繁指标</span>
              </div>
            )}
          </div>
        )}

        <div className="alert-filters">
          <select
            value={filterMetric}
            onChange={(e) => { setFilterMetric(e.target.value); setPage(0) }}
          >
            <option value="">全部指标</option>
            {METRIC_CONFIGS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select
            value={filterAck}
            onChange={(e) => { setFilterAck(e.target.value); setPage(0) }}
          >
            <option value="">全部状态</option>
            <option value="0">未确认</option>
            <option value="1">已确认</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={handleAcknowledgeAll}>
            全部确认
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
            清除全部
          </button>
        </div>

        <div className="alert-list">
          {alerts.length === 0 ? (
            <div className="alert-empty">暂无告警记录</div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`alert-item ${alert.acknowledged ? 'acknowledged' : ''}`}
              >
                <div className="alert-item-left">
                  <span className={`alert-item-badge ${alert.threshold_type}`}>
                    {alert.threshold_type === 'max' ? '↑ 超上限' : '↓ 低下限'}
                  </span>
                  <span className="alert-item-metric">
                    {METRIC_LABEL_MAP[alert.metric] || alert.metric}
                  </span>
                  <span className="alert-item-value">
                    {alert.value.toFixed(2)} (阈值: {alert.threshold_value})
                  </span>
                </div>
                <div className="alert-item-right">
                  <span className="alert-item-time">{formatDateTime(alert.timestamp)}</span>
                  {!alert.acknowledged && (
                    <button
                      className="btn btn-sm btn-ack"
                      onClick={() => handleAcknowledge(alert.id)}
                    >
                      确认
                    </button>
                  )}
                  {alert.acknowledged && <span className="ack-badge">✓ 已确认</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="alert-pagination">
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span className="pagination-info">
              {page + 1} / {totalPages} (共 {total} 条)
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
