import { useEffect, useRef, useCallback, useState } from 'react'

const WS_BASE = 'ws://localhost:1111'
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_DELAY = 2000

export function useWebSocket(buildId, onMessage) {
  const wsRef = useRef(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const connect = useCallback(() => {
    if (!buildId) return

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/builds/${buildId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setReconnecting(false)
        reconnectCountRef.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessage?.(data)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null

        if (shouldReconnectRef.current && reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(true)
          reconnectCountRef.current += 1
          const delay = RECONNECT_DELAY * Math.min(reconnectCountRef.current, 5)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          setReconnecting(false)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (error) {
      console.error('WebSocket connection error:', error)
    }
  }, [buildId, onMessage])

  useEffect(() => {
    shouldReconnectRef.current = true
    reconnectCountRef.current = 0
    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const close = useCallback(() => {
    shouldReconnectRef.current = false
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
    setReconnecting(false)
  }, [])

  return { isConnected, reconnecting, close }
}
