import { useState, useEffect } from 'react'
import api, { adjustUserReputation, getUserReputationLogs } from '../api'
import { formatTime } from '../utils/notification'

const REASON_TYPE_LABELS = {
  create_post: '发帖',
  create_reply: '回复',
  post_replied: '被回复',
  post_favorited: '被收藏',
  report_resolved: '举报通过',
  muted: '被禁言',
  manual_adjust: '手动调整',
}

function getRoleLabel(role) {
  switch (role) {
    case 'admin': return '管理员'
    case 'moderator': return '版主'
    case 'senior': return '资深用户'
    case 'restricted': return '受限用户'
    default: return '普通用户'
  }
}

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
  const [showRepModal, setShowRepModal] = useState(false)
  const [repTargetUser, setRepTargetUser] = useState(null)
  const [repForm, setRepForm] = useState({ change: 0, reason: '' })
  const [showRepLogsModal, setShowRepLogsModal] = useState(false)
  const [repLogsUser, setRepLogsUser] = useState(null)
  const [repLogs, setRepLogs] = useState([])
  const [repLogsSkip, setRepLogsSkip] = useState(0)
  const [repLogsTotal, setRepLogsTotal] = useState(0)
  const [repLogsLoading, setRepLogsLoading] = useState(false)

  useEffect(() => {
    api.get('/api/sections/').then((res) => setSections(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'users' || tab === 'reputation') {
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

  useEffect(() => {
    if (showRepLogsModal && repLogsUser) {
      setRepLogsLoading(true)
      getUserReputationLogs(repLogsUser.id, repLogsSkip, 20)
        .then((res) => {
          setRepLogs(res.data.items)
          setRepLogsTotal(res.data.total)
        })
        .catch(() => {
          setRepLogs([])
          setRepLogsTotal(0)
        })
        .finally(() => setRepLogsLoading(false))
    }
  }, [showRepLogsModal, repLogsUser, repLogsSkip])

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

  const handleOpenRepModal = (user) => {
    setRepTargetUser(user)
    setRepForm({ change: 0, reason: '' })
    setShowRepModal(true)
  }

  const handleAdjustReputation = async (e) => {
    e.preventDefault()
    if (!repTargetUser) return
    try {
      await adjustUserReputation(repTargetUser.id, Number(repForm.change), repForm.reason)
      setShowRepModal(false)
      setRepTargetUser(null)
      setRepForm({ change: 0, reason: '' })
      const res = await api.get('/api/users/', { params: { skip: userSkip, limit: 20 } })
      setUsers(res.data)
    } catch (err) {
      alert('调整声望失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleOpenRepLogs = (user) => {
    setRepLogsUser(user)
    setRepLogsSkip(0)
    setShowRepLogsModal(true)
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
        <button className={`admin-tab ${tab === 'reputation' ? 'active' : ''}`} onClick={() => setTab('reputation')}>声望管理</button>
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

      {(tab === 'users' || tab === 'reputation') && (
        <div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>声望</th>
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
                  <td>{getRoleLabel(u.role)}</td>
                  <td>
                    <span className={u.reputation >= 0 ? 'rep-positive' : 'rep-negative'}>
                      {u.reputation}
                    </span>
                  </td>
                  <td>{u.is_muted ? '🔇 已禁言' : '正常'}</td>
                  <td>
                    <div className="admin-actions">
                      <button
                        className={`btn btn-sm ${u.is_muted ? 'btn-success' : 'btn-warning'}`}
                        onClick={() => handleMute(u.id, u.is_muted)}
                      >
                        {u.is_muted ? '解禁' : '禁言'}
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleOpenRepModal(u)}
                      >
                        调整声望
                      </button>
                      <button
                        className="btn btn-sm btn-info"
                        onClick={() => handleOpenRepLogs(u)}
                      >
                        声望记录
                      </button>
                    </div>
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

      {showRepModal && repTargetUser && (
        <div className="modal-overlay" onClick={() => setShowRepModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>调整用户声望 - {repTargetUser.username}</h3>
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-light)' }}>
              当前声望值: <strong className={repTargetUser.reputation >= 0 ? 'rep-positive' : 'rep-negative'}>{repTargetUser.reputation}</strong>
            </div>
            <form onSubmit={handleAdjustReputation}>
              <div className="form-group">
                <label>声望变化值（正数增加，负数减少）</label>
                <input
                  className="form-control"
                  type="number"
                  value={repForm.change}
                  onChange={(e) => setRepForm({ ...repForm, change: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="form-group">
                <label>调整原因</label>
                <textarea
                  className="form-control"
                  value={repForm.reason}
                  onChange={(e) => setRepForm({ ...repForm, reason: e.target.value })}
                  rows={3}
                  required
                  placeholder="请说明调整声望的原因..."
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setShowRepModal(false)}>取消</button>
                <button className="btn btn-primary" type="submit" disabled={repForm.change === 0}>
                  确认调整
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRepLogsModal && repLogsUser && (
        <div className="modal-overlay" onClick={() => { setShowRepLogsModal(false); setRepLogsUser(null) }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h3>声望记录 - {repLogsUser.username}</h3>
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-light)' }}>
              当前声望值: <strong className={repLogsUser.reputation >= 0 ? 'rep-positive' : 'rep-negative'}>{repLogsUser.reputation}</strong>
            </div>

            {repLogsLoading ? (
              <div className="loading">加载中...</div>
            ) : repLogs.length === 0 ? (
              <div className="empty-state"><p>暂无声望变动记录</p></div>
            ) : (
              <>
                <div className="reputation-logs" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {repLogs.map((log) => (
                    <div key={log.id} className="reputation-log-item">
                      <div className={`rep-change ${log.change >= 0 ? 'rep-positive' : 'rep-negative'}`}>
                        {log.change >= 0 ? '+' : ''}{log.change}
                      </div>
                      <div className="rep-log-main">
                        <div className="rep-log-reason">{log.reason}</div>
                        <div className="rep-log-meta">
                          <span className="rep-log-type">{REASON_TYPE_LABELS[log.reason_type] || log.reason_type}</span>
                          {log.operator && <span>操作人: {log.operator.username}</span>}
                          <span>{formatTime(log.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pagination" style={{ marginTop: 12 }}>
                  <button disabled={repLogsSkip === 0} onClick={() => setRepLogsSkip(Math.max(0, repLogsSkip - 20))}>上一页</button>
                  <span className="page-info">第 {Math.floor(repLogsSkip / 20) + 1} 页 / 共 {repLogsTotal} 条</span>
                  <button disabled={repLogsSkip + 20 >= repLogsTotal} onClick={() => setRepLogsSkip(repLogsSkip + 20)}>下一页</button>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => { setShowRepLogsModal(false); setRepLogsUser(null) }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
