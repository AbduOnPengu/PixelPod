import fs from 'node:fs'
import path from 'node:path'
import { sanitizePrefs, isValidPref } from '../shared/prefsSchema.js'

/**
 * Small JSON preference store persisted in the userData directory.
 * Writes are atomic (temp file + rename) so a crash never corrupts the file.
 */
export function createPrefsStore({ filePath, fsImpl = fs } = {}) {
  let prefs = sanitizePrefs(readJson(fsImpl, filePath))
  const listeners = new Set()

  const persist = () => writeJsonAtomic(fsImpl, filePath, prefs)

  return {
    getAll: () => ({ ...prefs }),
    get: (key) => prefs[key],
    set(key, value) {
      if (!isValidPref(key, value)) {
        throw new Error(`Invalid preference: ${String(key)}`)
      }
      if (prefs[key] === value) return { ...prefs }
      prefs = { ...prefs, [key]: value }
      persist()
      for (const listener of listeners) listener(key, value, { ...prefs })
      return { ...prefs }
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function readJson(fsImpl, filePath) {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function writeJsonAtomic(fsImpl, filePath, data) {
  try {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    fsImpl.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fsImpl.renameSync(tmp, filePath)
  } catch (error) {
    console.error('[pixelpod] Failed to write', filePath, error)
  }
}

