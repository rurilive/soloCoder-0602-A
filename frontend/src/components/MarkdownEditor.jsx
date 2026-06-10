import { useState, useRef } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import api from '../api'

export default function MarkdownEditor({ value, onChange }) {
  const [preview, setPreview] = useState(false)
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

  const handleImageUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await api.post('/api/upload/image', formData)
        const url = res.data.url
        insertText(`![${file.name}](${url})`)
      } catch (err) {
        alert('图片上传失败: ' + (err.response?.data?.detail || err.message))
      }
    }
    input.click()
  }

  const toolbarButtons = [
    { label: 'B', title: '粗体', action: () => insertText('**', '**') },
    { label: 'I', title: '斜体', action: () => insertText('*', '*') },
    { label: 'H', title: '标题', action: () => insertText('## ') },
    { label: '🔗', title: '链接', action: () => insertText('[', '](url)') },
    { label: '🖼', title: '图片', action: handleImageUpload },
    { label: '<>', title: '代码', action: () => insertText('`', '`') },
    { label: '•', title: '列表', action: () => insertText('- ') },
  ]

  return (
    <div className="md-editor">
      <div className="md-editor-toolbar">
        {toolbarButtons.map((btn, i) => (
          <button key={i} type="button" title={btn.title} onClick={btn.action}>
            {btn.label}
          </button>
        ))}
        {toolbarButtons.length > 0 && <div className="separator" />}
        <button
          type="button"
          className={`md-editor-toggle ${preview ? 'active' : ''}`}
          onClick={() => setPreview(!preview)}
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>
      {preview ? (
        <div className="md-editor-preview">
          <MarkdownRenderer content={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="支持 Markdown 语法..."
        />
      )}
    </div>
  )
}
