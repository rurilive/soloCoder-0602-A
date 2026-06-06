const API_BASE = 'http://localhost:1111'

export async function getProjects() {
  const res = await fetch(`${API_BASE}/api/projects`)
  return res.json()
}

export async function getProject(projectId) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`)
  return res.json()
}

export async function createProject(data) {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.json()
}

export async function updateProject(projectId, data) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.json()
}

export async function deleteProject(projectId) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: 'DELETE'
  })
  return res.json()
}

export async function triggerBuild(projectId) {
  const res = await fetch(`${API_BASE}/api/builds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId })
  })
  return res.json()
}

export async function getBuilds(projectId = null) {
  const url = projectId
    ? `${API_BASE}/api/builds?project_id=${projectId}`
    : `${API_BASE}/api/builds`
  const res = await fetch(url)
  return res.json()
}

export async function getBuild(buildId) {
  const res = await fetch(`${API_BASE}/api/builds/${buildId}`)
  return res.json()
}

export function getBuildWebSocket(buildId) {
  return new WebSocket(`ws://localhost:1111/ws/builds/${buildId}`)
}
