import { useState, useEffect, useCallback } from 'react'
import { clientsAPI, oauthAPI } from '../api'
import type { Client, TokenResponse, IntrospectResponse, RevokeResponse } from '../types'

const STORAGE_KEYS = {
  SELECTED_CLIENT_ID: 'oauth_test_selected_client_id',
  TOKEN_RESPONSE: 'oauth_test_token_response',
  USER_INFO: 'oauth_test_user_info',
  INTROSPECT_RESULT: 'oauth_test_introspect_result',
  STEP: 'oauth_test_step',
  LOG: 'oauth_test_log',
  CLIENT_SECRET_PREFIX: 'client_secret_',
  OAUTH_STATE: 'oauth_test_state',
  CODE_VERIFIER: 'oauth_test_code_verifier',
  PKCE_ENABLED: 'oauth_test_pkce_enabled',
  REPLAY_DETECTED: 'oauth_test_replay_detected',
}

const getClientSecret = (clientId: string): string | null => {
  return localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET_PREFIX + clientId)
}

const setClientSecret = (clientId: string, secret: string) => {
  localStorage.setItem(STORAGE_KEYS.CLIENT_SECRET_PREFIX + clientId, secret)
}

const enrichClientWithSecret = (client: Client): Client => {
  const secret = getClientSecret(client.client_id)
  if (secret && !client.client_secret) {
    return { ...client, client_secret: secret }
  }
  return client
}

const PKCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

const generateCodeVerifier = (length: number = 64): string => {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += PKCE_ALPHABET[array[i] % PKCE_ALPHABET.length]
  }
  return result
}

const base64UrlEncode = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const computeCodeChallengeS256 = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

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
  const [isInitialized, setIsInitialized] = useState(false)
  const [pkceEnabled, setPkceEnabled] = useState(true)
  const [replayDetected, setReplayDetected] = useState(false)
  const [accessTokenRevoked, setAccessTokenRevoked] = useState(false)
  const [refreshTokenRevoked, setRefreshTokenRevoked] = useState(false)

  const redirectUri = 'http://localhost:1112/test'

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await clientsAPI.list()
        const activeClients = response.data
          .filter(c => c.is_active)
          .map(enrichClientWithSecret)
        setClients(activeClients)

        const savedClientId = localStorage.getItem(STORAGE_KEYS.SELECTED_CLIENT_ID)
        let initialClient: Client | null = null

        if (savedClientId) {
          initialClient = activeClients.find(c => c.client_id === savedClientId) || null
        }
        if (!initialClient && activeClients.length > 0) {
          initialClient = activeClients[0]
        }

        if (initialClient) {
          setSelectedClient(initialClient)
        }

        const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN_RESPONSE)
        if (savedToken) {
          setTokenResponse(JSON.parse(savedToken))
        }

        const savedUserInfo = localStorage.getItem(STORAGE_KEYS.USER_INFO)
        if (savedUserInfo) {
          setUserInfo(JSON.parse(savedUserInfo))
        }

        const savedIntrospect = localStorage.getItem(STORAGE_KEYS.INTROSPECT_RESULT)
        if (savedIntrospect) {
          setIntrospectResult(JSON.parse(savedIntrospect))
        }

        const savedStep = localStorage.getItem(STORAGE_KEYS.STEP)
        if (savedStep) {
          setStep(parseInt(savedStep, 10))
        }

        const savedLog = localStorage.getItem(STORAGE_KEYS.LOG)
        if (savedLog) {
          setLog(JSON.parse(savedLog))
        }

        const savedPkce = localStorage.getItem(STORAGE_KEYS.PKCE_ENABLED)
        if (savedPkce !== null) {
          setPkceEnabled(savedPkce === 'true')
        }

        const savedReplay = localStorage.getItem(STORAGE_KEYS.REPLAY_DETECTED)
        if (savedReplay !== null) {
          setReplayDetected(savedReplay === 'true')
        }

        setIsInitialized(true)
      } catch (err: any) {
        addLog('❌ 加载客户端列表失败: ' + (err.response?.data?.detail || err.message))
        setIsInitialized(true)
      }
    }
    fetchClients()
  }, [])

  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_CLIENT_ID, selectedClient.client_id)
    }
  }, [selectedClient])

  useEffect(() => {
    if (tokenResponse) {
      localStorage.setItem(STORAGE_KEYS.TOKEN_RESPONSE, JSON.stringify(tokenResponse))
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN_RESPONSE)
    }
  }, [tokenResponse])

  useEffect(() => {
    if (userInfo) {
      localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo))
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER_INFO)
    }
  }, [userInfo])

  useEffect(() => {
    if (introspectResult) {
      localStorage.setItem(STORAGE_KEYS.INTROSPECT_RESULT, JSON.stringify(introspectResult))
    } else {
      localStorage.removeItem(STORAGE_KEYS.INTROSPECT_RESULT)
    }
  }, [introspectResult])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STEP, step.toString())
  }, [step])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOG, JSON.stringify(log))
  }, [log])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PKCE_ENABLED, pkceEnabled.toString())
  }, [pkceEnabled])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPLAY_DETECTED, replayDetected.toString())
  }, [replayDetected])

  const getSelectedClientWithSecret = useCallback((): Client | null => {
    if (!selectedClient) return null
    return enrichClientWithSecret(selectedClient)
  }, [selectedClient])

  useEffect(() => {
    if (!isInitialized) return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (code) {
      const storedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE)
      sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE)

      if (!state || state !== storedState) {
        setError('OAuth state 校验失败，可能存在 CSRF 攻击，请重新开始 OAuth2.0 流程')
        addLog('❌ OAuth state 校验失败，可能存在 CSRF 攻击')
        addLog(`   收到的 state: ${state || '缺失'}`)
        addLog(`   期望的 state: ${storedState || '缺失'}`)
        window.history.replaceState({}, document.title, '/test')
        return
      }

      addLog(`✅ OAuth state 校验通过`)

      const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER)
      sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER)

      if (pkceEnabled && !codeVerifier) {
        addLog('⚠️  PKCE 已启用但未找到 code_verifier，尝试不使用 PKCE 继续')
      }

      const clientWithSecret = getSelectedClientWithSecret()
      if (clientWithSecret && clientWithSecret.client_secret) {
        addLog(`📥 收到授权码: ${code.substring(0, 20)}...`)
        if (pkceEnabled && codeVerifier) {
          addLog(`🔐 使用 code_verifier (PKCE): ${codeVerifier.substring(0, 20)}...`)
        }
        exchangeCodeForToken(code, codeVerifier || undefined)
        window.history.replaceState({}, document.title, '/test')
      } else {
        const savedClientId = localStorage.getItem(STORAGE_KEYS.SELECTED_CLIENT_ID)
        const savedSecret = savedClientId ? getClientSecret(savedClientId) : null
        if (savedClientId && savedSecret) {
          addLog(`📥 收到授权码，从 localStorage 恢复客户端凭证`)
          addLog(`📥 授权码: ${code.substring(0, 20)}...`)
          if (pkceEnabled && codeVerifier) {
            addLog(`🔐 使用 code_verifier (PKCE): ${codeVerifier.substring(0, 20)}...`)
          }
          const tempClient: Client = {
            client_id: savedClientId,
            client_secret: savedSecret,
            name: '',
            redirect_uris: redirectUri,
            scope: '',
            is_active: true,
          }
          exchangeCodeForToken(code, codeVerifier || undefined, tempClient)
          window.history.replaceState({}, document.title, '/test')
        } else {
          setError('无法获取客户端凭证，请重新开始 OAuth2.0 流程')
          addLog('❌ 无法获取客户端凭证，页面刷新后丢失了客户端信息')
        }
      }
    }
  }, [isInitialized, getSelectedClientWithSecret, pkceEnabled])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN')
    setLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)])
  }

  const getErrorChineseTip = (errorMsg: string): string | null => {
    const msg = errorMsg.toLowerCase()
    if (msg.includes('pkce verification failed') && msg.includes('does not match')) {
      return 'PKCE 验证失败：code_verifier 与 code_challenge 不匹配，请检查客户端是否正确生成和传递 code_verifier'
    }
    if (msg.includes('pkce verification failed') && msg.includes('code_verifier is required')) {
      return 'PKCE 验证失败：授权请求使用了 PKCE 但 Token 交换时未提供 code_verifier'
    }
    if (msg.includes('replay attack detected')) {
      return '重放攻击检测：该 refresh_token 已被撤销过，检测到重放攻击，整个 Token 族已全部失效'
    }
    if (msg.includes('invalid authorization code')) {
      return '授权码无效：授权码可能已过期、已使用、不存在或与客户端不匹配'
    }
    if (msg.includes('invalid client credentials')) {
      return '客户端凭证无效：client_id 或 client_secret 不正确'
    }
    if (msg.includes('invalid or expired refresh token')) {
      return '刷新令牌无效：refresh_token 可能已过期、不存在或已被撤销'
    }
    if (msg.includes('invalid redirect_uri')) {
      return '回调地址无效：redirect_uri 未在客户端配置的回调地址列表中'
    }
    if (msg.includes('unsupported response type')) {
      return '不支持的响应类型：目前仅支持授权码模式 (response_type=code)'
    }
    if (msg.includes('invalid code_challenge_method')) {
      return '无效的 code_challenge_method：仅支持 S256 和 plain 两种方式'
    }
    return null
  }

  const startOAuth = async () => {
    const client = getSelectedClientWithSecret()
    if (!client) {
      setError('请先选择一个客户端')
      return
    }

    if (!client.client_secret) {
      setError('请先创建一个客户端并获取 client_secret，或重新创建客户端')
      return
    }

    if (!client.redirect_uris.includes(redirectUri)) {
      setError(`该客户端没有配置回调地址: ${redirectUri}\n请在客户端管理中添加此回调地址`)
      return
    }

    setError('')
    setReplayDetected(false)
    setAccessTokenRevoked(false)
    setRefreshTokenRevoked(false)
    setStep(1)
    setTokenResponse(null)
    setUserInfo(null)
    setIntrospectResult(null)
    addLog('🚀 开始 OAuth2.0 授权码流程')
    addLog(`📍 使用客户端: ${client.name} (${client.client_id})`)

    const state = crypto.getRandomValues(new Uint8Array(32)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, state)

    let authUrl = `/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read write&state=${state}`

    if (pkceEnabled) {
      const codeVerifier = generateCodeVerifier(64)
      sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier)
      const codeChallenge = await computeCodeChallengeS256(codeVerifier)
      authUrl += `&code_challenge=${codeChallenge}&code_challenge_method=S256`
      addLog(`🔐 PKCE (S256) 已启用`)
      addLog(`   code_verifier: ${codeVerifier.substring(0, 20)}...`)
      addLog(`   code_challenge: ${codeChallenge.substring(0, 20)}...`)
    } else {
      addLog(`🔐 PKCE 已禁用`)
    }

    addLog(`🔐 生成并存储 state 参数 (CSRF 防护)`)
    addLog(`🔗 重定向到授权服务器: ${authUrl.substring(0, 100)}...`)
    window.location.href = authUrl
  }

  const exchangeCodeForToken = async (code: string, codeVerifier?: string, clientOverride?: Client) => {
    const client = clientOverride || getSelectedClientWithSecret()
    if (!client || !client.client_secret) {
      setError('请先创建一个客户端并获取 client_secret')
      return
    }

    setLoading(true)
    setStep(2)
    addLog('🔄 使用授权码交换 Token...')
    if (codeVerifier) {
      addLog(`   携带 code_verifier 进行 PKCE 验证`)
    }

    try {
      const response = await oauthAPI.exchangeCode(
        code,
        client.client_id,
        client.client_secret,
        redirectUri,
        codeVerifier
      )
      setTokenResponse(response.data)
      setStep(3)
      addLog('✅ Token 交换成功!')
      addLog(`   Access Token: ${response.data.access_token.substring(0, 30)}...`)
      if (response.data.refresh_token) {
        addLog(`   Refresh Token: ${response.data.refresh_token.substring(0, 30)}...`)
      }
      if (response.data.token_family_id) {
        addLog(`   Token Family ID: ${response.data.token_family_id.substring(0, 20)}...`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ Token 交换失败: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }
      setError('Token 交换失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
    } finally {
      setLoading(false)
    }
  }

  const refreshToken = async () => {
    const client = getSelectedClientWithSecret()
    if (!client || !client.client_secret || !tokenResponse?.refresh_token) {
      return
    }

    const oldRefreshToken = tokenResponse.refresh_token
    setLoading(true)
    addLog('🔄 刷新 Access Token...')
    addLog(`   旧 Refresh Token: ${oldRefreshToken.substring(0, 20)}...`)

    try {
      const response = await oauthAPI.refreshToken(
        tokenResponse.refresh_token,
        client.client_id,
        client.client_secret
      )
      setTokenResponse(response.data)
      setReplayDetected(false)
      addLog('✅ Token 刷新成功!')
      addLog(`   新 Access Token: ${response.data.access_token.substring(0, 30)}...`)
      if (response.data.refresh_token) {
        addLog(`   新 Refresh Token: ${response.data.refresh_token.substring(0, 30)}...`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ Token 刷新失败: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }

      if (errorMsg.includes('Replay') || errorMsg.includes('replay') || errorMsg.includes('invalidated')) {
        setReplayDetected(true)
        addLog('⚠️  检测到重放攻击！该 token 族已全部撤销')
      }

      setError('Token 刷新失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
    } finally {
      setLoading(false)
    }
  }

  const testReplayAttack = async () => {
    const client = getSelectedClientWithSecret()
    if (!client || !client.client_secret || !tokenResponse?.refresh_token) {
      setError('请先完成授权码流程以获取 refresh token')
      return
    }

    const savedRefreshToken = tokenResponse.refresh_token

    setLoading(true)
    addLog('🎯 开始重放攻击测试...')
    addLog(`   目标 Refresh Token: ${savedRefreshToken.substring(0, 20)}...`)

    try {
      addLog('1️⃣ 第一次刷新 token (正常操作，旧 token 被撤销)')
      const resp1 = await oauthAPI.refreshToken(
        savedRefreshToken,
        client.client_id,
        client.client_secret
      )
      setTokenResponse(resp1.data)
      addLog('   ✅ 第一次刷新成功，旧 token 已被撤销')

      addLog('2️⃣ 第二次使用同一个旧 token (模拟重放攻击)')
      try {
        await oauthAPI.refreshToken(
          savedRefreshToken,
          client.client_id,
          client.client_secret
        )
        addLog('   ❌ 错误：第二次刷新居然成功了！重放检测失败')
      } catch (innerErr: any) {
        const innerMsg = innerErr.response?.data?.detail || innerErr.message
        const innerTip = getErrorChineseTip(innerMsg)
        if (innerMsg.includes('Replay') || innerMsg.includes('invalidated')) {
          setReplayDetected(true)
          addLog('   ✅ 重放检测成功！已撤销整个 token 族')
          addLog(`   错误信息: ${innerMsg.substring(0, 80)}...`)
          if (innerTip) {
            addLog(`   💡 中文提示: ${innerTip}`)
          }
        } else {
          addLog(`   ⚠️  返回其他错误: ${innerMsg.substring(0, 80)}...`)
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ 测试过程出错: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }
      setError('测试失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
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
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ 获取用户信息失败: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }
      setError('获取用户信息失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
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
        if (response.data.token_family_id) {
          addLog(`   Token Family ID: ${response.data.token_family_id.substring(0, 20)}...`)
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      addLog(`❌ Token 内省失败: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const revokeAccessToken = async () => {
    const client = getSelectedClientWithSecret()
    if (!client || !client.client_secret || !tokenResponse?.access_token) {
      setError('请先完成 OAuth2.0 流程以获取 access token')
      return
    }

    setLoading(true)
    addLog('🗑️  撤销 Access Token...')
    addLog(`   目标 Token: ${tokenResponse.access_token.substring(0, 20)}...`)

    try {
      const response = await oauthAPI.revoke(
        tokenResponse.access_token,
        client.client_id,
        client.client_secret,
        'access_token'
      )
      setAccessTokenRevoked(true)
      addLog(`✅ Access Token 撤销成功! 撤销记录数: ${response.data.revoked_count}`)

      addLog('🧪 立即验证：调用 /userinfo 接口...')
      try {
        await oauthAPI.userinfo(tokenResponse.access_token)
        addLog('   ❌ 验证失败：/userinfo 居然返回成功，撤销可能未生效！')
      } catch (verifyErr: any) {
        const status = verifyErr.response?.status
        const errMsg = verifyErr.response?.data?.detail || verifyErr.message
        if (status === 401) {
          addLog(`   ✅ 验证通过：/userinfo 返回 401，撤销已生效!`)
          addLog(`   错误信息: ${errMsg}`)
        } else {
          addLog(`   ⚠️  /userinfo 返回状态码 ${status}，错误信息: ${errMsg}`)
        }
      }

      addLog('🧪 再次验证：内省 Access Token...')
      try {
        const introResp = await oauthAPI.introspect(tokenResponse.access_token, 'access')
        if (!introResp.data.active) {
          addLog(`   ✅ 内省验证通过：Token 状态已变为无效!`)
        } else {
          addLog(`   ❌ 内省验证失败：Token 仍显示为有效!`)
        }
      } catch (introErr: any) {
        addLog(`   ⚠️  内省请求出错: ${introErr.response?.data?.detail || introErr.message}`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ Access Token 撤销失败: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }
      setError('Access Token 撤销失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
    } finally {
      setLoading(false)
    }
  }

  const revokeRefreshToken = async () => {
    const client = getSelectedClientWithSecret()
    if (!client || !client.client_secret || !tokenResponse?.refresh_token) {
      setError('请先完成 OAuth2.0 流程以获取 refresh token')
      return
    }

    setLoading(true)
    addLog('🗑️  撤销 Refresh Token (将同时撤销同一批次所有 Token)...')
    addLog(`   目标 Refresh Token: ${tokenResponse.refresh_token.substring(0, 20)}...`)
    if (tokenResponse.token_family_id) {
      addLog(`   Token Family ID: ${tokenResponse.token_family_id.substring(0, 20)}...`)
    }

    try {
      const response = await oauthAPI.revoke(
        tokenResponse.refresh_token,
        client.client_id,
        client.client_secret,
        'refresh_token'
      )
      setRefreshTokenRevoked(true)
      setAccessTokenRevoked(true)
      addLog(`✅ Refresh Token 撤销成功! 影响的 Token 数: ${response.data.revoked_count}`)

      addLog('🧪 验证1：尝试使用已撤销的 Refresh Token 刷新...')
      try {
        await oauthAPI.refreshToken(tokenResponse.refresh_token, client.client_id, client.client_secret)
        addLog('   ❌ 验证失败：刷新居然成功了，撤销可能未生效！')
      } catch (refreshErr: any) {
        const status = refreshErr.response?.status
        const errMsg = refreshErr.response?.data?.detail || refreshErr.message
        if (status === 400 || status === 401) {
          addLog(`   ✅ 验证通过：刷新 Token 返回 ${status}，撤销已生效!`)
          addLog(`   错误信息: ${errMsg}`)
        } else {
          addLog(`   ⚠️  刷新 Token 返回状态码 ${status}，错误信息: ${errMsg}`)
        }
      }

      addLog('🧪 验证2：调用 /userinfo 检查 Access Token 是否同时失效...')
      try {
        await oauthAPI.userinfo(tokenResponse.access_token)
        addLog('   ❌ 验证失败：/userinfo 居然返回成功，Access Token 可能未被连带撤销！')
      } catch (verifyErr: any) {
        const status = verifyErr.response?.status
        const errMsg = verifyErr.response?.data?.detail || verifyErr.message
        if (status === 401) {
          addLog(`   ✅ 验证通过：/userinfo 返回 401，Access Token 已连带失效!`)
          addLog(`   错误信息: ${errMsg}`)
        } else {
          addLog(`   ⚠️  /userinfo 返回状态码 ${status}，错误信息: ${errMsg}`)
        }
      }

      addLog('🧪 验证3：内省 Refresh Token...')
      try {
        const introResp = await oauthAPI.introspect(tokenResponse.refresh_token, 'refresh')
        if (!introResp.data.active) {
          addLog(`   ✅ 内省验证通过：Refresh Token 状态已变为无效!`)
        } else {
          addLog(`   ❌ 内省验证失败：Refresh Token 仍显示为有效!`)
        }
      } catch (introErr: any) {
        addLog(`   ⚠️  内省请求出错: ${introErr.response?.data?.detail || introErr.message}`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message
      const chineseTip = getErrorChineseTip(errorMsg)
      addLog(`❌ Refresh Token 撤销失败: ${errorMsg}`)
      if (chineseTip) {
        addLog(`   💡 中文提示: ${chineseTip}`)
      }
      setError('Refresh Token 撤销失败: ' + errorMsg + (chineseTip ? '\n\n💡 ' + chineseTip : ''))
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
    setReplayDetected(false)
    setAccessTokenRevoked(false)
    setRefreshTokenRevoked(false)
    setLog([])
    sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE)
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER)
    localStorage.removeItem(STORAGE_KEYS.TOKEN_RESPONSE)
    localStorage.removeItem(STORAGE_KEYS.USER_INFO)
    localStorage.removeItem(STORAGE_KEYS.INTROSPECT_RESULT)
    localStorage.removeItem(STORAGE_KEYS.STEP)
    localStorage.removeItem(STORAGE_KEYS.LOG)
    localStorage.removeItem(STORAGE_KEYS.REPLAY_DETECTED)
    addLog('🔄 测试已重置')
  }

  const steps = [
    { num: 1, title: '重定向到授权服务器', desc: '客户端将用户重定向到认证中心的授权端点' },
    { num: 2, title: '用户授权', desc: '用户登录并授权客户端访问' },
    { num: 3, title: '获取 Token', desc: '使用授权码交换 Access Token 和 Refresh Token' },
    { num: 4, title: '访问受保护资源', desc: '使用 Access Token 调用受保护的 API' },
  ]

  if (!isInitialized) {
    return (
      <div style={styles.loading}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>⏳</div>
        <div>加载中...</div>
      </div>
    )
  }

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

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={pkceEnabled}
                  onChange={(e) => setPkceEnabled(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                🔐 启用 PKCE (Proof Key for Code Exchange, RFC 7636) - S256 方式
              </label>
            </div>

            {(() => {
              const client = getSelectedClientWithSecret()
              if (!client) return null
              return (
                <div style={styles.clientInfo}>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Client ID:</span>
                    <code style={styles.infoCode}>{client.client_id}</code>
                  </div>
                  {client.client_secret ? (
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Client Secret:</span>
                      <code style={styles.infoCode}>{client.client_secret}</code>
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
                  {!client.redirect_uris.includes(redirectUri) && (
                    <div style={styles.warning}>
                      ⚠️ 回调地址未在客户端中配置。请添加: {redirectUri}
                    </div>
                  )}
                </div>
              )
            })()}

            {replayDetected && (
              <div style={styles.replayAlert}>
                🚨 <strong>重放攻击检测！</strong>检测到已撤销的 refresh token 被再次使用。
                该 client 下该用户的 <strong>所有 token 族已被立即撤销</strong>，
                请重新开始 OAuth2.0 授权流程。
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.buttonGroup}>
              <button
                onClick={startOAuth}
                disabled={loading || !getSelectedClientWithSecret()?.client_secret}
                style={{
                  ...styles.primaryBtn,
                  ...((loading || !getSelectedClientWithSecret()?.client_secret) ? styles.disabledBtn : {}),
                }}
              >
                🚀 开始 OAuth2.0 流程{pkceEnabled ? ' (PKCE)' : ''}
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
              {tokenResponse.token_family_id && (
                <div style={styles.familyBadge}>
                  👨‍👩‍👧‍👦 Token Family ID: <code>{tokenResponse.token_family_id}</code>
                </div>
              )}
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
                  onClick={testReplayAttack}
                  disabled={loading || replayDetected}
                  style={{
                    ...styles.dangerBtn,
                    ...((loading || replayDetected) ? styles.disabledBtn : {}),
                  }}
                >
                  🎯 测试重放攻击
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
                <button
                  onClick={revokeAccessToken}
                  disabled={loading || accessTokenRevoked}
                  style={{
                    ...styles.warnBtn,
                    ...((loading || accessTokenRevoked) ? styles.disabledBtn : {}),
                  }}
                >
                  {accessTokenRevoked ? '✅ Access Token 已撤销' : '🗑️ 撤销 Access Token'}
                </button>
                {tokenResponse.refresh_token && (
                  <button
                    onClick={revokeRefreshToken}
                    disabled={loading || refreshTokenRevoked}
                    style={{
                      ...styles.dangerBtn,
                      ...((loading || refreshTokenRevoked) ? styles.disabledBtn : {}),
                    }}
                  >
                    {refreshTokenRevoked ? '✅ Refresh Token 已撤销' : '🗑️ 撤销 Refresh Token (全族)'}
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
                    {introspectResult.token_family_id && (
                      <div style={styles.detailRow}>
                        <span>Token Family ID:</span>
                        <code>{introspectResult.token_family_id.substring(0, 20)}...</code>
                      </div>
                    )}
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
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#718096',
    fontSize: '16px',
  } as React.CSSProperties,
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    cursor: 'pointer',
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
  replayAlert: {
    background: '#fef2f2',
    color: '#991b1b',
    border: '2px solid #fecaca',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    lineHeight: '1.6',
  } as React.CSSProperties,
  familyBadge: {
    background: '#eef2ff',
    color: '#3730a3',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
    fontWeight: '500',
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
  warnBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  dangerBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
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
