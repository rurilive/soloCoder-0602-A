import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../api'
import { formatTime, getTypeIcon, getTypeLabel } from '../utils/notification'
import { useNotification } from '../contexts/NotificationContext'

const PAGE_SIZE = 20

export default function Notifications() {
  const navigate = useNavigate()
  const { decrementUnreadCount, resetUnreadCount, refreshUnreadCount } = useNotification()
  const [notifications, setNotifications] = useState([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const onlyUnread = filter === 'unread'
      const res = await getNotifications(skip, PAGE_SIZE, onlyUnread)
      setNotifications(res.data.items)
      setTotal(res.data.total)
    } catch (err) {
      console.error('获取通知失败:', err)
      setNotifications([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
    refreshUnreadCount()
  }, [skip, filter, refreshUnreadCount])

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation()
    try {
      await markNotificationAsRead(id)
      decrementUnreadCount(1)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      if (filter === 'unread') {
        setTotal((prev) => prev - 1)
      }
    } catch (err) {
      console.error('标记已读失败:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead()
      resetUnreadCount()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      if (filter === 'unread') {
        setTotal(0)
        setNotifications([])
      }
    } catch (err) {
      console.error('全部标记已读失败:', err)
    }
  }

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markNotificationAsRead(notification.id)
        decrementUnreadCount(1)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        )
      } catch (err) {
        console.error('标记已读失败:', err)
      }
    }
    if (notification.post_id) {
      navigate(`/post/${notification.post_id}`)
    }
  }

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter)
    setSkip(0)
  }

  const hasUnread = notifications.some((n) => !n.is_read)
  const hasMore = skip + PAGE_SIZE < total
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h2>我的通知</h2>
        <div className="notifications-actions">
          {hasUnread && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleMarkAllAsRead}
            >
              全部标记为已读
            </button>
          )}
        </div>
      </div>

      <div className="notifications-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          全部
        </button>
        <button
          className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => handleFilterChange('unread')}
        >
          未读
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <p>{filter === 'unread' ? '暂无未读通知' : '暂无通知'}</p>
        </div>
      ) : (
        <>
          <div className="notifications-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-list-item ${notification.is_read ? '' : 'unread'}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-item-icon">
                  {getTypeIcon(notification.type)}
                </div>
                <div className="notification-item-main">
                  <div className="notification-item-header">
                    <span className="notification-type-label">
                      {getTypeLabel(notification.type)}
                    </span>
                    {!notification.is_read && (
                      <span className="notification-unread-badge">新</span>
                    )}
                  </div>
                  <div className="notification-item-text">{notification.content}</div>
                  <div className="notification-item-footer">
                    <span className="notification-item-time">
                      {formatTime(notification.created_at)}
                    </span>
                    {notification.actor && (
                      <span className="notification-item-actor">
                        来自 {notification.actor.username}
                      </span>
                    )}
                    {!notification.is_read && (
                      <button
                        className="notification-mark-read-btn"
                        onClick={(e) => handleMarkAsRead(notification.id, e)}
                      >
                        标记已读
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="pagination">
              <button
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              >
                上一页
              </button>
              <span className="page-info">
                第 {currentPage} 页 / 共 {totalPages} 页 ({total} 条)
              </span>
              <button
                disabled={!hasMore}
                onClick={() => setSkip(skip + PAGE_SIZE)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
