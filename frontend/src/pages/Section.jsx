import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 20

export default function Section() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, user, isModerator, isAdmin } = useAuth()
  const [section, setSection] = useState(null)
  const [posts, setPosts] = useState([])
  const [skip, setSkip] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    api.get(`/api/sections/${id}`).then((res) => setSection(res.data)).catch(() => {})
  }, [id])

  useEffect(() => {
    setLoading(true)
    api.get(`/api/sections/${id}/posts`, { params: { skip, limit: PAGE_SIZE } })
      .then((res) => {
        setPosts(res.data)
        setHasMore(res.data.length === PAGE_SIZE)
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [id, skip])

  const canPost = isAuthenticated && user && !user.is_muted

  if (loading && !section) return <div className="loading">加载中...</div>

  return (
    <div>
      {section && (
        <div className="section-header">
          <h2>{section.name}</h2>
          {section.description && <p>{section.description}</p>}
        </div>
      )}

      <div className="post-list-header">
        <span style={{ fontSize: 14, color: 'var(--text-light)' }}>帖子列表</span>
        {canPost && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/post/new/${id}`)}>
            发新帖
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><p>暂无帖子</p></div>
      ) : (
        <>
          {posts.map((post) => (
            <div key={post.id} className={`post-item ${post.is_pinned ? 'pinned' : ''} ${post.is_deleted ? 'deleted' : ''}`}>
              <div className="post-item-main">
                <div className="post-item-title">
                  <Link to={`/post/${post.id}`}>{post.title}</Link>
                  {post.is_pinned && <span className="pin-badge">置顶</span>}
                  {post.is_deleted && <span className="deleted-badge">已删除</span>}
                </div>
                <div className="post-item-meta">
                  <span>{post.author?.username || '未知'}</span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="post-item-stats">
                <span>👁 {post.view_count}</span>
                <span>💬 {post.reply_count ?? 0}</span>
              </div>
            </div>
          ))}
          <div className="pagination">
            <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>上一页</button>
            <span className="page-info">第 {Math.floor(skip / PAGE_SIZE) + 1} 页</span>
            <button disabled={!hasMore} onClick={() => setSkip(skip + PAGE_SIZE)}>下一页</button>
          </div>
        </>
      )}
    </div>
  )
}
