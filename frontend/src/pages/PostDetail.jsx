import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import MarkdownRenderer from '../components/MarkdownRenderer'
import MarkdownEditor from '../components/MarkdownEditor'

const PAGE_SIZE = 20

export default function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isAdmin, isModerator } = useAuth()
  const [post, setPost] = useState(null)
  const [replies, setReplies] = useState([])
  const [replyContent, setReplyContent] = useState('')
  const [skip, setSkip] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/posts/${id}`)
      .then((res) => setPost(res.data))
      .catch(() => setPost(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    api.get(`/api/posts/${id}/replies`, { params: { skip, limit: PAGE_SIZE } })
      .then((res) => {
        setReplies(res.data)
        setHasMore(res.data.length === PAGE_SIZE)
      })
      .catch(() => setReplies([]))
  }, [id, skip])

  const canReply = isAuthenticated && user && !user.is_muted && post && !post.is_deleted
  const isAuthor = user && post && user.id === post.author_id
  const canDelete = isAuthor || isAdmin || isModerator
  const canPin = isAdmin || isModerator

  const handlePin = async () => {
    try {
      await api.post(`/api/posts/${id}/pin`)
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除此帖子吗？')) return
    try {
      await api.delete(`/api/posts/${id}`)
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyContent.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/api/posts/${id}/replies`, { content: replyContent })
      setReplyContent('')
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
      setSkip(0)
      const repliesRes = await api.get(`/api/posts/${id}/replies`, { params: { skip: 0, limit: PAGE_SIZE } })
      setReplies(repliesRes.data)
      setHasMore(repliesRes.data.length === PAGE_SIZE)
    } catch (err) {
      alert('回复失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="loading">加载中...</div>
  if (!post) return <div className="empty-state"><p>帖子不存在</p></div>

  return (
    <div>
      <div className="post-detail">
        <div className="post-detail-header">
          <div className="post-detail-title">
            {post.title}
            {post.is_pinned && <span className="pin-badge">置顶</span>}
            {post.is_deleted && <span className="deleted-badge">已删除</span>}
          </div>
          <div className="post-detail-meta">
            <span className="post-detail-author">
              <span className="avatar avatar-sm">
                {post.author?.avatar ? <img src={post.author.avatar} alt="" /> : post.author?.username?.[0] || '?'}
              </span>
              {post.author?.username || '未知'}
            </span>
            <span>{new Date(post.created_at).toLocaleString()}</span>
            <span>👁 {post.view_count} 次浏览</span>
          </div>
          <div className="post-detail-actions">
            {isAuthor && !post.is_deleted && (
              <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/post/${id}/edit`)}>编辑</button>
            )}
            {canPin && !post.is_deleted && (
              <button className="btn btn-sm btn-warning" onClick={handlePin}>
                {post.is_pinned ? '取消置顶' : '置顶'}
              </button>
            )}
            {canDelete && !post.is_deleted && (
              <button className="btn btn-sm btn-danger" onClick={handleDelete}>删除</button>
            )}
          </div>
        </div>
        <div className="post-detail-content">
          <MarkdownRenderer content={post.content} />
        </div>
      </div>

      <div className="replies-section">
        <div className="replies-title">回复 ({post.replies?.length ?? replies.length})</div>

        {replies.length === 0 ? (
          <div className="empty-state"><p>暂无回复</p></div>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className={`reply-item ${reply.is_deleted ? 'deleted' : ''}`}>
              <div className="reply-header">
                <span className="reply-author">
                  <span className="avatar avatar-sm">
                    {reply.author?.avatar ? <img src={reply.author.avatar} alt="" /> : reply.author?.username?.[0] || '?'}
                  </span>
                  {reply.author?.username || '未知'}
                </span>
                <span className="reply-date">{new Date(reply.created_at).toLocaleString()}</span>
              </div>
              <div className="reply-content">
                {reply.is_deleted ? <em style={{ color: 'var(--text-light)' }}>该回复已删除</em> : (
                  <MarkdownRenderer content={reply.content} />
                )}
              </div>
            </div>
          ))
        )}

        {replies.length > 0 && (
          <div className="pagination">
            <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>上一页</button>
            <span className="page-info">第 {Math.floor(skip / PAGE_SIZE) + 1} 页</span>
            <button disabled={!hasMore} onClick={() => setSkip(skip + PAGE_SIZE)}>下一页</button>
          </div>
        )}
      </div>

      {canReply && (
        <div className="reply-form">
          <form onSubmit={handleReply}>
            <MarkdownEditor value={replyContent} onChange={setReplyContent} />
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 12 }}>
              {submitting ? '发送中...' : '发送回复'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
