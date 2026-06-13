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

export default api
