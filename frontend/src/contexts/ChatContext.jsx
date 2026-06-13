import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { getChatUnreadCount } from '../api'
import { useAuth } from './AuthContext'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { isAuthenticated, user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const wsRef = useRef(null)
  const onMessageCallbacks = useRef([])

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }
    try {
      const res = await getChatUnreadCount()
      setUnreadCount(res.data.count)
    } catch (err) {
      console.error('获取未读私信数失败:', err)
    }
  }, [isAuthenticated])

  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated) return

    const token = localStorage.getItem('token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//localhost:1111/api/chat/ws?token=${token}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Chat WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'message') {
          onMessageCallbacks.current.forEach((cb) => cb(data))
          refreshUnreadCount()
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err)
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (isAuthenticated) {
        setTimeout(connectWebSocket, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [isAuthenticated, refreshUnreadCount])

  const sendMessage = useCallback((conversationId, content) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        conversation_id: conversationId,
        content: content,
      }))
    }
  }, [])

  const onMessage = useCallback((callback) => {
    onMessageCallbacks.current.push(callback)
    return () => {
      onMessageCallbacks.current = onMessageCallbacks.current.filter((cb) => cb !== callback)
    }
  }, [])

  useEffect(() => {
    refreshUnreadCount()
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }
    connectWebSocket()
    const interval = setInterval(refreshUnreadCount, 30000)
    return () => {
      clearInterval(interval)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [isAuthenticated, connectWebSocket, refreshUnreadCount])

  return (
    <ChatContext.Provider
      value={{
        unreadCount,
        refreshUnreadCount,
        sendMessage,
        onMessage,
        wsRef,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
