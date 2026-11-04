import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getValidToken } from '@/utils/spotifyAuth'
import { formatTrack } from '@/utils/spotifyApi'
import {
  transferPlaybackToDevice,
  startPlaybackSession,
  resumePlaybackSession,
  pausePlaybackSession,
  skipToNextTrack,
  skipToPreviousTrack,
  seekPlaybackPosition,
  updateShuffleState,
  updateRepeatMode,
  updatePlaybackVolume,
  fetchAvailableDevices,
  fetchRemotePlaybackState,
  fetchRemoteQueue,
  addTrackToRemoteQueue
} from '@/services/playbackService'
import { desktop } from '@/desktop/bridge'
import { logger } from '@/utils/logger'
import { REPEAT_MODES } from '@/constants/playback'

const PlaybackContext = createContext(null)

const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js'
const SDK_READY_TIMEOUT_MS = 12000

let sdkLoadPromise = null

function loadSpotifySdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'))
  }
  if (window.Spotify?.Player) {
    return Promise.resolve(window.Spotify)
  }
  if (sdkLoadPromise) {
    return sdkLoadPromise
  }

  sdkLoadPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sdkLoadPromise = null
      reject(new Error('Timed out loading Spotify Web Playback SDK'))
    }, SDK_READY_TIMEOUT_MS)

    const previousReady = window.onSpotifyWebPlaybackSDKReady
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timeout)
      previousReady?.()
      resolve(window.Spotify)
    }

    let script = document.querySelector('script[data-spotify-sdk="true"]')
    if (!script) {
      script = document.createElement('script')
      script.src = SDK_SCRIPT_URL
      script.async = true
      script.dataset.spotifySdk = 'true'
      script.onerror = () => {
        clearTimeout(timeout)
        sdkLoadPromise = null
        reject(new Error('Could not load Spotify Web Playback SDK'))
      }
      document.head.appendChild(script)
    }
  })

  return sdkLoadPromise
}

export function PlaybackProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [deviceId, setDeviceId] = useState(null)
  const [sdkDeviceId, setSdkDeviceId] = useState(null)
  const [playbackMode, setPlaybackMode] = useState('none') // 'sdk' | 'connect' | 'none'
  const [sdkFallbackReason, setSdkFallbackReason] = useState(null)
  const [devices, setDevices] = useState([])
  const [activeDeviceName, setActiveDeviceName] = useState(null)
  const [remoteQueue, setRemoteQueue] = useState([])
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(null)
  const [volume, setVolumeState] = useState(50)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [repeatMode, setRepeatModeState] = useState('off')
  const [currentTrack, setCurrentTrack] = useState(null)

  const playerRef = useRef(null)

  const refreshDevices = useCallback(async () => {
    try {
      const token = await getValidToken()
      if (!token) return []
      const list = await fetchAvailableDevices(token)
      setDevices(list)
      return list
    } catch (err) {
      logger.warn('Unable to fetch Spotify devices:', err)
      return []
    }
  }, [])

  const applyRemoteState = useCallback((state) => {
    if (!state) return
    setIsPlaying(Boolean(state.is_playing))
    setCurrentProgress(state.progress_ms ?? 0)
    setDuration(state.item?.duration_ms ?? 0)
    if (state.item) {
      setCurrentTrack(formatTrack(state.item))
    }
    if (typeof state.shuffle_state === 'boolean') {
      setShuffleEnabled(state.shuffle_state)
    }
    if (state.repeat_state && REPEAT_MODES.includes(state.repeat_state)) {
      setRepeatModeState(state.repeat_state)
    }
    if (typeof state.device?.volume_percent === 'number') {
      setVolumeState(state.device.volume_percent)
    }
    if (state.device?.id) {
      setDeviceId((prev) => prev || state.device.id)
      setActiveDeviceName(state.device.name || 'Spotify Device')
      setIsReady(true)
    }
    setIsLoading(false)
  }, [])

  const activateConnectFallback = useCallback(async (reason) => {
    logger.warn('Switching to Spotify Connect mode:', reason)
    setSdkFallbackReason(reason)
    setPlaybackMode('connect')

    try {
      const token = await getValidToken()
      if (!token) return
      const [remoteState, availableDevices] = await Promise.all([
        fetchRemotePlaybackState(token).catch(() => null),
        fetchAvailableDevices(token).catch(() => [])
      ])

      setDevices(availableDevices)
      if (remoteState) {
        applyRemoteState(remoteState)
        return
      }

      const preferred = availableDevices.find((d) => d.is_active) || availableDevices[0]
      if (preferred) {
        setDeviceId(preferred.id)
        setActiveDeviceName(preferred.name)
        if (typeof preferred.volume_percent === 'number') {
          setVolumeState(preferred.volume_percent)
        }
        setIsReady(true)
        setError(null)
      } else {
        setIsReady(false)
        setError('Open Spotify on your computer or phone to play via Spotify Connect.')
      }
    } catch (err) {
      logger.error('Spotify Connect fallback error:', err)
    }
  }, [applyRemoteState])

  // Initialize Spotify Web Playback SDK (with automatic Spotify Connect fallback)
  useEffect(() => {
    if (!isAuthenticated) {
      playerRef.current?.disconnect?.()
      playerRef.current = null
      setDeviceId(null)
      setSdkDeviceId(null)
      setPlaybackMode('none')
      setSdkFallbackReason(null)
      setDevices([])
      setActiveDeviceName(null)
      setRemoteQueue([])
      setIsReady(false)
      setIsPlaying(false)
      setIsLoading(false)
      setCurrentProgress(0)
      setDuration(0)
      setCurrentTrack(null)
      setError(null)
      return
    }

    let cancelled = false

    const syncSdkState = (state) => {
      if (!state || cancelled) return
      setIsPlaying(!state.paused)
      setCurrentProgress(state.position)
      setDuration(state.duration)
      setCurrentTrack(formatTrack(state.track_window?.current_track))
      setIsLoading(false)

      if (state.shuffle !== undefined) {
        setShuffleEnabled(state.shuffle)
      }
      if (state.repeat_mode !== undefined) {
        setRepeatModeState(REPEAT_MODES[state.repeat_mode] || 'off')
      }
    }

    const init = async () => {
      const token = await getValidToken()
      if (!token || cancelled) return

      let Spotify
      try {
        Spotify = await loadSpotifySdk()
      } catch (err) {
        if (!cancelled) {
          await activateConnectFallback(err.message)
        }
        return
      }

      if (cancelled) return

      try {
        const player = new Spotify.Player({
          name: 'PixelPod',
          getOAuthToken: (cb) => {
            getValidToken().then((fresh) => cb(fresh || token))
          },
          volume: 0.5
        })

        playerRef.current = player

        player.addListener('player_state_changed', syncSdkState)

        player.addListener('ready', ({ device_id }) => {
          if (cancelled) return
          logger.info('Spotify player ready with device ID:', device_id)
          setSdkDeviceId(device_id)
          setDeviceId(device_id)
          setActiveDeviceName('PixelPod (This Computer)')
          setPlaybackMode('sdk')
          setSdkFallbackReason(null)
          setIsReady(true)
          setError(null)

          getValidToken().then((fresh) => {
            if (fresh && !cancelled) {
              transferPlaybackToDevice(device_id, fresh, false).catch((err) => {
                logger.warn('Initial device transfer skipped:', err)
              })
            }
          })
          refreshDevices()
        })

        player.addListener('not_ready', ({ device_id }) => {
          if (cancelled) return
          logger.warn('SDK device went offline:', device_id)
          setIsReady(false)
        })

        player.addListener('initialization_error', (e) => {
          if (cancelled) return
          logger.error('SDK initialization error:', e)
          activateConnectFallback('Built-in audio engine unavailable (Widevine EME). Using Spotify Connect.')
        })

        player.addListener('authentication_error', (e) => {
          if (cancelled) return
          logger.error('SDK authentication error:', e)
          setError(`Authentication error: ${e.message}`)
        })

        player.addListener('account_error', (e) => {
          if (cancelled) return
          logger.error('SDK account error:', e)
          setError('Spotify Premium is required for on-demand playback.')
        })

        player.addListener('playback_error', (e) => {
          if (cancelled) return
          logger.error('SDK playback error:', e)
          setError(`Playback error: ${e.message}`)
          setIsLoading(false)
        })

        const connected = await player.connect()
        if (!connected && !cancelled) {
          await activateConnectFallback('Could not register local player. Using Spotify Connect.')
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('Error creating SDK player:', err)
          await activateConnectFallback(err.message)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      playerRef.current?.disconnect?.()
      playerRef.current = null
    }
  }, [isAuthenticated, activateConnectFallback, refreshDevices])

  // Progress ticker — ONLY runs when playing (fixes idle CPU polling bug)
  useEffect(() => {
    if (!isAuthenticated || !isPlaying) return

    const tick = setInterval(() => {
      if (playbackMode === 'sdk' && playerRef.current) {
        playerRef.current.getCurrentState().then((state) => {
          if (state && !state.paused) {
            setCurrentProgress(state.position)
            setDuration(state.duration)
          }
        })
      } else {
        setCurrentProgress((prev) => (duration > 0 ? Math.min(duration, prev + 1000) : prev + 1000))
      }
    }, 1000)

    return () => clearInterval(tick)
  }, [isAuthenticated, isPlaying, playbackMode, duration])

  // Remote state polling when operating in Spotify Connect mode
  useEffect(() => {
    if (!isAuthenticated || playbackMode !== 'connect') return

    let active = true
    const poll = async () => {
      const token = await getValidToken()
      if (!token || !active) return
      try {
        const state = await fetchRemotePlaybackState(token)
        if (active && state) {
          applyRemoteState(state)
        }
      } catch (err) {
        logger.warn('Connect poll failed:', err)
      }
    }

    poll()
    const interval = setInterval(poll, isPlaying ? 4000 : 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [isAuthenticated, playbackMode, isPlaying, applyRemoteState])

  // Report playback state to the Electron main process (tray, shortcuts, notifications)
  useEffect(() => {
    desktop?.player?.reportState({
      isPlaying,
      title: currentTrack?.title || '',
      artist: currentTrack?.artist || '',
      album: currentTrack?.album || '',
      artworkUrl: currentTrack?.albumArt || '',
      mode: playbackMode
    })
  }, [isPlaying, currentTrack, playbackMode])

  // Select any Spotify Connect device (or switch back to PixelPod's local SDK device)
  const selectDevice = useCallback(async (targetDeviceId, playImmediately = isPlaying) => {
    if (!targetDeviceId) return
    const token = await getValidToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    try {
      await transferPlaybackToDevice(targetDeviceId, token, playImmediately)
      setDeviceId(targetDeviceId)
      const isLocal = Boolean(sdkDeviceId && targetDeviceId === sdkDeviceId)
      setPlaybackMode(isLocal ? 'sdk' : 'connect')
      const matched = devices.find((d) => d.id === targetDeviceId)
      setActiveDeviceName(isLocal ? 'PixelPod (This Computer)' : matched?.name || 'Spotify Device')
      setIsReady(true)
      setError(null)
    } catch (err) {
      logger.error('Device switch error:', err)
      setError(`Could not switch device: ${err.message}`)
    }
  }, [devices, isPlaying, sdkDeviceId])

  const resolveActiveDevice = useCallback(async (token) => {
    if (deviceId) return deviceId
    const list = await fetchAvailableDevices(token).catch(() => [])
    setDevices(list)
    const candidate = list.find((d) => d.is_active) || list[0]
    if (candidate) {
      setDeviceId(candidate.id)
      setActiveDeviceName(candidate.name)
      setPlaybackMode(sdkDeviceId && candidate.id === sdkDeviceId ? 'sdk' : 'connect')
      setIsReady(true)
      return candidate.id
    }
    return null
  }, [deviceId, sdkDeviceId])

  const play = useCallback(async (trackUri, contextUri = null, offset = 0, trackUris = null, positionMs = null) => {
    if (!trackUri && !contextUri && (!trackUris || trackUris.length === 0)) {
      setError('No track or context URI provided')
      return
    }

    setIsLoading(true)

    try {
      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        setIsLoading(false)
        return
      }

      const targetDevice = await resolveActiveDevice(token)
      if (!targetDevice) {
        setError('No playback device available. Open Spotify on any device or wait for PixelPod to connect.')
        setIsLoading(false)
        return
      }

      await startPlaybackSession({
        token,
        deviceId: targetDevice,
        trackUri: contextUri ? undefined : trackUri,
        trackUris: contextUri ? undefined : trackUris,
        contextUri,
        offset,
        positionMs
      })

      setError(null)
      setIsPlaying(true)
      if (playbackMode === 'connect') {
        setIsLoading(false)
      }
    } catch (err) {
      logger.error('Playback error:', err)
      setError(
        err.message.includes('Premium') || err.message.includes('PREMIUM_REQUIRED')
          ? 'Spotify Premium is required to start playback.'
          : `Playback error: ${err.message}`
      )
      setIsLoading(false)
    }
  }, [resolveActiveDevice, playbackMode])

  const pause = useCallback(async () => {
    if (!deviceId) {
      setError('Player not ready')
      return
    }

    try {
      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      await pausePlaybackSession({ token, deviceId })
      setIsPlaying(false)
      setError(null)
    } catch (err) {
      if (playbackMode === 'sdk' && playerRef.current) {
        await playerRef.current.pause()
        setIsPlaying(false)
        return
      }
      setError(`Pause error: ${err.message}`)
    }
  }, [deviceId, playbackMode])

  const resume = useCallback(async () => {
    if (!deviceId) {
      setError('Player not ready')
      return
    }

    try {
      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      await resumePlaybackSession({ token, deviceId })
      setIsPlaying(true)
      setError(null)
    } catch (err) {
      if (playbackMode === 'sdk' && playerRef.current) {
        await playerRef.current.resume()
        setIsPlaying(true)
        return
      }
      setError(`Resume error: ${err.message}`)
    }
  }, [deviceId, playbackMode])

  // Symmetric play/pause toggle (fixes Audit Bug #4)
  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await pause()
    } else {
      await resume()
    }
  }, [isPlaying, pause, resume])

  const next = useCallback(async () => {
    if (playbackMode === 'sdk' && playerRef.current) {
      await playerRef.current.nextTrack()
      return
    }
    try {
      const token = await getValidToken()
      if (!token || !deviceId) return
      await skipToNextTrack({ token, deviceId })
    } catch (err) {
      setError(`Skip error: ${err.message}`)
    }
  }, [playbackMode, deviceId])

  const previous = useCallback(async () => {
    if (playbackMode === 'sdk' && playerRef.current) {
      await playerRef.current.previousTrack()
      return
    }
    try {
      const token = await getValidToken()
      if (!token || !deviceId) return
      await skipToPreviousTrack({ token, deviceId })
    } catch (err) {
      setError(`Previous track error: ${err.message}`)
    }
  }, [playbackMode, deviceId])

  const seek = useCallback(async (position) => {
    const clamped = Math.max(0, Math.round(position))
    setCurrentProgress(clamped)

    if (playbackMode === 'sdk' && playerRef.current) {
      await playerRef.current.seek(clamped)
      return
    }
    try {
      const token = await getValidToken()
      if (!token || !deviceId) return
      await seekPlaybackPosition({ token, deviceId, positionMs: clamped })
    } catch (err) {
      logger.error('Seek error:', err)
    }
  }, [playbackMode, deviceId])

  const toggleShuffle = useCallback(async (options = {}) => {
    const { syncRemote = true, forceState } = options
    const newShuffleState = typeof forceState === 'boolean' ? forceState : !shuffleEnabled

    if (!syncRemote) {
      setShuffleEnabled(newShuffleState)
      setError(null)
      return newShuffleState
    }

    if (!deviceId) {
      setError('No playback device available')
      return shuffleEnabled
    }

    try {
      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return shuffleEnabled
      }

      await updateShuffleState({ token, deviceId, enabled: newShuffleState })
      setShuffleEnabled(newShuffleState)
      setError(null)
      return newShuffleState
    } catch (err) {
      logger.error('Shuffle error:', err)
      if (err.message.includes('No active device')) {
        setError('Start playing a track first')
      } else if (err.message.includes('403') || err.message.includes('Premium')) {
        setError('Premium account required')
      } else {
        setError(`Shuffle error: ${err.message}`)
      }
      return shuffleEnabled
    }
  }, [shuffleEnabled, deviceId])

  const cycleRepeatMode = useCallback(async () => {
    if (!deviceId) {
      setError('No playback device available')
      return
    }

    try {
      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      const currentIndex = REPEAT_MODES.indexOf(repeatMode)
      const nextMode = REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length]

      await updateRepeatMode({ token, deviceId, mode: nextMode })
      setRepeatModeState(nextMode)
      setError(null)
    } catch (err) {
      logger.error('Repeat error:', err)
      if (err.message.includes('No active device')) {
        setError('Start playing a track first')
      } else if (err.message.includes('403') || err.message.includes('Premium')) {
        setError('Premium account required')
      } else {
        setError(`Repeat error: ${err.message}`)
      }
    }
  }, [repeatMode, deviceId])

  const setVolume = useCallback(async (volumePercent) => {
    const clampedVolume = Math.max(0, Math.min(100, Math.round(volumePercent)))
    setVolumeState(clampedVolume)

    try {
      if (playbackMode === 'sdk' && playerRef.current) {
        await playerRef.current.setVolume(clampedVolume / 100)
      }

      const token = await getValidToken()
      if (!token || !deviceId) return

      await updatePlaybackVolume({ token, deviceId, volumePercent: clampedVolume })
    } catch (err) {
      logger.error('Volume error:', err)
    }
  }, [deviceId, playbackMode])

  const adjustVolume = useCallback((delta) => {
    setVolume(volume + delta)
  }, [volume, setVolume])

  const refreshRemoteQueue = useCallback(async () => {
    try {
      const token = await getValidToken()
      if (!token) return []
      const data = await fetchRemoteQueue(token)
      const formatted = data.queue.map((item) => formatTrack(item)).filter(Boolean)
      setRemoteQueue(formatted)
      return formatted
    } catch (err) {
      logger.warn('Queue fetch failed:', err)
      return []
    }
  }, [])

  const addToQueue = useCallback(async (track) => {
    const uri = typeof track === 'string' ? track : track?.uri
    if (!uri) return false
    const token = await getValidToken()
    if (!token) throw new Error('Not authenticated')
    const targetDevice = await resolveActiveDevice(token)
    await addTrackToRemoteQueue({ token, deviceId: targetDevice, trackUri: uri })
    refreshRemoteQueue()
    return true
  }, [resolveActiveDevice, refreshRemoteQueue])

  const value = useMemo(() => ({
    isReady,
    isPlaying,
    isLoading,
    currentProgress,
    duration,
    deviceId,
    sdkDeviceId,
    playbackMode,
    sdkFallbackReason,
    devices,
    activeDeviceName,
    remoteQueue,
    error,
    currentTrack,
    volume,
    shuffleEnabled,
    repeatMode,
    play,
    pause,
    resume,
    togglePlayPause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeatMode,
    setVolume,
    adjustVolume,
    selectDevice,
    refreshDevices,
    refreshRemoteQueue,
    addToQueue,
    setError
  }), [
    isReady,
    isPlaying,
    isLoading,
    currentProgress,
    duration,
    deviceId,
    sdkDeviceId,
    playbackMode,
    sdkFallbackReason,
    devices,
    activeDeviceName,
    remoteQueue,
    error,
    currentTrack,
    volume,
    shuffleEnabled,
    repeatMode,
    play,
    pause,
    resume,
    togglePlayPause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeatMode,
    setVolume,
    adjustVolume,
    selectDevice,
    refreshDevices,
    refreshRemoteQueue,
    addToQueue
  ])

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  )
}

export function usePlayback() {
  const context = useContext(PlaybackContext)
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider')
  }
  return context
}
