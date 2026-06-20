import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import MarkdownEditor from '../components/MarkdownEditor'
import TagInput from '../components/TagInput'

export default function EditPost() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editReason, setEditReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [originalScheduledAt, setOriginalScheduledAt] = useState(null)
  const [tags, setTags] = useState([])
  const [originalTags, setOriginalTags] = useState([])
  const [allowPrivateReplies, setAllowPrivateReplies] = useState(false)
  const [originalAllowPrivateReplies, setOriginalAllowPrivateReplies] = useState(false)

  useEffect(() => {
    api.get(`/api/posts/${id}`)
      .then((res) => {
        setTitle(res.data.title)
        setContent(res.data.content)
        setOriginalTitle(res.data.title)
        setOriginalContent(res.data.content)
        const loadedTags = res.data.tags || []
        setTags(loadedTags)
        setOriginalTags(loadedTags)
        setAllowPrivateReplies(res.data.allow_private_replies || false)
        setOriginalAllowPrivateReplies(res.data.allow_private_replies || false)
        if (res.data.is_scheduled && res.data.scheduled_at) {
          setIsScheduled(true)
          const dt = new Date(res.data.scheduled_at)
          const localStr = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          setScheduledAt(localStr)
          setOriginalScheduledAt(res.data.scheduled_at)
        }
      })
      .catch(() => setError('加载帖子失败'))
      .finally(() => setLoading(false))
  }, [id])

  const hasTagChanges = JSON.stringify(tags.map(t => t.name).sort()) !== JSON.stringify(originalTags.map(t => t.name).sort())
  const hasChanges = title !== originalTitle || content !== originalContent || hasTagChanges || allowPrivateReplies !== originalAllowPrivateReplies

  const getMinDatetime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }
    if (hasChanges && !editReason.trim()) {
      setError('请填写编辑原因')
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
    setSaving(true)
    setError('')
    try {
      const payload = {
        title,
        content,
        edit_reason: hasChanges ? editReason.trim() : null,
      }
      if (isScheduled && scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString()
      } else if (!isScheduled && originalScheduledAt) {
        payload.scheduled_at = null
      } else {
        payload.scheduled_at = 'UNCHANGED'
      }
      if (hasTagChanges) {
        payload.tag_names = tags.map((t) => t.name)
      }
      if (allowPrivateReplies !== originalAllowPrivateReplies) {
        payload.allow_private_replies = allowPrivateReplies
      }
      const res = await api.put(`/api/posts/${id}`, payload)
      navigate(`/post/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div className="create-post-page">
      <h2>编辑帖子</h2>
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
          <div className="form-group">
            <label>标签</label>
            <TagInput tags={tags} onChange={setTags} maxTags={5} />
          </div>
          <div className="form-group scheduled-publish-group">
            <label className="scheduled-publish-label">
              <input
                type="checkbox"
                checked={allowPrivateReplies}
                onChange={(e) => setAllowPrivateReplies(e.target.checked)}
              />
              <span>允许仅作者可见回复</span>
            </label>
            {allowPrivateReplies && (
              <small style={{ color: 'var(--text-light)', marginTop: 4, display: 'block' }}>
                开启后，回复者可将回复标记为仅帖子和回复作者可见
              </small>
            )}
          </div>
          <div className="form-group">
            <label>编辑原因 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className="form-control"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="请说明编辑原因（如：修正错别字、补充内容等）"
              maxLength={500}
              required={hasChanges}
            />
            <small style={{ color: 'var(--text-light)' }}>{editReason.length}/500</small>
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
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
