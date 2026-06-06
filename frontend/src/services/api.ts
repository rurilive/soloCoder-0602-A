import axios from 'axios';
import { Department, Employee, EmployeeSearchResult, ApiResponse } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

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
