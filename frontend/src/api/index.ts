import api from './request'
import type { User, Token, DAG, DAGNode, DAGEdge, TaskExecution } from '../types'

export const authApi = {
  register: (username: string, password: string) =>
    api.post<User>('/auth/register', { username, password }),

  login: (username: string, password: string) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    return api.post<Token>('/auth/login', formData)
  },

  logout: () => api.post('/auth/logout'),

  getMe: () => api.get<User>('/auth/me')
}

export const dagApi = {
  list: () => api.get<DAG[]>('/dags'),

  get: (id: number) => api.get<DAG>(`/dags/${id}`),

  create: (data: Partial<DAG>) => api.post<DAG>('/dags', data),

  update: (id: number, data: Partial<DAG>) => api.put<DAG>(`/dags/${id}`, data),

  delete: (id: number) => api.delete(`/dags/${id}`),

  trigger: (id: number) => api.post(`/dags/${id}/trigger`)
}

export const nodeApi = {
  list: (dagId: number) => api.get<DAGNode[]>(`/dags/${dagId}/nodes`),

  create: (dagId: number, data: Partial<DAGNode>) =>
    api.post<DAGNode>(`/dags/${dagId}/nodes`, data),

  update: (dagId: number, nodeId: number, data: Partial<DAGNode>) =>
    api.put<DAGNode>(`/dags/${dagId}/nodes/${nodeId}`, data),

  delete: (dagId: number, nodeId: number) =>
    api.delete(`/dags/${dagId}/nodes/${nodeId}`)
}

export const edgeApi = {
  list: (dagId: number) => api.get<DAGEdge[]>(`/dags/${dagId}/edges`),

  create: (dagId: number, data: Partial<DAGEdge>) =>
    api.post<DAGEdge>(`/dags/${dagId}/edges`, data),

  delete: (dagId: number, edgeId: number) =>
    api.delete(`/dags/${dagId}/edges/${edgeId}`),

  batchSync: (dagId: number, edges: { source_node_id: number; target_node_id: number }[]) =>
    api.post(`/dags/${dagId}/edges/batch`, edges)
}

export const executionApi = {
  listByDag: (dagId: number) => api.get<TaskExecution[]>(`/executions/dag/${dagId}`),

  get: (id: number) => api.get<TaskExecution>(`/executions/${id}`),

  getLogs: (id: number) => api.get(`/executions/${id}/logs`)
}
