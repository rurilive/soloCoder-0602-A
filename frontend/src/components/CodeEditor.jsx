import { useRef } from 'react'
import Editor from '@monaco-editor/react'

function CodeEditor({ value, onChange, height = '400px', language = 'python', readOnly = false }) {
  const editorRef = useRef(null)

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor
    editor.focus()
  }

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden' }}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          readOnly: readOnly,
          theme: 'vs'
        }}
      />
    </div>
  )
}

export default CodeEditor
