import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me')
}

export const questionAPI = {
  list: (params) => api.get('/questions', { params }),
  create: (data) => api.post('/questions', data),
  update: (id, data) => api.put(`/questions/${id}`, data),
  delete: (id) => api.delete(`/questions/${id}`),
  get: (id) => api.get(`/questions/${id}`)
}

export const examAPI = {
  list: () => api.get('/exams'),
  create: (data) => api.post('/exams', data),
  get: (id) => api.get(`/exams/${id}`),
  delete: (id) => api.delete(`/exams/${id}`),
  getParticipations: (id) => api.get(`/exams/${id}/participations`)
}

export const studentAPI = {
  getExams: () => api.get('/student/exams'),
  startExam: (examId) => api.post(`/student/exams/${examId}/start`),
  submitExam: (examId, data) => api.post(`/student/exams/${examId}/submit`, data),
  getResult: (examId) => api.get(`/student/exams/${examId}/result`),
  listStudents: () => api.get('/student/students')
}

export default api
