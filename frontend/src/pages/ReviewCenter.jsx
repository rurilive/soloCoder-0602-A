import { useState, useEffect, useCallback } from 'react'
import api, {
  getPendingReports,
  batchReviewReports,
  reviewReport,
  getPendingReviewItems,
  approvePendingReview,
  rejectPendingReview,
} from '../api'

const PAGE_SIZE = 20

export default function ReviewCenter() {
  const [activeTab, setActiveTab] = useState('reports')

  const [reports, setReports] = useState([])
  const [pendingItems, setPendingItems] = useState([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [reviewNote, setReviewNote] = useState('')
  const [processing, setProcessing] = useState(false)
  const [singleReview, setSingleReview] = useState(null)
  const [targetTypeFilter, setTargetTypeFilter] = useState(null)

  useEffect(() => {
    api.get('/api/sections/').then((res) => setSections(res.data)).catch(() => {})
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getPendingReports(skip, PAGE_SIZE, selectedSection)
      setReports(res.data.items)
      setTotal(res.data.total)
    } catch {
      setReports([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [skip, selectedSection])

  const fetchPendingItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getPendingReviewItems(skip, PAGE_SIZE, targetTypeFilter, selectedSection)
      setPendingItems(res.data.items)
      setTotal(res.data.total)
    } catch {
      setPendingItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [skip, selectedSection, targetTypeFilter])

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports()
    } else {
      fetchPendingItems()
    }
  }, [activeTab, fetchReports, fetchPendingItems])

  useEffect(() => {
    setSkip(0)
    setSelectedIds([])
  }, [selectedSection, targetTypeFilter, activeTab])

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      if (activeTab === 'reports') {
        setSelectedIds(reports.map((r) => r.id))
      } else {
        setSelectedIds(pendingItems.map((item) => `${item.target_type}-${item.id}`))
      }
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleBatchAction = async (action) => {
    if (selectedIds.length === 0) {
      alert('请先选择内容')
      return
    }
    const actionText = action === 'resolve' || action === 'reject' ? '不通过' : '通过'
    if (!confirm(`确定要批量${actionText} ${selectedIds.length} 条内容吗？`)) return
    setProcessing(true)
    try {
      if (activeTab === 'reports') {
        await batchReviewReports(selectedIds, action, reviewNote || null)
      } else {
        for (const idStr of selectedIds) {
          const [targetType, targetId] = idStr.split('-')
          if (action === 'approve') {
            await approvePendingReview(targetType, parseInt(targetId))
          } else {
            await rejectPendingReview(targetType, parseInt(targetId), reviewNote || null)
          }
        }
      }
      setSelectedIds([])
      setReviewNote('')
      if (activeTab === 'reports') {
        fetchReports()
      } else {
        fetchPendingItems()
      }
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setProcessing(false)
    }
  }

  const handleSingleReview = async (id, action) => {
    const note = singleReview?.note || null
    setProcessing(true)
    try {
      if (activeTab === 'reports') {
        await reviewReport(id, action, note)
      } else {
        const [targetType, targetId] = id.split('-')
        if (action === 'approve') {
          await approvePendingReview(targetType, parseInt(targetId))
        } else {
          await rejectPendingReview(targetType, parseInt(targetId), note)
        }
      }
      setSingleReview(null)
      if (activeTab === 'reports') {
        fetchReports()
      } else {
        fetchPendingItems()
      }
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setProcessing(false)
    }
  }

  const hasMore = skip + PAGE_SIZE < total

  return (
    <div className="review-center-page">
      <h2>审核中心</h2>

      <div className="review-tabs">
        <button
          className={`review-tab ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          举报审核
        </button>
        <button
          className={`review-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          待审核
        </button>
      </div>

      <div className="review-filters">
        <div className="review-filter-row">
          <label>按板块筛选：</label>
          <select
            className="form-control"
            style={{ width: 200, display: 'inline-block' }}
            value={selectedSection || ''}
            onChange={(e) => setSelectedSection(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">全部板块</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {activeTab === 'pending' && (
            <select
              className="form-control"
              style={{ width: 150, display: 'inline-block', marginLeft: 10 }}
              value={targetTypeFilter || ''}
              onChange={(e) => setTargetTypeFilter(e.target.value || null)}
            >
              <option value="">全部类型</option>
              <option value="post">帖子</option>
              <option value="reply">回复</option>
            </select>
          )}
          <span className="review-total">共 {total} 条待审核</span>
        </div>

        {selectedIds.length > 0 && (
          <div className="review-batch-actions">
            <span>已选择 {selectedIds.length} 条</span>
            <input
              className="form-control"
              style={{ width: 300, display: 'inline-block' }}
              placeholder="审核意见（可选）"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            <button
              className="btn btn-sm btn-success"
              disabled={processing}
              onClick={() => handleBatchAction(activeTab === 'reports' ? 'dismiss' : 'approve')}
            >
              批量通过
            </button>
            <button
              className="btn btn-sm btn-danger"
              disabled={processing}
              onClick={() => handleBatchAction(activeTab === 'reports' ? 'resolve' : 'reject')}
            >
              批量不通过{activeTab === 'pending' && ' (-10声望)'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (activeTab === 'reports' ? reports : pendingItems).length === 0 ? (
        <div className="empty-state"><p>暂无待审核内容</p></div>
      ) : (
        <div className="review-table-wrapper">
          <table className="admin-table review-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === (activeTab === 'reports' ? reports : pendingItems).length && (activeTab === 'reports' ? reports : pendingItems).length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                {activeTab === 'reports' && <th>举报人</th>}
                <th>目标类型</th>
                <th>目标内容</th>
                <th>内容作者</th>
                <th>所属板块</th>
                {activeTab === 'reports' && <th>举报原因</th>}
                <th>{activeTab === 'reports' ? '举报时间' : '提交时间'}</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'reports'
                ? reports.map((report) => (
                    <tr key={report.id} className={selectedIds.includes(report.id) ? 'review-row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(report.id)}
                          onChange={() => handleSelectOne(report.id)}
                        />
                      </td>
                      <td>
                        <span className="review-user">
                          <span className="avatar avatar-xs">
                            {report.reporter?.avatar ? (
                              <img src={report.reporter.avatar} alt="" />
                            ) : (
                              report.reporter?.username?.[0] || '?'
                            )}
                          </span>
                          {report.reporter?.username}
                        </span>
                      </td>
                      <td>
                        <span className={`review-type-badge ${report.target_type}`}>
                          {report.target_type === 'post' ? '帖子' : '回复'}
                        </span>
                      </td>
                      <td className="review-target-content">
                        {report.target_type === 'post' ? (
                          <a href={`/post/${report.target_id}`} target="_blank" rel="noopener noreferrer">
                            {report.target_content || `帖子#${report.target_id}`}
                          </a>
                        ) : (
                          <span>{report.target_content || `回复#${report.target_id}`}</span>
                        )}
                      </td>
                      <td>
                        {report.target_author && (
                          <span className="review-user">
                            <span className="avatar avatar-xs">
                              {report.target_author?.avatar ? (
                                <img src={report.target_author.avatar} alt="" />
                              ) : (
                                report.target_author?.username?.[0] || '?'
                              )}
                            </span>
                            {report.target_author?.username}
                          </span>
                        )}
                      </td>
                      <td>{report.target_section_name || '-'}</td>
                      <td className="review-reason">{report.reason}</td>
                      <td className="review-date">{new Date(report.created_at).toLocaleString()}</td>
                      <td>
                        <div className="admin-actions">
                          {singleReview?.id === report.id ? (
                            <>
                              <input
                                className="form-control"
                                style={{ width: 150, fontSize: 12, marginBottom: 4 }}
                                placeholder="审核意见"
                                value={singleReview.note || ''}
                                onChange={(e) => setSingleReview({ ...singleReview, note: e.target.value })}
                              />
                              <button
                                className="btn btn-sm btn-danger"
                                disabled={processing}
                                onClick={() => handleSingleReview(report.id, 'resolve')}
                              >
                                通过
                              </button>
                              <button
                                className="btn btn-sm btn-success"
                                disabled={processing}
                                onClick={() => handleSingleReview(report.id, 'dismiss')}
                              >
                                驳回
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setSingleReview(null)}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setSingleReview({ id: report.id, note: '' })}
                            >
                              审核
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                : pendingItems.map((item) => {
                    const itemId = `${item.target_type}-${item.id}`
                    return (
                      <tr key={itemId} className={selectedIds.includes(itemId) ? 'review-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(itemId)}
                            onChange={() => handleSelectOne(itemId)}
                          />
                        </td>
                        <td>
                          <span className={`review-type-badge ${item.target_type}`}>
                            {item.target_type === 'post' ? '帖子' : '回复'}
                          </span>
                        </td>
                        <td className="review-target-content">
                          {item.target_type === 'post' ? (
                            <a href={`/post/${item.id}`} target="_blank" rel="noopener noreferrer">
                              {item.title || `帖子#${item.id}`}
                            </a>
                          ) : (
                            <span>{item.content || `回复#${item.id}`}</span>
                          )}
                        </td>
                        <td>
                          <span className="review-user">
                            <span className="avatar avatar-xs">
                              {item.author?.avatar ? (
                                <img src={item.author.avatar} alt="" />
                              ) : (
                                item.author?.username?.[0] || '?'
                              )}
                            </span>
                            {item.author?.username}
                          </span>
                        </td>
                        <td>{item.section_name || '-'}</td>
                        <td className="review-date">{new Date(item.created_at).toLocaleString()}</td>
                        <td>
                          <div className="admin-actions">
                            {singleReview?.id === itemId ? (
                              <>
                                <input
                                  className="form-control"
                                  style={{ width: 150, fontSize: 12, marginBottom: 4 }}
                                  placeholder="审核意见"
                                  value={singleReview.note || ''}
                                  onChange={(e) => setSingleReview({ ...singleReview, note: e.target.value })}
                                />
                                <button
                                  className="btn btn-sm btn-success"
                                  disabled={processing}
                                  onClick={() => handleSingleReview(itemId, 'approve')}
                                >
                                  通过
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  disabled={processing}
                                  onClick={() => handleSingleReview(itemId, 'reject')}
                                >
                                  不通过
                                </button>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => setSingleReview(null)}
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleSingleReview(itemId, 'approve')}
                                >
                                  通过
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setSingleReview({ id: itemId, note: '' })}
                                >
                                  不通过
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>

          {total > 0 && (
            <div className="pagination">
              <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
                上一页
              </button>
              <span className="page-info">
                第 {Math.floor(skip / PAGE_SIZE) + 1} 页 / 共 {Math.ceil(total / PAGE_SIZE)} 页
              </span>
              <button disabled={!hasMore} onClick={() => setSkip(skip + PAGE_SIZE)}>
                下一页
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
