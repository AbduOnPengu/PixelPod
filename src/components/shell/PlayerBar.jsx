import { useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Speaker,
  Maximize2
} from 'lucide-react'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import Artwork from '@/components/ui/Artwork'
import { formatTime } from '@/utils/format'
import './shell.css'

export default function PlayerBar({
  onOpenNowPlaying,
  onToggleQueue,
  onOpenDevices,
  isQueueOpen
}) {
  const {
    isReady,
    isPlaying,
    isLoading,
    currentProgress,
    duration,
    volume,
    repeatMode,
    togglePlayPause,
    seek,
    cycleRepeatMode,
    setVolume
  } = usePlayback()

  const {
    currentTrack,
    effectiveShuffleEnabled,
    handleSkipForward,
    handleSkipBack,
    handleToggleShuffle
  } = useQueue()

  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(50)
  const [scrubProgress, setScrubProgress] = useState(null)

  const displayedProgress = scrubProgress !== null ? scrubProgress : currentProgress
  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (displayedProgress / duration) * 100)) : 0

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  const handleToggleMute = () => {
    if (volume > 0) {
      setLastNonZeroVolume(volume)
      setVolume(0)
    } else {
      setVolume(lastNonZeroVolume || 50)
    }
  }

  return (
    <footer className="pp-player" aria-label="Now playing controls">
      {/* Left: Track Info */}
      <div className="pp-player__track">
        <button
          type="button"
          className="pp-player__art-btn"
          onClick={onOpenNowPlaying}
          aria-label="Open Now Playing screen"
          title="Open Now Playing"
        >
          <Artwork
            src={currentTrack?.albumArtSmall || currentTrack?.albumArt}
            alt={currentTrack?.title || 'No track playing'}
            size={52}
            seed={currentTrack?.id || 'idle'}
          />
        </button>

        <div className="pp-player__meta">
          {currentTrack ? (
            <>
              <button
                type="button"
                className="pp-player__title"
                onClick={onOpenNowPlaying}
                title={currentTrack.title}
              >
                {currentTrack.title}
              </button>
              <div className="pp-player__artist" title={currentTrack.artist}>
                {currentTrack.artist}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg-secondary)' }}>
                Ready to play
              </div>
              <div className="pp-player__artist">
                {isReady ? 'Choose any track or playlist' : 'Connecting to Spotify…'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Transport + Scrubbable Timeline */}
      <div className="pp-player__center">
        <div className="pp-player__transport">
          <button
            type="button"
            className={`pp-icon-btn ${effectiveShuffleEnabled ? 'pp-icon-btn--active' : ''}`}
            onClick={handleToggleShuffle}
            disabled={!isReady && !currentTrack}
            aria-label={effectiveShuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'}
            title={effectiveShuffleEnabled ? 'Shuffle on (S)' : 'Shuffle off (S)'}
          >
            <Shuffle size={15} />
          </button>

          <button
            type="button"
            className="pp-icon-btn"
            onClick={handleSkipBack}
            disabled={!currentTrack && !isReady}
            aria-label="Previous track"
            title="Previous track"
          >
            <SkipBack size={17} fill="currentColor" />
          </button>

          <button
            type="button"
            className="pp-play-fab"
            onClick={() => togglePlayPause(currentTrack?.uri)}
            disabled={!currentTrack}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play
                size={17}
                fill="currentColor"
                style={{ marginLeft: 2, opacity: isLoading ? 0.55 : 1 }}
              />
            )}
          </button>

          <button
            type="button"
            className="pp-icon-btn"
            onClick={handleSkipForward}
            disabled={!currentTrack && !isReady}
            aria-label="Next track"
            title="Next track"
          >
            <SkipForward size={17} fill="currentColor" />
          </button>

          <button
            type="button"
            className={`pp-icon-btn pp-repeat-badge ${
              repeatMode !== 'off' ? 'pp-icon-btn--active' : ''
            }`}
            onClick={cycleRepeatMode}
            disabled={!isReady}
            aria-label={`Repeat mode: ${repeatMode}`}
            title={`Repeat: ${repeatMode} (R)`}
          >
            <Repeat size={15} />
            {repeatMode === 'track' && <span className="pp-repeat-badge__one">1</span>}
          </button>
        </div>

        <div className="pp-timeline">
          <span className="pp-timeline__time">{formatTime(displayedProgress)}</span>
          <div className="pp-range">
            <div className="pp-range__track">
              <div className="pp-range__fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <input
              type="range"
              className="pp-range__input"
              aria-label="Playback position"
              min={0}
              max={Math.max(1, duration)}
              value={Math.min(duration || 1, displayedProgress)}
              disabled={!currentTrack || duration <= 0}
              onChange={(event) => setScrubProgress(Number(event.target.value))}
              onMouseUp={(event) => {
                seek(Number(event.currentTarget.value))
                setScrubProgress(null)
              }}
              onKeyUp={(event) => {
                seek(Number(event.currentTarget.value))
                setScrubProgress(null)
              }}
            />
          </div>
          <span className="pp-timeline__time pp-timeline__time--end">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Output Devices, Queue, Volume, Expand */}
      <div className="pp-player__right">
        <button
          type="button"
          className="pp-icon-btn"
          onClick={onOpenDevices}
          aria-label="Select playback device"
          title="Playback devices"
        >
          <Speaker size={16} />
        </button>

        <button
          type="button"
          className={`pp-icon-btn ${isQueueOpen ? 'pp-icon-btn--active' : ''}`}
          onClick={onToggleQueue}
          aria-label="Toggle queue"
          title="Queue"
        >
          <ListMusic size={16} />
        </button>

        <div className="pp-volume">
          <button
            type="button"
            className="pp-icon-btn"
            onClick={handleToggleMute}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            title={`Volume ${volume}% (M to mute)`}
          >
            <VolumeIcon size={16} />
          </button>
          <div className="pp-range">
            <div className="pp-range__track">
              <div className="pp-range__fill" style={{ width: `${volume}%` }} />
            </div>
            <input
              type="range"
              className="pp-range__input"
              aria-label="Volume"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </div>
        </div>

        <button
          type="button"
          className="pp-icon-btn"
          onClick={onOpenNowPlaying}
          aria-label="Open full Now Playing view"
          title="Now Playing"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </footer>
  )
}

