import { useState, useEffect } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Speaker,
  Disc3,
  ListMusic
} from 'lucide-react'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { usePreferences } from '@/context/PreferencesContext'
import Artwork from '@/components/ui/Artwork'
import { EmptyState } from '@/components/ui/StatePanel'
import { formatTime, formatDuration } from '@/utils/format'
import './pages.css'

export default function NowPlayingPage({ onOpenDevices, onSwitchClassic, onBrowseHome }) {
  const {
    isReady,
    isPlaying,
    currentProgress,
    duration,
    volume,
    repeatMode,
    playbackMode,
    activeDeviceName,
    remoteQueue,
    error,
    togglePlayPause,
    seek,
    cycleRepeatMode,
    setVolume,
    refreshRemoteQueue
  } = usePlayback()

  const {
    currentTrack,
    currentTrackList,
    currentTrackIndex,
    currentPlaybackSource,
    effectiveShuffleEnabled,
    playCollection,
    playSingleTrack,
    handleSkipForward,
    handleSkipBack,
    handleToggleShuffle
  } = useQueue()

  const { prefs } = usePreferences()

  // Two-layer smooth artwork crossfade
  const [displayArt, setDisplayArt] = useState(currentTrack?.albumArt || null)
  const [outgoingArt, setOutgoingArt] = useState(null)
  const [scrubVal, setScrubVal] = useState(null)

  useEffect(() => {
    const nextArt = currentTrack?.albumArt || null
    if (nextArt !== displayArt) {
      if (displayArt) setOutgoingArt(displayArt)
      setDisplayArt(nextArt)
    }
  }, [currentTrack?.albumArt, displayArt])

  useEffect(() => {
    refreshRemoteQueue()
  }, [currentTrack?.uri, refreshRemoteQueue])

  const shownProgress = scrubVal !== null ? scrubVal : currentProgress
  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (shownProgress / duration) * 100)) : 0

  const localUpcoming =
    currentTrackList.length > 1
      ? currentTrackList.slice(currentTrackIndex + 1, currentTrackIndex + 20)
      : []
  const queueItems = localUpcoming.length > 0 ? localUpcoming : remoteQueue.slice(0, 20)

  if (!currentTrack) {
    return (
      <div className="pp-now-playing pp-now-playing--solo">
        <div style={{ maxWidth: 440, width: '100%' }}>
          <EmptyState
            icon={Disc3}
            title={isReady ? 'Nothing playing right now' : 'Connecting to Spotify…'}
            description={
              error ||
              'Pick a playlist, album, or track from your library to fill this stage with album artwork and live queue controls.'
            }
            actionLabel="Browse Home"
            onAction={onBrowseHome}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="pp-now-playing">
      {prefs.artworkBackdrop && displayArt && (
        <div
          className="pp-np-backdrop"
          style={{ backgroundImage: `url(${displayArt})` }}
          aria-hidden="true"
        />
      )}
      <div className="pp-np-vignette" aria-hidden="true" />

      {/* Centerpiece Stage */}
      <div className="pp-np-stage">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="pp-chip" onClick={onOpenDevices}>
            <Speaker size={12} />
            <span>
              {playbackMode === 'sdk'
                ? 'PixelPod Audio'
                : activeDeviceName || 'Spotify Connect'}
            </span>
          </button>
          <button type="button" className="pp-chip" onClick={onSwitchClassic}>
            <Disc3 size={12} />
            <span>Classic Wheel</span>
          </button>
        </div>

        <div className="pp-np-art-frame">
          {displayArt ? (
            <>
              <img
                src={displayArt}
                alt={`${currentTrack.album || currentTrack.title} cover`}
                className="pp-np-art-layer"
              />
              {outgoingArt && (
                <img
                  src={outgoingArt}
                  alt=""
                  aria-hidden="true"
                  className="pp-np-art-layer pp-np-art-layer--exiting"
                  onTransitionEnd={() => setOutgoingArt(null)}
                />
              )}
            </>
          ) : (
            <Artwork
              src={null}
              alt={currentTrack.title}
              size={null}
              className="pp-np-art-layer"
            />
          )}
        </div>

        <div style={{ maxWidth: '100%' }}>
          <h1 className="pp-np-track-title">{currentTrack.title}</h1>
          <div className="pp-np-track-artist">{currentTrack.artist}</div>
          {currentTrack.album && <div className="pp-np-track-album">{currentTrack.album}</div>}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.14)',
              border: '1px solid rgba(244, 63, 94, 0.32)',
              fontSize: 'var(--text-xs)',
              color: '#fda4af'
            }}
          >
            {error}
          </div>
        )}

        {/* Timeline */}
        <div className="pp-timeline" style={{ maxWidth: 420 }}>
          <span className="pp-timeline__time">{formatTime(shownProgress)}</span>
          <div className="pp-range">
            <div className="pp-range__track" style={{ height: 5 }}>
              <div className="pp-range__fill" style={{ width: `${progressPct}%` }} />
            </div>
            <input
              type="range"
              className="pp-range__input"
              aria-label="Seek track position"
              min={0}
              max={Math.max(1, duration)}
              value={Math.min(duration || 1, shownProgress)}
              onChange={(e) => setScrubVal(Number(e.target.value))}
              onMouseUp={(e) => {
                seek(Number(e.currentTarget.value))
                setScrubVal(null)
              }}
              onKeyUp={(e) => {
                seek(Number(e.currentTarget.value))
                setScrubVal(null)
              }}
            />
          </div>
          <span className="pp-timeline__time pp-timeline__time--end">{formatTime(duration)}</span>
        </div>

        {/* Transport */}
        <div className="pp-np-controls">
          <button
            type="button"
            className={`pp-icon-btn ${effectiveShuffleEnabled ? 'pp-icon-btn--active' : ''}`}
            onClick={handleToggleShuffle}
            aria-label={effectiveShuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
          >
            <Shuffle size={18} />
          </button>

          <button
            type="button"
            className="pp-icon-btn"
            style={{ width: 40, height: 40 }}
            onClick={handleSkipBack}
            aria-label="Previous track"
          >
            <SkipBack size={21} fill="currentColor" />
          </button>

          <button
            type="button"
            className="pp-np-play-btn"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          <button
            type="button"
            className="pp-icon-btn"
            style={{ width: 40, height: 40 }}
            onClick={handleSkipForward}
            aria-label="Next track"
          >
            <SkipForward size={21} fill="currentColor" />
          </button>

          <button
            type="button"
            className={`pp-icon-btn pp-repeat-badge ${
              repeatMode !== 'off' ? 'pp-icon-btn--active' : ''
            }`}
            onClick={cycleRepeatMode}
            aria-label={`Repeat mode: ${repeatMode}`}
          >
            <Repeat size={18} />
            {repeatMode === 'track' && <span className="pp-repeat-badge__one">1</span>}
          </button>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: 200 }}>
          <button
            type="button"
            className="pp-icon-btn"
            onClick={() => setVolume(volume > 0 ? 0 : 50)}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="pp-range">
            <div className="pp-range__track">
              <div className="pp-range__fill" style={{ width: `${volume}%` }} />
            </div>
            <input
              type="range"
              className="pp-range__input"
              aria-label="Now Playing volume"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
          <span className="pp-timeline__time tabular" style={{ textAlign: 'right' }}>
            {volume}%
          </span>
        </div>
      </div>

      {/* Side-by-Side Up Next Queue */}
      <aside className="pp-np-queue-card" aria-label="Up next in queue">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListMusic size={16} color="var(--pp-accent)" />
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 650 }}>Up Next</span>
          </div>
          {currentPlaybackSource?.label && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
              {currentPlaybackSource.label}
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {queueItems.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                color: 'var(--fg-muted)',
                fontSize: 'var(--text-xs)',
                padding: '24px'
              }}
            >
              Start a playlist or liked songs collection to see upcoming tracks here.
            </div>
          ) : (
            queueItems.map((track, idx) => (
              <div
                key={`${track.id || track.uri}-${idx}`}
                className="pp-track-row pp-track-row--compact"
                style={{ height: 48, padding: '0 8px' }}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (localUpcoming.length > 0) {
                    playCollection({
                      tracks: currentTrackList,
                      startIndex: currentTrackIndex + 1 + idx,
                      contextUri: currentPlaybackSource?.contextUri || null,
                      sourceLabel: currentPlaybackSource?.label || null
                    })
                  } else {
                    playSingleTrack(track)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    playSingleTrack(track)
                  }
                }}
              >
                <span className="pp-track-row__index">{idx + 1}</span>
                <div className="pp-track-row__main">
                  <Artwork
                    src={track.albumArtSmall || track.albumArt}
                    alt={track.title}
                    size={34}
                  />
                  <div className="pp-track-row__meta">
                    <div className="pp-track-row__title">{track.title}</div>
                    <div className="pp-track-row__artist">{track.artist}</div>
                  </div>
                </div>
                <span className="pp-track-row__duration">{formatDuration(track.duration)}</span>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  )
}

