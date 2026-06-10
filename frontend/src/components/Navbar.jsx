import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">📋 论坛系统</Link>
        <div className="navbar-links">
          <Link to="/">首页</Link>
          {isAuthenticated ? (
            <>
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
