import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getConversations, createConversation } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { formatTime } from '../utils/notification'

export default function ChatList() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewChat, setShowNewChat] = useState(false)
  const [chatType, setChatType] = useState('dm')
  const [newChatUsername, setNewChatUsername] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMembers, setNewGroupMembers] = useState('')
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  const fetchConversations = async () => {
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
    fetchConversations()
  }, [])

  const resolveUsernameToId = async (username) => {
    const allUsersRes = await fetch('http://localhost:1111/api/users?limit=100', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    const usersData = await allUsersRes.json()
    const target = usersData.find((u) => u.username === username.trim())
    return target?.id || null
  }

  const handleCreateDM = async (e) => {
    e.preventDefault()
    setError('')
    if (!newChatUsername.trim()) {
      setError('请输入用户名')
      return
    }
    try {
      const targetId = await resolveUsernameToId(newChatUsername)
      if (!targetId) {
        setError('用户不存在')
        return
      }
      const res = await createConversation([targetId])
      navigate(`/chat/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || '创建会话失败')
    }
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    setError('')
    if (!newGroupMembers.trim()) {
      setError('请输入成员用户名')
      return
    }
    try {
      const allUsersRes = await fetch('http://localhost:1111/api/users?limit=100', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      const usersData = await allUsersRes.json()
      const usernames = newGroupMembers.split(/[,，\s]+/).filter(Boolean)
      const memberIds = []
      for (const uname of usernames) {
        const target = usersData.find((u) => u.username === uname.trim())
        if (!target) {
          setError(`用户 "${uname}" 不存在`)
          return
        }
        if (target.id !== user.id) {
          memberIds.push(target.id)
        }
      }
      if (memberIds.length === 0) {
        setError('至少需要一个其他成员')
        return
      }
      const res = await createConversation(memberIds, newGroupName.trim() || null)
      navigate(`/chat/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || '创建群聊失败')
    }
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
    <div className="chat-page">
      <div className="chat-page-header">
        <h2>私信</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowNewChat(!showNewChat)}
        >
          {showNewChat ? '取消' : '✏️ 新会话'}
        </button>
      </div>

      {showNewChat && (
        <div className="chat-new-form card">
          <div className="admin-tabs" style={{ marginBottom: '16px' }}>
            <button
              className={`admin-tab ${chatType === 'dm' ? 'active' : ''}`}
              onClick={() => setChatType('dm')}
            >
              私聊
            </button>
            <button
              className={`admin-tab ${chatType === 'group' ? 'active' : ''}`}
              onClick={() => setChatType('group')}
            >
              群聊
            </button>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          {chatType === 'dm' ? (
            <form onSubmit={handleCreateDM}>
              <div className="form-group">
                <label>用户名</label>
                <input
                  type="text"
                  className="form-control"
                  value={newChatUsername}
                  onChange={(e) => setNewChatUsername(e.target.value)}
                  placeholder="输入对方用户名"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                创建私聊
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>群名称（可选）</label>
                <input
                  type="text"
                  className="form-control"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="输入群聊名称"
                />
              </div>
              <div className="form-group">
                <label>成员用户名（逗号分隔）</label>
                <input
                  type="text"
                  className="form-control"
                  value={newGroupMembers}
                  onChange={(e) => setNewGroupMembers(e.target.value)}
                  placeholder="user1, user2, user3"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                创建群聊
              </button>
            </form>
          )}
        </div>
      )}

      <div className="chat-conversation-list">
        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>暂无私信会话</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/chat/${conv.id}`}
              className={`chat-conversation-item ${conv.unread_count > 0 ? 'unread' : ''}`}
            >
              <div className="chat-conversation-avatar">
                {conv.is_group ? '👥' : '💬'}
              </div>
              <div className="chat-conversation-info">
                <div className="chat-conversation-name">
                  {conv.name || '私聊'}
                  {conv.is_group && <span className="section-tag">群聊</span>}
                </div>
                {conv.last_message && (
                  <div className="chat-conversation-preview">
                    {conv.last_message.sender.username}: {conv.last_message.content}
                  </div>
                )}
              </div>
              <div className="chat-conversation-meta">
                <span className="chat-conversation-time">
                  {conv.last_message
                    ? formatTime(conv.last_message.created_at)
                    : formatTime(conv.created_at)}
                </span>
                {conv.unread_count > 0 && (
                  <span className="chat-unread-badge">{conv.unread_count}</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
