import { useEffect, useCallback } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

const AUTO_DISMISS_MS = 5000

const METRIC_LABEL_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.label])
)

const METRIC_UNIT_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.unit])
)

const SEVERITY_LABELS = {
  warning: { text: '警告', className: 'severity-warning' },
  critical: { text: '严重', className: 'severity-critical' },
}

export default function NotificationPopup({ notifications, onDismiss }) {
  return (
    <div className="notification-container">
      {notifications.map((n) => (
        <NotificationCard key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function NotificationCard({ notification, onDismiss }) {
  const { id, metric, value, threshold_value, threshold_type, severity } = notification

  const handleDismiss = useCallback(() => {
    onDismiss(id)
  }, [id, onDismiss])

  useEffect(() => {
    const timer = setTimeout(handleDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [handleDismiss])

  const severityInfo = SEVERITY_LABELS[severity] || SEVERITY_LABELS.warning
  const label = METRIC_LABEL_MAP[metric] || metric
  const unit = METRIC_UNIT_MAP[metric] || ''
  const direction = threshold_type === 'max' ? '超过上限' : '低于下限'

  return (
    <div className={`notification-card ${severityInfo.className}`}>
      <div className="notification-header">
        <span className="notification-title">{label}</span>
        <span className={`notification-severity ${severityInfo.className}`}>
          {severityInfo.text}
        </span>
        <button className="notification-close" onClick={handleDismiss}>×</button>
      </div>
      <div className="notification-body">
        <div className="notification-row">
          <span className="notification-label">当前值</span>
          <span className="notification-value">{value.toFixed(2)}{unit}</span>
        </div>
        <div className="notification-row">
          <span className="notification-label">阈值</span>
          <span className="notification-value">{threshold_value.toFixed(2)}{unit} ({direction})</span>
        </div>
      </div>
    </div>
  )
}
