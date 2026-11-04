import fs from 'node:fs'
import path from 'node:path'

/**
 * Persists OAuth tokens encrypted with Electron's safeStorage
 * (DPAPI / Keychain / libsecret). If OS encryption is unavailable the tokens are
 * kept in memory only — they are never written to disk in plain text.
 */
export function createTokenStore({ filePath, safeStorage, fsImpl = fs }) {
  let cache = null
  let loaded = false

  const canEncrypt = () => {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable())
    } catch {
      return false
    }
  }

  const load = () => {
    if (loaded) return cache
    loaded = true
    if (!canEncrypt()) return cache
    try {
      const encrypted = fsImpl.readFileSync(filePath)
      const parsed = JSON.parse(safeStorage.decryptString(encrypted))
      cache = isTokenShape(parsed) ? parsed : null
    } catch {
      cache = null
    }
    return cache
  }

  return {
    isPersistent: canEncrypt,
    get: () => load(),
    set(tokens) {
      if (!isTokenShape(tokens)) throw new Error('Invalid token payload')
      cache = { ...tokens }
      loaded = true
      if (!canEncrypt()) return
      try {
        fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
        fsImpl.writeFileSync(filePath, safeStorage.encryptString(JSON.stringify(cache)))
      } catch (error) {
        console.error('[pixelpod] Failed to persist tokens', error)
      }
    },
    clear() {
      cache = null
      loaded = true
      try {
        fsImpl.rmSync(filePath, { force: true })
      } catch {
        /* nothing to remove */
      }
    }
  }
}

export const isTokenShape = (value) =>
  Boolean(value) &&
  typeof value.access_token === 'string' &&
  typeof value.refresh_token === 'string' &&
  typeof value.expires_at === 'number'

