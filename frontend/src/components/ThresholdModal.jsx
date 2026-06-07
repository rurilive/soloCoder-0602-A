import { useState } from 'react'
import { METRIC_CONFIGS } from '../utils/thresholds'

export default function ThresholdModal({ thresholds, onSave, onClose }) {
  const [formData, setFormData] = useState({ ...thresholds })

  const handleChange = (key, value) => {
    setFormData({
      ...formData,
      [key]: value === '' ? undefined : parseFloat(value),
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>设置阈值告警</h2>
        <form onSubmit={handleSubmit}>
          {METRIC_CONFIGS.map((config) => (
            <div key={config.key} className="threshold-group">
              <h3>{config.label} ({config.unit})</h3>
              <div className="threshold-inputs">
                <div className="threshold-input">
                  <label>下限 (低于告警)</label>
                  <input
                    type="number"
                    value={formData[`${config.key}_min`] ?? ''}
                    onChange={(e) => handleChange(`${config.key}_min`, e.target.value)}
                    placeholder={`可选`}
                  />
                </div>
                <div className="threshold-input">
                  <label>上限 (高于告警)</label>
                  <input
                    type="number"
                    value={formData[`${config.key}_max`] ?? ''}
                    onChange={(e) => handleChange(`${config.key}_max`, e.target.value)}
                    placeholder={`默认: ${config.defaultMax}`}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
