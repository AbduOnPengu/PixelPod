import { useState, useEffect, useRef } from 'react'
import { Play, Pause, ListPlus, MoreHorizontal, Copy } from 'lucide-react'
import Artwork from './Artwork'
import { formatDuration } from '@/utils/format'
import './ui.css'

export default function TrackRow({
  track,
  index,
  isActive = false,
  isPlaying = false,
  compact = false,
  onPlay,
  onAddToQueue,
  onCopyUri
}) {
  const [menuPos, setMenuPos] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuPos) return
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuPos(null)
      }
    }
    const closeOnEsc = (event) => {
      if (event.key === 'Escape') setMenuPos(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEsc)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEsc)
      window.removeEventListener('scroll', close, true)
    }
  }, [menuPos])

  const openMenuAt = (x, y) => {
    const safeX = Math.min(x, window.innerWidth - 216)
    const safeY = Math.min(y, window.innerHeight - 160)
    setMenuPos({ x: Math.max(12, safeX), y: Math.max(12, safeY) })
  }

  return (
    <>
      <div
        className={`pp-track-row ${compact ? 'pp-track-row--compact' : ''} ${
          isActive ? 'pp-track-row--active' : ''
        }`}
        role="row"
        tabIndex={0}
        onClick={() => onPlay?.(track, index)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPlay?.(track, index)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          openMenuAt(event.clientX, event.clientY)
        }}
        aria-label={`${track.title} by ${track.artist}`}
      >
        <div className="pp-track-row__index">
          {isActive && isPlaying ? (
            <span className="pp-eq" aria-label="Playing">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <>
              <span className="pp-track-row__num">{index + 1}</span>
              <span className="pp-track-row__play-glyph" aria-hidden="true">
                {isActive && isPlaying ? (
                  <Pause size={13} fill="currentColor" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
              </span>
            </>
          )}
        </div>

        <div className="pp-track-row__main">
          <Artwork
            src={track.albumArtSmall || track.albumArt}
            alt={track.album || track.title}
            size={38}
            seed={track.id}
          />
          <div className="pp-track-row__meta">
            <div className="pp-track-row__title" title={track.title}>
              {track.title}
            </div>
            <div className="pp-track-row__artist" title={track.artist}>
              {track.artist}
            </div>
          </div>
        </div>

        {!compact && (
          <div className="pp-track-row__album" title={track.album}>
            {track.album}
          </div>
        )}

        <div className="pp-track-row__end">
          <div className="pp-track-row__actions">
            {onAddToQueue && (
              <button
                type="button"
                className="pp-icon-btn"
                title="Add to queue"
                aria-label={`Add ${track.title} to queue`}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddToQueue(track)
                }}
              >
                <ListPlus size={15} />
              </button>
            )}
            <button
              type="button"
              className="pp-icon-btn"
              title="More actions"
              aria-label={`More actions for ${track.title}`}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                openMenuAt(rect.right - 180, rect.bottom + 4)
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
          <span className="pp-track-row__duration">{formatDuration(track.duration)}</span>
        </div>
      </div>

      {menuPos && (
        <div
          ref={menuRef}
          className="pp-context-menu"
          role="menu"
          style={{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }}
        >
          <button
            type="button"
            role="menuitem"
            className="pp-context-menu__item"
            onClick={() => {
              setMenuPos(null)
              onPlay?.(track, index)
            }}
          >
            <Play size={14} />
            <span>Play now</span>
          </button>
          {onAddToQueue && (
            <button
              type="button"
              role="menuitem"
              className="pp-context-menu__item"
              onClick={() => {
                setMenuPos(null)
                onAddToQueue(track)
              }}
            >
              <ListPlus size={14} />
              <span>Add to Spotify queue</span>
            </button>
          )}
          {onCopyUri && track.uri && (
            <button
              type="button"
              role="menuitem"
              className="pp-context-menu__item"
              onClick={() => {
                setMenuPos(null)
                onCopyUri(track)
              }}
            >
              <Copy size={14} />
              <span>Copy track URI</span>
            </button>
          )}
        </div>
      )}
    </>
  )
}

