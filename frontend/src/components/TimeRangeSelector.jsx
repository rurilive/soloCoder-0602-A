import { useState } from 'react'

const PRESETS = [
  { label: '最近 5 分钟', value: 5 * 60 },
  { label: '最近 30 分钟', value: 30 * 60 },
  { label: '最近 1 小时', value: 60 * 60 },
  { label: '最近 6 小时', value: 6 * 60 * 60 },
  { label: '最近 24 小时', value: 24 * 60 * 60 },
  { label: '自定义', value: 'custom' },
]

export default function TimeRangeSelector({ onRangeChange, onModeChange, isLive }) {
  const [selectedPreset, setSelectedPreset] = useState(5 * 60)
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const handlePresetClick = (seconds) => {
    if (seconds === 'custom') {
      setShowCustom(true)
      setSelectedPreset('custom')
      return
    }
    setShowCustom(false)
    setSelectedPreset(seconds)
    const now = Date.now() / 1000
    onRangeChange(now - seconds, now, calculateDownsample(seconds))
  }

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return
    const startTime = new Date(customStart).getTime() / 1000
    const endTime = new Date(customEnd).getTime() / 1000
    const duration = endTime - startTime
    onRangeChange(startTime, endTime, calculateDownsample(duration))
  }

  const calculateDownsample = (seconds) => {
    if (seconds <= 10 * 60) return null
    if (seconds <= 60 * 60) return '10s'
    if (seconds <= 6 * 60 * 60) return '1m'
    if (seconds <= 24 * 60 * 60) return '5m'
    return '1h'
  }

  return (
    <div className="time-range-selector">
      <div className="mode-tabs">
        <button
          className={`mode-tab ${isLive ? 'active' : ''}`}
          onClick={() => onModeChange(true)}
        >
          📡 实时
        </button>
        <button
          className={`mode-tab ${!isLive ? 'active' : ''}`}
          onClick={() => {
            onModeChange(false)
            handlePresetClick(5 * 60)
          }}
        >
          📅 历史
        </button>
      </div>

      {!isLive && (
        <div className="preset-buttons">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className={`preset-btn ${selectedPreset === preset.value ? 'active' : ''}`}
              onClick={() => handlePresetClick(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {showCustom && !isLive && (
        <div className="custom-range">
          <div className="custom-input">
            <label>开始时间</label>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="custom-input">
            <label>结束时间</label>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleCustomApply}>
            应用
          </button>
        </div>
      )}
    </div>
  )
}
