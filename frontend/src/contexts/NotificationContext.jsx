import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getUnreadCount } from '../api'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }
    try {
      const res = await getUnreadCount()
      setUnreadCount(res.data.count)
    } catch (err) {
      console.error('获取未读通知数失败:', err)
    }
  }, [isAuthenticated])

  const decrementUnreadCount = useCallback((amount = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - amount))
  }, [])

  const resetUnreadCount = useCallback(() => {
    setUnreadCount(0)
  }, [])

  useEffect(() => {
    refreshUnreadCount()
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }
    const interval = setInterval(refreshUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, refreshUnreadCount])

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        refreshUnreadCount,
        decrementUnreadCount,
        resetUnreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
