import { useState, useEffect } from 'react'
import { Disc3, Music2, User } from 'lucide-react'
import './ui.css'

const GRADIENTS = [
  'linear-gradient(135deg, #2b1f2e 0%, #191926 100%)',
  'linear-gradient(135deg, #1d2b2a 0%, #151b26 100%)',
  'linear-gradient(135deg, #2a241c 0%, #181822 100%)',
  'linear-gradient(135deg, #222036 0%, #141720 100%)'
]

function pickGradient(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

export default function Artwork({
  src,
  alt = '',
  size = 44,
  round = false,
  kind = 'music',
  seed = '',
  className = ''
}) {
  const [loadedSrc, setLoadedSrc] = useState(null)
  const [erroredSrc, setErroredSrc] = useState(null)

  useEffect(() => {
    if (!src) {
      setLoadedSrc(null)
      setErroredSrc(null)
    }
  }, [src])

  const showImage = Boolean(src && erroredSrc !== src)
  const isLoaded = loadedSrc === src

  const FallbackIcon = kind === 'artist' ? User : kind === 'album' ? Disc3 : Music2
  const style = size
    ? { width: `${size}px`, height: `${size}px`, background: pickGradient(seed || alt) }
    : { background: pickGradient(seed || alt) }

  return (
    <div
      className={`pp-artwork ${round ? 'pp-artwork--round' : ''} ${className}`.trim()}
      style={style}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={`pp-artwork__img ${isLoaded ? 'pp-artwork__img--loaded' : ''}`}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setErroredSrc(src)}
        />
      ) : (
        <div className="pp-artwork__fallback" aria-hidden="true">
          <FallbackIcon size={size ? Math.max(16, Math.round(size * 0.42)) : 26} strokeWidth={1.6} />
        </div>
      )}
    </div>
  )
}

