export default function AlertBanner({ alerts, onClose }) {
  if (!alerts || alerts.length === 0) return null

  const alertText = alerts
    .map((a) => `${a.metric}: ${a.value.toFixed(2)} (阈值: ${a.threshold_value})`)
    .join(' | ')

  return (
    <div className="alert-banner">
      <span>
        ⚠️ 告警: {alertText}
      </span>
      <button className="alert-banner-close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
