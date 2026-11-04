import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { usePreferences } from '@/context/PreferencesContext'
import { onDesktopEvent } from '@/desktop/bridge'
import TitleBar from '@/components/shell/TitleBar'
import Sidebar from '@/components/shell/Sidebar'
import PlayerBar from '@/components/shell/PlayerBar'
import QueueDrawer from '@/components/ui/QueueDrawer'
import ToastViewport from '@/components/ui/ToastViewport'
import LoginPage from '@/pages/LoginPage'
import HomePage from '@/pages/HomePage'
import SearchPage from '@/pages/SearchPage'
import LibraryPage from '@/pages/LibraryPage'
import CollectionPage from '@/pages/CollectionPage'
import NowPlayingPage from '@/pages/NowPlayingPage'
import SettingsPage from '@/pages/SettingsPage'
import ClassicModePage from '@/pages/ClassicModePage'

export default function App() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth()
  const {
    playlists,
    selectedPlaylist,
    userProfile,
    fetchUserProfile,
    fetchPlaylists,
    fetchLikedSongs,
    fetchHomeDiscovery,
    selectPlaylist,
    openAlbum,
    openArtist
  } = useSpotify()
  const {
    volume,
    togglePlayPause,
    cycleRepeatMode,
    setVolume
  } = usePlayback()
  const {
    currentTrack,
    playCollection,
    handleToggleShuffle,
    handleSkipForward,
    handleSkipBack,
    resetQueue
  } = useQueue()
  const { prefs, setPref } = usePreferences()

  const initialRoute = prefs.uiMode === 'classic' ? 'classic' : 'home'
  const [history, setHistory] = useState([initialRoute])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [searchFocusTick, setSearchFocusTick] = useState(0)
  const [drawerState, setDrawerState] = useState({ open: false, tab: 'queue' })
  const mainRef = useRef(null)

  const activeRoute = history[historyIndex] || 'home'

  const navigateTo = useCallback(
    (route) => {
      setHistory((prev) => {
        const current = prev[historyIndex]
        if (current === route) return prev
        const next = [...prev.slice(0, historyIndex + 1), route]
        setHistoryIndex(next.length - 1)
        return next
      })
      mainRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
    },
    [historyIndex]
  )

  const goBack = useCallback(() => {
    setHistoryIndex((idx) => Math.max(0, idx - 1))
  }, [])

  const goForward = useCallback(() => {
    setHistoryIndex((idx) => Math.min(history.length - 1, idx + 1))
  }, [history.length])

  // Initial library hydration once signed in
  useEffect(() => {
    if (!isAuthenticated) return
    fetchUserProfile()
    fetchPlaylists()
    fetchLikedSongs()
    fetchHomeDiscovery()
  }, [
    isAuthenticated,
    fetchUserProfile,
    fetchPlaylists,
    fetchLikedSongs,
    fetchHomeDiscovery
  ])

  // Menu & Tray navigation events from Electron main process
  useEffect(
    () =>
      onDesktopEvent('ui', 'onNavigate', (target) => {
        if (target === 'search') {
          setSearchFocusTick((n) => n + 1)
        }
        navigateTo(target)
      }),
    [navigateTo]
  )

  // Global keyboard shortcuts inside the desktop window
  useEffect(() => {
    if (!isAuthenticated) return

    const onKeyDown = (event) => {
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchFocusTick((n) => n + 1)
        navigateTo('search')
        return
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        navigateTo(activeRoute === 'classic' ? 'home' : 'classic')
        return
      }

      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        goBack()
        return
      }

      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        goForward()
        return
      }

      // Inside Classic Mode, IPod's useKeyboardNavigation handles single-key controls
      if (activeRoute === 'classic') return

      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (event.key === ' ') {
        event.preventDefault()
        if (currentTrack) togglePlayPause()
      } else if (mod && event.key === 'ArrowRight') {
        event.preventDefault()
        handleSkipForward()
      } else if (mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        handleSkipBack()
      } else if (event.key === 's' || event.key === 'S') {
        handleToggleShuffle()
      } else if (event.key === 'r' || event.key === 'R') {
        cycleRepeatMode()
      } else if (event.key === '+' || event.key === '=') {
        setVolume(Math.min(100, volume + 10))
      } else if (event.key === '-' || event.key === '_') {
        setVolume(Math.max(0, volume - 10))
      } else if (event.key === 'm' || event.key === 'M') {
        setVolume(volume > 0 ? 0 : 50)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    isAuthenticated,
    activeRoute,
    currentTrack,
    volume,
    navigateTo,
    goBack,
    goForward,
    togglePlayPause,
    handleSkipForward,
    handleSkipBack,
    handleToggleShuffle,
    cycleRepeatMode,
    setVolume
  ])

  const handleOpenPlaylist = useCallback(
    async (playlist, options = {}) => {
      if (!playlist) return
      navigateTo('playlist')
      const tracks = await selectPlaylist(playlist)
      if (options.autoPlay && tracks?.length > 0) {
        await playCollection({
          tracks,
          startIndex: 0,
          contextUri: playlist.uri,
          sourceLabel: playlist.name
        })
      }
    },
    [navigateTo, selectPlaylist, playCollection]
  )

  const handleOpenAlbum = useCallback(
    async (albumId) => {
      if (!albumId) return
      navigateTo('album')
      await openAlbum(albumId)
    },
    [navigateTo, openAlbum]
  )

  const handleOpenArtist = useCallback(
    async (artistId) => {
      if (!artistId) return
      navigateTo('artist')
      await openArtist(artistId)
    },
    [navigateTo, openArtist]
  )

  const handleLogout = useCallback(async () => {
    await logout()
    resetQueue()
    setHistory(['home'])
    setHistoryIndex(0)
  }, [logout, resetQueue])

  if (authLoading) {
    return (
      <div className="pp-login-shell">
        <div className="pp-login-drag" />
        <div className="pp-login-center">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div className="pp-brand-wheel" style={{ width: 44, height: 44, borderRadius: 12 }}>
              <div className="pp-brand-wheel__ring" style={{ width: 25, height: 25 }}>
                <div className="pp-brand-wheel__dot" style={{ width: 6, height: 6 }} />
              </div>
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-secondary)' }}>
              Starting PixelPod…
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <ToastViewport />
      </>
    )
  }

  return (
    <div className={`pp-shell ${prefs.sidebarCollapsed ? 'pp-shell--collapsed' : ''}`}>
      <TitleBar
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        onBack={goBack}
        onForward={goForward}
        onOpenSearch={() => {
          setSearchFocusTick((n) => n + 1)
          navigateTo('search')
        }}
        onOpenDevices={() => setDrawerState({ open: true, tab: 'devices' })}
        isClassicRoute={activeRoute === 'classic'}
        onToggleClassic={() => navigateTo(activeRoute === 'classic' ? 'home' : 'classic')}
      />

      <Sidebar
        activeRoute={activeRoute}
        selectedPlaylistId={selectedPlaylist?.id}
        collapsed={Boolean(prefs.sidebarCollapsed)}
        playlists={playlists}
        userProfile={userProfile}
        onNavigate={(route) => {
          if (route === 'search') setSearchFocusTick((n) => n + 1)
          navigateTo(route)
        }}
        onOpenPlaylist={handleOpenPlaylist}
        onToggleCollapse={() => setPref('sidebarCollapsed', !prefs.sidebarCollapsed)}
      />

      <main ref={mainRef} className="pp-main">
        {activeRoute === 'home' && (
          <HomePage
            onOpenPlaylist={handleOpenPlaylist}
            onOpenLiked={() => navigateTo('liked')}
            onOpenRecent={() => navigateTo('recent')}
            onOpenArtist={handleOpenArtist}
            onOpenLibrary={() => navigateTo('library')}
            onSwitchClassic={() => navigateTo('classic')}
          />
        )}

        {activeRoute === 'search' && (
          <SearchPage
            focusSignal={searchFocusTick}
            onOpenPlaylist={handleOpenPlaylist}
            onOpenAlbum={handleOpenAlbum}
            onOpenArtist={handleOpenArtist}
          />
        )}

        {activeRoute === 'library' && (
          <LibraryPage
            onOpenPlaylist={handleOpenPlaylist}
            onOpenAlbum={handleOpenAlbum}
            onOpenLiked={() => navigateTo('liked')}
          />
        )}

        {activeRoute === 'liked' && <CollectionPage kind="liked" />}
        {activeRoute === 'recent' && <CollectionPage kind="recent" />}
        {activeRoute === 'playlist' && <CollectionPage kind="playlist" />}
        {activeRoute === 'album' && <CollectionPage kind="album" />}
        {activeRoute === 'artist' && <CollectionPage kind="artist" />}

        {activeRoute === 'nowPlaying' && (
          <NowPlayingPage
            onOpenDevices={() => setDrawerState({ open: true, tab: 'devices' })}
            onSwitchClassic={() => navigateTo('classic')}
            onBrowseHome={() => navigateTo('home')}
          />
        )}

        {activeRoute === 'settings' && (
          <SettingsPage
            onOpenDevices={() => setDrawerState({ open: true, tab: 'devices' })}
            onLogout={handleLogout}
          />
        )}

        {activeRoute === 'classic' && (
          <ClassicModePage
            skipBoot
            onExitClassic={() => navigateTo('home')}
          />
        )}
      </main>

      <PlayerBar
        onOpenNowPlaying={() => navigateTo('nowPlaying')}
        onToggleQueue={() =>
          setDrawerState((prev) =>
            prev.open && prev.tab === 'queue'
              ? { open: false, tab: 'queue' }
              : { open: true, tab: 'queue' }
          )
        }
        onOpenDevices={() =>
          setDrawerState((prev) =>
            prev.open && prev.tab === 'devices'
              ? { open: false, tab: 'devices' }
              : { open: true, tab: 'devices' }
          )
        }
        isQueueOpen={drawerState.open && drawerState.tab === 'queue'}
      />

      <QueueDrawer
        open={drawerState.open}
        initialTab={drawerState.tab}
        onClose={() => setDrawerState((prev) => ({ ...prev, open: false }))}
      />

      <ToastViewport />
    </div>
  )
}
