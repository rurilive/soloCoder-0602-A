import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { deviceAuthAPI, authAPI } from '../api'
import type { UserCodeVerifyResponse } from '../types'
import { useAuth } from '../context/AuthContext'

type Step = 'input' | 'confirm' | 'success' | 'denied'

export default function DeviceVerification() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, login } = useAuth()

  const urlUserCode = searchParams.get('user_code') || ''

  const [step, setStep] = useState<Step>('input')
  const [userCodeInput, setUserCodeInput] = useState(urlUserCode)
  const [verifying, setVerifying] = useState(false)
  const [authInfo, setAuthInfo] = useState<UserCodeVerifyResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [acting, setActing] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (urlUserCode) {
      const formatted = formatUserCode(urlUserCode)
      setUserCodeInput(formatted)
      handleVerify(formatted)
    } else {
      setTimeout(() => codeInputRef.current?.focus(), 100)
    }
  }, [urlUserCode])

  const formatUserCode = (code: string) => {
    const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleaned.length === 8) {
      return cleaned.slice(0, 4) + '-' + cleaned.slice(4)
    }
    return cleaned
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatUserCode(e.target.value)
    setUserCodeInput(formatted)
    setErrorMsg('')
  }

  const handleVerify = async (code?: string) => {
    const codeToVerify = (code || userCodeInput).trim()
    if (!codeToVerify) {
      setErrorMsg('请输入用户码')
      return
    }
    if (codeToVerify.replace(/-/g, '').length !== 8) {
      setErrorMsg('用户码格式不正确，应为 8 位字符')
      return
    }

    setVerifying(true)
    setErrorMsg('')
    try {
      const res = await deviceAuthAPI.verifyUserCode(codeToVerify)
      setAuthInfo(res.data)
      setStep('confirm')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '用户码无效或已过期'
      setErrorMsg(detail)
    } finally {
      setVerifying(false)
    }
  }

  const ensureAuthenticated = async (): Promise<boolean> => {
    if (isAuthenticated) return true
    setShowLogin(true)
    return false
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername || !loginPassword) {
      setErrorMsg('请输入用户名和密码')
      return
    }
    setLoginLoading(true)
    setErrorMsg('')
    try {
      await login(loginUsername, loginPassword)
      setShowLogin(false)
      setLoginUsername('')
      setLoginPassword('')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || '登录失败，请检查用户名和密码'
      setErrorMsg(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!authInfo) return
    const ok = await ensureAuthenticated()
    if (!ok) return

    setActing(true)
    try {
      await deviceAuthAPI.approve(authInfo.id)
      setStep('success')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '批准失败'
      setErrorMsg(detail)
    } finally {
      setActing(false)
    }
  }

  const handleDeny = async () => {
    if (!authInfo) return
    const ok = await ensureAuthenticated()
    if (!ok) return

    setActing(true)
    try {
      await deviceAuthAPI.deny(authInfo.id)
      setStep('denied')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '拒绝失败'
      setErrorMsg(detail)
    } finally {
      setActing(false)
    }
  }

  const handleBackToInput = () => {
    setStep('input')
    setAuthInfo(null)
    setErrorMsg('')
    setUserCodeInput('')
    setTimeout(() => codeInputRef.current?.focus(), 100)
  }

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString('zh-CN')
    } catch { return s }
  }

  const timeRemaining = (expiresAt: string) => {
    try {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) return '已过期'
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      if (mins > 0) return `${mins} 分 ${secs} 秒`
      return `${secs} 秒`
    } catch { return '' }
  }

  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    if (authInfo && step === 'confirm') {
      setTimeLeft(timeRemaining(authInfo.expires_at))
      const t = setInterval(() => {
        setTimeLeft(timeRemaining(authInfo.expires_at))
      }, 1000)
      return () => clearInterval(t)
    }
  }, [authInfo, step])

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🔐</span>
          <span style={styles.logoText}>OAuth2.0 设备授权验证</span>
        </div>

        {step === 'input' && (
          <div>
            <h2 style={styles.title}>输入用户码</h2>
            <p style={styles.subtitle}>
              请输入设备上显示的用户码以继续授权流程
            </p>

            <div style={styles.codeHint}>
              <p style={{ margin: 0, marginBottom: '8px', fontWeight: '600' }}>💡 用户码格式提示</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#4a5568' }}>
                用户码由 8 位大写字母和数字组成，格式如：<code style={styles.inlineCode}>ABCD-EFGH</code>
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleVerify() }} style={{ marginTop: '24px' }}>
              <label style={styles.label}>用户码</label>
              <input
                ref={codeInputRef}
                type="text"
                value={userCodeInput}
                onChange={handleCodeChange}
                placeholder="例如：ABCD-EFGH"
                style={{
                  ...styles.input,
                  ...styles.codeInput,
                  letterSpacing: '3px',
                  fontSize: '22px',
                  fontWeight: '700',
                  textAlign: 'center',
                }}
                maxLength={9}
                autoComplete="off"
              />
              {errorMsg && (
                <div style={styles.errorBox}>{errorMsg}</div>
              )}
              <button
                type="submit"
                disabled={verifying}
                style={{
                  ...styles.button,
                  ...styles.primaryBtn,
                  opacity: verifying ? 0.6 : 1,
                }}
              >
                {verifying ? '验证中...' : '继续'}
              </button>
            </form>
          </div>
        )}

        {step === 'confirm' && authInfo && (
          <div>
            <div style={styles.successIcon}>📱</div>
            <h2 style={styles.title}>确认设备授权请求</h2>

            <div style={styles.infoCard}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>应用名称</span>
                <span style={styles.infoValueStrong}>
                  {authInfo.client_name || authInfo.client_id}
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Client ID</span>
                <code style={styles.infoMono}>{authInfo.client_id.slice(0, 20)}...</code>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>用户码</span>
                <code style={styles.codeBadge}>{authInfo.user_code}</code>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>请求权限</span>
                <span style={styles.infoValue}>{authInfo.scope}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>剩余时间</span>
                <span style={{
                  ...styles.infoValue,
                  color: timeLeft === '已过期' ? '#e53e3e' : '#2b6cb0',
                  fontWeight: '600',
                }}>{timeLeft}</span>
              </div>
            </div>

            <div style={styles.warningBox}>
              <strong>⚠️ 安全提示</strong>
              <ul style={{ margin: '8px 0 0 20px', padding: 0, fontSize: '13px', lineHeight: '1.7' }}>
                <li>请确认此请求是您本人在设备上发起的</li>
                <li>不要批准您不认识的应用或设备</li>
                <li>批准后，该应用将可以代表您访问授权的资源</li>
              </ul>
            </div>

            {errorMsg && (
              <div style={styles.errorBox}>{errorMsg}</div>
            )}

            <div style={styles.actionRow}>
              <button
                onClick={handleDeny}
                disabled={acting}
                style={{
                  ...styles.button,
                  ...styles.dangerBtn,
                  opacity: acting ? 0.6 : 1,
                }}
              >
                {acting ? '处理中...' : '❌ 拒绝授权'}
              </button>
              <button
                onClick={handleApprove}
                disabled={acting}
                style={{
                  ...styles.button,
                  ...styles.primaryBtn,
                  opacity: acting ? 0.6 : 1,
                }}
              >
                {acting ? '处理中...' : '✅ 批准授权'}
              </button>
            </div>

            <button onClick={handleBackToInput} style={styles.linkBtn}>
              ← 返回输入用户码
            </button>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={styles.successIcon}>✅</div>
            <h2 style={styles.title}>授权已批准</h2>
            <p style={styles.subtitle}>
              您已成功批准该设备的授权请求。<br />
              设备将在下次轮询时自动获取访问令牌。
            </p>
            <div style={{ marginTop: '24px' }}>
              <button
                onClick={() => navigate('/')}
                style={{ ...styles.button, ...styles.primaryBtn }}
              >
                前往管理控制台 →
              </button>
              <button onClick={handleBackToInput} style={styles.linkBtn}>
                继续验证其他用户码
              </button>
            </div>
          </div>
        )}

        {step === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={styles.denyIcon}>🚫</div>
            <h2 style={styles.title}>授权已拒绝</h2>
            <p style={styles.subtitle}>
              您已拒绝该设备的授权请求。<br />
              设备将在下次轮询时收到拒绝通知。
            </p>
            <div style={{ marginTop: '24px' }}>
              <button onClick={handleBackToInput} style={{ ...styles.button, ...styles.primaryBtn }}>
                继续验证其他用户码
              </button>
            </div>
          </div>
        )}
      </div>

      {showLogin && (
        <div style={styles.modalOverlay} onClick={() => setShowLogin(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '20px', margin: '0 0 8px', color: '#1a202c' }}>需要登录</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#4a5568' }}>
              请先登录您的账号以完成设备授权操作
            </p>
            <form onSubmit={handleLoginSubmit}>
              <label style={styles.label}>用户名</label>
              <input
                type="text"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                style={styles.input}
                placeholder="请输入用户名"
              />
              <label style={{ ...styles.label, marginTop: '16px' }}>密码</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                style={styles.input}
                placeholder="请输入密码"
              />
              {errorMsg && (
                <div style={{ ...styles.errorBox, marginTop: '16px' }}>{errorMsg}</div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => { setShowLogin(false); setErrorMsg('') }}
                  style={{ ...styles.button, ...styles.secondaryBtn, flex: 1 }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    ...styles.button,
                    ...styles.primaryBtn,
                    flex: 1,
                    opacity: loginLoading ? 0.6 : 1,
                  }}
                >
                  {loginLoading ? '登录中...' : '登录'}
                </button>
              </div>
            </form>
            <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#718096' }}>
              还没有账号？<Link to="/register" style={{ color: '#667eea', textDecoration: 'none' }}>立即注册</Link>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  } as React.CSSProperties,
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '520px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  } as React.CSSProperties,
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '1px solid #edf2f7',
  } as React.CSSProperties,
  logoIcon: {
    fontSize: '32px',
  } as React.CSSProperties,
  logoText: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#2d3748',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a202c',
    margin: '0 0 8px',
    textAlign: 'center',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#718096',
    margin: '0 0 8px',
    textAlign: 'center',
    lineHeight: '1.6',
  } as React.CSSProperties,
  codeHint: {
    background: '#f7fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '20px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: '8px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  codeInput: {
    textTransform: 'uppercase',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  } as React.CSSProperties,
  button: {
    width: '100%',
    padding: '12px 20px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '16px',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  primaryBtn: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
  } as React.CSSProperties,
  dangerBtn: {
    background: '#e53e3e',
    color: 'white',
  } as React.CSSProperties,
  secondaryBtn: {
    background: '#f7fafc',
    color: '#4a5568',
    border: '1px solid #e2e8f0',
  } as React.CSSProperties,
  linkBtn: {
    display: 'block',
    margin: '16px auto 0',
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '4px 8px',
  } as React.CSSProperties,
  successIcon: {
    fontSize: '56px',
    textAlign: 'center',
    marginBottom: '12px',
  } as React.CSSProperties,
  denyIcon: {
    fontSize: '56px',
    textAlign: 'center',
    marginBottom: '12px',
  } as React.CSSProperties,
  infoCard: {
    background: '#f7fafc',
    borderRadius: '12px',
    padding: '16px 20px',
    marginTop: '20px',
  } as React.CSSProperties,
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #e2e8f0',
    gap: '12px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '13px',
    color: '#718096',
    fontWeight: '500',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '13px',
    color: '#2d3748',
  } as React.CSSProperties,
  infoValueStrong: {
    fontSize: '14px',
    color: '#2d3748',
    fontWeight: '700',
  } as React.CSSProperties,
  infoMono: {
    fontSize: '12px',
    color: '#4a5568',
    fontFamily: 'monospace',
    background: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  codeBadge: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#4c51bf',
    fontFamily: 'monospace',
    background: 'white',
    padding: '4px 12px',
    borderRadius: '6px',
    letterSpacing: '2px',
  } as React.CSSProperties,
  warningBox: {
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '20px',
    fontSize: '13px',
    color: '#742a2a',
  } as React.CSSProperties,
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    color: '#c53030',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    marginTop: '12px',
  } as React.CSSProperties,
  actionRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  } as React.CSSProperties,
  inlineCode: {
    background: '#edf2f7',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#4c51bf',
  } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  } as React.CSSProperties,
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '28px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
}
