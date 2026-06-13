import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}&skip=0`)
      setSearchQuery('')
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">📋 论坛系统</Link>
        <form onSubmit={handleSearch} className="navbar-search">
          <input
            type="text"
            placeholder="搜索帖子..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" aria-label="搜索">🔍</button>
        </form>
        <div className="navbar-links">
          <Link to="/">首页</Link>
          {loading ? (
            <span className="navbar-username navbar-loading">加载中...</span>
          ) : isAuthenticated ? (
            <>
              <NotificationBell />
              <span className="navbar-username">{user?.username}</span>
              <Link to="/profile">个人中心</Link>
              {isAdmin && <Link to="/admin">管理后台</Link>}
              <button className="btn btn-sm btn-secondary" onClick={handleLogout}>退出</button>
            </>
          ) : (
            <>
              <Link to="/login">登录</Link>
              <Link to="/register">注册</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
