import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idCounter = useRef(0)

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const showToast = useCallback(
    ({ title, description = '', tone = 'info', duration = 3600 }) => {
      idCounter.current += 1
      const id = `toast-${idCounter.current}`
      setToasts((prev) => [...prev.slice(-3), { id, title, description, tone }])

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id)
        }, duration)
      }
      return id
    },
    [dismissToast]
  )

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast
    }),
    [toasts, showToast, dismissToast]
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      toasts: [],
      showToast: () => {},
      dismissToast: () => {}
    }
  }
  return ctx
}

