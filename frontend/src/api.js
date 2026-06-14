import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:1111',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const getUnreadCount = () => api.get('/api/notifications/unread-count')

export const getNotifications = (skip = 0, limit = 20, onlyUnread = false) =>
  api.get('/api/notifications', { params: { skip, limit, only_unread: onlyUnread } })

export const getRecentNotifications = () =>
  api.get('/api/notifications', { params: { skip: 0, limit: 5, only_unread: false } })

export const markNotificationAsRead = (id) =>
  api.post(`/api/notifications/${id}/read`)

export const markAllNotificationsAsRead = () =>
  api.post('/api/notifications/read-all')

export const getChatUnreadCount = () => api.get('/api/chat/unread-count')

export const getConversations = () => api.get('/api/chat/conversations')

export const createConversation = (memberIds, name = null) =>
  api.post('/api/chat/conversations', { member_ids: memberIds, name })

export const getMessages = (conversationId, skip = 0, limit = 50) =>
  api.get(`/api/chat/conversations/${conversationId}/messages`, { params: { skip, limit } })

export const markConversationRead = (conversationId) =>
  api.post(`/api/chat/conversations/${conversationId}/read`)

export const getUserByUsername = (username) =>
  api.get(`/api/users/by-username/${encodeURIComponent(username)}`)

export const getPostRevisions = (postId, skip = 0, limit = 20) =>
  api.get(`/api/posts/${postId}/revisions`, { params: { skip, limit } })

export const getPostRevision = (postId, revisionId) =>
  api.get(`/api/posts/${postId}/revisions/${revisionId}`)

export const getPostDiff = (postId, oldVersion, newVersion) =>
  api.get(`/api/posts/${postId}/diff`, { params: { old_version: oldVersion, new_version: newVersion } })

export const getPostWebSocketUrl = (postId) => {
  const token = localStorage.getItem('token')
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = 'localhost:1111'
  const url = `${protocol}//${base}/api/ws/posts/${postId}`
  return token ? `${url}?token=${encodeURIComponent(token)}` : url
}

export default api
