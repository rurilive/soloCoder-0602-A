import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { authApi, setAuthToken } from '../services/api';
import { LoginRequest, CurrentUser } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: CurrentUser) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: LoginRequest) => {
    try {
      setLoading(true);
      const res = await authApi.login(values);
      const { access_token, employee } = res.data;
      setAuthToken(access_token);
      
      const meRes = await authApi.me();
      onLoginSuccess(meRes.data);
      message.success('登录成功');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        style={{
          width: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          borderRadius: 12,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
            企业通讯录管理系统
          </h2>
          <p style={{ color: '#999', margin: 0 }}>请登录您的账号</p>
        </div>
        
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入员工姓名"
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码（默认：123456）"
              size="large"
            />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              icon={<LoginOutlined />}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
        
        <div style={{ marginTop: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>
          <p style={{ margin: 0 }}>演示账号：王十二 / 123456（管理员）</p>
          <p style={{ margin: 0 }}>其他账号：员工姓名 / 123456</p>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
