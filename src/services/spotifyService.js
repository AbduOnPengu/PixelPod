import {
  getUserPlaylists,
  getPlaylistTracks,
  getSavedTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  getTopTracks,
  getTopArtists,
  getAlbum,
  getArtist,
  getArtistTopTracks,
  search,
  getUserProfile,
  formatTrack,
  formatPlaylist,
  formatAlbum,
  formatArtist
} from '@/utils/spotifyApi'

const PAGE_SIZE = 50

async function fetchAllPages(fetchPage, formatItem) {
  let allItems = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const data = await fetchPage(PAGE_SIZE, offset)
    const formattedItems = (data?.items || []).map((item) => formatItem(item)).filter(Boolean)
    allItems = [...allItems, ...formattedItems]

    offset += PAGE_SIZE
    hasMore = data?.items?.length === PAGE_SIZE && Boolean(data.next)
  }

  return allItems
}

export function fetchAllPlaylists() {
  return fetchAllPages(getUserPlaylists, formatPlaylist)
}

export function fetchAllPlaylistTracks(playlistId) {
  return fetchAllPages((limit, offset) => getPlaylistTracks(playlistId, limit, offset), formatTrack)
}

export function fetchAllLikedSongs() {
  return fetchAllPages(getSavedTracks, formatTrack)
}

export function fetchAllSavedAlbums() {
  return fetchAllPages(getSavedAlbums, formatAlbum)
}

export async function fetchRecentlyPlayedTracks(limit = 20) {
  const data = await getRecentlyPlayed(limit)
  const seen = new Set()
  const tracks = []

  for (const entry of data?.items || []) {
    const track = formatTrack(entry)
    if (track && !seen.has(track.uri)) {
      seen.add(track.uri)
      tracks.push(track)
    }
  }

  return tracks
}

export async function fetchUserTopTracks(timeRange = 'short_term', limit = 16) {
  const data = await getTopTracks(timeRange, limit)
  return (data?.items || []).map((item) => formatTrack(item)).filter(Boolean)
}

export async function fetchUserTopArtists(timeRange = 'medium_term', limit = 12) {
  const data = await getTopArtists(timeRange, limit)
  return (data?.items || []).map((item) => formatArtist(item)).filter(Boolean)
}

export async function fetchAlbumDetails(albumId) {
  const data = await getAlbum(albumId)
  if (!data) return null
  const album = formatAlbum(data)
  const fallbackAlbum = { name: data.name, images: data.images || [] }
  const tracks = (data.tracks?.items || [])
    .map((item) => formatTrack(item, fallbackAlbum))
    .filter(Boolean)

  return { ...album, label: data.label || null, tracks }
}

export async function fetchArtistDetails(artistId) {
  const [artistData, topData] = await Promise.all([
    getArtist(artistId),
    getArtistTopTracks(artistId)
  ])
  if (!artistData) return null
  const artist = formatArtist(artistData)
  const topTracks = (topData?.tracks || []).map((item) => formatTrack(item)).filter(Boolean)
  return { ...artist, topTracks }
}

export async function searchSpotifyCatalog(
  query,
  types = ['track', 'album', 'artist', 'playlist']
) {
  if (!query.trim()) {
    return { tracks: [], albums: [], artists: [], playlists: [] }
  }

  const data = await search(query, types)

  return {
    tracks: (data?.tracks?.items || []).map((item) => formatTrack(item)).filter(Boolean),
    albums: (data?.albums?.items || []).map((item) => formatAlbum(item)).filter(Boolean),
    artists: (data?.artists?.items || []).map((item) => formatArtist(item)).filter(Boolean),
    playlists: (data?.playlists?.items || []).map((item) => formatPlaylist(item)).filter(Boolean)
  }
}

export async function fetchSpotifyUserProfile() {
  const data = await getUserProfile()

  return {
    name: data.display_name,
    email: data.email,
    image: data.images?.[0]?.url || null,
    uri: data.uri,
    ...(data.product ? { product: data.product } : {}),
    ...(data.country ? { country: data.country } : {})
  }
}
