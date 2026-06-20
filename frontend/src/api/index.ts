import axios from 'axios'
import type { User, Client, TokenResponse, CreateClientRequest, UpdateClientRequest, IntrospectResponse, DeviceAuthorization, DeviceAuthorizationResponse, UserCodeVerifyResponse } from '../types'

const api = axios.create({
  baseURL: '/',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authAPI = {
  register: (username: string, email: string, password: string) =>
    api.post<User>('/api/auth/register', { username, email, password }),

  login: (username: string, password: string) =>
    api.post<TokenResponse>(
      '/api/auth/login',
      new URLSearchParams({ username, password }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),

  getMe: () =>
    api.get<User>('/api/auth/me'),
}

export const clientsAPI = {
  list: () =>
    api.get<Client[]>('/api/clients'),

  get: (clientId: string) =>
    api.get<Client>(`/api/clients/${clientId}`),

  create: (data: CreateClientRequest) =>
    api.post<Client>('/api/clients', data),

  update: (clientId: string, data: UpdateClientRequest) =>
    api.put<Client>(`/api/clients/${clientId}`, data),

  delete: (clientId: string) =>
    api.delete(`/api/clients/${clientId}`),
}

export const oauthAPI = {
  exchangeCode: (code: string, clientId: string, clientSecret: string, redirectUri: string, codeVerifier?: string) =>
    api.post<TokenResponse>(
      '/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),

  refreshToken: (refreshToken: string, clientId: string, clientSecret: string) =>
    api.post<TokenResponse>(
      '/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),

  introspect: (token: string, tokenTypeHint?: string) =>
    api.post<IntrospectResponse>(
      '/introspect',
      new URLSearchParams({
        token,
        ...(tokenTypeHint && { token_type_hint: tokenTypeHint }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),

  userinfo: (accessToken: string) =>
    api.get<{ sub: string; username: string; email: string }>(
      '/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),

  deviceAuthorization: (clientId: string, scope?: string) =>
    api.post<DeviceAuthorizationResponse>(
      '/device_authorization',
      new URLSearchParams({
        client_id: clientId,
        ...(scope && { scope }),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),

  deviceToken: (deviceCode: string, clientId: string, clientSecret: string) =>
    api.post<TokenResponse>(
      '/token',
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),
}

export const deviceAuthAPI = {
  list: (status?: string) =>
    api.get<DeviceAuthorization[]>('/api/device_authorizations', {
      params: status ? { status } : {},
    }),

  approve: (authId: number) =>
    api.post(`/api/device_authorizations/${authId}/approve`),

  deny: (authId: number) =>
    api.post(`/api/device_authorizations/${authId}/deny`),

  verifyUserCode: (userCode: string) =>
    api.post<UserCodeVerifyResponse>('/api/public/device_verify', {
      user_code: userCode,
    }),
}

export default api
