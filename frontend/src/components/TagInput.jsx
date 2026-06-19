import { useState, useEffect, useRef } from 'react'
import { searchTags } from '../api'

export default function TagInput({ tags = [], onChange, maxTags = 5, placeholder = '添加标签，按回车或逗号确认' }) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const timeoutRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchSuggestions = async (q) => {
    if (!q.trim() || q.trim().length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const res = await searchTags(q, 10)
      const filtered = res.data.filter((t) => !tags.some((tag) => tag.id === t.id))
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } catch {
      setSuggestions([])
    }
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInputValue(value)
    setError('')

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (value.endsWith(',') || value.endsWith('，')) {
      const tagName = value.slice(0, -1).trim()
      if (tagName) {
        addTagByName(tagName)
      }
      setInputValue('')
      setShowSuggestions(false)
      return
    }

    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(value.trim())
    }, 200)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const tagName = inputValue.trim()
      if (tagName) {
        addTagByName(tagName)
        setInputValue('')
      }
      setShowSuggestions(false)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const addTagByName = (name) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    if (trimmedName.length < 2 || trimmedName.length > 20) {
      setError('标签名长度必须在 2-20 个字符之间')
      return
    }

    if (tags.some((t) => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('该标签已添加')
      return
    }

    if (tags.length >= maxTags) {
      setError(`最多只能添加 ${maxTags} 个标签`)
      return
    }

    const newTag = { id: -Date.now(), name: trimmedName }
    onChange([...tags, newTag])
    setError('')
  }

  const addTag = (tag) => {
    if (tags.some((t) => t.id === tag.id || t.name === tag.name)) {
      return
    }
    if (tags.length >= maxTags) {
      setError(`最多只能添加 ${maxTags} 个标签`)
      return
    }
    onChange([...tags, tag])
    setInputValue('')
    setShowSuggestions(false)
  }

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t.id !== tag.id))
  }

  const handleSuggestionClick = (tag) => {
    addTag(tag)
    inputRef.current?.focus()
  }

  const handleFocus = () => {
    if (inputValue.trim() && suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  return (
    <div className="tag-input-wrapper" ref={wrapperRef}>
      <div className="tag-input-container">
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag.id} className="tag-item">
              <span className="tag-name">{tag.name}</span>
              <button
                type="button"
                className="tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`删除标签 ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="tag-input"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={tags.length === 0 ? placeholder : ''}
            disabled={tags.length >= maxTags}
          />
        </div>
        {error && <div className="tag-input-error">{error}</div>}
        <div className="tag-input-hint">
          最多 {maxTags} 个标签，按回车或逗号添加
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="tag-suggestions">
          {suggestions.map((tag) => (
            <div
              key={tag.id}
              className="tag-suggestion-item"
              onClick={() => handleSuggestionClick(tag)}
            >
              <span className="tag-suggestion-name">{tag.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
