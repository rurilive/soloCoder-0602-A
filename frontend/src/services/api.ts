import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Department, Employee, EmployeeSearchResult, ApiResponse, LoginRequest, LoginResponse, CurrentUser } from '../types';

const TOKEN_KEY = 'auth_token';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (window.location.pathname !== '/login') {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data),
  me: () => api.get<CurrentUser>('/auth/me'),
};

export const departmentApi = {
  getAll: () => api.get<Department[]>('/departments'),
  create: (data: Partial<Department>) => api.post<Department>('/departments', data),
  update: (id: number, data: Partial<Department>) => api.put<Department>(`/departments/${id}`, data),
  delete: (id: number) => api.delete(`/departments/${id}`),
};

export const employeeApi = {
  getAll: (params?: { department_id?: number; search?: string; skip?: number; limit?: number }) =>
    api.get<ApiResponse<Employee>>('/employees', { params }),
  getOne: (id: number) => api.get<Employee>(`/employees/${id}`),
  create: (data: Partial<Employee>) => api.post<Employee>('/employees', data),
  update: (id: number, data: Partial<Employee>) => api.put<Employee>(`/employees/${id}`, data),
  delete: (id: number) => api.delete(`/employees/${id}`),
  search: (keyword: string) => api.get<EmployeeSearchResult[]>('/employees/search', { params: { keyword } }),
  export: () => api.get('/employees/export/excel', { responseType: 'blob' }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/employees/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
