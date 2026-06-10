import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api'

export default function Profile() {
  const { user, fetchUser } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [avatar, setAvatar] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
    </div>
  )
}
