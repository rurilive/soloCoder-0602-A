import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, getBuilds } from '../api.js'

export default function Home() {
  const [projects, setProjects] = useState([])
  const [recentBuilds, setRecentBuilds] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [projectsRes, buildsRes] = await Promise.all([
      getProjects(),
      getBuilds()
    ])
    setProjects(projectsRes.projects)
    setRecentBuilds(buildsRes.builds.slice(0, 5))
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div>
      <div className="card">
        <h2>项目列表</h2>
        {projects.length === 0 ? (
          <div className="empty-state">
            <p>还没有项目，点击上方按钮创建第一个项目</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/projects/new')}
            >
              创建项目
            </button>
          </div>
        ) : (
          <div className="project-list">
            {projects.map(project => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <h3>{project.name}</h3>
                <p>{project.description || '暂无描述'}</p>
                <div className="project-meta">
                  <span>{project.steps.length} 个步骤</span>
                  <span>创建于 {formatDate(project.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>最近构建</h2>
        {recentBuilds.length === 0 ? (
          <div className="empty-state">
            <p>还没有构建记录</p>
          </div>
        ) : (
          recentBuilds.map(build => (
            <div
              key={build.id}
              className="build-item"
              onClick={() => navigate(`/builds/${build.id}`)}
            >
              <div className="build-header">
                <strong>{build.project_name}</strong>
                <span className={`status-badge status-${build.status}`}>
                  {build.status === 'pending' ? '等待中' :
                   build.status === 'running' ? '运行中' :
                   build.status === 'success' ? '成功' : '失败'}
                </span>
              </div>
              <div className="build-info">
                构建 #{build.id} · 开始于 {formatDate(build.started_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
