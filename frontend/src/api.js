const API_BASE = 'http://localhost:1111'
const WS_BASE = 'ws://localhost:1111'

export class ApiError extends Error {
  constructor(message, type = 'network') {
    super(message)
    this.name = 'ApiError'
    this.type = type
  }
}

async function handleRequest(promise) {
  try {
    const res = await promise
    if (!res.ok) {
      throw new ApiError(`请求失败: ${res.status}`, 'http')
    }
    return await res.json()
  } catch (error) {
    if (error.name === 'ApiError') {
      throw error
    }
    throw new ApiError(
      '无法连接到后端服务，请确认服务已启动',
      'network'
    )
  }
}

export async function getProjects() {
  return handleRequest(fetch(`${API_BASE}/api/projects`))
}

export async function getProject(projectId) {
  return handleRequest(fetch(`${API_BASE}/api/projects/${projectId}`))
}

export async function createProject(data) {
  return handleRequest(
    fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  )
}

export async function updateProject(projectId, data) {
  return handleRequest(
    fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  )
}

export async function deleteProject(projectId) {
  return handleRequest(
    fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: 'DELETE'
    })
  )
}

export async function triggerBuild(projectId) {
  return handleRequest(
    fetch(`${API_BASE}/api/builds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    })
  )
}

export async function getBuilds(projectId = null) {
  const url = projectId
    ? `${API_BASE}/api/builds?project_id=${projectId}`
    : `${API_BASE}/api/builds`
  return handleRequest(fetch(url))
}

export async function getBuild(buildId) {
  return handleRequest(fetch(`${API_BASE}/api/builds/${buildId}`))
}

export function getBuildWebSocket(buildId) {
  return new WebSocket(`${WS_BASE}/ws/builds/${buildId}`)
}
