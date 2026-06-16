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

export const createReport = (targetType, targetId, reason) =>
  api.post('/api/reports', { target_type: targetType, target_id: targetId, reason })

export const getPendingReports = (skip = 0, limit = 20, sectionId = null) =>
  api.get('/api/reports/pending', { params: { skip, limit, section_id: sectionId } })

export const reviewReport = (reportId, action, reviewNote = null) =>
  api.post(`/api/reports/${reportId}/review`, null, { params: { action, review_note: reviewNote } })

export const batchReviewReports = (reportIds, action, reviewNote = null) =>
  api.post('/api/reports/batch', { report_ids: reportIds, action, review_note: reviewNote })

export const getPendingReviewItems = (skip = 0, limit = 20, targetType = null, sectionId = null) =>
  api.get('/api/reports/pending-review', { params: { skip, limit, target_type: targetType, section_id: sectionId } })

export const approvePendingReview = (targetType, targetId) =>
  api.post(`/api/reports/pending-review/${targetType}/${targetId}/approve`)

export const rejectPendingReview = (targetType, targetId, reviewNote = null) =>
  api.post(`/api/reports/pending-review/${targetType}/${targetId}/reject`, null, { params: { review_note: reviewNote } })

export const getSensitiveWords = (skip = 0, limit = 50, keyword = null, category = null) =>
  api.get('/api/admin/sensitive-words', { params: { skip, limit, keyword, category } })

export const createSensitiveWord = (word, category = 'general') =>
  api.post('/api/admin/sensitive-words', { word, category })

export const updateSensitiveWord = (wordId, word = null, category = null) =>
  api.put(`/api/admin/sensitive-words/${wordId}`, { word, category })

export const deleteSensitiveWord = (wordId) =>
  api.delete(`/api/admin/sensitive-words/${wordId}`)

export const getMyReputationLogs = (skip = 0, limit = 20) =>
  api.get('/api/users/me/reputation-logs', { params: { skip, limit } })

export const getUserReputationLogs = (userId, skip = 0, limit = 20) =>
  api.get(`/api/users/${userId}/reputation-logs`, { params: { skip, limit } })

export const adjustUserReputation = (userId, change, reason) =>
  api.put(`/api/admin/users/${userId}/reputation`, { change, reason })

export const rewardPost = (postId) =>
  api.post(`/api/posts/${postId}/reward`)

export const getPostRewardInfo = (postId) =>
  api.get(`/api/posts/${postId}/reward-info`)

export const getMyGivenRewards = (skip = 0, limit = 20) =>
  api.get('/api/me/rewards/given', { params: { skip, limit } })

export const getMyReceivedRewards = (skip = 0, limit = 20) =>
  api.get('/api/me/rewards/received', { params: { skip, limit } })

export const followUser = (userId) =>
  api.post(`/api/users/${userId}/follow`)

export const unfollowUser = (userId) =>
  api.delete(`/api/users/${userId}/follow`)

export const checkFollowing = (userId) =>
  api.get(`/api/users/${userId}/is-following`)

export const getFollowing = (userId, skip = 0, limit = 20) =>
  api.get(`/api/users/${userId}/following`, { params: { skip, limit } })

export const getFollowers = (userId, skip = 0, limit = 20) =>
  api.get(`/api/users/${userId}/followers`, { params: { skip, limit } })

export const getFeed = (cursor = null, limit = 20) =>
  api.get('/api/feed', { params: { cursor, limit } })

export default api
