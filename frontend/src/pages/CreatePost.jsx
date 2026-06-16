import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { createPoll } from '../api'
import MarkdownEditor from '../components/MarkdownEditor'

export default function CreatePost() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [hasPoll, setHasPoll] = useState(false)
  const [pollIsMulti, setPollIsMulti] = useState(false)
  const [pollMaxChoices, setPollMaxChoices] = useState(2)
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [createdPostId, setCreatedPostId] = useState(null)
  const [createdPostData, setCreatedPostData] = useState(null)
  const [pollError, setPollError] = useState('')
  const [pollRetrying, setPollRetrying] = useState(false)

  const addPollOption = () => {
    if (pollOptions.length >= 20) return
    setPollOptions([...pollOptions, ''])
  }

  const removePollOption = (index) => {
    if (pollOptions.length <= 2) return
    setPollOptions(pollOptions.filter((_, i) => i !== index))
  }

  const updatePollOption = (index, value) => {
    const updated = [...pollOptions]
    updated[index] = value
    setPollOptions(updated)
  }

  const tryCreatePoll = async (postId) => {
    const filledOptions = pollOptions.filter((o) => o.trim())
    try {
      await createPoll(postId, {
        is_multi: pollIsMulti,
        max_choices: pollIsMulti ? pollMaxChoices : 1,
        options: filledOptions,
      })
      return { success: true }
    } catch (pollErr) {
      return {
        success: false,
        message: pollErr.response?.data?.detail || '创建投票失败',
      }
    }
  }

  const goToPost = (postId, postData) => {
    if (postData?.is_pending_review) {
      alert('您的帖子已提交，正在审核中，审核通过后将正常展示。您可以在"我的帖子"中查看。')
      navigate('/profile')
    } else if (postData?.is_scheduled) {
      alert('定时帖子已创建，将在指定时间自动发布。')
      navigate(`/post/${postId}`)
    } else {
      navigate(`/post/${postId}`)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }
    if (isScheduled && !scheduledAt) {
      setError('请选择定时发布时间')
      return
    }
    if (isScheduled && new Date(scheduledAt) <= new Date()) {
      setError('定时发布时间必须为未来时间')
      return
    }
    if (hasPoll) {
      const filledOptions = pollOptions.filter((o) => o.trim())
      if (filledOptions.length < 2) {
        setError('投票至少需要2个非空选项')
        return
      }
    }
    setLoading(true)
    setError('')
    try {
      const payload = { title, content }
      if (isScheduled && scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString()
      }
      const res = await api.post(`/api/sections/${sectionId}/posts`, payload)
      const postId = res.data.id

      if (hasPoll) {
        const pollResult = await tryCreatePoll(postId)
        if (!pollResult.success) {
          setCreatedPostId(postId)
          setCreatedPostData(res.data)
          setPollError(pollResult.message)
          setLoading(false)
          return
        }
      }

      goToPost(postId, res.data)
    } catch (err) {
      setError(err.response?.data?.detail || '发布失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRetryPoll = async () => {
    if (!createdPostId) return
    setPollRetrying(true)
    setPollError('')
    const result = await tryCreatePoll(createdPostId)
    setPollRetrying(false)
    if (result.success) {
      goToPost(createdPostId, createdPostData)
    } else {
      setPollError(result.message)
    }
  }

  const handleSkipPoll = () => {
    if (!createdPostId) return
    goToPost(createdPostId, createdPostData)
  }

  const getMinDatetime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  return (
    <div className="create-post-page">
      <h2>发布新帖</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      {createdPostId && pollError && (
        <div className="alert alert-warning poll-failed-alert">
          <div style={{ marginBottom: 8 }}>
            <strong>帖子已发布，但投票创建失败：</strong>
            {pollError}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={handleRetryPoll} disabled={pollRetrying}>
              {pollRetrying ? '重试中...' : '重试创建投票'}
            </button>
            <button className="btn btn-sm btn-secondary" onClick={handleSkipPoll}>
              跳过，直接查看帖子
            </button>
          </div>
        </div>
      )}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>标题</label>
            <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>内容</label>
            <MarkdownEditor value={content} onChange={setContent} />
          </div>
          <div className="form-group scheduled-publish-group">
            <label className="scheduled-publish-label">
              <input
                type="checkbox"
                checked={isScheduled}
                onChange={(e) => {
                  setIsScheduled(e.target.checked)
                  if (!e.target.checked) setScheduledAt('')
                }}
              />
              <span>定时发布</span>
            </label>
            {isScheduled && (
              <div className="scheduled-datetime-picker">
                <label>发布时间</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={scheduledAt}
                  min={getMinDatetime()}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
                <small style={{ color: 'var(--text-light)', marginTop: 4, display: 'block' }}>
                  帖子将在指定时间后才对其他用户可见
                </small>
              </div>
            )}
          </div>
          <div className="form-group poll-create-group">
            <label className="scheduled-publish-label">
              <input
                type="checkbox"
                checked={hasPoll}
                onChange={(e) => setHasPoll(e.target.checked)}
              />
              <span>添加投票</span>
            </label>
            {hasPoll && (
              <div className="poll-create-options">
                <div className="poll-type-toggle">
                  <label className="poll-type-option">
                    <input
                      type="radio"
                      name="pollType"
                      checked={!pollIsMulti}
                      onChange={() => { setPollIsMulti(false); setPollOptions(['', '']) }}
                    />
                    <span>单选投票</span>
                  </label>
                  <label className="poll-type-option">
                    <input
                      type="radio"
                      name="pollType"
                      checked={pollIsMulti}
                      onChange={() => { setPollIsMulti(true); setPollMaxChoices(2); setPollOptions(['', '']) }}
                    />
                    <span>多选投票</span>
                  </label>
                  {pollIsMulti && (
                    <div className="poll-max-choices">
                      <label>最多可选</label>
                      <select
                        className="form-control poll-max-select"
                        value={pollMaxChoices}
                        onChange={(e) => setPollMaxChoices(parseInt(e.target.value))}
                      >
                        {pollOptions.filter((o) => o.trim()).length >= 2 &&
                          Array.from(
                            { length: pollOptions.filter((o) => o.trim()).length - 1 },
                            (_, i) => (
                              <option key={i + 2} value={i + 2}>{i + 2}</option>
                            )
                          )}
                      </select>
                      <span>项</span>
                    </div>
                  )}
                </div>
                <div className="poll-option-list">
                  {pollOptions.map((opt, index) => (
                    <div key={index} className="poll-option-input-row">
                      <input
                        className="form-control"
                        value={opt}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                        placeholder={`选项 ${index + 1}`}
                        maxLength={200}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary poll-option-remove-btn"
                          onClick={() => removePollOption(index)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 20 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline poll-add-option-btn"
                    onClick={addPollOption}
                  >
                    + 添加选项
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '发布中...' : isScheduled ? '定时发布' : '发布'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
