import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { getFeed } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { formatTime } from '../utils/notification'

const PAGE_SIZE = 20

export default function Home() {
  const { isAuthenticated, user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [activeTab, setActiveTab] = useState('sections')

  const [feedItems, setFeedItems] = useState([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedCursor, setFeedCursor] = useState(null)
  const [feedHasMore, setFeedHasMore] = useState(false)

  const [latestPosts, setLatestPosts] = useState([])
  const [latestLoading, setLatestLoading] = useState(false)

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

  useEffect(() => {
    if (activeTab === 'feed' && isAuthenticated) {
      fetchFeedItems()
    }
  }, [activeTab, isAuthenticated])

  useEffect(() => {
    if (activeTab === 'latest') {
      fetchLatestPosts()
    }
  }, [activeTab])

  const fetchFeedItems = useCallback(async (cursor = null) => {
    setFeedLoading(true)
    try {
      const res = await getFeed(cursor, PAGE_SIZE)
      if (cursor) {
        setFeedItems(prev => [...prev, ...res.data.items])
      } else {
        setFeedItems(res.data.items)
      }
      setFeedCursor(res.data.next_cursor)
      setFeedHasMore(res.data.has_more)
    } catch {
      if (!cursor) setFeedItems([])
    } finally {
      setFeedLoading(false)
    }
  }, [])

  const fetchLatestPosts = async () => {
    setLatestLoading(true)
    try {
      const res = await api.get('/api/posts/search', { params: { q: '', skip: 0, limit: PAGE_SIZE } })
      setLatestPosts(res.data.items || [])
    } catch {
      setLatestPosts([])
    } finally {
      setLatestLoading(false)
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

  const loadMoreFeed = () => {
    if (feedCursor && feedHasMore) {
      fetchFeedItems(feedCursor)
    }
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div>
      <div className="home-tabs">
        <button
          className={`home-tab ${activeTab === 'sections' ? 'active' : ''}`}
          onClick={() => setActiveTab('sections')}
        >
          板块列表
        </button>
        <button
          className={`home-tab ${activeTab === 'latest' ? 'active' : ''}`}
          onClick={() => setActiveTab('latest')}
        >
          最新帖子
        </button>
        {isAuthenticated && (
          <button
            className={`home-tab ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            关注动态
          </button>
        )}
      </div>

      {activeTab === 'sections' && (
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
      )}

      {activeTab === 'latest' && (
        <div>
          {latestLoading ? (
            <div className="loading">加载中...</div>
          ) : latestPosts.length === 0 ? (
            <div className="empty-state"><p>暂无帖子</p></div>
          ) : (
            latestPosts.map((post) => (
              <div key={`latest-${post.id}`} className="feed-card feed-card-post">
                <div className="feed-card-header">
                  <div className="feed-card-author">
                    <span className="avatar avatar-sm">
                      {post.author?.avatar ? <img src={post.author.avatar} alt="" /> : post.author?.username?.[0] || '?'}
                    </span>
                    <span className="feed-author-name">{post.author?.username || '未知'}</span>
                    {post.section && <span className="section-tag">{post.section.name}</span>}
                  </div>
                  <span className="feed-card-time">{formatTime(post.created_at)}</span>
                </div>
                <div className="feed-card-title">
                  <Link to={`/post/${post.id}`}>{post.title}</Link>
                </div>
                {post.content && (
                  <div className="feed-card-summary">{post.content.slice(0, 120)}{post.content.length > 120 ? '...' : ''}</div>
                )}
                <div className="feed-card-stats">
                  <span>💬 {post.reply_count ?? 0}</span>
                  <span>👁 {post.view_count ?? 0}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'feed' && (
        <div>
          {feedLoading && feedItems.length === 0 ? (
            <div className="loading">加载中...</div>
          ) : feedItems.length === 0 ? (
            <div className="empty-state">
              <p>暂无关注动态</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>关注其他用户后，他们的帖子和回复将出现在这里</p>
            </div>
          ) : (
            <>
              {feedItems.map((item) => (
                item.activity_type === 'post' ? (
                  <div key={`post-${item.id}`} className="feed-card feed-card-post">
                    <div className="feed-card-header">
                      <div className="feed-card-author">
                        <span className="avatar avatar-sm">
                          {item.author?.avatar ? <img src={item.author.avatar} alt="" /> : item.author?.username?.[0] || '?'}
                        </span>
                        <span className="feed-author-name">{item.author?.username || '未知'}</span>
                        <span className="section-tag">{item.section?.name || '未知板块'}</span>
                      </div>
                      <span className="feed-card-time">{formatTime(item.created_at)}</span>
                    </div>
                    <div className="feed-card-title">
                      <Link to={`/post/${item.id}`}>{item.title}</Link>
                    </div>
                    <div className="feed-card-summary">{item.content_summary}</div>
                    <div className="feed-card-stats">
                      <span>💬 {item.reply_count}</span>
                      <span>⭐ {item.favorite_count}</span>
                      <span>🎁 {item.reward_count}</span>
                    </div>
                  </div>
                ) : (
                  <div key={`reply-${item.id}`} className="feed-card feed-card-reply">
                    <div className="feed-card-header">
                      <div className="feed-card-author">
                        <span className="avatar avatar-sm">
                          {item.author?.avatar ? <img src={item.author.avatar} alt="" /> : item.author?.username?.[0] || '?'}
                        </span>
                        <span className="feed-author-name">{item.author?.username || '未知'}</span>
                        <span className="section-tag">{item.section?.name || '未知板块'}</span>
                      </div>
                      <span className="feed-card-time">{formatTime(item.created_at)}</span>
                    </div>
                    <div className="feed-card-reply-hint">
                      在《<Link to={`/post/${item.original_post_id}`}>{item.original_post_title}</Link>》中回复了
                    </div>
                    <div className="feed-card-summary">{item.content_summary}</div>
                    <div className="feed-card-stats">
                      <span>💬 {item.reply_count}</span>
                      <span>⭐ {item.favorite_count}</span>
                      <span>🎁 {item.reward_count}</span>
                    </div>
                  </div>
                )
              ))}
              {feedHasMore && (
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  <button className="btn btn-secondary" onClick={loadMoreFeed} disabled={feedLoading}>
                    {feedLoading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
