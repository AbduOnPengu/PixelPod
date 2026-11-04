import { desktop } from '@/desktop/bridge'
import { logger } from './logger'

/**
 * Renderer-side token access.
 *
 * The Electron main process owns the OAuth session (PKCE login, encrypted
 * storage, refresh). The renderer only ever holds a short-lived access token,
 * cached here until shortly before it expires.
 */

const EXPIRY_SKEW_MS = 30 * 1000
let cached = null
let inflight = null

const isFresh = (token) => token && Date.now() < token.expiresAt - EXPIRY_SKEW_MS

export function resetTokenCache() {
  cached = null
  inflight = null
}

/** Full token info `{ accessToken, expiresAt, scope }` or null when signed out. */
export async function getTokenInfo({ forceRefresh = false } = {}) {
  if (!desktop) return null
  if (!forceRefresh && isFresh(cached)) return cached
  if (!forceRefresh && inflight) return inflight

  inflight = desktop.auth
    .getAccessToken({ forceRefresh })
    .then((token) => {
      cached = token || null
      return cached
    })
    .catch((error) => {
      logger.error('Unable to obtain Spotify access token:', error)
      cached = null
      throw error
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/** Access token string or null. Never throws — callers treat null as signed out/offline. */
export async function getValidToken(options) {
  try {
    const token = await getTokenInfo(options)
    return token?.accessToken ?? null
  } catch {
    return null
  }
}

export function tokenHasScopes(scope, requiredScopes = []) {
  if (!scope) return false
  const granted = new Set(String(scope).split(/\s+/).filter(Boolean))
  return requiredScopes.every((required) => granted.has(required))
}

export async function getAuthStatus() {
  if (!desktop) return { authenticated: false, hasClientId: false, unavailable: true }
  return desktop.auth.getStatus()
}

export async function initiateLogin() {
  if (!desktop) throw new Error('Open PixelPod as a desktop app to connect Spotify.')
  resetTokenCache()
  return desktop.auth.login()
}

export async function cancelLogin() {
  if (desktop) await desktop.auth.cancelLogin()
}

export async function clearTokens() {
  resetTokenCache()
  if (desktop) await desktop.auth.logout()
}
