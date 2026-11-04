import {
  getAuthStatus,
  getValidToken,
  initiateLogin,
  cancelLogin,
  clearTokens
} from '@/utils/spotifyAuth'

const SPOTIFY_PROFILE_ENDPOINT = 'https://api.spotify.com/v1/me'

export async function fetchAuthenticatedUserProfile(token) {
  const response = await fetch(SPOTIFY_PROFILE_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Unable to fetch Spotify profile')
  }

  return response.json()
}

/**
 * Restore the session held by the desktop main process.
 * Returns `{ isAuthenticated, user, error, status }`.
 */
export async function restoreAuthSession() {
  const status = await getAuthStatus()

  if (!status.authenticated) {
    return { isAuthenticated: false, user: null, error: null, status }
  }

  const token = await getValidToken()
  if (!token) {
    // Tokens exist but could not be refreshed: offline, or the grant was revoked.
    const latest = await getAuthStatus()
    return {
      isAuthenticated: false,
      user: null,
      error: latest.authenticated
        ? 'Could not reach Spotify. Check your connection and try again.'
        : 'Login expired. Connect Spotify again.',
      status: latest
    }
  }

  const user = await fetchAuthenticatedUserProfile(token)
  return { isAuthenticated: true, user, error: null, status }
}

/** Run the full desktop login (system browser + loopback callback), then load the profile. */
export async function completeLogin() {
  const status = await initiateLogin()
  const token = await getValidToken()

  if (!token) {
    throw new Error('Unable to restore Spotify session')
  }

  const user = await fetchAuthenticatedUserProfile(token)
  return { isAuthenticated: true, user, error: null, status }
}

export function cancelSpotifyLogin() {
  return cancelLogin()
}

export function clearAuthSession() {
  return clearTokens()
}
