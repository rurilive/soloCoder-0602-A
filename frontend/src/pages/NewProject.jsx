import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject } from '../api.js'

export default function NewProject() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState([{ name: '', command: '' }])
  const navigate = useNavigate()

  function addStep() {
    setSteps([...steps, { name: '', command: '' }])
  }

  function removeStep(index) {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index))
    }
  }

  function updateStep(index, field, value) {
    const newSteps = [...steps]
    newSteps[index][field] = value
    setSteps(newSteps)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validSteps = steps.filter(s => s.name && s.command)
    const res = await createProject({
      name,
      description,
      steps: validSteps
    })
    navigate(`/projects/${res.project.id}`)
  }

  return (
    <div className="card">
      <h2>新建项目</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>项目名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="输入项目名称"
            required
          />
        </div>

        <div className="form-group">
          <label>项目描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="输入项目描述（可选）"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>构建步骤</label>
          {steps.map((step, index) => (
            <div key={index} className="step-item">
              <input
                type="text"
                placeholder="步骤名称，如：安装依赖"
                value={step.name}
                onChange={e => updateStep(index, 'name', e.target.value)}
              />
              <input
                type="text"
                placeholder="执行命令，如：npm install"
                value={step.command}
                onChange={e => updateStep(index, 'command', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeStep(index)}
                disabled={steps.length <= 1}
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
          <button type="submit" className="btn btn-primary">
            创建项目
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
