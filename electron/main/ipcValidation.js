import { PLAYER_COMMANDS, AUDIO_COMMANDS } from '../shared/channels.js'

const MAX_TEXT = 512

const optionalString = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.length <= MAX_TEXT)

/** Validate the "now playing" snapshot the renderer reports to the main process. */
export function sanitizePlayerState(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { isPlaying, title, artist, album, artworkUrl, mode } = raw
  if (typeof isPlaying !== 'boolean') return null
  if (![title, artist, album, artworkUrl].every(optionalString)) return null
  if (artworkUrl && !/^https:\/\//.test(artworkUrl)) return null
  if (mode !== undefined && !['sdk', 'connect', 'none'].includes(mode)) return null
  return {
    isPlaying,
    title: title || '',
    artist: artist || '',
    album: album || '',
    artworkUrl: artworkUrl || '',
    mode: mode || 'none'
  }
}

export const isPlayerCommand = (value) => PLAYER_COMMANDS.includes(value)
export const isAudioCommand = (value) => AUDIO_COMMANDS.includes(value)

/**
 * Wrap an ipcMain handler so it only runs for the trusted renderer frame.
 * Returns a structured `{ ok, data | error }` envelope so the renderer never
 * receives raw Error objects (which Electron serializes lossily).
 */
export function guardHandler(isTrusted, handler) {
  return async (event, ...args) => {
    const url = event.senderFrame?.url
    if (!url || !isTrusted(url)) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender' } }
    }
    try {
      return { ok: true, data: await handler(...args) }
    } catch (error) {
      return {
        ok: false,
        error: { code: error?.code || 'ERROR', message: error?.message || 'Unexpected error' }
      }
    }
  }
}

