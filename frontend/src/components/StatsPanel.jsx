import { useState, useEffect, useCallback } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

const API_URL = 'http://localhost:1111'

export default function StatsPanel({ isOpen, onClose, timeRange }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    if (!timeRange.start || !timeRange.end) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_time: timeRange.start,
        end_time: timeRange.end,
      })
      const res = await fetch(`${API_URL}/metrics/stats?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    if (isOpen && timeRange.start && timeRange.end) {
      fetchStats()
    }
  }, [isOpen, fetchStats])

  if (!isOpen) return null

  const getMetricConfig = (key) => METRIC_CONFIGS.find((c) => c.key === key)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-header">
          <h2>📈 数据统计</h2>
          <button className="alert-banner-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="stats-loading">加载中...</div>
        ) : stats ? (
          <div className="stats-grid">
            {METRIC_CONFIGS.map((config) => {
              const s = stats[config.key]
              if (!s) return null
              return (
                <div key={config.key} className="stats-card">
                  <div className="stats-card-title" style={{ color: config.color }}>
                    {config.label}
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">数据量</span>
                    <span className="stats-value">{s.count}</span>
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">平均值</span>
                    <span className="stats-value">{s.avg} {config.unit}</span>
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">最小值</span>
                    <span className="stats-value stats-min">{s.min} {config.unit}</span>
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">最大值</span>
                    <span className="stats-value stats-max">{s.max} {config.unit}</span>
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">P95</span>
                    <span className="stats-value">{s.p95 ?? '-'} {config.unit}</span>
                  </div>
                  <div className="stats-card-row">
                    <span className="stats-label">P99</span>
                    <span className="stats-value">{s.p99 ?? '-'} {config.unit}</span>
                  </div>
                  <div className="stats-bar-container">
                    <div className="stats-bar-bg">
                      <div
                        className="stats-bar-fill"
                        style={{
                          width: `${Math.min(100, (s.avg / (s.max || 1)) * 100)}%`,
                          backgroundColor: config.color,
                        }}
                      />
                    </div>
                    <div className="stats-bar-labels">
                      <span>{s.min}</span>
                      <span>{s.max}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="stats-empty">请选择时间范围后查看统计</div>
        )}

        <div className="stats-actions">
          <button className="btn btn-primary" onClick={fetchStats}>
            🔄 刷新
          </button>
        </div>
      </div>
    </div>
  )
}
