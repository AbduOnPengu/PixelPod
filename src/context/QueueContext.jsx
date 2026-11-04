import { createContext, useContext, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useSpotify } from '@/context/SpotifyContext'
import useQueueManager from '@/hooks/useQueueManager'
import { onDesktopEvent } from '@/desktop/bridge'

const QueueContext = createContext(null)

export function QueueProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const {
    currentTrack: playbackTrack,
    isReady: playbackReady,
    isPlaying,
    currentProgress,
    duration,
    shuffleEnabled,
    play,
    pause,
    resume,
    togglePlayPause,
    next,
    previous,
    seek,
    toggleShuffle
  } = usePlayback()
  const { currentPlaylistTracks, likedSongs } = useSpotify()

  const queue = useQueueManager({
    playbackTrack,
    playbackReady,
    play,
    next,
    previous,
    toggleShuffle,
    shuffleEnabled,
    isPlaying,
    currentProgress,
    currentPlaylistTracks,
    likedSongs
  })

  const { currentTrack, handleSkipForward, handleSkipBack, resetQueue } = queue

  // Clear queue when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      resetQueue()
    }
  }, [isAuthenticated, resetQueue])

  // Subscribe to Electron main-process media commands (Tray + Global Shortcuts + App Menu)
  useEffect(
    () =>
      onDesktopEvent('player', 'onCommand', (command) => {
        if (command === 'playPause') togglePlayPause()
        else if (command === 'next') handleSkipForward()
        else if (command === 'previous') handleSkipBack()
      }),
    [togglePlayPause, handleSkipForward, handleSkipBack]
  )

  // Sync OS MediaSession metadata & hardware media-key handlers
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const session = navigator.mediaSession
    if (currentTrack && typeof window.MediaMetadata === 'function') {
      const artwork = []
      if (currentTrack.albumArtSmall) {
        artwork.push({ src: currentTrack.albumArtSmall, sizes: '64x64', type: 'image/jpeg' })
      }
      if (currentTrack.albumArt) {
        artwork.push({ src: currentTrack.albumArt, sizes: '640x640', type: 'image/jpeg' })
      }

      session.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Unknown Track',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || '',
        artwork
      })
    } else {
      session.metadata = null
    }

    session.playbackState = isPlaying ? 'playing' : currentTrack ? 'paused' : 'none'

    try {
      if (duration > 0 && typeof session.setPositionState === 'function') {
        session.setPositionState({
          duration: duration / 1000,
          playbackRate: 1,
          position: Math.min(duration, Math.max(0, currentProgress)) / 1000
        })
      }
    } catch {
      /* ignore transient position range errors */
    }
  }, [currentTrack, isPlaying, duration, currentProgress])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession

    const safeSet = (action, handler) => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        /* unsupported action on platform */
      }
    }

    safeSet('play', () => resume?.())
    safeSet('pause', () => pause?.())
    safeSet('previoustrack', () => handleSkipBack())
    safeSet('nexttrack', () => handleSkipForward())
    safeSet('seekto', (details) => {
      if (typeof details?.seekTime === 'number') {
        seek(details.seekTime * 1000)
      }
    })

    return () => {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
        safeSet(action, null)
      }
    }
  }, [resume, pause, handleSkipBack, handleSkipForward, seek])

  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) {
    throw new Error('useQueue must be used within a QueueProvider')
  }
  return ctx
}

