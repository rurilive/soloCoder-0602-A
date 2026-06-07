import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            setLastMessage(data)
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

      ws.onclose = () => {
          setIsConnected(false)
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }

      ws.onerror = () => {
          setIsConnected(false)
        }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [url])

  return { isConnected, lastMessage }
}
