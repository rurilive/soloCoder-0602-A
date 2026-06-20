import { useEffect, useState } from 'react'
import { clientsAPI } from '../api'
import type { Client, CreateClientRequest, UpdateClientRequest } from '../types'

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [formData, setFormData] = useState<CreateClientRequest>({
    name: '',
    description: '',
    redirect_uris: '',
    scope: 'read write',
  })
  const [error, setError] = useState('')

  const fetchClients = async () => {
    try {
      const response = await clientsAPI.list()
      setClients(response.data)
    } catch (err: any) {
      console.error('Failed to fetch clients:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (editingClient) {
        const updateData: UpdateClientRequest = { ...formData }
        await clientsAPI.update(editingClient.client_id, updateData)
      } else {
        await clientsAPI.create(formData)
      }
      setShowModal(false)
      setEditingClient(null)
      resetForm()
      fetchClients()
    } catch (err: any) {
      setError(err.response?.data?.detail || '操作失败，请稍后重试')
    }
  }

  const handleEdit = (client: Client) => {
    setEditingClient(client)
    setFormData({
      name: client.name,
      description: client.description || '',
      redirect_uris: client.redirect_uris,
      scope: client.scope,
    })
    setShowModal(true)
  }

  const handleDelete = async (clientId: string) => {
    if (!confirm('确定要删除这个客户端吗？')) return
    try {
      await clientsAPI.delete(clientId)
      fetchClients()
    } catch (err: any) {
      alert('删除失败：' + (err.response?.data?.detail || err.message))
    }
  }

  const handleToggleActive = async (client: Client) => {
    try {
      await clientsAPI.update(client.client_id, { is_active: !client.is_active })
      fetchClients()
    } catch (err: any) {
      alert('操作失败：' + (err.response?.data?.detail || err.message))
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      redirect_uris: '',
      scope: 'read write',
    })
    setError('')
  }

  const openCreateModal = () => {
    setEditingClient(null)
    resetForm()
    setShowModal(true)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('已复制到剪贴板')
  }

  if (loading) {
    return <div style={styles.loading}>加载中...</div>
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>🔑 客户端管理</h1>
        <button onClick={openCreateModal} style={styles.createBtn}>
          ➕ 注册新客户端
        </button>
      </div>

      {clients.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
          <h3 style={{ color: '#2d3748', marginBottom: '8px' }}>还没有注册的客户端</h3>
          <p style={{ color: '#718096' }}>点击上方按钮注册您的第一个客户端</p>
        </div>
      ) : (
        <div style={styles.clientList}>
          {clients.map((client) => (
            <div key={client.id} style={styles.clientCard}>
              <div style={styles.clientHeader}>
                <div style={styles.clientName}>
                  <span style={{ fontSize: '24px', marginRight: '12px' }}>
                    {client.is_active ? '🟢' : '🔴'}
                  </span>
                  <div>
                    <div style={styles.clientTitle}>{client.name}</div>
                    {client.description && (
                      <div style={styles.clientDesc}>{client.description}</div>
                    )}
                  </div>
                </div>
                <div style={styles.clientActions}>
                  <button
                    onClick={() => handleToggleActive(client)}
                    style={{
                      ...styles.actionBtn,
                      ...(client.is_active ? styles.deactivateBtn : styles.activateBtn),
                    }}
                  >
                    {client.is_active ? '⏸️ 停用' : '▶️ 启用'}
                  </button>
                  <button onClick={() => handleEdit(client)} style={styles.editBtn}>
                    ✏️ 编辑
                  </button>
                  <button onClick={() => handleDelete(client.client_id)} style={styles.deleteBtn}>
                    🗑️ 删除
                  </button>
                </div>
              </div>

              <div style={styles.clientDetails}>
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Client ID</span>
                  <div style={styles.detailValueRow}>
                    <code style={styles.detailCode}>{client.client_id}</code>
                    <button onClick={() => copyToClipboard(client.client_id)} style={styles.copyBtn}>
                      📋
                    </button>
                  </div>
                </div>

                {client.client_secret && (
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Client Secret</span>
                    <div style={styles.detailValueRow}>
                      <code style={styles.detailCode}>{client.client_secret}</code>
                      <button onClick={() => copyToClipboard(client.client_secret!)} style={styles.copyBtn}>
                        📋
                      </button>
                    </div>
                    <div style={styles.secretWarning}>
                      ⚠️ 请妥善保管此密钥，之后将无法再次查看
                    </div>
                  </div>
                )}

                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Redirect URIs</span>
                  <code style={styles.detailCode}>{client.redirect_uris}</code>
                </div>

                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Scope</span>
                  <code style={styles.detailCode}>{client.scope}</code>
                </div>

                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>创建时间</span>
                  <span style={styles.detailValue}>
                    {new Date(client.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>
              {editingClient ? '编辑客户端' : '注册新客户端'}
            </h2>

            <form onSubmit={handleSubmit} style={styles.form}>
              {error && <div style={styles.error}>{error}</div>}

              <div style={styles.formGroup}>
                <label style={styles.label}>客户端名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={styles.input}
                  placeholder="例如：我的Web应用"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={styles.textarea}
                  placeholder="描述此客户端的用途"
                  rows={3}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Redirect URIs *</label>
                <input
                  type="text"
                  value={formData.redirect_uris}
                  onChange={(e) => setFormData({ ...formData, redirect_uris: e.target.value })}
                  style={styles.input}
                  placeholder="多个URI用空格分隔，例如：http://localhost:8000/callback"
                  required
                />
                <div style={styles.hint}>多个回调地址用空格分隔</div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Scope</label>
                <input
                  type="text"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  style={styles.input}
                  placeholder="read write"
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingClient(null)
                    resetForm()
                  }}
                  style={styles.cancelBtn}
                >
                  取消
                </button>
                <button type="submit" style={styles.submitBtn}>
                  {editingClient ? '保存修改' : '注册客户端'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '50vh',
    fontSize: '18px',
    color: '#718096',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  pageTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a202c',
  } as React.CSSProperties,
  createBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  emptyState: {
    background: 'white',
    borderRadius: '12px',
    padding: '60px 20px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
  clientList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  clientCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
  clientHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  } as React.CSSProperties,
  clientName: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  clientTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
  } as React.CSSProperties,
  clientDesc: {
    fontSize: '14px',
    color: '#718096',
    marginTop: '4px',
  } as React.CSSProperties,
  clientActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  actionBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  editBtn: {
    padding: '8px 16px',
    background: '#e2e8f0',
    color: '#2d3748',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  deleteBtn: {
    padding: '8px 16px',
    background: '#fed7d7',
    color: '#c53030',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  activateBtn: {
    background: '#c6f6d5',
    color: '#22543d',
  } as React.CSSProperties,
  deactivateBtn: {
    background: '#feebc8',
    color: '#7b341e',
  } as React.CSSProperties,
  clientDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  detailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  detailValueRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  } as React.CSSProperties,
  detailCode: {
    flex: 1,
    background: '#f7fafc',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#2d3748',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  } as React.CSSProperties,
  detailValue: {
    fontSize: '14px',
    color: '#2d3748',
  } as React.CSSProperties,
  copyBtn: {
    padding: '6px 10px',
    background: '#e2e8f0',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  secretWarning: {
    fontSize: '12px',
    color: '#dd6b20',
  } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflowY: 'auto',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '24px',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  error: {
    background: '#fed7d7',
    color: '#c53030',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
  } as React.CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
  } as React.CSSProperties,
  input: {
    padding: '12px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'all 0.2s',
    outline: 'none',
  } as React.CSSProperties,
  textarea: {
    padding: '12px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    resize: 'vertical',
    transition: 'all 0.2s',
    outline: 'none',
  } as React.CSSProperties,
  hint: {
    fontSize: '12px',
    color: '#718096',
  } as React.CSSProperties,
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelBtn: {
    flex: 1,
    padding: '12px',
    background: '#e2e8f0',
    color: '#4a5568',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  submitBtn: {
    flex: 2,
    padding: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
}
