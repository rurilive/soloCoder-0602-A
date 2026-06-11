import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../api'

const PAGE_SIZE = 20

function highlightText(text, keyword) {
  if (!keyword) return text
  const lower = text.toLowerCase()
  const kw = keyword.toLowerCase()
  const idx = lower.indexOf(kw)
  if (idx === -1) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + keyword.length)
  const after = text.slice(idx + keyword.length)
  return (
    <>
      {before}
      <mark style={{ background: 'var(--warning-light)', padding: '0 2px', borderRadius: 2 }}>{match}</mark>
      {highlightText(after, keyword)}
    </>
  )
}

function truncateContent(content, keyword, maxLen = 200) {
  if (!keyword) {
    return content.length > maxLen ? content.slice(0, maxLen) + '...' : content
  }
  const lower = content.toLowerCase()
  const kw = keyword.toLowerCase()
  const idx = lower.indexOf(kw)
  if (idx === -1) {
    return content.length > maxLen ? content.slice(0, maxLen) + '...' : content
  }
  const start = Math.max(0, idx - 60)
  const end = Math.min(content.length, idx + keyword.length + 140)
  let result = content.slice(start, end)
  if (start > 0) result = '...' + result
  if (end < content.length) result = result + '...'
  return result
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const skip = parseInt(searchParams.get('skip') || '0', 10)

  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(query)

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    setLoading(true)
    setInputValue(query)
    api.get('/api/posts/search', { params: { q: query, skip, limit: PAGE_SIZE } })
      .then((res) => {
        if (!cancelled) {
          setPosts(res.data.items)
          setTotal(res.data.total)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPosts([])
          setTotal(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, skip])

  const handleSearch = (e) => {
    e.preventDefault()
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim(), skip: 0 })
    }
  }

  const handleSkipChange = (newSkip) => {
    setSearchParams({ q: query, skip: newSkip })
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1
  const hasMore = skip + PAGE_SIZE < total

  return (
    <div>
      <div className="search-page-header">
        <h2>搜索帖子</h2>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="form-control search-input"
            placeholder="输入关键词搜索帖子标题或内容..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!inputValue.trim()}>
            搜索
          </button>
        </form>
        {query && (
          <div className="search-result-info">
            共找到 <strong>{total}</strong> 条与「<strong>{query}</strong>」相关的结果
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : !query ? (
        <div className="empty-state"><p>请输入关键词开始搜索</p></div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><p>未找到相关帖子</p></div>
      ) : (
        <>
          <div className="search-results">
            {posts.map((post) => (
              <div key={post.id} className={`post-item search-result-item ${post.is_pinned ? 'pinned' : ''}`}>
                <div className="post-item-main">
                  <div className="post-item-title">
                    <Link to={`/post/${post.id}`}>
                      {highlightText(post.title, query)}
                    </Link>
                    {post.is_pinned && <span className="pin-badge">置顶</span>}
                    {post.section && (
                      <Link to={`/section/${post.section.id}`} className="section-tag">
                        {post.section.name}
                      </Link>
                    )}
                  </div>
                  <div className="search-result-content markdown-content">
                    {highlightText(truncateContent(post.content, query), query)}
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
          </div>
          <div className="pagination">
            <button
              disabled={skip === 0}
              onClick={() => handleSkipChange(Math.max(0, skip - PAGE_SIZE))}
            >
              上一页
            </button>
            <span className="page-info">第 {currentPage} / {totalPages || 1} 页</span>
            <button
              disabled={!hasMore}
              onClick={() => handleSkipChange(skip + PAGE_SIZE)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  )
}
