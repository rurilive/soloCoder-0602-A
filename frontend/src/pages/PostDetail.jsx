import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { getPostRevisions, getPostDiff, getPostWebSocketUrl, createReport, rewardPost, getPostRewardInfo } from '../api'
import { useAuth } from '../contexts/AuthContext'
import MarkdownRenderer from '../components/MarkdownRenderer'
import MarkdownEditor from '../components/MarkdownEditor'

const PAGE_SIZE = 20

function ReplyItem({ reply, onReply, onReport, depth = 0 }) {
  const { user, isAuthenticated } = useAuth()
  const canReply = isAuthenticated && user && !user.is_muted && !reply.is_deleted && !reply.is_pending_review
  const canReport = isAuthenticated && user && !reply.is_deleted && reply.author_id !== user?.id && !reply.is_pending_review
  const isOwnPending = user && reply.author_id === user.id && reply.is_pending_review

  const handleReply = (e) => {
    e.stopPropagation()
    if (onReply) {
      onReply(reply)
    }
  }

  return (
    <div className={`reply-item ${reply.is_deleted ? 'deleted' : ''} ${reply.is_pending_review ? 'pending-review' : ''}`}>
      <div className="reply-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="reply-floor">#{reply.floor_number}楼</span>
          <span className="reply-author">
            <span className="avatar avatar-sm">
              {reply.author?.avatar ? <img src={reply.author.avatar} alt="" /> : reply.author?.username?.[0] || '?'}
            </span>
            {reply.author?.username || '未知'}
          </span>
          {reply.is_pending_review && <span className="pending-review-badge">审核中</span>}
        </div>
        <div className="reply-actions">
          <span className="reply-date">{new Date(reply.created_at).toLocaleString()}</span>
          {canReply && (
            <button className="reply-action-btn" onClick={handleReply}>
              回复
            </button>
          )}
          {canReport && (
            <button className="reply-action-btn report-btn" onClick={() => onReport && onReport('reply', reply.id)}>
              举报
            </button>
          )}
        </div>
      </div>
      <div className="reply-content">
        {reply.is_deleted ? (
          <em style={{ color: 'var(--text-light)' }}>该回复已删除</em>
        ) : reply.is_pending_review ? (
          <div className="pending-review-hint">
            {isOwnPending ? (
              <em style={{ color: 'var(--warning-color)' }}>⏳ 您的回复正在审核中，仅您自己可见</em>
            ) : (
              <em style={{ color: 'var(--text-light)' }}>该回复正在审核中</em>
            )}
          </div>
        ) : (
          <MarkdownRenderer content={reply.content} />
        )}
      </div>
      {reply.children && reply.children.length > 0 && (
        <div className="reply-children">
          {reply.children.map((child) => (
            <ReplyItem key={child.id} reply={child} onReply={onReply} onReport={onReport} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function DiffViewer({ diff }) {
  if (!diff) return null

  const renderDiff = (operations) => {
    return operations.map((op, index) => {
      let className = 'diff-equal'
      if (op.type === 'insert') className = 'diff-insert'
      else if (op.type === 'delete') className = 'diff-delete'
      return (
        <span key={index} className={className}>
          {op.value}
        </span>
      )
    })
  }

  return (
    <div className="diff-viewer">
      <div className="diff-section">
        <h4>标题变更</h4>
        <div className="diff-content">
          {renderDiff(diff.title_diff)}
        </div>
      </div>
      <div className="diff-section">
        <h4>内容变更</h4>
        <div className="diff-content diff-content-multiline">
          {renderDiff(diff.content_diff)}
        </div>
      </div>
    </div>
  )
}

function RevisionList({ revisions, onViewDiff, selectedOld, selectedNew, onSelectOld, onSelectNew }) {
  const { user } = useAuth()
  const maxVersion = revisions.length > 0 ? Math.max(...revisions.map(r => r.version)) : 0

  return (
    <div className="revision-list">
      <div className="revision-header">
        <h3>编辑历史</h3>
        <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>
          选择两个版本进行对比（点击版本号选择）
        </p>
      </div>

      {selectedOld !== null && selectedNew !== null && selectedOld < selectedNew && (
        <div style={{ marginBottom: '16px' }}>
          <button 
            className="btn btn-primary btn-sm" 
            onClick={() => onViewDiff(selectedOld, selectedNew)}
          >
            对比版本 v{selectedOld} → v{selectedNew}
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            style={{ marginLeft: '8px' }}
            onClick={() => { onSelectOld(null); onSelectNew(null) }}
          >
            清除选择
          </button>
        </div>
      )}

      <div className="revision-items">
        {revisions.map((rev) => {
          const version = rev.version
          const isLatest = version === maxVersion
          const isSelectedOld = selectedOld === version
          const isSelectedNew = selectedNew === version

          return (
            <div 
              key={rev.id} 
              className={`revision-item ${isLatest ? 'current-version' : ''} ${isSelectedOld ? 'selected-old' : ''} ${isSelectedNew ? 'selected-new' : ''}`}
            >
              <div className="revision-version-badge">
                {isLatest ? '当前版本' : `v${version}`}
              </div>
              <div className="revision-info">
                <div className="revision-meta">
                  <span 
                    className="revision-version"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isSelectedOld) {
                        onSelectOld(null)
                      } else if (isSelectedNew) {
                        onSelectNew(null)
                      } else if (selectedOld === null || (selectedNew !== null && selectedOld !== null)) {
                        onSelectOld(version)
                        onSelectNew(null)
                      } else if (selectedNew === null) {
                        if (version > selectedOld) {
                          onSelectNew(version)
                        } else {
                          onSelectOld(version)
                        }
                      }
                    }}
                  >
                    [{isSelectedOld ? '旧版本' : isSelectedNew ? '新版本' : `v${version}`}]
                  </span>
                  <span className="revision-editor">
                    <span className="avatar avatar-xs">
                      {rev.editor?.avatar ? <img src={rev.editor.avatar} alt="" /> : rev.editor?.username?.[0] || '?'}
                    </span>
                    {rev.editor?.username || '未知'}
                  </span>
                  <span className="revision-date">{new Date(rev.created_at).toLocaleString()}</span>
                </div>
                {rev.edit_reason && (
                  <div className="revision-reason">
                    <strong>编辑原因：</strong>{rev.edit_reason}
                  </div>
                )}
                <div className="revision-preview">
                  <strong>标题：</strong>{rev.title}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isAdmin, isModerator, fetchUser } = useAuth()
  const [post, setPost] = useState(null)
  const [replies, setReplies] = useState([])
  const [replyContent, setReplyContent] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [skip, setSkip] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('content')
  const [revisions, setRevisions] = useState([])
  const [revisionsLoading, setRevisionsLoading] = useState(false)
  const [diff, setDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectedOldVersion, setSelectedOldVersion] = useState(null)
  const [selectedNewVersion, setSelectedNewVersion] = useState(null)
  const [editNotification, setEditNotification] = useState(null)
  const [reportModal, setReportModal] = useState(null)
  const [reportReason, setReportReason] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [rewardInfo, setRewardInfo] = useState({ reward_count: 0, is_rewarded: false, rewarders: [] })
  const [rewardLoading, setRewardLoading] = useState(false)
  const [scheduledCountdown, setScheduledCountdown] = useState('')
  const wsRef = useRef(null)

  const postId = parseInt(id)
  const activeTabRef = useRef(activeTab)
  const userRef = useRef(user)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    userRef.current = user
  }, [user])

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true)
    try {
      const res = await getPostRevisions(postId, 0, 100)
      setRevisions(res.data.items)
    } catch (err) {
      console.error('加载历史版本失败:', err)
    } finally {
      setRevisionsLoading(false)
    }
  }, [postId])

  const loadDiff = useCallback(async (oldVer, newVer) => {
    setDiffLoading(true)
    setDiff(null)
    try {
      const res = await getPostDiff(postId, oldVer, newVer)
      setDiff(res.data)
    } catch (err) {
      alert('加载 diff 失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setDiffLoading(false)
    }
  }, [postId])

  const handleViewDiff = useCallback((oldVer, newVer) => {
    loadDiff(oldVer, newVer)
  }, [loadDiff])

  useEffect(() => {
    setLoading(true)
    api.get(`/api/posts/${id}`)
      .then((res) => setPost(res.data))
      .catch(() => setPost(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!post || !post.is_scheduled || !post.scheduled_at) return
    const updateCountdown = () => {
      const now = new Date()
      const target = new Date(post.scheduled_at)
      const diff = target - now
      if (diff <= 0) {
        setScheduledCountdown('即将发布...')
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      const parts = []
      if (days > 0) parts.push(`${days}天`)
      if (hours > 0 || days > 0) parts.push(`${hours}小时`)
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`)
      parts.push(`${seconds}秒`)
      setScheduledCountdown(parts.join(' '))
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [post])

  useEffect(() => {
    getPostRewardInfo(postId)
      .then((res) => setRewardInfo(res.data))
      .catch(() => setRewardInfo({ reward_count: 0, is_rewarded: false, rewarders: [] }))
  }, [postId])

  useEffect(() => {
    api.get(`/api/posts/${id}/replies`, { params: { skip, limit: PAGE_SIZE } })
      .then((res) => {
        setReplies(res.data.items)
        setTotal(res.data.total)
        setHasMore(skip + PAGE_SIZE < res.data.total)
      })
      .catch(() => setReplies([]))
  }, [id, skip])

  useEffect(() => {
    if (activeTab === 'history' && revisions.length === 0) {
      loadRevisions()
    }
  }, [activeTab, revisions.length, loadRevisions])

  useEffect(() => {
    const wsUrl = getPostWebSocketUrl(postId)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket 连接已建立')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'post_edited') {
          const currentUser = userRef.current
          if (!currentUser || data.editor_id !== currentUser.id) {
            setEditNotification(data)
          }
          if (activeTabRef.current === 'history') {
            loadRevisions()
          }
        }
      } catch (err) {
        console.error('WebSocket 消息解析失败:', err)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket 连接已关闭')
    }

    ws.onerror = (err) => {
      console.error('WebSocket 错误:', err)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [postId, loadRevisions])

  const handleRefreshPost = async () => {
    try {
      const res = await api.get(`/api/posts/${id}`)
      setPost(res.data)
      setEditNotification(null)
      if (activeTab === 'history') {
        loadRevisions()
      }
    } catch (err) {
      console.error('刷新帖子失败:', err)
    }
  }

  const canReply = isAuthenticated && user && !user.is_muted && post && !post.is_deleted
  const isAuthor = user && post && user.id === post.author_id
  const canDelete = isAuthor || isAdmin || isModerator
  const canPin = isAdmin || isModerator
  const canFavorite = isAuthenticated && post && !post.is_deleted
  const canReward = isAuthenticated && user && post && !post.is_deleted && post.author_id !== user.id && !rewardInfo.is_rewarded
  const canReportPost = isAuthenticated && user && post && !post.is_deleted && post.author_id !== user.id

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

  const handleReward = async () => {
    if (!confirm('确认打赏？将消耗2点声望，作者获得1点声望')) return
    setRewardLoading(true)
    try {
      await rewardPost(postId)
      const res = await getPostRewardInfo(postId)
      setRewardInfo(res.data)
      await fetchUser()
    } catch (err) {
      alert('打赏失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setRewardLoading(false)
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

  const handleOpenReport = (targetType, targetId) => {
    setReportModal({ targetType, targetId })
    setReportReason('')
  }

  const handleReport = async (e) => {
    e.preventDefault()
    if (!reportReason.trim()) return
    setReportSubmitting(true)
    try {
      await createReport(reportModal.targetType, reportModal.targetId, reportReason.trim())
      alert('举报已提交，我们会尽快处理')
      setReportModal(null)
      setReportReason('')
    } catch (err) {
      alert('举报失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setReportSubmitting(false)
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyContent.trim()) return
    setSubmitting(true)
    try {
      const res = await api.post(`/api/posts/${id}/replies`, {
        content: replyContent,
        parent_id: replyTo?.id || null,
      })
      setReplyContent('')
      setReplyTo(null)
      if (res.data.is_pending_review) {
        alert('您的回复已提交，正在审核中，审核通过后将正常展示')
      }
      const postRes = await api.get(`/api/posts/${id}`)
      setPost(postRes.data)
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
      {editNotification && (
        <div className="edit-notification">
          <div className="edit-notification-content">
            <span className="avatar avatar-sm">
              {editNotification.editor_avatar ? <img src={editNotification.editor_avatar} alt="" /> : editNotification.editor_username?.[0] || '?'}
            </span>
            <div>
              <strong>{editNotification.editor_username}</strong> 刚刚更新了这篇帖子
              {editNotification.edit_reason && (
                <div style={{ fontSize: '13px', color: 'var(--text-light)' }}>
                  原因：{editNotification.edit_reason}
                </div>
              )}
            </div>
          </div>
          <div className="edit-notification-actions">
            <button className="btn btn-primary btn-sm" onClick={handleRefreshPost}>
              查看最新版本
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditNotification(null)}>
              忽略
            </button>
          </div>
        </div>
      )}

      <div className="post-detail">
        {post.is_pending_review && user && post.author_id === user.id && (
          <div className="pending-review-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⏳</span>
              <div>
                <strong>内容审核中</strong>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>您的内容正在审核中，目前只有您自己可以看到，审核通过后将正常展示。</div>
              </div>
            </div>
          </div>
        )}
        {post.is_scheduled && user && post.author_id === user.id && (
          <div className="scheduled-publish-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🕐</span>
              <div>
                <strong>定时发布中</strong>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>
                  此帖子将于 {new Date(post.scheduled_at).toLocaleString()} 发布，目前仅您自己可见。
                </div>
                <div className="scheduled-countdown">
                  距发布还有：{scheduledCountdown}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="post-detail-header">
          <div className="post-detail-title">
            {post.title}
            {post.is_pinned && <span className="pin-badge">置顶</span>}
            {post.is_deleted && <span className="deleted-badge">已删除</span>}
            {post.is_pending_review && <span className="pending-review-badge">审核中</span>}
            {post.is_scheduled && <span className="scheduled-badge">定时发布</span>}
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
            {canReward && (
              <button
                className="btn btn-sm btn-reward"
                onClick={handleReward}
                disabled={rewardLoading}
              >
                {rewardLoading ? '打赏中...' : '🎁 打赏'}
              </button>
            )}
            {rewardInfo.is_rewarded && (
              <span className="rewarded-badge">已打赏</span>
            )}
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
            {canReportPost && (
              <button className="btn btn-sm btn-secondary" onClick={() => handleOpenReport('post', post.id)}>举报</button>
            )}
          </div>
          {rewardInfo.reward_count > 0 && (
            <div className="reward-info">
              <span className="reward-count">🎁 {rewardInfo.reward_count} 人打赏</span>
              <div className="rewarder-avatars">
                {rewardInfo.rewarders.map((r) => (
                  <span key={r.id} className="avatar avatar-xs rewarder-avatar" title={r.username}>
                    {r.avatar ? <img src={r.avatar} alt={r.username} /> : r.username?.[0] || '?'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="post-tabs">
          <button 
            className={`post-tab ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
          >
            内容
          </button>
          <button 
            className={`post-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            编辑历史 {revisions.length > 0 && `(${revisions.length})`}
          </button>
        </div>

        {activeTab === 'content' && (
          <div className="post-detail-content">
            <MarkdownRenderer content={post.content} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="post-history">
            {revisionsLoading ? (
              <div className="loading">加载历史版本中...</div>
            ) : revisions.length === 0 ? (
              <div className="empty-state"><p>暂无编辑历史</p></div>
            ) : (
              <>
                <RevisionList 
                  revisions={revisions}
                  onViewDiff={handleViewDiff}
                  selectedOld={selectedOldVersion}
                  selectedNew={selectedNewVersion}
                  onSelectOld={setSelectedOldVersion}
                  onSelectNew={setSelectedNewVersion}
                />
                {diffLoading && <div className="loading">加载 diff 中...</div>}
                {diff && !diffLoading && (
                  <div className="diff-container">
                    <h3>版本对比 v{diff.old_version} → v{diff.new_version}</h3>
                    <DiffViewer diff={diff} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {activeTab === 'content' && (
        <>
          <div className="replies-section">
            <div className="replies-title">回复 ({total})</div>

            {replies.length === 0 ? (
              <div className="empty-state"><p>暂无回复</p></div>
            ) : (
              replies.map((reply) => (
                <ReplyItem key={reply.id} reply={reply} onReply={handleReplyClick} onReport={handleOpenReport} />
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
        </>
      )}

      {reportModal && (
        <div className="modal-overlay" onClick={() => setReportModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>举报{reportModal.targetType === 'post' ? '帖子' : '回复'}</h3>
            <form onSubmit={handleReport}>
              <div className="form-group">
                <label>举报原因</label>
                <textarea
                  className="form-control"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="请描述举报原因..."
                  required
                  rows={4}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setReportModal(null)}>取消</button>
                <button className="btn btn-danger" type="submit" disabled={reportSubmitting}>
                  {reportSubmitting ? '提交中...' : '提交举报'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
