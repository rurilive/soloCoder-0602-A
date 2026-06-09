import { useEffect, useCallback } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

const AUTO_DISMISS_MS = 8000

const METRIC_LABEL_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.label])
)

const METRIC_UNIT_MAP = Object.fromEntries(
  METRIC_CONFIGS.map((c) => [c.key, c.unit])
)

const SEVERITY_LABELS = {
  info:     { text: '提示',   className: 'severity-info' },
  warning:  { text: '警告',   className: 'severity-warning' },
  error:    { text: '错误',   className: 'severity-error' },
  critical: { text: '严重',   className: 'severity-critical' },
}

const THRESHOLD_TYPE_LABEL = {
  max: '超过上限',
  min: '低于下限',
  eq: '等于阈值',
  neq: '不等于阈值',
  composite: '复合规则触发',
  rule: '规则触发',
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
  const { id, metric, value, threshold_value, threshold_type, severity, rule_name } = notification

  const handleDismiss = useCallback(() => {
    onDismiss(id)
  }, [id, onDismiss])

  useEffect(() => {
    const timer = setTimeout(handleDismiss, severity === 'critical' ? 12000 : AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [handleDismiss, severity])

  const severityInfo = SEVERITY_LABELS[severity] || SEVERITY_LABELS.warning
  const label = rule_name || METRIC_LABEL_MAP[metric] || metric
  const unit = METRIC_UNIT_MAP[metric] || ''
  const direction = THRESHOLD_TYPE_LABEL[threshold_type] || '触发规则'

  return (
    <div className={`notification-card ${severityInfo.className}`}>
      <div className="notification-header">
        <span className="notification-title">⚠ {label}</span>
        <span className={`notification-severity ${severityInfo.className}`}>
          {severityInfo.text}
        </span>
        <button className="notification-close" onClick={handleDismiss}>×</button>
      </div>
      <div className="notification-body">
        <div className="notification-row">
          <span className="notification-label">指标</span>
          <span className="notification-value">
            {METRIC_LABEL_MAP[metric] || metric}
          </span>
        </div>
        <div className="notification-row">
          <span className="notification-label">当前值</span>
          <span className="notification-value">
            {typeof value === 'number' ? value.toFixed(2) : value}{unit}
          </span>
        </div>
        <div className="notification-row">
          <span className="notification-label">规则类型</span>
          <span className="notification-value">
            {typeof threshold_value === 'number'
              ? `${threshold_value.toFixed(2)}${unit} · ${direction}`
              : direction}
          </span>
        </div>
      </div>
    </div>
  )
}
