import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Select, message, Typography } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { authAPI } from '../api'

const { Title, Text } = Typography
const { Option } = Select

function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login')

  const onFinish = async (values) => {
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await authAPI.login(values)
        localStorage.setItem('token', res.data.access_token)
        localStorage.setItem('user', JSON.stringify(res.data.user))
        message.success('登录成功')
        if (res.data.user.role === 'teacher') {
          navigate('/teacher')
        } else {
          navigate('/student')
        }
      } else {
        await authAPI.register(values)
        message.success('注册成功，请登录')
        setMode('login')
      }
    } catch (err) {
      message.error(err.response?.data?.detail || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8 }}>在线考试系统</Title>
          <Text type="secondary">{mode === 'login' ? '请登录您的账号' : '注册新账号'}</Text>
        </div>
        
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          {mode === 'register' && (
            <Form.Item
              name="name"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="姓名" />
            </Form.Item>
          )}

          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          {mode === 'register' && (
            <Form.Item
              name="role"
              initialValue="student"
              rules={[{ required: true, message: '请选择角色' }]}
            >
              <Select>
                <Option value="student">学生</Option>
                <Option value="teacher">教师</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录'}
            </Button>
          </div>
        </Form>

        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            测试账号：teacher/123456 (教师) 或 student1/123456 (学生)
          </Text>
        </div>
      </Card>
    </div>
  )
}

export default Login
