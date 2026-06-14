import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import MarkdownRenderer from '../components/MarkdownRenderer'
import MarkdownEditor from '../components/MarkdownEditor'

const PAGE_SIZE = 20

function ReplyItem({ reply, onReply, depth = 0 }) {
  const { user, isAuthenticated } = useAuth()
  const canReply = isAuthenticated && user && !user.is_muted && !reply.is_deleted

  const handleReply = (e) => {
    e.stopPropagation()
    if (onReply) {
      onReply(reply)
    }
  }

  return (
    <div className={`reply-item ${reply.is_deleted ? 'deleted' : ''}`}>
      <div className="reply-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="reply-floor">#{reply.floor_number}楼</span>
          <span className="reply-author">
            <span className="avatar avatar-sm">
              {reply.author?.avatar ? <img src={reply.author.avatar} alt="" /> : reply.author?.username?.[0] || '?'}
            </span>
            {reply.author?.username || '未知'}
          </span>
        </div>
        <div className="reply-actions">
          <span className="reply-date">{new Date(reply.created_at).toLocaleString()}</span>
          {canReply && (
            <button className="reply-action-btn" onClick={handleReply}>
              回复
            </button>
          )}
        </div>
      </div>
      <div className="reply-content">
        {reply.is_deleted ? (
          <em style={{ color: 'var(--text-light)' }}>该回复已删除</em>
        ) : (
          <MarkdownRenderer content={reply.content} />
        )}
      </div>
      {reply.children && reply.children.length > 0 && (
        <div className="reply-children">
          {reply.children.map((child) => (
            <ReplyItem key={child.id} reply={child} onReply={onReply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isAdmin, isModerator } = useAuth()
  const [post, setPost] = useState(null)
  const [replies, setReplies] = useState([])
  const [replyContent, setReplyContent] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [skip, setSkip] = useState(0)
  const [total, setTotal] = useState(0)
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
        setReplies(res.data.items)
        setTotal(res.data.total)
        setHasMore(skip + PAGE_SIZE < res.data.total)
      })
      .catch(() => setReplies([]))
  }, [id, skip])

  const canReply = isAuthenticated && user && !user.is_muted && post && !post.is_deleted
  const isAuthor = user && post && user.id === post.author_id
  const canDelete = isAuthor || isAdmin || isModerator
  const canPin = isAdmin || isModerator
  const canFavorite = isAuthenticated && post && !post.is_deleted

  const handleReplyClick = (reply) => {
    setReplyTo(reply)
    setReplyContent(`@${reply.author.username} `)
    const editor = document.querySelector('.reply-form textarea')
    if (editor) {
      editor.focus()
    }
  }

  const handleCancelReply = () => {
    setReplyTo(null)
    setReplyContent('')
  }

  const handleFavorite = async () => {
    try {
      if (post.is_favorited) {
        await api.delete(`/api/posts/${id}/favorite`)
      } else {
        await api.post(`/api/posts/${id}/favorite`)
      }
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    }
  }

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
      await api.post(`/api/posts/${id}/replies`, {
        content: replyContent,
        parent_id: replyTo?.id || null,
      })
      setReplyContent('')
      setReplyTo(null)
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
      setSkip(0)
      const repliesRes = await api.get(`/api/posts/${id}/replies`, { params: { skip: 0, limit: PAGE_SIZE } })
      setReplies(repliesRes.data.items)
      setTotal(repliesRes.data.total)
      setHasMore(PAGE_SIZE < repliesRes.data.total)
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
            {canFavorite && (
              <button
                className={`btn btn-sm ${post.is_favorited ? 'btn-warning' : 'btn-secondary'}`}
                onClick={handleFavorite}
              >
                {post.is_favorited ? '★ 已收藏' : '☆ 收藏'}
              </button>
            )}
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
        <div className="replies-title">回复 ({total})</div>

        {replies.length === 0 ? (
          <div className="empty-state"><p>暂无回复</p></div>
        ) : (
          replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} onReply={handleReplyClick} />
          ))
        )}

        {total > 0 && (
          <div className="pagination">
            <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>上一页</button>
            <span className="page-info">第 {Math.floor(skip / PAGE_SIZE) + 1} 页 / 共 {Math.ceil(total / PAGE_SIZE)} 页</span>
            <button disabled={!hasMore} onClick={() => setSkip(skip + PAGE_SIZE)}>下一页</button>
          </div>
        )}
      </div>

      {canReply && (
        <div className="reply-form">
          {replyTo && (
            <div className="replying-to">
              回复 <span className="at-user">@{replyTo.author.username}</span>
              <button className="cancel-reply-btn" onClick={handleCancelReply}>取消</button>
            </div>
          )}
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
