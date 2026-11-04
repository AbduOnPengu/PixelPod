import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { desktop, onDesktopEvent } from '@/desktop/bridge'
import { APPEARANCE_STORAGE_KEY } from '@/constants/appearance'
import { logger } from '@/utils/logger'

const LOCAL_PREFS_KEY = 'pixelpod_desktop_prefs'

export const DEFAULT_PREFS = Object.freeze({
  uiMode: 'modern',
  classicTheme: 'classic',
  classicSkin: 'silver',
  accent: 'ember',
  artworkBackdrop: true,
  reducedMotion: 'system',
  sidebarCollapsed: false,
  libraryView: 'grid',
  clickSounds: true,
  closeToTray: false,
  minimizeToTray: false,
  launchOnStartup: false,
  trackNotifications: false,
  globalMediaShortcuts: true,
  clientId: ''
})

function readLocalFallback() {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCAL_PREFS_KEY) || 'null') || {}
    const legacy = JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'null') || {}
    return {
      ...DEFAULT_PREFS,
      ...(legacy.theme ? { classicTheme: legacy.theme } : {}),
      ...(legacy.skin ? { classicSkin: legacy.skin } : {}),
      ...raw
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

const PreferencesContext = createContext(null)

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(readLocalFallback)

  useEffect(() => {
    if (!desktop) return
    let active = true
    desktop.prefs
      .getAll()
      .then((loaded) => {
        if (active && loaded) {
          setPrefs((prev) => ({ ...prev, ...loaded }))
        }
      })
      .catch((err) => logger.warn('Failed to load desktop preferences:', err))

    const unsubscribe = onDesktopEvent('prefs', 'onChanged', (updated) => {
      if (active && updated) {
        setPrefs((prev) => ({ ...prev, ...updated }))
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // Sync accent & motion tokens onto <html> so all CSS can react without JS re-renders
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.accent = prefs.accent || 'ember'
    document.documentElement.dataset.motion = prefs.reducedMotion || 'system'
  }, [prefs.accent, prefs.reducedMotion])

  const setPref = useCallback(async (key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(next))
        } catch {
          /* ignore storage quota errors */
        }
      }
      return next
    })

    if (desktop) {
      try {
        const persisted = await desktop.prefs.set(key, value)
        if (persisted) setPrefs((prev) => ({ ...prev, ...persisted }))
      } catch (err) {
        logger.error(`Failed to persist preference "${key}":`, err)
        throw err
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      prefs,
      setPref
    }),
    [prefs, setPref]
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    return {
      prefs: DEFAULT_PREFS,
      setPref: async () => {}
    }
  }
  return ctx
}

