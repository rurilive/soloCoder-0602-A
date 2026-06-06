import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Avatar, Dropdown, message } from 'antd'
import {
  BookOutlined,
  FileTextOutlined,
  LogoutOutlined,
  UserOutlined
} from '@ant-design/icons'

const { Header, Sider, Content } = Layout

function TeacherLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const u = JSON.parse(userStr)
      if (u.role !== 'teacher') {
        navigate('/login')
        return
      }
      setUser(u)
    } else {
      navigate('/login')
    }
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    message.success('已退出登录')
    navigate('/login')
  }

  const menuItems = [
    {
      key: '/teacher/questions',
      icon: <BookOutlined />,
      label: '题库管理'
    },
    {
      key: '/teacher/exams',
      icon: <FileTextOutlined />,
      label: '考试管理'
    }
  ]

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ]

  const getSelectedKey = () => {
    if (location.pathname.startsWith('/teacher/exams')) {
      return '/teacher/exams'
    }
    return '/teacher/questions'
  }

  if (!user) return null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 18,
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          教师端
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: 'white',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,21,41,0.08)'
        }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>在线考试系统</div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user.name}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 0, background: '#f0f2f5' }}>
          <div style={{ padding: 24, minHeight: 'calc(100vh - 64px)' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default TeacherLayout
