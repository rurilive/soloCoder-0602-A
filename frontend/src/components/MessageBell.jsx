import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConversations } from '../api'
import { useChat } from '../contexts/ChatContext'
import { formatTime } from '../utils/notification'

export default function MessageBell() {
  const { unreadCount } = useChat()
  const [conversations, setConversations] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const res = await getConversations()
      setConversations(res.data.items)
    } catch (err) {
      console.error('获取会话列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchConversations()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleConversationClick = (conv) => {
    navigate(`/chat/${conv.id}`)
    setIsOpen(false)
  }

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="私信"
      >
        <span className="notification-bell-icon">✉️</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown chat-dropdown">
          <div className="notification-dropdown-header">
            <span>私信</span>
            {unreadCount > 0 && (
              <span className="notification-unread-tip">{unreadCount} 个未读会话</span>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-loading">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="notification-empty">暂无私信</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`notification-item ${conv.unread_count > 0 ? 'unread' : ''}`}
                  onClick={() => handleConversationClick(conv)}
                >
                  <div className="notification-item-icon">
                    {conv.is_group ? '👥' : '💬'}
                  </div>
                  <div className="notification-item-content">
                    <div className="notification-item-text">
                      {conv.name || '私聊'}
                    </div>
                    <div className="notification-item-meta">
                      <span className="notification-item-time">
                        {conv.last_message
                          ? formatTime(conv.last_message.created_at)
                          : formatTime(conv.created_at)}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="chat-unread-badge">{conv.unread_count}</span>
                      )}
                    </div>
                    {conv.last_message && (
                      <div className="chat-last-message">
                        {conv.last_message.sender.username}: {conv.last_message.content}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="notification-dropdown-footer">
            <span
              onClick={() => { navigate('/chat'); setIsOpen(false) }}
              style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '13px', fontWeight: 500 }}
            >
              查看全部
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
