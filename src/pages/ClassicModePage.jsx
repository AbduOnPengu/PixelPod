import { useEffect, useCallback, useMemo } from 'react'
import { Monitor, Volume2, VolumeX } from 'lucide-react'
import IPod from '@/components/IPod'
import { useAuth } from '@/context/AuthContext'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { usePreferences } from '@/context/PreferencesContext'
import useNavigation from '@/hooks/useNavigation'
import { THEMES, SKINS } from '@/constants/appearance'
import '@/App.css'
import './pages.css'

/**
 * Classic iPod Experience — preserves rotary wheel navigation, LCD themes,
 * anodized skins, tactile click sounds, and shares the exact same QueueContext
 * & PlaybackContext as the Modern Desktop interface.
 */
export default function ClassicModePage({ skipBoot = false, onExitClassic }) {
  const { isAuthenticated, isLoading: authLoading, login, logout, error: authError } = useAuth()
  const {
    playlists,
    currentPlaylistTracks,
    likedSongs,
    searchResults,
    selectedPlaylist,
    userProfile,
    isLoading: spotifyLoading,
    error: spotifyError,
    fetchPlaylists,
    fetchLikedSongs,
    selectPlaylist,
    searchAll,
    fetchUserProfile
  } = useSpotify()

  const {
    isReady: playbackReady,
    isPlaying,
    isLoading: playbackLoading,
    currentProgress,
    duration,
    volume,
    shuffleEnabled,
    repeatMode,
    play,
    togglePlayPause,
    seek,
    toggleShuffle,
    cycleRepeatMode,
    setVolume,
    error: playbackError
  } = usePlayback()

  const {
    currentTrack,
    setCurrentSourceTracks,
    queueShuffleEnabled,
    effectiveShuffleEnabled,
    createLikedSongsQueue,
    applyTrackSelection,
    handleSkipForward,
    handleSkipBack,
    handleToggleShuffle,
    resetQueue
  } = useQueue()

  const { prefs, setPref } = usePreferences()
  const theme = prefs.classicTheme || 'classic'
  const skin = prefs.classicSkin || 'silver'
  const soundsEnabled = Boolean(prefs.clickSounds)

  const {
    currentScreen,
    setCurrentScreen,
    selectedIndex,
    setSelectedIndex,
    setMenuHistory,
    transitionDirection,
    searchMode,
    setSearchMode,
    navigateForward,
    handleBack,
    handleNext,
    handlePrevious,
    getMenuItems,
    getSearchResults,
    resetNavigation
  } = useNavigation({
    playlists,
    currentPlaylistTracks,
    likedSongs,
    searchResults,
    spotifyLoading,
    spotifyError,
    authError,
    selectPlaylist
  })

  // Skip the 2s boot animation when switching in from an already-running desktop session
  useEffect(() => {
    if (skipBoot && currentScreen === 'boot' && !authLoading) {
      setCurrentScreen(isAuthenticated ? 'main' : 'login')
    }
  }, [skipBoot, currentScreen, authLoading, isAuthenticated, setCurrentScreen])

  useEffect(() => {
    if (!skipBoot && currentScreen === 'boot') {
      const timer = setTimeout(() => {
        if (authLoading) return
        setCurrentScreen(isAuthenticated ? 'main' : 'login')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [skipBoot, currentScreen, isAuthenticated, authLoading, setCurrentScreen])

  useEffect(() => {
    if (!authLoading && currentScreen === 'boot') return
    if (!authLoading && currentScreen === 'login' && isAuthenticated) {
      setCurrentScreen('main')
      setMenuHistory([])
      setSelectedIndex(0)
    }
  }, [
    isAuthenticated,
    authLoading,
    currentScreen,
    setCurrentScreen,
    setMenuHistory,
    setSelectedIndex
  ])

  useEffect(() => {
    if (isAuthenticated && !userProfile) {
      fetchUserProfile()
    }
  }, [isAuthenticated, userProfile, fetchUserProfile])

  useEffect(() => {
    if (isAuthenticated && currentScreen === 'playlists' && playlists.length === 0) {
      fetchPlaylists()
    }
  }, [isAuthenticated, currentScreen, playlists.length, fetchPlaylists])

  useEffect(() => {
    if (isAuthenticated && currentScreen === 'songs' && likedSongs.length === 0) {
      fetchLikedSongs()
    }
  }, [isAuthenticated, currentScreen, likedSongs.length, fetchLikedSongs])

  const getCurrentClassicTracks = useCallback(() => {
    if (currentScreen === 'playlistTracks') return currentPlaylistTracks
    if (currentScreen === 'songs') return likedSongs
    return []
  }, [currentScreen, currentPlaylistTracks, likedSongs])

  const handleSelect = useCallback(async () => {
    if (currentScreen === 'login') {
      login()
      return
    }

    if (spotifyLoading) return

    if (currentScreen === 'search') {
      const searchTrackResults = getSearchResults()
      if (searchTrackResults.length > 0 && searchMode === 'results') {
        const track = searchTrackResults[selectedIndex]
        if (track) {
          setCurrentSourceTracks(searchTrackResults)
          applyTrackSelection(searchTrackResults, selectedIndex, { kind: 'search' })
          navigateForward('nowPlaying')
          setSearchMode('keyboard')
          if (track.uri) {
            play(track.uri)
          }
        }
      }
      return
    }

    const items = getMenuItems()
    if (items.length === 0) return

    if (currentScreen === 'main') {
      if (selectedIndex === 0) {
        navigateForward('music')
      } else if (selectedIndex === 1) {
        if (currentTrack) {
          navigateForward('nowPlaying')
        }
      } else if (selectedIndex === 2) {
        navigateForward('settings')
      }
    } else if (currentScreen === 'music') {
      if (selectedIndex === 0) {
        navigateForward('playlists')
      } else if (selectedIndex === 1) {
        navigateForward('songs')
      } else if (selectedIndex === 2) {
        navigateForward('search')
      }
    } else if (currentScreen === 'playlists') {
      if (playlists[selectedIndex]) {
        await selectPlaylist(playlists[selectedIndex])
        navigateForward('playlistTracks')
      }
    } else if (currentScreen === 'playlistTracks' || currentScreen === 'songs') {
      const tracks = getCurrentClassicTracks()
      if (tracks[selectedIndex]) {
        const selectedTrack = tracks[selectedIndex]
        navigateForward('nowPlaying')

        if (currentScreen === 'playlistTracks' && selectedPlaylist?.uri) {
          setCurrentSourceTracks(tracks)
          applyTrackSelection(tracks, selectedIndex, {
            kind: 'playlist',
            contextUri: selectedPlaylist.uri,
            label: selectedPlaylist.name
          })
          play(selectedTrack.uri, selectedPlaylist.uri, selectedIndex)
        } else {
          const likedSongsQueue = createLikedSongsQueue(
            tracks,
            selectedTrack.id,
            queueShuffleEnabled
          )
          const queueUris = likedSongsQueue.map((track) => track.uri).filter(Boolean)

          setCurrentSourceTracks(tracks)
          applyTrackSelection(likedSongsQueue, 0, {
            kind: 'queue',
            label: 'Liked Songs'
          })

          if (queueUris.length > 0) {
            if (shuffleEnabled) {
              await toggleShuffle({ syncRemote: true, forceState: false })
            }
            play(queueUris[0], null, 0, queueUris)
          }
        }
      }
    }
  }, [
    currentScreen,
    selectedIndex,
    login,
    spotifyLoading,
    getSearchResults,
    searchMode,
    navigateForward,
    play,
    getMenuItems,
    currentTrack,
    playlists,
    selectPlaylist,
    getCurrentClassicTracks,
    selectedPlaylist,
    createLikedSongsQueue,
    toggleShuffle,
    shuffleEnabled,
    queueShuffleEnabled,
    applyTrackSelection,
    setCurrentSourceTracks,
    setSearchMode
  ])

  const handleSearch = useCallback(
    async (query) => {
      const results = await searchAll(query)
      if (results?.tracks?.length > 0) {
        setSearchMode('results')
        setSelectedIndex(0)
      }
    },
    [searchAll, setSearchMode, setSelectedIndex]
  )

  const handlePlayPause = useCallback(() => {
    if (currentTrack && playbackReady) {
      togglePlayPause()
    }
  }, [currentTrack, playbackReady, togglePlayPause])

  const handleLogout = useCallback(() => {
    logout()
    resetNavigation()
    resetQueue()
  }, [logout, resetNavigation, resetQueue])

  const handleSeek = useCallback(
    (positionMs) => {
      if (playbackReady && duration > 0) {
        seek(positionMs)
      }
    },
    [playbackReady, duration, seek]
  )

  const progress = duration > 0 ? (currentProgress / duration) * 100 : 0
  const menuItems = useMemo(() => getMenuItems(), [getMenuItems])

  return (
    <div className="pp-classic-stage">
      <div className="pp-classic-toolbar" aria-label="Classic iPod customization">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`pp-pill ${skin === s.id ? 'pp-pill--active' : ''}`}
            style={{ height: 26, fontSize: '11px' }}
            onClick={() => setPref('classicSkin', s.id)}
          >
            {s.label}
          </button>
        ))}

        <span style={{ width: 1, height: 14, background: 'var(--border-default)' }} />

        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pp-pill ${theme === t.id ? 'pp-pill--active' : ''}`}
            style={{ height: 26, fontSize: '11px' }}
            onClick={() => setPref('classicTheme', t.id)}
          >
            {t.label} LCD
          </button>
        ))}

        <button
          type="button"
          className="pp-icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => setPref('clickSounds', !soundsEnabled)}
          aria-label={soundsEnabled ? 'Mute click sounds' : 'Enable click sounds'}
          title={soundsEnabled ? 'Click sounds on' : 'Click sounds muted'}
        >
          {soundsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {onExitClassic && (
          <button
            type="button"
            className="pp-pill"
            style={{ height: 26, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={onExitClassic}
          >
            <Monitor size={12} />
            <span>Desktop View</span>
          </button>
        )}
      </div>

      <div className={`app theme-${theme} skin-${skin}`} style={{ height: 'auto' }}>
        <IPod
          currentScreen={currentScreen}
          menuItems={menuItems}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onBack={handleBack}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onPlayPause={handlePlayPause}
          onSkipForward={handleSkipForward}
          onSkipBack={handleSkipBack}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isLoading={playbackLoading}
          progress={progress}
          currentProgress={currentProgress}
          duration={duration}
          volume={volume}
          shuffleEnabled={effectiveShuffleEnabled}
          repeatMode={repeatMode}
          onSeek={handleSeek}
          onToggleShuffle={handleToggleShuffle}
          onCycleRepeatMode={cycleRepeatMode}
          onVolumeChange={setVolume}
          playbackError={playbackError}
          playbackReady={playbackReady}
          searchResults={searchResults}
          spotifyError={spotifyError}
          onSearch={handleSearch}
          searchMode={searchMode}
          userProfile={userProfile}
          onLogout={handleLogout}
          transitionDirection={transitionDirection}
          theme={theme}
          skin={skin}
          onThemeChange={(val) => setPref('classicTheme', val)}
          onSkinChange={(val) => setPref('classicSkin', val)}
          soundsEnabled={soundsEnabled}
        />
      </div>
    </div>
  )
}

