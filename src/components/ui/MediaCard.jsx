import { Play, Pause } from 'lucide-react'
import Artwork from './Artwork'
import './ui.css'

export default function MediaCard({
  title,
  subtitle,
  artworkUrl,
  kind = 'playlist',
  roundArtwork = false,
  isPlaying = false,
  onOpen,
  onPlay
}) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen?.()
    }
  }

  return (
    <div
      className="pp-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.()}
      onKeyDown={handleKeyDown}
      aria-label={`${title}${subtitle ? ` — ${subtitle}` : ''}`}
    >
      <div className="pp-card__art-wrap">
        <Artwork
          src={artworkUrl}
          alt={title}
          size={null}
          round={roundArtwork}
          kind={kind}
          seed={title}
        />
        {onPlay && (
          <button
            type="button"
            className={`pp-card__play ${isPlaying ? 'pp-card__play--playing' : ''}`}
            aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" style={{ marginLeft: 1 }} />
            )}
          </button>
        )}
      </div>
      <div className="pp-card__body">
        <div className="pp-card__title" title={title}>
          {title}
        </div>
        {subtitle && (
          <div className="pp-card__subtitle" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

