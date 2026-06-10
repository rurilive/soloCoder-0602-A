import { useState, useEffect } from 'react'
import api from '../api'

export default function Admin() {
  const [tab, setTab] = useState('sections')
  const [sections, setSections] = useState([])
  const [users, setUsers] = useState([])
  const [moderators, setModerators] = useState([])
  const [userSkip, setUserSkip] = useState(0)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [editSection, setEditSection] = useState(null)
  const [sectionForm, setSectionForm] = useState({ name: '', description: '', sort_order: 0 })
  const [modForm, setModForm] = useState({ user_id: '', section_id: '' })

  useEffect(() => {
    api.get('/api/sections/').then((res) => setSections(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'users') {
      api.get('/api/users/', { params: { skip: userSkip, limit: 20 } }).then((res) => setUsers(res.data)).catch(() => {})
    }
  }, [tab, userSkip])

  useEffect(() => {
    if (tab === 'moderators') {
      api.get('/api/sections/').then((res) => setSections(res.data)).catch(() => {})
      api.get('/api/users/', { params: { skip: 0, limit: 100 } }).then((res) => setUsers(res.data)).catch(() => {})
      fetchModerators()
    }
  }, [tab])

  const fetchModerators = async () => {
    try {
      const res = await api.get('/api/sections/')
      const allMods = []
      for (const s of res.data) {
        const modRes = await api.get(`/api/sections/${s.id}`)
        if (modRes.data.moderators) {
          allMods.push(...modRes.data.moderators.map((m) => ({ ...m, section_name: s.name })))
        }
      }
      setModerators(allMods)
    } catch {
      setModerators([])
    }
  }

  const handleCreateSection = async (e) => {
    e.preventDefault()
    try {
      if (editSection) {
        await api.put(`/api/sections/${editSection.id}`, sectionForm)
      } else {
        await api.post('/api/sections/', sectionForm)
      }
      setShowSectionModal(false)
      setEditSection(null)
      setSectionForm({ name: '', description: '', sort_order: 0 })
      const res = await api.get('/api/sections/')
      setSections(res.data)
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleEditSection = (section) => {
    setEditSection(section)
    setSectionForm({ name: section.name, description: section.description || '', sort_order: section.sort_order || 0 })
    setShowSectionModal(true)
  }

  const handleDeleteSection = async (id) => {
    if (!confirm('确定要删除此板块吗？')) return
    try {
      await api.delete(`/api/sections/${id}`)
      const res = await api.get('/api/sections/')
      setSections(res.data)
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleMute = async (userId, isMuted) => {
    try {
      await api.put(`/api/admin/users/${userId}/mute`, { is_muted: !isMuted })
      const res = await api.get('/api/users/', { params: { skip: userSkip, limit: 20 } })
      setUsers(res.data)
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleAddModerator = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/admin/moderators', { user_id: Number(modForm.user_id), section_id: Number(modForm.section_id) })
      setModForm({ user_id: '', section_id: '' })
      fetchModerators()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDeleteModerator = async (id) => {
    if (!confirm('确定要移除此版主？')) return
    try {
      await api.delete(`/api/admin/moderators/${id}`)
      fetchModerators()
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const openNewSection = () => {
    setEditSection(null)
    setSectionForm({ name: '', description: '', sort_order: 0 })
    setShowSectionModal(true)
  }

  return (
    <div className="admin-page">
      <h2>管理后台</h2>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>板块管理</button>
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>用户管理</button>
        <button className={`admin-tab ${tab === 'moderators' ? 'active' : ''}`} onClick={() => setTab('moderators')}>版主管理</button>
      </div>

      {tab === 'sections' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={openNewSection}>新建板块</button>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>描述</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.description || '-'}</td>
                  <td>{s.sort_order ?? 0}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => handleEditSection(s)}>编辑</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSection(s.id)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {showSectionModal && (
            <div className="modal-overlay" onClick={() => setShowSectionModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{editSection ? '编辑板块' : '新建板块'}</h3>
                <form onSubmit={handleCreateSection}>
                  <div className="form-group">
                    <label>名称</label>
                    <input className="form-control" value={sectionForm.name} onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>描述</label>
                    <input className="form-control" value={sectionForm.description} onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>排序</label>
                    <input className="form-control" type="number" value={sectionForm.sort_order} onChange={(e) => setSectionForm({ ...sectionForm, sort_order: Number(e.target.value) })} />
                  </div>
                  <div className="modal-actions">
                    <button className="btn btn-secondary" type="button" onClick={() => setShowSectionModal(false)}>取消</button>
                    <button className="btn btn-primary" type="submit">{editSection ? '保存' : '创建'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.email || '-'}</td>
                  <td>{u.role}</td>
                  <td>{u.is_muted ? '🔇 已禁言' : '正常'}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_muted ? 'btn-success' : 'btn-warning'}`}
                      onClick={() => handleMute(u.id, u.is_muted)}
                    >
                      {u.is_muted ? '解禁' : '禁言'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button disabled={userSkip === 0} onClick={() => setUserSkip(Math.max(0, userSkip - 20))}>上一页</button>
            <span className="page-info">第 {Math.floor(userSkip / 20) + 1} 页</span>
            <button disabled={users.length < 20} onClick={() => setUserSkip(userSkip + 20)}>下一页</button>
          </div>
        </div>
      )}

      {tab === 'moderators' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>添加版主</h3>
            <form onSubmit={handleAddModerator} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                <label>用户</label>
                <select className="form-control" value={modForm.user_id} onChange={(e) => setModForm({ ...modForm, user_id: e.target.value })} required>
                  <option value="">选择用户</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                <label>板块</label>
                <select className="form-control" value={modForm.section_id} onChange={(e) => setModForm({ ...modForm, section_id: e.target.value })} required>
                  <option value="">选择板块</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">添加</button>
            </form>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户</th>
                <th>板块</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {moderators.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  <td>{m.user?.username || m.user_id}</td>
                  <td>{m.section_name || m.section_id}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteModerator(m.id)}>移除</button>
                  </td>
                </tr>
              ))}
              {moderators.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)' }}>暂无版主</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
