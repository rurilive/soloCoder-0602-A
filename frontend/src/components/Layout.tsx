import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { path: '/dashboard', label: '📊 仪表盘', icon: '📊' },
    { path: '/clients', label: '🔑 客户端管理', icon: '🔑' },
    { path: '/test', label: '🧪 OAuth测试', icon: '🧪' },
  ]

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🔐</span>
          <span style={styles.logoText}>OAuth2.0 SSO</span>
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                ...styles.navItem,
                ...(location.pathname === item.path ? styles.navItemActive : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={styles.userSection}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{user?.username?.[0]?.toUpperCase()}</div>
            <div>
              <div style={styles.username}>{user?.username}</div>
              <div style={styles.userEmail}>{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            🚪 退出登录
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
  } as React.CSSProperties,
  sidebar: {
    width: '260px',
    background: 'linear-gradient(180deg, #1a365d 0%, #2c5282 100%)',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
  } as React.CSSProperties,
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 8px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  } as React.CSSProperties,
  logoIcon: {
    fontSize: '32px',
  } as React.CSSProperties,
  logoText: {
    fontSize: '18px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  nav: {
    flex: 1,
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.7)',
    transition: 'all 0.2s',
    fontSize: '14px',
  } as React.CSSProperties,
  navItemActive: {
    background: 'rgba(255,255,255,0.15)',
    color: 'white',
  } as React.CSSProperties,
  userSection: {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    padding: '24px 8px 0',
  } as React.CSSProperties,
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '16px',
  } as React.CSSProperties,
  username: {
    fontWeight: '600',
    fontSize: '14px',
  } as React.CSSProperties,
  userEmail: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.6)',
  } as React.CSSProperties,
  logoutBtn: {
    width: '100%',
    padding: '10px',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  main: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto',
  } as React.CSSProperties,
}
