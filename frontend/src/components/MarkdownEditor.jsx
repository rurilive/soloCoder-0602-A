import { useState, useRef } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import api from '../api'

export default function MarkdownEditor({ value, onChange }) {
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  const insertText = (before, after = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.substring(start, end)
    const newText = value.substring(0, start) + before + selected + after + value.substring(end)
    onChange(newText)
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selected.length
    }, 0)
  }

  const getErrorMessage = (err) => {
    if (err.response) {
      const detail = err.response.data?.detail
      if (detail) {
        if (typeof detail === 'string') {
          return detail
        }
        if (Array.isArray(detail)) {
          return detail.map(d => d.msg || JSON.stringify(d)).join('; ')
        }
        return JSON.stringify(detail)
      }
      return `请求失败 (HTTP ${err.response.status})`
    }
    if (err.request) {
      return '网络错误，请检查网络连接或服务器状态'
    }
    return err.message || '未知错误'
  }

  const handleImageUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/gif,image/webp'

    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      setError('')

      const allowedExtensions = /\.(jpe?g|png|gif|webp)$/i
      if (!allowedExtensions.test(file.name)) {
        setError(`不支持的文件格式，请上传 .jpg、.jpeg、.png、.gif 或 .webp 格式的图片`)
        return
      }

      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        setError(`图片大小不能超过 5MB，当前文件大小：${(file.size / 1024 / 1024).toFixed(2)}MB`)
        return
      }

      if (file.size === 0) {
        setError('文件内容为空，请选择有效的图片文件')
        return
      }

      setUploading(true)
      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await api.post('/api/upload/image', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        })
        const url = res.data.url
        insertText(`![${file.name}](${url})`)
        setError('')
      } catch (err) {
        const msg = getErrorMessage(err)
        setError(`图片上传失败：${msg}`)
      } finally {
        setUploading(false)
      }
    }

    input.click()
  }

  const toolbarButtons = [
    { label: 'B', title: '粗体', action: () => insertText('**', '**'), disabled: uploading },
    { label: 'I', title: '斜体', action: () => insertText('*', '*'), disabled: uploading },
    { label: 'H', title: '标题', action: () => insertText('## '), disabled: uploading },
    { label: '🔗', title: '链接', action: () => insertText('[', '](url)'), disabled: uploading },
    { label: uploading ? '⏳' : '🖼', title: uploading ? '上传中...' : '图片', action: handleImageUpload, disabled: uploading },
    { label: '<>', title: '代码', action: () => insertText('`', '`'), disabled: uploading },
    { label: '•', title: '列表', action: () => insertText('- '), disabled: uploading },
  ]

  return (
    <div className="md-editor">
      <div className="md-editor-toolbar">
        {toolbarButtons.map((btn, i) => (
          <button
            key={i}
            type="button"
            title={btn.title}
            onClick={btn.action}
            disabled={btn.disabled}
            className={btn.disabled ? 'disabled' : ''}
          >
            {btn.label}
          </button>
        ))}
        {toolbarButtons.length > 0 && <div className="separator" />}
        <button
          type="button"
          className={`md-editor-toggle ${preview ? 'active' : ''}`}
          onClick={() => setPreview(!preview)}
          disabled={uploading}
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>

      {error && (
        <div className="md-editor-error">
          <span className="error-icon">⚠</span>
          <span className="error-text">{error}</span>
          <button
            type="button"
            className="error-close"
            onClick={() => setError('')}
            title="关闭"
          >
            ×
          </button>
        </div>
      )}

      {uploading && (
        <div className="md-editor-loading">
          <div className="loading-spinner" />
          <span>图片上传中，请稍候...</span>
        </div>
      )}

      {preview ? (
        <div className="md-editor-preview">
          <MarkdownRenderer content={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (error) setError('')
          }}
          placeholder="支持 Markdown 语法..."
          disabled={uploading}
        />
      )}
    </div>
  )
}
