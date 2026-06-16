import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import MarkdownEditor from '../components/MarkdownEditor'

export default function CreatePost() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }
    if (isScheduled && !scheduledAt) {
      setError('请选择定时发布时间')
      return
    }
    if (isScheduled && new Date(scheduledAt) <= new Date()) {
      setError('定时发布时间必须为未来时间')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = { title, content }
      if (isScheduled && scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString()
      }
      const res = await api.post(`/api/sections/${sectionId}/posts`, payload)
      if (res.data.is_pending_review) {
        alert('您的帖子已提交，正在审核中，审核通过后将正常展示。您可以在"我的帖子"中查看。')
        navigate('/profile')
      } else if (res.data.is_scheduled) {
        alert('定时帖子已创建，将在指定时间自动发布。')
        navigate(`/post/${res.data.id}`)
      } else {
        navigate(`/post/${res.data.id}`)
      }
    } catch (err) {
      setError(err.response?.data?.detail || '发布失败')
    } finally {
      setLoading(false)
    }
  }

  const getMinDatetime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  return (
    <div className="create-post-page">
      <h2>发布新帖</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>标题</label>
            <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>内容</label>
            <MarkdownEditor value={content} onChange={setContent} />
          </div>
          <div className="form-group scheduled-publish-group">
            <label className="scheduled-publish-label">
              <input
                type="checkbox"
                checked={isScheduled}
                onChange={(e) => {
                  setIsScheduled(e.target.checked)
                  if (!e.target.checked) setScheduledAt('')
                }}
              />
              <span>定时发布</span>
            </label>
            {isScheduled && (
              <div className="scheduled-datetime-picker">
                <label>发布时间</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={scheduledAt}
                  min={getMinDatetime()}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
                <small style={{ color: 'var(--text-light)', marginTop: 4, display: 'block' }}>
                  帖子将在指定时间后才对其他用户可见
                </small>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '发布中...' : isScheduled ? '定时发布' : '发布'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
