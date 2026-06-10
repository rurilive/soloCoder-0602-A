import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import MarkdownEditor from '../components/MarkdownEditor'

export default function EditPost() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/posts/${id}`)
      .then((res) => {
        setTitle(res.data.title)
        setContent(res.data.content)
      })
      .catch(() => setError('加载帖子失败'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.put(`/api/posts/${id}`, { title, content })
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
