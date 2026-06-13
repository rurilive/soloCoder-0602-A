import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getMessages, markConversationRead } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useChat } from '../contexts/ChatContext'
import { formatTime } from '../utils/notification'

export default function ChatConversation() {
  const { id } = useParams()
  const conversationId = parseInt(id)
  const [messages, setMessages] = useState([])
  const [total, setTotal] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { sendMessage, onMessage, refreshUnreadCount } = useChat()
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  const fetchMessages = async () => {
    try {
      const res = await getMessages(conversationId)
      setMessages(res.data.items)
      setTotal(res.data.total)
    } catch (err) {
      console.error('获取消息失败:', err)
      if (err.response?.status === 403) {
        navigate('/chat')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    markConversationRead(conversationId).then(() => refreshUnreadCount()).catch(() => {})
  }, [conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      if (msg.conversation_id === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [
            ...prev,
            {
              id: msg.id,
              conversation_id: msg.conversation_id,
              sender_id: msg.sender_id,
              sender: msg.sender,
              content: msg.content,
              created_at: msg.created_at,
            },
          ]
        })
        markConversationRead(conversationId).catch(() => {})
      }
    })
    return unsubscribe
  }, [conversationId, onMessage])

  const handleSend = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(conversationId, input.trim())
    setInput('')
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <span>加载中...</span>
      </div>
    )
  }

  return (
    <div className="chat-detail-page">
      <div className="chat-detail-header">
        <Link to="/chat" className="btn btn-sm btn-secondary">← 返回</Link>
        <h2>会话 #{conversationId}</h2>
      </div>

      <div className="chat-messages-container">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${msg.sender_id === user?.id ? 'own' : ''}`}
            >
              <div className="chat-message-avatar">
                {msg.sender.avatar ? (
                  <img src={msg.sender.avatar} alt="" className="avatar avatar-sm" />
                ) : (
                  <span className="avatar avatar-sm">
                    {msg.sender.username[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="chat-message-body">
                <div className="chat-message-header">
                  <span className="chat-message-sender">{msg.sender.username}</span>
                  <span className="chat-message-time">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div className="chat-message-content">{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          type="text"
          className="form-control"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
        />
        <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
          发送
        </button>
      </form>
    </div>
  )
}
