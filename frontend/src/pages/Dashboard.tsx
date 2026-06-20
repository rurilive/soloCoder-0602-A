import { useEffect, useState } from 'react'
import { clientsAPI } from '../api'
import type { Client } from '../types'

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await clientsAPI.list()
        setClients(response.data)
      } catch {
        console.error('Failed to fetch clients')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const stats = [
    { label: '注册客户端', value: clients.length, icon: '🔑', color: '#667eea' },
    { label: '活跃客户端', value: clients.filter(c => c.is_active).length, icon: '✅', color: '#38a169' },
    { label: '授权方式', value: '授权码模式', icon: '🎫', color: '#dd6b20' },
    { label: 'SSO支持', value: '已启用', icon: '🔄', color: '#805ad5' },
  ]

  return (
    <div>
      <h1 style={styles.pageTitle}>📊 仪表盘</h1>

      <div style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <div key={index} style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: stat.color }}>{stat.icon}</div>
            <div>
              <div style={styles.statValue}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>🔌 API 端点</h2>
        <div style={styles.apiGrid}>
          {[
            { method: 'POST', path: '/api/auth/register', desc: '用户注册' },
            { method: 'POST', path: '/api/auth/login', desc: '用户登录' },
            { method: 'GET', path: '/api/auth/me', desc: '获取当前用户信息' },
            { method: 'GET', path: '/authorize', desc: 'OAuth2.0 授权端点' },
            { method: 'POST', path: '/token', desc: '获取/刷新Token' },
            { method: 'POST', path: '/introspect', desc: 'Token 内省' },
            { method: 'GET', path: '/userinfo', desc: '获取用户信息' },
            { method: 'GET', path: '/health', desc: '健康检查' },
          ].map((api, index) => (
            <div key={index} style={styles.apiItem}>
              <span style={{
                ...styles.methodBadge,
                ...(api.method === 'GET' ? styles.get : api.method === 'POST' ? styles.post : styles.put),
              }}>{api.method}</span>
              <div style={styles.apiInfo}>
                <code style={styles.apiPath}>{api.path}</code>
                <span style={styles.apiDesc}>{api.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📚 OAuth2.0 授权码流程</h2>
        <div style={styles.flowContainer}>
          {[
            { step: 1, title: '客户端重定向到授权服务器', desc: '携带 client_id, redirect_uri, scope, state 参数' },
            { step: 2, title: '用户登录并授权', desc: '用户输入凭证，授权客户端访问' },
            { step: 3, title: '返回授权码', desc: '授权服务器重定向回客户端，携带 code' },
            { step: 4, title: '交换 Token', desc: '客户端使用 code 换取 access_token 和 refresh_token' },
            { step: 5, title: '访问受保护资源', desc: '使用 access_token 调用 API' },
          ].map((item) => (
            <div key={item.step} style={styles.flowStep}>
              <div style={styles.stepNumber}>{item.step}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{item.title}</div>
                <div style={styles.stepDesc}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  pageTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: '24px',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  } as React.CSSProperties,
  statCard: {
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  } as React.CSSProperties,
  statIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
  } as React.CSSProperties,
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1a202c',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '14px',
    color: '#718096',
  } as React.CSSProperties,
  section: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '20px',
  } as React.CSSProperties,
  apiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  apiItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    background: '#f7fafc',
    borderRadius: '8px',
  } as React.CSSProperties,
  methodBadge: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white',
    flexShrink: 0,
  } as React.CSSProperties,
  get: { background: '#38a169' } as React.CSSProperties,
  post: { background: '#3182ce' } as React.CSSProperties,
  put: { background: '#dd6b20' } as React.CSSProperties,
  apiInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,
  apiPath: {
    fontSize: '13px',
    color: '#2d3748',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  apiDesc: {
    fontSize: '12px',
    color: '#718096',
  } as React.CSSProperties,
  flowContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  flowStep: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
  } as React.CSSProperties,
  stepNumber: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    flexShrink: 0,
  } as React.CSSProperties,
  stepContent: {
    flex: 1,
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  } as React.CSSProperties,
  stepTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '4px',
  } as React.CSSProperties,
  stepDesc: {
    fontSize: '13px',
    color: '#718096',
  } as React.CSSProperties,
}
