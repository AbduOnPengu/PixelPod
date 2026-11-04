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
import { desktop, onDesktopEvent } from '@/desktop/bridge'
import { logger } from '@/utils/logger'
import { REPEAT_MODES } from '@/constants/playback'

const PlaybackContext = createContext(null)

const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js'
const SDK_READY_TIMEOUT_MS = 12000
const REPLAY_WINDOW_MS = 12000

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
  const sdkDeviceIdRef = useRef(null)
  const sdkDisabledRef = useRef(false)
  const lastPlayRequestRef = useRef(null)

  const refreshDevices = useCallback(async () => {
    try {
      const token = await getValidToken()
      if (!token) return []
      const list = await fetchAvailableDevices(token)
      const filtered = sdkDisabledRef.current
        ? list.filter((d) => d.id !== sdkDeviceIdRef.current)
        : list
      setDevices(filtered)
      return filtered
    } catch (err) {
      logger.warn('Unable to fetch Spotify devices:', err)
      return []
    }
  }, [])

  const applyRemoteState = useCallback((state, ignoreDeviceId = null) => {
    if (!state) return
    if (ignoreDeviceId && state.device?.id === ignoreDeviceId) return

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

  const activateConnectFallback = useCallback(
    async (reason, { replayPending = false, deadSdkId = null } = {}) => {
      logger.warn('Switching to Spotify Connect mode:', reason)
      setSdkFallbackReason(reason)
      setPlaybackMode('connect')

      try {
        const token = await getValidToken()
        if (!token) return
        const [remoteState, rawDevices] = await Promise.all([
          fetchRemotePlaybackState(token).catch(() => null),
          fetchAvailableDevices(token).catch(() => [])
        ])

        const ignoredId = deadSdkId || (sdkDisabledRef.current ? sdkDeviceIdRef.current : null)
        const availableDevices = ignoredId
          ? rawDevices.filter((d) => d.id !== ignoredId)
          : rawDevices
        setDevices(availableDevices)

        const preferred = availableDevices.find((d) => d.is_active) || availableDevices[0]
        const pendingPlay = lastPlayRequestRef.current
        const shouldReplay =
          replayPending &&
          preferred &&
          pendingPlay &&
          Date.now() - pendingPlay.at < REPLAY_WINDOW_MS

        if (shouldReplay) {
          lastPlayRequestRef.current = null
          setDeviceId(preferred.id)
          setActiveDeviceName(preferred.name || 'Spotify Device')
          setIsReady(true)
          await startPlaybackSession({
            token,
            deviceId: preferred.id,
            ...pendingPlay.params
          })
          setIsPlaying(true)
          setIsLoading(false)
          setError(null)
          return
        }

        if (remoteState && (!ignoredId || remoteState.device?.id !== ignoredId)) {
          applyRemoteState(remoteState, ignoredId)
          return
        }

        if (preferred) {
          setDeviceId(preferred.id)
          setActiveDeviceName(preferred.name)
          if (typeof preferred.volume_percent === 'number') {
            setVolumeState(preferred.volume_percent)
          }
          setIsReady(true)
          setIsLoading(false)
          setError(null)
        } else {
          setDeviceId(null)
          setActiveDeviceName(null)
          setIsReady(false)
          setIsPlaying(false)
          setIsLoading(false)
          setError('Open Spotify on your computer or phone to play via Spotify Connect.')
        }
      } catch (err) {
        logger.error('Spotify Connect fallback error:', err)
        setIsLoading(false)
      }
    },
    [applyRemoteState]
  )

  // Initialize Spotify Web Playback SDK (via OEM VMP Audio Host on desktop, with Connect fallback)
  useEffect(() => {
    if (!isAuthenticated) {
      desktop?.audio?.stop?.().catch?.(() => {})
      playerRef.current?.disconnect?.()
      playerRef.current = null
      sdkDeviceIdRef.current = null
      sdkDisabledRef.current = false
      lastPlayRequestRef.current = null
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
    let unsubAudio = null
    let ownsInPagePlayer = false
    sdkDisabledRef.current = false

    const teardownLocalSdk = (reason, replayPending = false) => {
      if (cancelled || sdkDisabledRef.current) return
      sdkDisabledRef.current = true
      const deadId = sdkDeviceIdRef.current
      try {
        playerRef.current?.disconnect?.()
      } catch {
        /* ignore disconnect error */
      }
      desktop?.audio?.stop?.().catch?.(() => {})
      playerRef.current = null
      sdkDeviceIdRef.current = null
      setSdkDeviceId(null)
      setDeviceId((prev) => (prev === deadId ? null : prev))
      activateConnectFallback(reason, { replayPending, deadSdkId: deadId })
    }

    const syncSdkState = (state) => {
      if (!state || cancelled || sdkDisabledRef.current) return
      setIsPlaying(!state.paused)
      setCurrentProgress(state.position)
      setDuration(state.duration)
      const formatted = formatTrack(state.track_window?.current_track)
      if (formatted) {
        setCurrentTrack(formatted)
      }
      setIsLoading(false)

      if (state.shuffle !== undefined) {
        setShuffleEnabled(state.shuffle)
      }
      if (state.repeat_mode !== undefined) {
        setRepeatModeState(REPEAT_MODES[state.repeat_mode] || 'off')
      }
    }

    const handleSdkReady = async (device_id) => {
      if (!device_id || cancelled || sdkDisabledRef.current) return
      logger.info('Spotify player ready with device ID:', device_id)
      sdkDeviceIdRef.current = device_id
      setSdkDeviceId(device_id)
      setSdkFallbackReason(null)
      setError(null)

      // Never call transferPlaybackToDevice(..., play=false) here — doing so
      // forcibly pauses active playback or hijacks a track already playing!
      try {
        const fresh = await getValidToken()
        const remote = fresh ? await fetchRemotePlaybackState(fresh).catch(() => null) : null
        if (cancelled || sdkDisabledRef.current) return

        if (remote?.is_playing && remote?.device?.id && remote.device.id !== device_id) {
          setPlaybackMode('connect')
          applyRemoteState(remote)
        } else {
          setDeviceId(device_id)
          setActiveDeviceName('PixelPod (This Computer)')
          setPlaybackMode('sdk')
          setIsReady(true)
        }
      } catch {
        if (!cancelled && !sdkDisabledRef.current) {
          setDeviceId(device_id)
          setActiveDeviceName('PixelPod (This Computer)')
          setPlaybackMode('sdk')
          setIsReady(true)
        }
      }

      refreshDevices()
    }

    const handleSdkError = async (kind, message) => {
      if (cancelled || sdkDisabledRef.current) return

      if (kind === 'initialization_error') {
        logger.error('SDK initialization error:', message)
        teardownLocalSdk(
          'Built-in audio engine unavailable (Widevine EME). Using Spotify Connect.',
          true
        )
        return
      }

      if (kind === 'authentication_error') {
        logger.error('SDK authentication error:', message)
        setError(`Authentication error: ${message}`)
        return
      }

      if (kind === 'account_error') {
        logger.error('SDK account error:', message)
        setError('Spotify Premium is required for on-demand playback.')
        return
      }

      logger.error('SDK playback error:', message)
      setIsPlaying(false)
      setIsLoading(false)

      try {
        await playerRef.current?.pause?.()
      } catch {
        /* ignore */
      }

      try {
        const freshToken = await getValidToken()
        const rawDevices = freshToken
          ? await fetchAvailableDevices(freshToken).catch(() => [])
          : []
        const externalDevices = rawDevices.filter(
          (d) => d.id && d.id !== sdkDeviceIdRef.current
        )
        if (externalDevices.length > 0) {
          teardownLocalSdk(
            `Local audio stream unavailable (${message || 'DRM'}). Switched to Spotify Connect.`,
            true
          )
          return
        }
      } catch {
        /* keep local player ready */
      }

      setError(`Playback error: ${message || 'Could not play this track.'}`)
    }

    const initDesktopAudioHost = async () => {
      if (!desktop?.audio?.start) return false

      const hostProxy = {
        activateElement: () => {},
        pause: () => desktop.audio.command('pause'),
        resume: () => desktop.audio.command('resume'),
        nextTrack: () => desktop.audio.command('nextTrack'),
        previousTrack: () => desktop.audio.command('previousTrack'),
        seek: (pos) => desktop.audio.command('seek', pos),
        setVolume: (vol) => desktop.audio.command('setVolume', vol),
        getCurrentState: () => desktop.audio.command('getState').catch(() => null),
        disconnect: () => {}
      }

      playerRef.current = hostProxy

      unsubAudio = onDesktopEvent('audio', 'onEvent', (ev) => {
        if (cancelled || sdkDisabledRef.current || !ev) return
        if (ev.type === 'ready') {
          handleSdkReady(ev.deviceId)
        } else if (ev.type === 'not_ready') {
          setIsReady(false)
        } else if (ev.type === 'state') {
          syncSdkState(ev.state)
        } else if (ev.type === 'error') {
          handleSdkError(ev.kind, ev.message)
        } else if (ev.type === 'closed') {
          setIsReady(false)
        }
      })

      try {
        const res = await desktop.audio.start()
        if (cancelled) return true
        if (res?.available && res.deviceId) {
          await handleSdkReady(res.deviceId)
          if (res.state) syncSdkState(res.state)
          return true
        }
      } catch (err) {
        logger.warn('Desktop audio host unavailable, falling back:', err)
      }

      unsubAudio?.()
      unsubAudio = null
      playerRef.current = null
      return false
    }

    const init = async () => {
      const token = await getValidToken()
      if (!token || cancelled) return

      // Primary path on Desktop: OEM-VMP-certified native browser audio engine
      const startedHost = await initDesktopAudioHost()
      if (startedHost || cancelled) return

      // Secondary path (web browser dev mode or system without Edge/Chrome/Brave)
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

        ownsInPagePlayer = true
        playerRef.current = player

        player.addListener('player_state_changed', syncSdkState)
        player.addListener('ready', ({ device_id }) => handleSdkReady(device_id))
        player.addListener('not_ready', ({ device_id }) => {
          if (cancelled || sdkDisabledRef.current) return
          logger.warn('SDK device went offline:', device_id)
          setIsReady(false)
        })
        player.addListener('initialization_error', (e) =>
          handleSdkError('initialization_error', e?.message)
        )
        player.addListener('authentication_error', (e) =>
          handleSdkError('authentication_error', e?.message)
        )
        player.addListener('account_error', (e) =>
          handleSdkError('account_error', e?.message)
        )
        player.addListener('playback_error', (e) =>
          handleSdkError('playback_error', e?.message)
        )

        const connected = await player.connect()
        if (!connected && !cancelled) {
          teardownLocalSdk('Could not register local player. Using Spotify Connect.', false)
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
      unsubAudio?.()
      if (ownsInPagePlayer) {
        playerRef.current?.disconnect?.()
      }
      playerRef.current = null
    }
  }, [isAuthenticated, activateConnectFallback, applyRemoteState, refreshDevices])

  // Progress ticker — ONLY runs when playing
  useEffect(() => {
    if (!isAuthenticated || !isPlaying) return

    const tick = setInterval(() => {
      if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
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
        const ignoredId = sdkDisabledRef.current ? sdkDeviceIdRef.current : null
        if (active && state) {
          applyRemoteState(state, ignoredId)
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
    playerRef.current?.activateElement?.()

    const token = await getValidToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    try {
      await transferPlaybackToDevice(targetDeviceId, token, playImmediately)
      setDeviceId(targetDeviceId)
      const isLocal = Boolean(!sdkDisabledRef.current && sdkDeviceId && targetDeviceId === sdkDeviceId)
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

  const resolveActiveDevice = useCallback(
    async (token, forceRefreshList = false) => {
      if (deviceId && !forceRefreshList) return deviceId
      if (!sdkDisabledRef.current && sdkDeviceId && !forceRefreshList) {
        setDeviceId(sdkDeviceId)
        setActiveDeviceName('PixelPod (This Computer)')
        setPlaybackMode('sdk')
        setIsReady(true)
        return sdkDeviceId
      }

      const rawList = await fetchAvailableDevices(token).catch(() => [])
      const list = sdkDisabledRef.current
        ? rawList.filter((d) => d.id !== sdkDeviceIdRef.current)
        : rawList
      setDevices(list)

      const candidate =
        list.find((d) => d.is_active) ||
        (!sdkDisabledRef.current && sdkDeviceId ? list.find((d) => d.id === sdkDeviceId) : null) ||
        list[0]

      if (candidate) {
        const isLocal = Boolean(!sdkDisabledRef.current && sdkDeviceId && candidate.id === sdkDeviceId)
        setDeviceId(candidate.id)
        setActiveDeviceName(isLocal ? 'PixelPod (This Computer)' : candidate.name)
        setPlaybackMode(isLocal ? 'sdk' : 'connect')
        setIsReady(true)
        return candidate.id
      }
      return null
    },
    [deviceId, sdkDeviceId]
  )

  const play = useCallback(
    async (trackUri, contextUri = null, offset = 0, trackUris = null, positionMs = null) => {
      if (!trackUri && !contextUri && (!trackUris || trackUris.length === 0)) {
        setError('No track or context URI provided')
        return
      }

      // Unlock Chromium user-gesture audio playback before any async boundary
      playerRef.current?.activateElement?.()
      setIsLoading(true)

      const sessionParams = {
        trackUri: contextUri ? undefined : trackUri,
        trackUris: contextUri ? undefined : trackUris,
        contextUri,
        offset,
        positionMs
      }
      lastPlayRequestRef.current = { at: Date.now(), params: sessionParams }

      try {
        const token = await getValidToken()
        if (!token) {
          setError('Not authenticated')
          setIsLoading(false)
          return
        }

        let targetDevice = await resolveActiveDevice(token, false)
        if (!targetDevice) {
          setError(
            'No playback device available. Open Spotify on any device or wait a moment for PixelPod to connect.'
          )
          setIsLoading(false)
          return
        }

        try {
          await startPlaybackSession({
            token,
            deviceId: targetDevice,
            ...sessionParams
          })
        } catch (firstErr) {
          // Handle stale device ID or brief SDK registration propagation delay
          const msg = String(firstErr?.message || '')
          if (msg.includes('404') || msg.toLowerCase().includes('device')) {
            const refreshedDevice = await resolveActiveDevice(token, true)
            if (refreshedDevice && refreshedDevice !== targetDevice) {
              targetDevice = refreshedDevice
              await startPlaybackSession({
                token,
                deviceId: targetDevice,
                ...sessionParams
              })
            } else {
              throw firstErr
            }
          } else {
            throw firstErr
          }
        }

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
    },
    [resolveActiveDevice, playbackMode]
  )

  const pause = useCallback(async () => {
    if (!deviceId) {
      setError('Player not ready')
      return
    }

    try {
      if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
        await playerRef.current.pause()
        setIsPlaying(false)
        setError(null)
        return
      }

      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      await pausePlaybackSession({ token, deviceId })
      setIsPlaying(false)
      setError(null)
    } catch (err) {
      setError(`Pause error: ${err.message}`)
    }
  }, [deviceId, playbackMode])

  const resume = useCallback(async () => {
    if (!deviceId) {
      setError('Player not ready')
      return
    }

    playerRef.current?.activateElement?.()

    try {
      if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
        await playerRef.current.resume()
        setIsPlaying(true)
        setError(null)
        return
      }

      const token = await getValidToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      await resumePlaybackSession({ token, deviceId })
      setIsPlaying(true)
      setError(null)
    } catch (err) {
      setError(`Resume error: ${err.message}`)
    }
  }, [deviceId, playbackMode])

  const togglePlayPause = useCallback(
    async (fallbackTrackUri = null) => {
      if (isPlaying) {
        await pause()
        return
      }

      const candidateUri =
        typeof fallbackTrackUri === 'string' ? fallbackTrackUri : currentTrack?.uri || null

      // If no active stream is loaded in the player yet (duration === 0 or no device),
      // start a fresh playback session instead of calling empty /resume.
      if ((!currentTrack || duration === 0 || !deviceId) && lastPlayRequestRef.current?.params) {
        const p = lastPlayRequestRef.current.params
        await play(p.trackUri, p.contextUri, p.offset, p.trackUris, p.positionMs)
        return
      }
      if ((!currentTrack || duration === 0 || !deviceId) && candidateUri) {
        await play(candidateUri)
        return
      }

      await resume()
    },
    [isPlaying, pause, resume, play, currentTrack, duration, deviceId]
  )

  const next = useCallback(async () => {
    if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
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
    if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
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

    if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
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
      if (playbackMode === 'sdk' && playerRef.current && !sdkDisabledRef.current) {
        await playerRef.current.setVolume(clampedVolume / 100)
        return
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
    const targetDevice = await resolveActiveDevice(token, false)
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
