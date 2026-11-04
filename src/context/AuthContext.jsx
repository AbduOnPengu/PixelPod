import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  restoreAuthSession,
  completeLogin,
  cancelSpotifyLogin,
  clearAuthSession
} from '@/services/authService'
import { resetTokenCache } from '@/utils/spotifyAuth'
import { desktop, onDesktopEvent } from '@/desktop/bridge'
import { logger } from '@/utils/logger'

const AuthContext = createContext(null)

const LOGIN_ERROR_MESSAGES = {
  NO_CLIENT_ID: 'Add your Spotify Client ID to connect.',
  ACCESS_DENIED: 'Spotify authorization was cancelled.',
  CANCELLED: null,
  SUPERSEDED: null,
  TIMEOUT: 'Login timed out. Please try again.',
  PORT_IN_USE: null, // main process message already explains the fix
  NETWORK: 'Could not reach Spotify. Check your internet connection.'
}

const describeLoginError = (err) => {
  if (err?.code && Object.hasOwn(LOGIN_ERROR_MESSAGES, err.code)) {
    const message = LOGIN_ERROR_MESSAGES[err.code]
    return message === null && (err.code === 'CANCELLED' || err.code === 'SUPERSEDED') ? null : message || err.message
  }
  return err?.message || 'Failed to connect Spotify'
}

/**
 * Authentication state for the renderer.
 *
 * The OAuth session itself lives in the Electron main process; this provider
 * mirrors its status, triggers login/logout through the preload bridge and
 * loads the Spotify profile.
 */
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(null)
  const authenticatedRef = useRef(false)

  const applySession = useCallback((session) => {
    authenticatedRef.current = session.isAuthenticated
    setIsAuthenticated(session.isAuthenticated)
    setUser(session.user)
    setError(session.error)
    if (session.status) setStatus(session.status)
  }, [])

  // Restore an existing session on mount
  useEffect(() => {
    let cancelled = false
    restoreAuthSession()
      .then((session) => {
        if (!cancelled) applySession(session)
      })
      .catch((err) => {
        logger.error('Auth check failed:', err)
        if (!cancelled) setError(err.message || 'Unable to verify Spotify login')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applySession])

  // Mirror session changes made by the main process (revoked grant, client ID change, …)
  useEffect(
    () =>
      onDesktopEvent('auth', 'onChanged', (next) => {
        setStatus(next)
        if (!next.authenticated && authenticatedRef.current) {
          resetTokenCache()
          authenticatedRef.current = false
          setIsAuthenticated(false)
          setUser(null)
          setError('Your Spotify session ended. Connect again to continue.')
        }
      }),
    []
  )

  const login = useCallback(async () => {
    setIsLoggingIn(true)
    setError(null)
    try {
      applySession(await completeLogin())
    } catch (err) {
      logger.error('Login failed:', err)
      setError(describeLoginError(err))
    } finally {
      setIsLoggingIn(false)
    }
  }, [applySession])

  const cancelLogin = useCallback(async () => {
    try {
      await cancelSpotifyLogin()
    } catch (err) {
      logger.warn('Cancel login failed:', err)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await clearAuthSession()
    } catch (err) {
      logger.error('Logout failed:', err)
    }
    authenticatedRef.current = false
    setIsAuthenticated(false)
    setUser(null)
    setError(null)
  }, [])

  const setClientId = useCallback(async (clientId) => {
    if (!desktop) throw new Error('Desktop bridge unavailable')
    await desktop.prefs.set('clientId', clientId.trim())
    setStatus(await desktop.auth.getStatus())
  }, [])

  const value = useMemo(() => ({
    isAuthenticated,
    isLoading,
    isLoggingIn,
    error,
    user,
    status,
    isDesktop: Boolean(desktop),
    login,
    cancelLogin,
    logout,
    setClientId
  }), [isAuthenticated, isLoading, isLoggingIn, error, user, status, login, cancelLogin, logout, setClientId])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
