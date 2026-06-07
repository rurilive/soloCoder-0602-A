export const METRIC_CONFIGS = [
  {
    key: 'cpu_usage',
    label: 'CPU 使用率',
    unit: '%',
    color: '#3b82f6',
    defaultMax: 80,
  },
  {
    key: 'memory_usage',
    label: '内存使用率',
    unit: '%',
    color: '#10b981',
    defaultMax: 85,
  },
  {
    key: 'request_count',
    label: '请求数',
    unit: '个/秒',
    color: '#f59e0b',
    defaultMax: 400,
  },
  {
    key: 'response_time',
    label: '响应时间',
    unit: 'ms',
    color: '#8b5cf6',
    defaultMax: 200,
  },
]

export function isInAlert(value, min, max) {
  if (max !== null && max !== undefined && value > max) return true
  if (min !== null && min !== undefined && value < min) return true
  return false
}

export function formatTime(timestamp) {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
