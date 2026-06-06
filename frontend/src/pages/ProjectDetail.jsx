import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getProject, deleteProject, triggerBuild, getBuilds, updateProject } from '../api.js'
import ErrorAlert from '../components/ErrorAlert.jsx'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [builds, setBuilds] = useState([])
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [projectRes, buildsRes] = await Promise.all([
        getProject(projectId),
        getBuilds(projectId)
      ])
      setProject(projectRes.project)
      setBuilds(buildsRes.builds)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerBuild() {
    try {
      const res = await triggerBuild(projectId)
      navigate(`/builds/${res.build.id}`)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete() {
    if (confirm('确定要删除这个项目吗？')) {
      try {
        await deleteProject(projectId)
        navigate('/')
      } catch (err) {
        alert(err.message)
      }
    }
  }

  function startEdit() {
    setEditData({
      name: project.name,
      description: project.description,
      steps: [...project.steps]
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditData(null)
  }

  function addStep() {
    setEditData({
      ...editData,
      steps: [...editData.steps, { name: '', command: '' }]
    })
  }

  function removeStep(index) {
    if (editData.steps.length > 1) {
      setEditData({
        ...editData,
        steps: editData.steps.filter((_, i) => i !== index)
      })
    }
  }

  function updateStep(index, field, value) {
    const newSteps = [...editData.steps]
    newSteps[index][field] = value
    setEditData({ ...editData, steps: newSteps })
  }

  async function saveEdit(e) {
    e.preventDefault()
    try {
      const validSteps = editData.steps.filter(s => s.name && s.command)
      await updateProject(projectId, {
        ...editData,
        steps: validSteps
      })
      setEditing(false)
      setEditData(null)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={loadData} />
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">项目列表</Link>
        <span> / </span>
        <span>{project.name}</span>
      </div>

      {editing ? (
        <div className="card">
          <h2>编辑项目</h2>
          <form onSubmit={saveEdit}>
            <div className="form-group">
              <label>项目名称</label>
              <input
                type="text"
                value={editData.name}
                onChange={e => setEditData({ ...editData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>项目描述</label>
              <textarea
                value={editData.description}
                onChange={e => setEditData({ ...editData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>构建步骤</label>
              {editData.steps.map((step, index) => (
                <div key={index} className="step-item">
                  <input
                    type="text"
                    placeholder="步骤名称"
                    value={step.name}
                    onChange={e => updateStep(index, 'name', e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="执行命令"
                    value={step.command}
                    onChange={e => updateStep(index, 'command', e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeStep(index)}
                    disabled={editData.steps.length <= 1}
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '8px' }}
                onClick={addStep}
              >
                + 添加步骤
              </button>
            </div>

            <div className="actions">
              <button type="submit" className="btn btn-primary">保存</button>
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                取消
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <h2>{project.name}</h2>
          <p style={{ color: '#8b949e', marginBottom: '16px' }}>
            {project.description || '暂无描述'}
          </p>

          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>构建步骤</h3>
          <div className="steps-container">
            {project.steps.map((step, index) => (
              <div key={index} className="step-row">
                <span style={{ color: '#8b949e' }}>{index + 1}.</span>
                <span className="step-name">{step.name}</span>
                <code style={{ background: '#0d1117', padding: '4px 8px', borderRadius: '4px' }}>
                  {step.command}
                </code>
              </div>
            ))}
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={handleTriggerBuild}>
              触发构建
            </button>
            <button className="btn btn-secondary" onClick={startEdit}>
              编辑项目
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              删除项目
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>构建历史</h2>
        {builds.length === 0 ? (
          <div className="empty-state">
            <p>还没有构建记录</p>
          </div>
        ) : (
          builds.map(build => (
            <div
              key={build.id}
              className="build-item"
              onClick={() => navigate(`/builds/${build.id}`)}
            >
              <div className="build-header">
                <strong>构建 #{build.id}</strong>
                <span className={`status-badge status-${build.status}`}>
                  {build.status === 'pending' ? '等待中' :
                   build.status === 'running' ? '运行中' :
                   build.status === 'success' ? '成功' : '失败'}
                </span>
              </div>
              <div className="build-info">
                开始于 {formatDate(build.started_at)}
                {build.finished_at && ` · 完成于 ${formatDate(build.finished_at)}`}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
