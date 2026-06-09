import { useState, useEffect, useCallback } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

const API_URL = 'http://localhost:1111'

const METRIC_LABEL_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.label])
)

const SEVERITY_OPTIONS = [
  { value: '', label: '全部严重程度' },
  { value: 'info', label: '提示 (Info)' },
  { value: 'warning', label: '警告 (Warning)' },
  { value: 'error', label: '错误 (Error)' },
  { value: 'critical', label: '严重 (Critical)' },
]

const SEVERITY_STYLES = {
  info: {
    badge: 'severity-info',
    label: '提示',
    dot: '#3b82f6',
  },
  warning: {
    badge: 'severity-warning',
    label: '警告',
    dot: '#f59e0b',
  },
  error: {
    badge: 'severity-error',
    label: '错误',
    dot: '#ef4444',
  },
  critical: {
    badge: 'severity-critical',
    label: '严重',
    dot: '#dc2626',
  },
}

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

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.warning
  return (
    <span className={`severity-badge ${s.badge}`} title={s.label}>
      <span className="severity-dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

export default function AlertHistory({ isOpen, onClose }) {
  const [alerts, setAlerts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filterMetric, setFilterMetric] = useState('')
  const [filterAck, setFilterAck] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
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
      if (filterSeverity) params.append('severity', filterSeverity)
      const res = await fetch(`${API_URL}/alerts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.data || [])
        setTotal(data.total || 0)
      }
    } catch (e) {
      console.error('Failed to fetch alerts:', e)
    }
  }, [page, filterMetric, filterAck, filterSeverity])

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

  const severityMap = (alertStats?.by_severity || []).reduce((acc, s) => {
    acc[s.severity] = s
    return acc
  }, {})

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
            <div className="alert-stat-card critical-card">
              <span className="alert-stat-value">{severityMap.critical?.count || 0}</span>
              <span className="alert-stat-label">严重告警</span>
            </div>
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
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); setPage(0) }}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
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
                className={`alert-item ${alert.acknowledged ? 'acknowledged' : ''} ${alert.suppressed ? 'suppressed' : ''}`}
              >
                <div className="alert-item-left">
                  <SeverityBadge severity={alert.severity} />
                  <span className={`alert-item-badge ${alert.threshold_type}`}>
                    {alert.threshold_type === 'max'
                      ? '↑ 超上限'
                      : alert.threshold_type === 'min'
                      ? '↓ 低下限'
                      : alert.threshold_type === 'composite'
                      ? '⚙ 复合'
                      : alert.threshold_type}
                  </span>
                  <span className="alert-item-metric">
                    {alert.rule_name
                      ? <span className="alert-rule-name">{alert.rule_name}</span>
                      : (METRIC_LABEL_MAP[alert.metric] || alert.metric)}
                  </span>
                  <span className="alert-item-value">
                    {typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}
                    {alert.threshold_type !== 'rule' && (
                      <span className="alert-threshold-hint"> (阈值: {alert.threshold_value})</span>
                    )}
                  </span>
                  {alert.suppressed ? (
                    <span className="alert-item-silenced" title="静默期产生，未弹窗通知">🔕 已静默</span>
                  ) : null}
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
