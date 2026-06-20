import { useEffect, useState, useCallback } from 'react'
import { clientsAPI, deviceAuthAPI } from '../api'
import type { Client, DeviceAuthorization } from '../types'

type TabKey = 'overview' | 'deviceAuth'

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [deviceAuths, setDeviceAuths] = useState<DeviceAuthorization[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [clientsRes, authsRes] = await Promise.all([
        clientsAPI.list(),
        deviceAuthAPI.list(statusFilter || undefined),
      ])
      setClients(clientsRes.data)
      setDeviceAuths(authsRes.data)
    } catch (e) {
      console.error('Failed to fetch data', e)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleApprove = async (id: number) => {
    setActionLoading(id)
    try {
      await deviceAuthAPI.approve(id)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e?.response?.data?.detail || '批准失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeny = async (id: number) => {
    setActionLoading(id)
    try {
      await deviceAuthAPI.deny(id)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e?.response?.data?.detail || '拒绝失败')
    } finally {
      setActionLoading(null)
    }
  }

  const stats = [
    { label: '注册客户端', value: clients.length, icon: '🔑', color: '#667eea' },
    { label: '活跃客户端', value: clients.filter(c => c.is_active).length, icon: '✅', color: '#38a169' },
    { label: '待确认授权', value: deviceAuths.filter(a => a.status === 'pending').length, icon: '📱', color: '#dd6b20' },
    { label: 'SSO支持', value: '已启用', icon: '🔄', color: '#805ad5' },
  ]

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: '#fef3c7', text: '#92400e', label: '待确认' },
      approved: { bg: '#d1fae5', text: '#065f46', label: '已批准' },
      denied: { bg: '#fee2e2', text: '#991b1b', label: '已拒绝' },
    }
    const s = map[status] || { bg: '#e5e7eb', text: '#374151', label: status }
    return (
      <span style={{
        background: s.bg, color: s.text,
        padding: '4px 10px', borderRadius: '999px',
        fontSize: '12px', fontWeight: '600',
      }}>{s.label}</span>
    )
  }

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString('zh-CN')
    } catch { return s }
  }

  const isExpired = (expiresAt: string) => {
    try {
      return new Date(expiresAt).getTime() < Date.now()
    } catch { return false }
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>📊 仪表盘</h1>

      <div style={styles.tabBar}>
        {[
          { key: 'overview' as TabKey, label: '概览', icon: '📋' },
          { key: 'deviceAuth' as TabKey, label: '设备授权', icon: '📱' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.key === 'deviceAuth' && deviceAuths.filter(a => a.status === 'pending').length > 0 && (
              <span style={styles.badge}>{deviceAuths.filter(a => a.status === 'pending').length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
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
                { method: 'POST', path: '/device_authorization', desc: '设备授权发起 (RFC8628)' },
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
        </>
      )}

      {activeTab === 'deviceAuth' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>📱 设备授权请求</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={styles.select}
              >
                <option value="">全部状态</option>
                <option value="pending">待确认</option>
                <option value="approved">已批准</option>
                <option value="denied">已拒绝</option>
              </select>
              <button onClick={() => setRefreshKey(k => k + 1)} style={styles.refreshBtn}>
                🔄 刷新
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>加载中...</div>
          ) : deviceAuths.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>
              暂无设备授权请求
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>用户码</th>
                    <th style={styles.th}>客户端</th>
                    <th style={styles.th}>权限范围</th>
                    <th style={styles.th}>状态</th>
                    <th style={styles.th}>操作用户</th>
                    <th style={styles.th}>创建时间</th>
                    <th style={styles.th}>过期时间</th>
                    <th style={styles.th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceAuths.map(auth => (
                    <tr key={auth.id} style={{
                      ...styles.tableRow,
                      ...(auth.status === 'pending' && !isExpired(auth.expires_at) ? { background: '#fffbeb' } : {}),
                    }}>
                      <td style={styles.td}>
                        <code style={styles.userCode}>{auth.user_code}</code>
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '600' }}>{auth.client_name || auth.client_id}</div>
                        <div style={{ fontSize: '11px', color: '#718096', fontFamily: 'monospace' }}>
                          {auth.client_id.slice(0, 16)}...
                        </div>
                      </td>
                      <td style={styles.td}>{auth.scope}</td>
                      <td style={styles.td}>
                        {auth.status === 'pending' && isExpired(auth.expires_at) ? (
                          <span style={{
                            background: '#e5e7eb', color: '#374151',
                            padding: '4px 10px', borderRadius: '999px',
                            fontSize: '12px', fontWeight: '600',
                          }}>已过期</span>
                        ) : statusBadge(auth.status)}
                      </td>
                      <td style={styles.td}>
                        {auth.username ? (
                          <div>
                            <div style={{ fontWeight: '500' }}>{auth.username}</div>
                            {auth.resolved_at && (
                              <div style={{ fontSize: '11px', color: '#718096' }}>
                                {formatDate(auth.resolved_at)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#a0aec0' }}>-</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontSize: '12px' }}>{formatDate(auth.created_at)}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          fontSize: '12px',
                          color: isExpired(auth.expires_at) ? '#e53e3e' : '#2d3748',
                        }}>
                          {formatDate(auth.expires_at)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {auth.status === 'pending' && !isExpired(auth.expires_at) ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleApprove(auth.id)}
                              disabled={actionLoading === auth.id}
                              style={{ ...styles.actionBtn, ...styles.approveBtn }}
                            >
                              {actionLoading === auth.id ? '处理中...' : '✅ 批准'}
                            </button>
                            <button
                              onClick={() => handleDeny(auth.id)}
                              disabled={actionLoading === auth.id}
                              style={{ ...styles.actionBtn, ...styles.denyBtn }}
                            >
                              {actionLoading === auth.id ? '处理中...' : '❌ 拒绝'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>
                            {auth.is_used ? '已使用' : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '16px', background: '#f7fafc', borderRadius: '8px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#2d3748' }}>
              ℹ️ 设备授权流程说明
            </div>
            <ol style={{ margin: '0', paddingLeft: '20px', color: '#4a5568', fontSize: '13px', lineHeight: '1.8' }}>
              <li>客户端调用 <code>/device_authorization</code> 发起设备授权请求，获取 <code>device_code</code> 和 <code>user_code</code></li>
              <li>设备显示 user_code，并提示用户访问 <code>/device</code> 页面输入该代码</li>
              <li>用户在管理控制台"设备授权"标签页看到待确认请求，点击"批准"或"拒绝"</li>
              <li>客户端按 <code>interval</code> 指定的秒数间隔轮询 <code>/token</code> 端点（grant_type=urn:ietf:params:oauth:grant-type:device_code）</li>
              <li>用户批准后，轮询返回 access_token 和 refresh_token</li>
            </ol>
          </div>
        </div>
      )}
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
  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '0',
  } as React.CSSProperties,
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#718096',
    marginBottom: '-1px',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  tabActive: {
    color: '#667eea',
    borderBottomColor: '#667eea',
  } as React.CSSProperties,
  badge: {
    background: '#e53e3e',
    color: 'white',
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '999px',
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '0',
  } as React.CSSProperties,
  select: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    background: 'white',
    cursor: 'pointer',
  } as React.CSSProperties,
  refreshBtn: {
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    background: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  } as React.CSSProperties,
  tableHeader: {
    background: '#f7fafc',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#4a5568',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  tableRow: {
    borderBottom: '1px solid #f0f0f0',
  } as React.CSSProperties,
  td: {
    padding: '12px 16px',
    verticalAlign: 'middle',
    color: '#2d3748',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  userCode: {
    background: '#edf2f7',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#4c51bf',
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  actionBtn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  approveBtn: {
    background: '#38a169',
    color: 'white',
  } as React.CSSProperties,
  denyBtn: {
    background: '#e53e3e',
    color: 'white',
  } as React.CSSProperties,
}
