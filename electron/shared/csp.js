/**
 * Content Security Policy shared by the Vite dev server (meta tag) and the
 * production `app://` protocol handler (response header).
 *
 * Allowed remote origins are restricted to Spotify's SDK, API, dealer WebSockets,
 * and encrypted audio segment CDNs (scdn.co, spotifycdn.com, akamaized.net,
 * cloudfront.net, fastly.net).
 */
export function buildCsp({ dev = false, devOrigin = 'http://127.0.0.1:5174' } = {}) {
  const devWs = devOrigin.replace(/^http/, 'ws')
  const audioCdns = [
    'https://*.scdn.co',
    'https://*.spotifycdn.com',
    'https://*.akamaized.net',
    'https://*.cloudfront.net',
    'https://*.fastly.net'
  ]

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://sdk.scdn.co', ...(dev ? ["'unsafe-inline'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://api.spotify.com',
      'https://*.spotify.com',
      'wss://*.spotify.com',
      ...audioCdns,
      ...(dev ? [devOrigin, devWs] : [])
    ],
    'media-src': ["'self'", 'blob:', 'mediastream:', ...audioCdns],
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
