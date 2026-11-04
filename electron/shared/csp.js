/**
 * Content Security Policy shared by the Vite dev server (meta tag) and the
 * production `app://` protocol handler (response header).
 *
 * Spotify domains are the only remote origins allowed:
 *  - sdk.scdn.co        Web Playback SDK script + its hidden iframe
 *  - *.scdn.co / *.spotifycdn.com   artwork and audio
 *  - api / *.spotify.com (+ wss)    Web API, playback dealer
 */
export function buildCsp({ dev = false, devOrigin = 'http://127.0.0.1:5174' } = {}) {
  const devWs = devOrigin.replace(/^http/, 'ws')
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://sdk.scdn.co', ...(dev ? ["'unsafe-inline'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.scdn.co', 'https://*.spotifycdn.com'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://api.spotify.com',
      'https://*.spotify.com',
      'wss://*.spotify.com',
      'https://*.scdn.co',
      'https://*.spotifycdn.com',
      ...(dev ? [devOrigin, devWs] : [])
    ],
    'media-src': ["'self'", 'blob:', 'https://*.scdn.co', 'https://*.spotifycdn.com'],
    'frame-src': ['https://sdk.scdn.co'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"]
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

