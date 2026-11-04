const SPOTIFY_PLAYER_API = 'https://api.spotify.com/v1/me/player'
const MAX_URI_BATCH = 80

const isPlayableSpotifyUri = (uri) =>
  typeof uri === 'string' &&
  (uri.startsWith('spotify:track:') || uri.startsWith('spotify:episode:'))

async function sendPlaybackRequest(path, { token, method = 'PUT', body } = {}) {
  const response = await fetch(`${SPOTIFY_PLAYER_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  if (!response.ok && response.status !== 204) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `HTTP ${response.status}`)
  }

  return response
}

const deviceQuery = (deviceId) => (deviceId ? `device_id=${encodeURIComponent(deviceId)}` : '')
const withDevice = (basePath, deviceId, hasExistingQuery = false) => {
  if (!deviceId) return basePath
  return `${basePath}${hasExistingQuery ? '&' : '?'}${deviceQuery(deviceId)}`
}

export function transferPlaybackToDevice(deviceId, token, play = false) {
  return sendPlaybackRequest('', {
    token,
    body: {
      device_ids: [deviceId],
      play
    }
  })
}

export function startPlaybackSession({
  token,
  deviceId,
  trackUri,
  trackUris,
  contextUri,
  offset = 0,
  positionMs
}) {
  const rawUris = trackUris?.length ? trackUris : [trackUri]
  const cleanUris = rawUris.filter(isPlayableSpotifyUri)
  const boundedUris = (cleanUris.length > 0 ? cleanUris : rawUris.filter(Boolean)).slice(
    0,
    MAX_URI_BATCH
  )
  const requestBody = contextUri
    ? {
        context_uri: contextUri,
        offset: { position: offset },
        ...(Number.isFinite(positionMs) ? { position_ms: positionMs } : {})
      }
    : {
        uris: boundedUris,
        ...(Number.isFinite(positionMs) ? { position_ms: positionMs } : {})
      }

  return sendPlaybackRequest(withDevice('/play', deviceId), {
    token,
    body: requestBody
  })
}

export function resumePlaybackSession({ token, deviceId }) {
  return sendPlaybackRequest(withDevice('/play', deviceId), { token })
}

export function pausePlaybackSession({ token, deviceId }) {
  return sendPlaybackRequest(withDevice('/pause', deviceId), { token })
}

export function skipToNextTrack({ token, deviceId }) {
  return sendPlaybackRequest(withDevice('/next', deviceId), { token, method: 'POST' })
}

export function skipToPreviousTrack({ token, deviceId }) {
  return sendPlaybackRequest(withDevice('/previous', deviceId), { token, method: 'POST' })
}

export function seekPlaybackPosition({ token, deviceId, positionMs }) {
  const clamped = Math.max(0, Math.round(positionMs))
  return sendPlaybackRequest(withDevice(`/seek?position_ms=${clamped}`, deviceId, true), { token })
}

export function updateShuffleState({ token, deviceId, enabled }) {
  return sendPlaybackRequest(withDevice(`/shuffle?state=${enabled}`, deviceId, true), { token })
}

export function updateRepeatMode({ token, deviceId, mode }) {
  return sendPlaybackRequest(withDevice(`/repeat?state=${mode}`, deviceId, true), { token })
}

export function updatePlaybackVolume({ token, deviceId, volumePercent }) {
  return sendPlaybackRequest(withDevice(`/volume?volume_percent=${volumePercent}`, deviceId, true), {
    token
  })
}

export async function fetchAvailableDevices(token) {
  const response = await sendPlaybackRequest('/devices', { token, method: 'GET' })
  if (response.status === 204) return []
  const data = await response.json().catch(() => ({}))
  return Array.isArray(data.devices) ? data.devices : []
}

export async function fetchRemotePlaybackState(token) {
  const response = await sendPlaybackRequest('', { token, method: 'GET' })
  if (response.status === 204) return null
  return response.json().catch(() => null)
}

export async function fetchRemoteQueue(token) {
  const response = await sendPlaybackRequest('/queue', { token, method: 'GET' })
  if (response.status === 204) return { currentlyPlaying: null, queue: [] }
  const data = await response.json().catch(() => ({}))
  return {
    currentlyPlaying: data.currently_playing || null,
    queue: Array.isArray(data.queue) ? data.queue : []
  }
}

export function addTrackToRemoteQueue({ token, deviceId, trackUri }) {
  return sendPlaybackRequest(
    withDevice(`/queue?uri=${encodeURIComponent(trackUri)}`, deviceId, true),
    { token, method: 'POST' }
  )
}
