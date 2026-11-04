import { clearTokens, getTokenInfo, getValidToken, tokenHasScopes } from './spotifyAuth'
import { logger } from './logger'

const SPOTIFY_API = 'https://api.spotify.com/v1'

async function fetchWithAuth(endpoint, options = {}) {
  const tokenInfo = await getTokenInfo()

  if (
    tokenInfo?.scope &&
    (endpoint.startsWith('/me/playlists') || endpoint.startsWith('/playlists/')) &&
    !tokenHasScopes(tokenInfo.scope, ['playlist-read-private'])
  ) {
    await clearTokens()
    throw new Error('Spotify playlist permission is missing - reconnect Spotify and try again')
  }

  const token = tokenInfo?.accessToken || (await getValidToken())

  if (!token) {
    throw new Error('Not authenticated - please log in again')
  }

  const send = (bearer) =>
    fetch(`${SPOTIFY_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

  let response = await send(token)

  // Retry once with a forced refresh if the access token expired mid-flight.
  if (response.status === 401) {
    const refreshed = await getValidToken({ forceRefresh: true })
    if (refreshed && refreshed !== token) {
      response = await send(refreshed)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const spotifyMessage = error.error?.message || ''
    const normalizedMessage = spotifyMessage.toLowerCase()
    const authenticateHeader = response.headers.get('www-authenticate') || ''
    const missingScopeMatch = authenticateHeader.match(/scope="([^"]+)"/i)
    const requiredScope = missingScopeMatch?.[1] || ''
    const isPlaylistScopeFailure =
      response.status === 403 &&
      (endpoint.startsWith('/playlists/') || endpoint.startsWith('/me/playlists'))

    logger.error('Spotify API error:', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      error,
      authenticateHeader
    })

    if (response.status === 401) {
      await clearTokens()
      throw new Error('Spotify session expired - connect Spotify again')
    }
    if (response.status === 403) {
      if (requiredScope) {
        await clearTokens()
        throw new Error(`Spotify scope "${requiredScope}" is missing - reconnect Spotify and try again`)
      }

      if (normalizedMessage.includes('scope') || isPlaylistScopeFailure) {
        await clearTokens()
        throw new Error('Spotify permissions changed - connect Spotify again')
      }

      throw new Error(spotifyMessage || 'Access denied - reconnect Spotify and try again')
    }

    throw new Error(spotifyMessage || `API error: ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

// User profile
export async function getUserProfile() {
  return fetchWithAuth('/me')
}

// Get user's playlists
export async function getUserPlaylists(limit = 50, offset = 0) {
  return fetchWithAuth(`/me/playlists?limit=${limit}&offset=${offset}`)
}

// Get playlist details
export async function getPlaylist(playlistId) {
  return fetchWithAuth(`/playlists/${playlistId}`)
}

// Get playlist tracks
export async function getPlaylistTracks(playlistId, limit = 50, offset = 0) {
  return fetchWithAuth(`/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`)
}

// Get user's saved tracks (liked songs)
export async function getSavedTracks(limit = 50, offset = 0) {
  return fetchWithAuth(`/me/tracks?limit=${limit}&offset=${offset}`)
}

// Get user's saved albums
export async function getSavedAlbums(limit = 50, offset = 0) {
  return fetchWithAuth(`/me/albums?limit=${limit}&offset=${offset}`)
}

// Search for tracks, artists, albums, playlists
export async function search(query, types = ['track']) {
  const typeString = types.join(',')
  const searchParams = new URLSearchParams({
    q: query,
    type: typeString
  })
  return fetchWithAuth(`/search?${searchParams.toString()}`)
}

// Get user's top tracks
export async function getTopTracks(timeRange = 'medium_term', limit = 20) {
  return fetchWithAuth(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`)
}

// Get user's top artists
export async function getTopArtists(timeRange = 'medium_term', limit = 12) {
  return fetchWithAuth(`/me/top/artists?time_range=${timeRange}&limit=${limit}`)
}

// Get recently played tracks
export async function getRecentlyPlayed(limit = 20) {
  return fetchWithAuth(`/me/player/recently-played?limit=${limit}`)
}

// Get track details
export async function getTrack(trackId) {
  return fetchWithAuth(`/tracks/${trackId}`)
}

// Get album details (includes tracks)
export async function getAlbum(albumId) {
  return fetchWithAuth(`/albums/${albumId}`)
}

// Get artist details & top tracks
export async function getArtist(artistId) {
  return fetchWithAuth(`/artists/${artistId}`)
}

export async function getArtistTopTracks(artistId) {
  return fetchWithAuth(`/artists/${artistId}/top-tracks`)
}

// Format track data for our app
export function formatTrack(track, fallbackAlbum = null) {
  if (!track) return null

  // Handle regular track, saved track ({ track }), or playlist item ({ item } / { track })
  const actualTrack = track.track ?? track.item ?? track

  if (!actualTrack?.uri || !actualTrack?.name) {
    return null
  }

  const validFallback =
    fallbackAlbum && typeof fallbackAlbum === 'object' && !Array.isArray(fallbackAlbum)
      ? fallbackAlbum
      : null
  const albumObj = actualTrack.album || validFallback

  return {
    id: actualTrack.id || actualTrack.uri,
    uri: actualTrack.uri,
    title: actualTrack.name,
    artist: actualTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
    album: albumObj?.name || 'Unknown Album',
    albumArt: albumObj?.images?.[0]?.url || null,
    albumArtSmall: albumObj?.images?.[2]?.url || albumObj?.images?.[0]?.url || null,
    duration: actualTrack.duration_ms ?? 0,
    previewUrl: actualTrack.preview_url
  }
}

// Format playlist data for our app
export function formatPlaylist(playlist) {
  if (!playlist) return null

  const itemsContainer = playlist.tracks ?? playlist.items
  const trackTotal = Number.isFinite(playlist.trackCount)
    ? playlist.trackCount
    : Number.isFinite(itemsContainer?.total)
      ? itemsContainer.total
      : Array.isArray(itemsContainer?.items)
        ? itemsContainer.items.length
        : undefined

  return {
    id: playlist.id,
    uri: playlist.uri,
    name: playlist.name,
    description: playlist.description,
    trackCount: trackTotal,
    image: playlist.images?.[0]?.url || null,
    owner: playlist.owner?.display_name || 'Unknown'
  }
}

// Format album data for our app
export function formatAlbum(albumEntry) {
  const album = albumEntry?.album ?? albumEntry
  if (!album) return null

  return {
    id: album.id,
    uri: album.uri,
    type: 'album',
    title: album.name,
    artist: album.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
    image: album.images?.[0]?.url || null,
    imageSmall: album.images?.[2]?.url || album.images?.[0]?.url || null,
    releaseDate: album.release_date,
    totalTracks: album.total_tracks
  }
}

// Format artist data for our app
export function formatArtist(artist) {
  if (!artist) return null

  return {
    id: artist.id,
    uri: artist.uri,
    type: 'artist',
    name: artist.name,
    image: artist.images?.[0]?.url || null,
    imageSmall: artist.images?.[2]?.url || artist.images?.[0]?.url || null,
    followers: artist.followers?.total || 0,
    genres: artist.genres || []
  }
}
