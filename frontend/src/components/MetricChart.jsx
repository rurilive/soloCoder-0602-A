import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import { isInAlert, formatTime } from '../utils/thresholds'

export default function MetricChart({
  data,
  metricKey,
  label,
  unit,
  color,
  thresholds,
  hasAlert,
}) {
  const currentValue = data.length > 0 ? data[data.length - 1][metricKey] : 0
  const minKey = `${metricKey}_min`
  const maxKey = `${metricKey}_max`
  const minVal = thresholds[minKey]
  const maxVal = thresholds[maxKey]

  const chartData = data.map((item) => ({
    ...item,
    time: formatTime(item.timestamp),
  }))

  return (
    <div className={`chart-card ${hasAlert ? 'alert' : ''}`}>
      <div className="chart-header">
        <span className="chart-title">{label}</span>
        <span className="chart-value">
          {currentValue.toFixed(1)}
          {unit}
        </span>
      </div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#e2e8f0',
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value) => [`${value.toFixed(2)} ${unit}`, label]}
            />
            {maxVal !== undefined && maxVal !== null && (
              <ReferenceArea
                y1={maxVal}
                y2={Math.max(maxVal * 1.5, currentValue * 1.2)}
                stroke="none"
                fill="#ef4444"
                fillOpacity={0.15}
              />
            )}
            {minVal !== undefined && minVal !== null && (
              <ReferenceArea
                y1={0}
                y2={minVal}
                stroke="none"
                fill="#ef4444"
                fillOpacity={0.15}
              />
            )}
            <Line
              type="monotone"
              dataKey={metricKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
