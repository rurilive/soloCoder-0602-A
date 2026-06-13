import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getRecentNotifications,
  markNotificationAsRead,
} from '../api'
import { formatTime, getTypeIcon } from '../utils/notification'
import { useNotification } from '../contexts/NotificationContext'

export default function NotificationBell() {
  const { unreadCount, decrementUnreadCount, refreshUnreadCount } = useNotification()
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const fetchRecentNotifications = async () => {
    setLoading(true)
    try {
      const res = await getRecentNotifications()
      setNotifications(res.data.items)
    } catch (err) {
      console.error('获取通知失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchRecentNotifications()
      refreshUnreadCount()
    }
  }, [isOpen, refreshUnreadCount])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleDropdown = () => {
    setIsOpen(!isOpen)
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
    setIsOpen(false)
  }

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={toggleDropdown}
        aria-label="通知"
      >
        <span className="notification-bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>通知</span>
            {unreadCount > 0 && (
              <span className="notification-unread-tip">{unreadCount} 条未读</span>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-loading">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.is_read ? '' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-item-icon">
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="notification-item-content">
                    <div className="notification-item-text">{notification.content}</div>
                    <div className="notification-item-meta">
                      <span className="notification-item-time">
                        {formatTime(notification.created_at)}
                      </span>
                      {notification.actor && (
                        <span className="notification-item-actor">
                          来自 {notification.actor.username}
                        </span>
                      )}
                    </div>
                  </div>
                  {!notification.is_read && (
                    <div className="notification-dot" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="notification-dropdown-footer">
            <Link to="/notifications" onClick={() => setIsOpen(false)}>
              查看全部
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
