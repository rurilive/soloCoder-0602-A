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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.post(`/api/sections/${sectionId}/posts`, { title, content })
      navigate(`/post/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || '发布失败')
    } finally {
      setLoading(false)
    }
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
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '发布中...' : '发布'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
