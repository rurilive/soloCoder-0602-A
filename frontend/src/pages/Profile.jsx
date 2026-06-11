import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../api'

const PAGE_SIZE = 20

export default function Profile() {
  const { user, fetchUser } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')
  const [email, setEmail] = useState(user?.email || '')
  const [avatar, setAvatar] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [favorites, setFavorites] = useState([])
  const [favSkip, setFavSkip] = useState(0)
  const [favTotal, setFavTotal] = useState(0)
  const [favLoading, setFavLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'favorites') {
      setFavLoading(true)
      api.get('/api/users/me/favorites', { params: { skip: favSkip, limit: PAGE_SIZE } })
        .then((res) => {
          setFavorites(res.data.items)
          setFavTotal(res.data.total)
        })
        .catch(() => {
          setFavorites([])
          setFavTotal(0)
        })
        .finally(() => setFavLoading(false))
    }
  }, [activeTab, favSkip])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/api/upload/image', formData)
      setAvatar(res.data.url)
    } catch (err) {
      setMessage('头像上传失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const data = {}
      if (email !== user.email) data.email = email
      if (avatar) data.avatar = avatar
      await api.put('/api/users/me', data)
      await fetchUser()
      setMessage('保存成功')
      setAvatar('')
    } catch (err) {
      setMessage('保存失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const displayAvatar = avatar || user.avatar
  const hasMoreFavorites = favSkip + PAGE_SIZE < favTotal

  return (
    <div className="profile-page">
      <h2>个人中心</h2>

      <div className="profile-info">
        <div className={`avatar avatar-lg`}>
          {displayAvatar ? <img src={displayAvatar} alt="" /> : user.username[0]?.toUpperCase()}
        </div>
        <div className="profile-details">
          <div className="profile-name">{user.username}</div>
          <div className="profile-role">角色: {user.role}</div>
          <div className="profile-date">注册于: {new Date(user.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="profile-tabs">
        <button
          className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          基本资料
        </button>
        <button
          className={`profile-tab ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          我的收藏
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="card">
          {message && (
            <div className={`alert ${message.includes('失败') ? 'alert-danger' : 'alert-success'}`}>
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>邮箱</label>
              <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>头像</label>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              {avatar && <div style={{ marginTop: 8 }}><img src={avatar} alt="预览" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} /></div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存修改'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'favorites' && (
        <div>
          {favLoading ? (
            <div className="loading">加载中...</div>
          ) : favorites.length === 0 ? (
            <div className="empty-state"><p>暂无收藏的帖子</p></div>
          ) : (
            <>
              {favorites.map((item) => (
                <div key={item.id} className={`post-item ${item.is_pinned ? 'pinned' : ''}`}>
                  <div className="post-item-main">
                    <div className="post-item-title">
                      {item.is_pinned && <span className="pin-badge">置顶</span>}
                      <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/post/${item.id}`) }}>
                        {item.title}
                      </a>
                      {item.section && (
                        <a
                          href="#"
                          className="section-tag"
                          onClick={(e) => { e.preventDefault(); navigate(`/section/${item.section.id}`) }}
                        >
                          {item.section.name}
                        </a>
                      )}
                    </div>
                    <div className="post-item-meta">
                      <span className="post-detail-author">
                        <span className="avatar avatar-sm">
                          {item.author?.avatar ? <img src={item.author.avatar} alt="" /> : item.author?.username?.[0] || '?'}
                        </span>
                        {item.author?.username || '未知'}
                      </span>
                      <span>收藏于 {new Date(item.favorited_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="post-item-stats">
                    <span>👁 {item.view_count}</span>
                    <span>💬 {item.reply_count}</span>
                  </div>
                </div>
              ))}

              {favTotal > 0 && (
                <div className="pagination">
                  <button disabled={favSkip === 0} onClick={() => setFavSkip(Math.max(0, favSkip - PAGE_SIZE))}>上一页</button>
                  <span className="page-info">第 {Math.floor(favSkip / PAGE_SIZE) + 1} 页 / 共 {favTotal} 条</span>
                  <button disabled={!hasMoreFavorites} onClick={() => setFavSkip(favSkip + PAGE_SIZE)}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
