import { ChevronLeft, ChevronRight, Search, Disc, Radio } from 'lucide-react'
import { desktop } from '@/desktop/bridge'
import { usePlayback } from '@/context/PlaybackContext'
import './shell.css'

export default function TitleBar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onOpenSearch,
  onOpenDevices,
  isClassicRoute,
  onToggleClassic
}) {
  const { isReady, playbackMode, activeDeviceName } = usePlayback()

  const platformClass = !desktop
    ? 'pp-titlebar--web'
    : desktop.platform === 'darwin'
      ? 'pp-titlebar--mac'
      : ''

  return (
    <header className={`pp-titlebar ${platformClass}`.trim()}>
      <div className="pp-titlebar__left">
        <button
          type="button"
          className="pp-titlebar__nav-btn"
          disabled={!canGoBack}
          onClick={onBack}
          aria-label="Navigate back"
          title="Back"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          className="pp-titlebar__nav-btn"
          disabled={!canGoForward}
          onClick={onForward}
          aria-label="Navigate forward"
          title="Forward"
        >
          <ChevronRight size={15} />
        </button>

        <button
          type="button"
          className="pp-titlebar__search-pill"
          onClick={onOpenSearch}
          aria-label="Search tracks, albums, artists, and playlists"
        >
          <Search size={13} />
          <span>Search library &amp; catalog…</span>
          <span className="pp-kbd">Ctrl K</span>
        </button>
      </div>

      <div className="pp-titlebar__right">
        <button
          type="button"
          className="pp-chip"
          onClick={onOpenDevices}
          title="Playback output device"
        >
          <span className={`pp-chip__dot ${isReady ? 'pp-chip__dot--ready' : ''}`} />
          <Radio size={12} />
          <span>
            {playbackMode === 'sdk'
              ? 'PixelPod Audio'
              : playbackMode === 'connect'
                ? activeDeviceName || 'Spotify Connect'
                : 'Connecting…'}
          </span>
        </button>

        <button
          type="button"
          className={`pp-chip ${isClassicRoute ? 'pp-chip--active' : ''}`}
          onClick={onToggleClassic}
          title="Toggle Classic iPod Mode (Ctrl+Shift+C)"
        >
          <Disc size={12} />
          <span>{isClassicRoute ? 'Desktop Mode' : 'Classic iPod'}</span>
        </button>
      </div>
    </header>
  )
}

