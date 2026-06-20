import { useState, useEffect } from 'react'
import { clientsAPI, oauthAPI } from '../api'
import type { Client, TokenResponse, IntrospectResponse } from '../types'

export default function TestOAuth() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null)
  const [userInfo, setUserInfo] = useState<{ sub: string; username: string; email: string } | null>(null)
  const [introspectResult, setIntrospectResult] = useState<IntrospectResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [log, setLog] = useState<string[]>([])

  const redirectUri = 'http://localhost:1112/test'

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await clientsAPI.list()
        const activeClients = response.data.filter(c => c.is_active)
        setClients(activeClients)
        if (activeClients.length > 0 && !selectedClient) {
          setSelectedClient(activeClients[0])
        }
      } catch (err: any) {
        addLog('❌ 加载客户端列表失败: ' + (err.response?.data?.detail || err.message))
      }
    }
    fetchClients()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (code && selectedClient) {
      addLog(`📥 收到授权码: ${code.substring(0, 20)}...`)
      exchangeCodeForToken(code)
      window.history.replaceState({}, document.title, '/test')
    }
  }, [selectedClient])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN')
    setLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)])
  }

  const startOAuth = () => {
    if (!selectedClient) {
      setError('请先选择一个客户端')
      return
    }

    if (!selectedClient.redirect_uris.includes(redirectUri)) {
      setError(`该客户端没有配置回调地址: ${redirectUri}\n请在客户端管理中添加此回调地址`)
      return
    }

    setError('')
    setStep(1)
    setTokenResponse(null)
    setUserInfo(null)
    setIntrospectResult(null)
    addLog('🚀 开始 OAuth2.0 授权码流程')

    const state = Math.random().toString(36).substring(2)
    const authUrl = `/authorize?response_type=code&client_id=${selectedClient.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read write&state=${state}`

    addLog(`🔗 重定向到授权服务器: ${authUrl}`)
    window.location.href = authUrl
  }

  const exchangeCodeForToken = async (code: string) => {
    if (!selectedClient || !selectedClient.client_secret) {
      setError('请先创建一个客户端并获取 client_secret')
      return
    }

    setLoading(true)
    setStep(2)
    addLog('🔄 使用授权码交换 Token...')

    try {
      const response = await oauthAPI.exchangeCode(
        code,
        selectedClient.client_id,
        selectedClient.client_secret,
        redirectUri
      )
      setTokenResponse(response.data)
      setStep(3)
      addLog('✅ Token 交换成功!')
      addLog(`   Access Token: ${response.data.access_token.substring(0, 30)}...`)
      addLog(`   Refresh Token: ${response.data.refresh_token?.substring(0, 30)}...`)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      addLog(`❌ Token 交换失败: ${errorMsg}`)
      setError('Token 交换失败: ' + errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const refreshToken = async () => {
    if (!selectedClient || !selectedClient.client_secret || !tokenResponse?.refresh_token) {
      return
    }

    setLoading(true)
    addLog('🔄 刷新 Access Token...')

    try {
      const response = await oauthAPI.refreshToken(
        tokenResponse.refresh_token,
        selectedClient.client_id,
        selectedClient.client_secret
      )
      setTokenResponse(response.data)
      addLog('✅ Token 刷新成功!')
      addLog(`   新 Access Token: ${response.data.access_token.substring(0, 30)}...`)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      addLog(`❌ Token 刷新失败: ${errorMsg}`)
      setError('Token 刷新失败: ' + errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const getUserInfo = async () => {
    if (!tokenResponse?.access_token) return

    setLoading(true)
    addLog('📡 获取用户信息...')

    try {
      const response = await oauthAPI.userinfo(tokenResponse.access_token)
      setUserInfo(response.data)
      addLog('✅ 用户信息获取成功!')
      addLog(`   用户: ${response.data.username} (${response.data.email})`)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      addLog(`❌ 获取用户信息失败: ${errorMsg}`)
      setError('获取用户信息失败: ' + errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const introspectToken = async (token: string, type: 'access' | 'refresh') => {
    setLoading(true)
    addLog(`🔍 内省 ${type} token...`)

    try {
      const response = await oauthAPI.introspect(token, type === 'access' ? 'access' : 'refresh')
      setIntrospectResult(response.data)
      addLog(`✅ Token 内省结果: ${response.data.active ? '有效' : '无效'}`)
      if (response.data.active) {
        addLog(`   用户: ${response.data.username}, Scope: ${response.data.scope}`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      addLog(`❌ Token 内省失败: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const resetTest = () => {
    setStep(0)
    setTokenResponse(null)
    setUserInfo(null)
    setIntrospectResult(null)
    setError('')
    setLog([])
    addLog('🔄 测试已重置')
  }

  const steps = [
    { num: 1, title: '重定向到授权服务器', desc: '客户端将用户重定向到认证中心的授权端点' },
    { num: 2, title: '用户授权', desc: '用户登录并授权客户端访问' },
    { num: 3, title: '获取 Token', desc: '使用授权码交换 Access Token 和 Refresh Token' },
    { num: 4, title: '访问受保护资源', desc: '使用 Access Token 调用受保护的 API' },
  ]

  return (
    <div>
      <h1 style={styles.pageTitle}>🧪 OAuth2.0 测试</h1>

      <div style={styles.container}>
        <div style={styles.mainSection}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📋 配置</h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>选择客户端</label>
              <select
                value={selectedClient?.client_id || ''}
                onChange={(e) => {
                  const client = clients.find(c => c.client_id === e.target.value)
                  setSelectedClient(client || null)
                  resetTest()
                }}
                style={styles.select}
              >
                <option value="">-- 请选择客户端 --</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedClient && (
              <div style={styles.clientInfo}>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Client ID:</span>
                  <code style={styles.infoCode}>{selectedClient.client_id}</code>
                </div>
                {selectedClient.client_secret ? (
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Client Secret:</span>
                    <code style={styles.infoCode}>{selectedClient.client_secret}</code>
                  </div>
                ) : (
                  <div style={styles.warning}>
                    ⚠️ 此客户端没有可用的 client_secret。请重新创建客户端以获取新的密钥。
                  </div>
                )}
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Redirect URI:</span>
                  <code style={styles.infoCode}>{redirectUri}</code>
                </div>
                {!selectedClient.redirect_uris.includes(redirectUri) && (
                  <div style={styles.warning}>
                    ⚠️ 回调地址未在客户端中配置。请添加: {redirectUri}
                  </div>
                )}
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.buttonGroup}>
              <button
                onClick={startOAuth}
                disabled={loading || !selectedClient || !selectedClient.client_secret}
                style={{
                  ...styles.primaryBtn,
                  ...((loading || !selectedClient || !selectedClient.client_secret) ? styles.disabledBtn : {}),
                }}
              >
                🚀 开始 OAuth2.0 流程
              </button>
              <button onClick={resetTest} style={styles.secondaryBtn}>
                🔄 重置
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>📈 流程步骤</h2>
            <div style={styles.steps}>
              {steps.map((s) => (
                <div
                  key={s.num}
                  style={{
                    ...styles.step,
                    ...(step >= s.num ? styles.stepActive : {}),
                  }}
                >
                  <div style={{
                    ...styles.stepNum,
                    ...(step >= s.num ? styles.stepNumActive : {}),
                  }}>
                    {step > s.num ? '✓' : s.num}
                  </div>
                  <div>
                    <div style={styles.stepTitle}>{s.title}</div>
                    <div style={styles.stepDesc}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {tokenResponse && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>🔑 Token 信息</h2>
              <div style={styles.tokenGrid}>
                <div style={styles.tokenItem}>
                  <div style={styles.tokenLabel}>Access Token</div>
                  <div style={styles.tokenValue}>{tokenResponse.access_token}</div>
                </div>
                {tokenResponse.refresh_token && (
                  <div style={styles.tokenItem}>
                    <div style={styles.tokenLabel}>Refresh Token</div>
                    <div style={styles.tokenValue}>{tokenResponse.refresh_token}</div>
                  </div>
                )}
                <div style={styles.tokenItem}>
                  <div style={styles.tokenLabel}>Token Type</div>
                  <div style={styles.tokenValue}>{tokenResponse.token_type}</div>
                </div>
                <div style={styles.tokenItem}>
                  <div style={styles.tokenLabel}>Expires In</div>
                  <div style={styles.tokenValue}>{tokenResponse.expires_in} 秒</div>
                </div>
                <div style={styles.tokenItem}>
                  <div style={styles.tokenLabel}>Scope</div>
                  <div style={styles.tokenValue}>{tokenResponse.scope}</div>
                </div>
              </div>

              <div style={styles.buttonGroup}>
                <button
                  onClick={() => tokenResponse.refresh_token && refreshToken()}
                  disabled={loading}
                  style={{
                    ...styles.primaryBtn,
                    ...(loading ? styles.disabledBtn : {}),
                  }}
                >
                  🔄 刷新 Token
                </button>
                <button
                  onClick={getUserInfo}
                  disabled={loading}
                  style={{
                    ...styles.primaryBtn,
                    ...(loading ? styles.disabledBtn : {}),
                  }}
                >
                  👤 获取用户信息
                </button>
                <button
                  onClick={() => introspectToken(tokenResponse.access_token, 'access')}
                  disabled={loading}
                  style={{
                    ...styles.secondaryBtn,
                    ...(loading ? styles.disabledBtn : {}),
                  }}
                >
                  🔍 内省 Access Token
                </button>
                {tokenResponse.refresh_token && (
                  <button
                    onClick={() => tokenResponse.refresh_token && introspectToken(tokenResponse.refresh_token, 'refresh')}
                    disabled={loading}
                    style={{
                      ...styles.secondaryBtn,
                      ...(loading ? styles.disabledBtn : {}),
                    }}
                  >
                    🔍 内省 Refresh Token
                  </button>
                )}
              </div>
            </div>
          )}

          {userInfo && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>👤 用户信息</h2>
              <div style={styles.userInfoCard}>
                <div style={styles.userAvatar}>
                  {userInfo.username[0].toUpperCase()}
                </div>
                <div>
                  <div style={styles.userName}>{userInfo.username}</div>
                  <div style={styles.userEmail}>{userInfo.email}</div>
                  <div style={styles.userId}>用户ID: {userInfo.sub}</div>
                </div>
              </div>
            </div>
          )}

          {introspectResult && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>🔍 Token 内省结果</h2>
              <div style={styles.introspectCard}>
                <div style={{
                  ...styles.statusBadge,
                  ...(introspectResult.active ? styles.statusActive : styles.statusInactive),
                }}>
                  {introspectResult.active ? '✅ 有效' : '❌ 无效'}
                </div>
                {introspectResult.active && (
                  <div style={styles.introspectDetails}>
                    <div style={styles.detailRow}>
                      <span>Scope:</span>
                      <code>{introspectResult.scope}</code>
                    </div>
                    <div style={styles.detailRow}>
                      <span>Client ID:</span>
                      <code>{introspectResult.client_id}</code>
                    </div>
                    <div style={styles.detailRow}>
                      <span>用户名:</span>
                      <span>{introspectResult.username}</span>
                    </div>
                    {introspectResult.exp && (
                      <div style={styles.detailRow}>
                        <span>过期时间:</span>
                        <span>{new Date(introspectResult.exp * 1000).toLocaleString('zh-CN')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <span>📜 操作日志</span>
          </div>
          <div style={styles.logContainer}>
            {log.length === 0 ? (
              <div style={styles.emptyLog}>点击"开始 OAuth2.0 流程"开始测试</div>
            ) : (
              log.map((entry, index) => (
                <div key={index} style={styles.logEntry}>
                  {entry}
                </div>
              ))
            )}
          </div>
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
  container: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '24px',
  } as React.CSSProperties,
  mainSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  section: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '20px',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '6px',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
  } as React.CSSProperties,
  clientInfo: {
    background: '#f7fafc',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
  } as React.CSSProperties,
  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    minWidth: '100px',
    paddingTop: '4px',
  } as React.CSSProperties,
  infoCode: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#2d3748',
    background: 'white',
    padding: '8px 12px',
    borderRadius: '4px',
    wordBreak: 'break-all',
    border: '1px solid #e2e8f0',
  } as React.CSSProperties,
  warning: {
    background: '#fff3cd',
    color: '#856404',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    marginTop: '12px',
  } as React.CSSProperties,
  error: {
    background: '#fed7d7',
    color: '#c53030',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    whiteSpace: 'pre-wrap',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '16px',
  } as React.CSSProperties,
  primaryBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  secondaryBtn: {
    padding: '12px 24px',
    background: '#e2e8f0',
    color: '#4a5568',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  disabledBtn: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  step: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    borderRadius: '8px',
    background: '#f7fafc',
    opacity: 0.5,
  } as React.CSSProperties,
  stepActive: {
    background: '#ebf8ff',
    opacity: 1,
  } as React.CSSProperties,
  stepNum: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#cbd5e0',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    flexShrink: 0,
  } as React.CSSProperties,
  stepNumActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  } as React.CSSProperties,
  stepTitle: {
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '4px',
  } as React.CSSProperties,
  stepDesc: {
    fontSize: '13px',
    color: '#718096',
  } as React.CSSProperties,
  tokenGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  } as React.CSSProperties,
  tokenItem: {
    background: '#f7fafc',
    padding: '12px',
    borderRadius: '8px',
  } as React.CSSProperties,
  tokenLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
    marginBottom: '6px',
  } as React.CSSProperties,
  tokenValue: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#2d3748',
    wordBreak: 'break-all',
  } as React.CSSProperties,
  userInfoCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    background: 'linear-gradient(135deg, #f0fff4 0%, #c6f6d5 100%)',
    borderRadius: '12px',
  } as React.CSSProperties,
  userAvatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  userName: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#22543d',
    marginBottom: '4px',
  } as React.CSSProperties,
  userEmail: {
    fontSize: '14px',
    color: '#276749',
    marginBottom: '4px',
  } as React.CSSProperties,
  userId: {
    fontSize: '13px',
    color: '#38a169',
  } as React.CSSProperties,
  introspectCard: {
    padding: '20px',
    background: '#f7fafc',
    borderRadius: '12px',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-block',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '16px',
  } as React.CSSProperties,
  statusActive: {
    background: '#c6f6d5',
    color: '#22543d',
  } as React.CSSProperties,
  statusInactive: {
    background: '#fed7d7',
    color: '#c53030',
  } as React.CSSProperties,
  introspectDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  detailRow: {
    display: 'flex',
    gap: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
  sidebar: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    height: 'fit-content',
    maxHeight: 'calc(100vh - 100px)',
    position: 'sticky',
    top: '32px',
  } as React.CSSProperties,
  sidebarHeader: {
    padding: '20px',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: '600',
    color: '#2d3748',
  } as React.CSSProperties,
  logContainer: {
    flex: 1,
    padding: '12px',
    overflowY: 'auto',
    maxHeight: '600px',
    display: 'flex',
    flexDirection: 'column-reverse',
  } as React.CSSProperties,
  emptyLog: {
    color: '#a0aec0',
    fontSize: '13px',
    textAlign: 'center',
    padding: '40px 20px',
  } as React.CSSProperties,
  logEntry: {
    fontSize: '12px',
    color: '#4a5568',
    padding: '8px 12px',
    fontFamily: 'monospace',
    borderBottom: '1px solid #f7fafc',
    wordBreak: 'break-all',
  } as React.CSSProperties,
}
