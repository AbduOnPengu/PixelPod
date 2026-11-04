import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import {
  fetchAllPlaylists,
  fetchAllPlaylistTracks,
  fetchAllLikedSongs,
  fetchAllSavedAlbums,
  fetchRecentlyPlayedTracks,
  fetchUserTopTracks,
  fetchUserTopArtists,
  fetchAlbumDetails,
  fetchArtistDetails,
  searchSpotifyCatalog,
  fetchSpotifyUserProfile
} from '@/services/spotifyService'
import { useAuth } from '@/context/AuthContext'
import { logger } from '@/utils/logger'

const SpotifyContext = createContext(null)

const EMPTY_SEARCH = Object.freeze({
  tracks: [],
  albums: [],
  artists: [],
  playlists: []
})

export function SpotifyProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [playlists, setPlaylists] = useState([])
  const [currentPlaylistTracks, setCurrentPlaylistTracks] = useState([])
  const [likedSongs, setLikedSongs] = useState([])
  const [savedAlbums, setSavedAlbums] = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState([])
  const [topTracks, setTopTracks] = useState([])
  const [topArtists, setTopArtists] = useState([])
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [selectedAlbum, setSelectedAlbum] = useState(null)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [searchResults, setSearchResults] = useState(EMPTY_SEARCH)
  const [userProfile, setUserProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isHomeLoading, setIsHomeLoading] = useState(false)
  const [error, setError] = useState(null)

  const resetLibrary = useCallback(() => {
    setPlaylists([])
    setCurrentPlaylistTracks([])
    setLikedSongs([])
    setSavedAlbums([])
    setRecentlyPlayed([])
    setTopTracks([])
    setTopArtists([])
    setSelectedPlaylist(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSearchResults(EMPTY_SEARCH)
    setUserProfile(null)
    setError(null)
  }, [])

  // Clear cached user library whenever authentication is cleared
  useEffect(() => {
    if (!isAuthenticated) {
      resetLibrary()
    }
  }, [isAuthenticated, resetLibrary])

  const fetchPlaylists = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allPlaylists = await fetchAllPlaylists()
      setPlaylists(allPlaylists)
      return allPlaylists
    } catch (err) {
      logger.error('Error fetching playlists:', err)
      setPlaylists([])
      setError(err.message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchPlaylistTracks = useCallback(async (playlistId) => {
    setIsLoading(true)
    setError(null)
    try {
      const allTracks = await fetchAllPlaylistTracks(playlistId)
      setCurrentPlaylistTracks(allTracks)
      return allTracks
    } catch (err) {
      logger.error('Error fetching playlist tracks:', err)
      const normalizedMessage = err.message.toLowerCase()

      if (
        normalizedMessage.includes('connect spotify again') ||
        normalizedMessage.includes('permissions changed') ||
        normalizedMessage.includes('session expired') ||
        normalizedMessage.includes('not authenticated')
      ) {
        setError(err.message)
      } else if (
        normalizedMessage.includes('private') ||
        normalizedMessage.includes('deleted') ||
        normalizedMessage.includes('not found')
      ) {
        setError('Cannot access this playlist - it may be private or deleted')
      } else {
        setError(err.message)
      }

      setCurrentPlaylistTracks([])
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchLikedSongs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allTracks = await fetchAllLikedSongs()
      setLikedSongs(allTracks)
      return allTracks
    } catch (err) {
      logger.error('Error fetching liked songs:', err)
      setLikedSongs([])
      setError(err.message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchSavedAlbums = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const albums = await fetchAllSavedAlbums()
      setSavedAlbums(albums)
      return albums
    } catch (err) {
      logger.error('Error fetching saved albums:', err)
      setSavedAlbums([])
      setError(err.message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchRecentlyPlayed = useCallback(async () => {
    try {
      const tracks = await fetchRecentlyPlayedTracks(20)
      setRecentlyPlayed(tracks)
      return tracks
    } catch (err) {
      logger.warn('Recently played unavailable:', err)
      return []
    }
  }, [])

  const fetchHomeDiscovery = useCallback(async () => {
    setIsHomeLoading(true)
    try {
      const [recentRes, topTracksRes, topArtistsRes] = await Promise.allSettled([
        fetchRecentlyPlayedTracks(20),
        fetchUserTopTracks('short_term', 16),
        fetchUserTopArtists('medium_term', 12)
      ])
      if (recentRes.status === 'fulfilled') setRecentlyPlayed(recentRes.value)
      if (topTracksRes.status === 'fulfilled') setTopTracks(topTracksRes.value)
      if (topArtistsRes.status === 'fulfilled') setTopArtists(topArtistsRes.value)
    } finally {
      setIsHomeLoading(false)
    }
  }, [])

  const openAlbum = useCallback(async (albumId) => {
    if (!albumId) {
      setSelectedAlbum(null)
      return null
    }
    setIsLoading(true)
    setError(null)
    try {
      const details = await fetchAlbumDetails(albumId)
      setSelectedAlbum(details)
      return details
    } catch (err) {
      logger.error('Error fetching album:', err)
      setError(err.message)
      setSelectedAlbum(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const openArtist = useCallback(async (artistId) => {
    if (!artistId) {
      setSelectedArtist(null)
      return null
    }
    setIsLoading(true)
    setError(null)
    try {
      const details = await fetchArtistDetails(artistId)
      setSelectedArtist(details)
      return details
    } catch (err) {
      logger.error('Error fetching artist:', err)
      setError(err.message)
      setSelectedArtist(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const searchAll = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults(EMPTY_SEARCH)
      return EMPTY_SEARCH
    }

    setIsLoading(true)
    setError(null)
    try {
      const results = await searchSpotifyCatalog(query)
      setSearchResults(results)
      return results
    } catch (err) {
      logger.error('Error searching:', err)
      setSearchResults(EMPTY_SEARCH)
      setError(err.message)
      return EMPTY_SEARCH
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchUserProfile = useCallback(async () => {
    try {
      const profile = await fetchSpotifyUserProfile()
      setUserProfile(profile)
      return profile
    } catch (err) {
      logger.error('Error fetching user profile:', err)
      setError(err.message)
      return null
    }
  }, [])

  const clearSearch = useCallback(() => {
    setSearchResults(EMPTY_SEARCH)
  }, [])

  const selectPlaylist = useCallback(async (playlist) => {
    setSelectedPlaylist(playlist)
    if (playlist) {
      await fetchPlaylistTracks(playlist.id)
    } else {
      setCurrentPlaylistTracks([])
    }
  }, [fetchPlaylistTracks])

  const value = useMemo(() => ({
    playlists,
    currentPlaylistTracks,
    likedSongs,
    savedAlbums,
    recentlyPlayed,
    topTracks,
    topArtists,
    searchResults,
    selectedPlaylist,
    selectedAlbum,
    selectedArtist,
    userProfile,
    isLoading,
    isHomeLoading,
    error,
    fetchPlaylists,
    fetchPlaylistTracks,
    fetchLikedSongs,
    fetchSavedAlbums,
    fetchRecentlyPlayed,
    fetchHomeDiscovery,
    openAlbum,
    openArtist,
    searchAll,
    clearSearch,
    selectPlaylist,
    fetchUserProfile,
    resetLibrary
  }), [
    playlists,
    currentPlaylistTracks,
    likedSongs,
    savedAlbums,
    recentlyPlayed,
    topTracks,
    topArtists,
    searchResults,
    selectedPlaylist,
    selectedAlbum,
    selectedArtist,
    userProfile,
    isLoading,
    isHomeLoading,
    error,
    fetchPlaylists,
    fetchPlaylistTracks,
    fetchLikedSongs,
    fetchSavedAlbums,
    fetchRecentlyPlayed,
    fetchHomeDiscovery,
    openAlbum,
    openArtist,
    searchAll,
    clearSearch,
    selectPlaylist,
    fetchUserProfile,
    resetLibrary
  ])

  return (
    <SpotifyContext.Provider value={value}>
      {children}
    </SpotifyContext.Provider>
  )
}

export function useSpotify() {
  const context = useContext(SpotifyContext)
  if (!context) {
    throw new Error('useSpotify must be used within a SpotifyProvider')
  }
  return context
}
