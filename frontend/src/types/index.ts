export interface User {
  id: number
  username: string
  email: string
  is_active: boolean
  created_at: string
}

export interface Client {
  id: number
  client_id: string
  client_secret?: string
  name: string
  description?: string
  redirect_uris: string
  scope: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_family_id?: string
}

export interface IntrospectResponse {
  active: boolean
  scope?: string
  client_id?: string
  username?: string
  exp?: number
  token_family_id?: string
}

export interface CreateClientRequest {
  name: string
  description?: string
  redirect_uris: string
  scope: string
}

export interface UpdateClientRequest {
  name?: string
  description?: string
  redirect_uris?: string
  scope?: string
  is_active?: boolean
}

export interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
}

export interface DeviceAuthorization {
  id: number
  user_code: string
  client_id: string
  client_name: string | null
  scope: string
  status: 'pending' | 'approved' | 'denied'
  user_id: number | null
  username: string | null
  expires_at: string
  interval: number
  is_used: boolean
  created_at: string
  resolved_at: string | null
}

export interface DeviceAuthorizationResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export interface UserCodeVerifyResponse extends DeviceAuthorization {
}
