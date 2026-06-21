import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { Layout, Menu, Dropdown, Avatar } from 'antd'
import { UserOutlined, LogoutOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import DAGList from './pages/DAGList'
import DAGEditor from './pages/DAGEditor'
import ExecutionHistory from './pages/ExecutionHistory'

const { Header, Content, Sider } = Layout

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    logout()
    navigate('/login', { replace: true })
  }

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout
      }
    ]
  }

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div className="app-logo">
          <AppstoreOutlined style={{ marginRight: 8 }} />
          DAG Scheduler
        </div>
        <Dropdown menu={userMenu} placement="bottomRight">
          <div style={{ cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar size="small" icon={<UserOutlined />} />
            <span>{user?.username}</span>
          </div>
        </Dropdown>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['1']}
            style={{ height: '100%', borderRight: 0 }}
            items={[
              { key: '1', icon: <AppstoreOutlined />, label: <Link to="/dags">DAG 列表</Link> }
            ]}
          />
        </Sider>
        <Content className="app-content">
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dags" replace />} />
      <Route
        path="/dags"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DAGList />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dags/:id"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DAGEditor />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dags/:id/executions"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ExecutionHistory />
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
