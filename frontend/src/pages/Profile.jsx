import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api, { getMyReputationLogs, getMyGivenRewards, getMyReceivedRewards } from '../api'
import { formatTime } from '../utils/notification'

const PAGE_SIZE = 20

const REASON_TYPE_LABELS = {
  create_post: '发帖',
  create_reply: '回复',
  post_replied: '被回复',
  post_favorited: '被收藏',
  report_resolved: '举报通过',
  muted: '被禁言',
  manual_adjust: '手动调整',
  reward_given: '打赏支出',
  reward_received: '打赏收入',
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

export default function Profile() {
  const { user, fetchUser } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')
  const [email, setEmail] = useState(user?.email || '')
  const [avatar, setAvatar] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [favorites, setFavorites] = useState([])
  const [favSkip, setFavSkip] = useState(0)
  const [favTotal, setFavTotal] = useState(0)
  const [favLoading, setFavLoading] = useState(false)
  const [repLogs, setRepLogs] = useState([])
  const [repSkip, setRepSkip] = useState(0)
  const [repTotal, setRepTotal] = useState(0)
  const [repLoading, setRepLoading] = useState(false)
  const [rewardSubTab, setRewardSubTab] = useState('given')
  const [givenRewards, setGivenRewards] = useState([])
  const [givenSkip, setGivenSkip] = useState(0)
  const [givenTotal, setGivenTotal] = useState(0)
  const [receivedRewards, setReceivedRewards] = useState([])
  const [receivedSkip, setReceivedSkip] = useState(0)
  const [receivedTotal, setReceivedTotal] = useState(0)
  const [rewardLoading, setRewardLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'favorites') {
      setFavLoading(true)
      api.get('/api/users/me/favorites', { params: { skip: favSkip, limit: PAGE_SIZE } })
        .then((res) => {
          setFavorites(res.data.items)
          setFavTotal(res.data.total)
        })
        .catch(() => {
          setFavorites([])
          setFavTotal(0)
        })
        .finally(() => setFavLoading(false))
    }
  }, [activeTab, favSkip])

  useEffect(() => {
    if (activeTab === 'reputation') {
      setRepLoading(true)
      getMyReputationLogs(repSkip, PAGE_SIZE)
        .then((res) => {
          setRepLogs(res.data.items)
          setRepTotal(res.data.total)
        })
        .catch(() => {
          setRepLogs([])
          setRepTotal(0)
        })
        .finally(() => setRepLoading(false))
    }
  }, [activeTab, repSkip])

  useEffect(() => {
    if (activeTab === 'rewards' && rewardSubTab === 'given') {
      setRewardLoading(true)
      getMyGivenRewards(givenSkip, PAGE_SIZE)
        .then((res) => {
          setGivenRewards(res.data.items)
          setGivenTotal(res.data.total)
        })
        .catch(() => {
          setGivenRewards([])
          setGivenTotal(0)
        })
        .finally(() => setRewardLoading(false))
    }
  }, [activeTab, rewardSubTab, givenSkip])

  useEffect(() => {
    if (activeTab === 'rewards' && rewardSubTab === 'received') {
      setRewardLoading(true)
      getMyReceivedRewards(receivedSkip, PAGE_SIZE)
        .then((res) => {
          setReceivedRewards(res.data.items)
          setReceivedTotal(res.data.total)
        })
        .catch(() => {
          setReceivedRewards([])
          setReceivedTotal(0)
        })
        .finally(() => setRewardLoading(false))
    }
  }, [activeTab, rewardSubTab, receivedSkip])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/api/upload/image', formData)
      setAvatar(res.data.url)
    } catch (err) {
      setMessage('头像上传失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const data = {}
      if (email !== user.email) data.email = email
      if (avatar) data.avatar = avatar
      await api.put('/api/users/me', data)
      await fetchUser()
      setMessage('保存成功')
      setAvatar('')
    } catch (err) {
      setMessage('保存失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const displayAvatar = avatar || user.avatar
  const hasMoreFavorites = favSkip + PAGE_SIZE < favTotal
  const hasMoreRepLogs = repSkip + PAGE_SIZE < repTotal

  return (
    <div className="profile-page">
      <h2>个人中心</h2>

      <div className="profile-info">
        <div className={`avatar avatar-lg`}>
          {displayAvatar ? <img src={displayAvatar} alt="" /> : user.username[0]?.toUpperCase()}
        </div>
        <div className="profile-details">
          <div className="profile-name">{user.username}</div>
          <div className="profile-role">角色: {getRoleLabel(user.role)}</div>
          <div className="profile-reputation">
            ⭐ 声望: <span className={user.reputation >= 0 ? 'rep-positive' : 'rep-negative'}>{user.reputation}</span>
          </div>
          <div className="profile-date">注册于: {new Date(user.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="profile-tabs">
        <button
          className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          基本资料
        </button>
        <button
          className={`profile-tab ${activeTab === 'reputation' ? 'active' : ''}`}
          onClick={() => setActiveTab('reputation')}
        >
          声望记录
        </button>
        <button
          className={`profile-tab ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          我的收藏
        </button>
        <button
          className={`profile-tab ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          打赏记录
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="card">
          {message && (
            <div className={`alert ${message.includes('失败') ? 'alert-danger' : 'alert-success'}`}>
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>邮箱</label>
              <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>头像</label>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              {avatar && <div style={{ marginTop: 8 }}><img src={avatar} alt="预览" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} /></div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存修改'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'reputation' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-light)' }}>当前声望值</div>
                <div style={{ fontSize: 32, fontWeight: 'bold', marginTop: 4 }}>
                  <span className={user.reputation >= 0 ? 'rep-positive' : 'rep-negative'}>{user.reputation}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, color: 'var(--text-light)' }}>升级进度</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {user.reputation < 100 ? (
                    <>距离资深用户还需 <strong className="rep-positive">{100 - user.reputation}</strong> 声望</>
                  ) : (
                    <strong style={{ color: 'var(--accent)' }}>已达成资深用户 🎖️</strong>
                  )}
                </div>
              </div>
            </div>
          </div>

          {repLoading ? (
            <div className="loading">加载中...</div>
          ) : repLogs.length === 0 ? (
            <div className="empty-state"><p>暂无声望变动记录</p></div>
          ) : (
            <>
              <div className="reputation-logs">
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

              {repTotal > 0 && (
                <div className="pagination">
                  <button disabled={repSkip === 0} onClick={() => setRepSkip(Math.max(0, repSkip - PAGE_SIZE))}>上一页</button>
                  <span className="page-info">第 {Math.floor(repSkip / PAGE_SIZE) + 1} 页 / 共 {repTotal} 条</span>
                  <button disabled={!hasMoreRepLogs} onClick={() => setRepSkip(repSkip + PAGE_SIZE)}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div>
          {favLoading ? (
            <div className="loading">加载中...</div>
          ) : favorites.length === 0 ? (
            <div className="empty-state"><p>暂无收藏的帖子</p></div>
          ) : (
            <>
              {favorites.map((item) => (
                <div key={item.id} className={`post-item ${item.is_pinned ? 'pinned' : ''}`}>
                  <div className="post-item-main">
                    <div className="post-item-title">
                      {item.is_pinned && <span className="pin-badge">置顶</span>}
                      <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/post/${item.id}`) }}>
                        {item.title}
                      </a>
                      {item.section && (
                        <a
                          href="#"
                          className="section-tag"
                          onClick={(e) => { e.preventDefault(); navigate(`/section/${item.section.id}`) }}
                        >
                          {item.section.name}
                        </a>
                      )}
                    </div>
                    <div className="post-item-meta">
                      <span className="post-detail-author">
                        <span className="avatar avatar-sm">
                          {item.author?.avatar ? <img src={item.author.avatar} alt="" /> : item.author?.username?.[0] || '?'}
                        </span>
                        {item.author?.username || '未知'}
                      </span>
                      <span>收藏于 {new Date(item.favorited_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="post-item-stats">
                    <span>👁 {item.view_count}</span>
                    <span>💬 {item.reply_count}</span>
                  </div>
                </div>
              ))}

              {favTotal > 0 && (
                <div className="pagination">
                  <button disabled={favSkip === 0} onClick={() => setFavSkip(Math.max(0, favSkip - PAGE_SIZE))}>上一页</button>
                  <span className="page-info">第 {Math.floor(favSkip / PAGE_SIZE) + 1} 页 / 共 {favTotal} 条</span>
                  <button disabled={!hasMoreFavorites} onClick={() => setFavSkip(favSkip + PAGE_SIZE)}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'rewards' && (
        <div>
          <div className="reward-sub-tabs">
            <button
              className={`reward-sub-tab ${rewardSubTab === 'given' ? 'active' : ''}`}
              onClick={() => setRewardSubTab('given')}
            >
              我打赏的
            </button>
            <button
              className={`reward-sub-tab ${rewardSubTab === 'received' ? 'active' : ''}`}
              onClick={() => setRewardSubTab('received')}
            >
              我收到的
            </button>
          </div>

          {rewardLoading ? (
            <div className="loading">加载中...</div>
          ) : rewardSubTab === 'given' ? (
            givenRewards.length === 0 ? (
              <div className="empty-state"><p>暂无打赏记录</p></div>
            ) : (
              <>
                <div className="reward-records">
                  {givenRewards.map((r) => (
                    <div key={r.id} className="reward-record-item">
                      <div className="reward-record-left">
                        <span className="avatar avatar-sm">
                          {r.receiver?.avatar ? <img src={r.receiver.avatar} alt="" /> : r.receiver?.username?.[0] || '?'}
                        </span>
                        <div className="reward-record-info">
                          <div className="reward-record-desc">
                            打赏了 <strong>{r.receiver?.username || '未知'}</strong>
                          </div>
                          <div className="reward-record-meta">
                            {r.post_title && <span className="reward-record-post" onClick={() => navigate(`/post/${r.post_id}`)}>《{r.post_title}》</span>}
                            <span>{formatTime(r.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="reward-record-amount rep-negative">-{r.amount}</div>
                    </div>
                  ))}
                </div>
                {givenTotal > 0 && (
                  <div className="pagination">
                    <button disabled={givenSkip === 0} onClick={() => setGivenSkip(Math.max(0, givenSkip - PAGE_SIZE))}>上一页</button>
                    <span className="page-info">第 {Math.floor(givenSkip / PAGE_SIZE) + 1} 页 / 共 {givenTotal} 条</span>
                    <button disabled={givenSkip + PAGE_SIZE >= givenTotal} onClick={() => setGivenSkip(givenSkip + PAGE_SIZE)}>下一页</button>
                  </div>
                )}
              </>
            )
          ) : receivedRewards.length === 0 ? (
            <div className="empty-state"><p>暂无收到的打赏</p></div>
          ) : (
            <>
              <div className="reward-records">
                {receivedRewards.map((r) => (
                  <div key={r.id} className="reward-record-item">
                    <div className="reward-record-left">
                      <span className="avatar avatar-sm">
                        {r.giver?.avatar ? <img src={r.giver.avatar} alt="" /> : r.giver?.username?.[0] || '?'}
                      </span>
                      <div className="reward-record-info">
                        <div className="reward-record-desc">
                          收到 <strong>{r.giver?.username || '未知'}</strong> 的打赏
                        </div>
                        <div className="reward-record-meta">
                          {r.post_title && <span className="reward-record-post" onClick={() => navigate(`/post/${r.post_id}`)}>《{r.post_title}》</span>}
                          <span>{formatTime(r.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="reward-record-amount rep-positive">+{r.received_amount}</div>
                  </div>
                ))}
              </div>
              {receivedTotal > 0 && (
                <div className="pagination">
                  <button disabled={receivedSkip === 0} onClick={() => setReceivedSkip(Math.max(0, receivedSkip - PAGE_SIZE))}>上一页</button>
                  <span className="page-info">第 {Math.floor(receivedSkip / PAGE_SIZE) + 1} 页 / 共 {receivedTotal} 条</span>
                  <button disabled={receivedSkip + PAGE_SIZE >= receivedTotal} onClick={() => setReceivedSkip(receivedSkip + PAGE_SIZE)}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
