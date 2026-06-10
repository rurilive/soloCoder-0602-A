import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function Home() {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const { isAdmin } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    fetchSections()
  }, [])

  const fetchSections = async () => {
    try {
      const res = await api.get('/api/sections/')
      setSections(res.data)
    } catch {
      setSections([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/sections/', { name, description })
      setName('')
      setDescription('')
      setShowCreate(false)
      fetchSections()
    } catch (err) {
      alert('创建失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div>
      <div className="post-list-header">
        <h2>板块列表</h2>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
            新建板块
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>板块名称</label>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>板块描述</label>
              <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">创建</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowCreate(false)} style={{ marginLeft: 8 }}>取消</button>
          </form>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="empty-state">
          <p>暂无板块</p>
        </div>
      ) : (
        <div className="sections-grid">
          {sections.map((s) => (
            <Link to={`/section/${s.id}`} key={s.id} className="card section-card">
              <div className="section-name">{s.name}</div>
              <div className="section-desc">{s.description || '暂无描述'}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
