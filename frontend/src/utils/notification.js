export function formatTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

export function getTypeIcon(type) {
  switch (type) {
    case 'reply':
      return '💬'
    case 'mention':
      return '@'
    default:
      return '🔔'
  }
}

export function getTypeLabel(type) {
  switch (type) {
    case 'reply':
      return '回复通知'
    case 'mention':
      return '@提及'
    default:
      return '系统通知'
  }
}
