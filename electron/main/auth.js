import http from 'node:http'
import crypto from 'node:crypto'

export const SPOTIFY_SCOPES = Object.freeze([
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read'
])

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const EXPIRY_SKEW_MS = 60 * 1000

export const DEFAULT_OAUTH_PORT = 43821

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export const base64url = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function createPkcePair(randomBytes = crypto.randomBytes) {
  const verifier = base64url(randomBytes(64))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthorizeUrl({ clientId, redirectUri, challenge, state, scopes = SPOTIFY_SCOPES }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: scopes.join(' ')
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

const callbackPage = (title, message) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PixelPod — ${title}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#0c0c0e;color:#ececf1;
       font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
  main{text-align:center;max-width:360px;padding:32px}
  .mark{width:44px;height:44px;border-radius:12px;margin:0 auto 18px;background:linear-gradient(135deg,#ff7a45,#ff3d6e)}
  h1{font-size:18px;margin:0 0 6px} p{margin:0;color:#9b9ba6}
</style></head>
<body><main><div class="mark"></div><h1>${title}</h1><p>${message}</p></main></body></html>`

/**
 * Spotify OAuth (Authorization Code + PKCE, public client — no client secret).
 *
 * The redirect target is a short-lived HTTP listener bound to 127.0.0.1 that only
 * exists while a login is in progress. The refresh token never leaves this module.
 */
export function createAuthService({
  getClientId,
  tokenStore,
  openExternal,
  fetchImpl = globalThis.fetch,
  createServer = http.createServer,
  port = DEFAULT_OAUTH_PORT,
  timeoutMs = LOGIN_TIMEOUT_MS,
  now = () => Date.now(),
  onChange = () => {}
}) {
  const redirectUri = `http://127.0.0.1:${port}/callback`
  let pending = null
  let refreshPromise = null

  const requireClientId = () => {
    const clientId = getClientId()
    if (!clientId) {
      throw new AuthError('NO_CLIENT_ID', 'Add your Spotify Client ID in PixelPod before connecting.')
    }
    return clientId
  }

  const requestToken = async (body) => {
    let response
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      })
    } catch {
      throw new AuthError('NETWORK', 'Could not reach Spotify. Check your internet connection.')
    }

    let data = null
    try {
      data = await response.json()
    } catch {
      /* non-JSON error body */
    }

    if (!response.ok) {
      const code = data?.error === 'invalid_grant' ? 'INVALID_GRANT' : 'TOKEN_REQUEST_FAILED'
      throw new AuthError(code, data?.error_description || data?.error || `Spotify returned ${response.status}`)
    }
    return data
  }

  const saveTokenResponse = (data, previous = null) => {
    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous?.refresh_token,
      expires_at: now() + Number(data.expires_in || 3600) * 1000,
      scope: data.scope || previous?.scope || ''
    }
    tokenStore.set(tokens)
    return tokens
  }

  const closePending = () => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.server.close()
    pending = null
  }

  const waitForCallback = (expectedState) =>
    new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url, redirectUri)
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }

        const finish = (status, title, message) => {
          res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(callbackPage(title, message))
        }

        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (state !== expectedState) {
          finish(400, 'Login not recognised', 'This sign-in link is invalid or expired. Return to PixelPod and try again.')
          return
        }
        if (error) {
          finish(200, 'Login cancelled', 'You can close this tab and return to PixelPod.')
          reject(new AuthError(error === 'access_denied' ? 'ACCESS_DENIED' : 'AUTHORIZE_FAILED',
            error === 'access_denied' ? 'Spotify authorization was cancelled.' : `Spotify error: ${error}`))
          return
        }
        if (!code) {
          finish(400, 'Login failed', 'Spotify did not return an authorization code.')
          reject(new AuthError('AUTHORIZE_FAILED', 'Spotify did not return an authorization code.'))
          return
        }

        finish(200, 'Connected to Spotify', 'You can close this tab and return to PixelPod.')
        resolve(code)
      })

      server.on('error', (err) => {
        reject(err.code === 'EADDRINUSE'
          ? new AuthError('PORT_IN_USE', `Port ${port} is in use. Close the other application or set PIXELPOD_OAUTH_PORT.`)
          : new AuthError('LISTENER_FAILED', err.message))
      })

      const timer = setTimeout(() => {
        reject(new AuthError('TIMEOUT', 'Login timed out. Please try again.'))
      }, timeoutMs)

      pending = { server, timer, reject }
      server.listen(port, '127.0.0.1')
    })

  const listening = () =>
    new Promise((resolve, reject) => {
      if (!pending) return reject(new AuthError('LISTENER_FAILED', 'Login listener missing'))
      if (pending.server.listening) return resolve()
      pending.server.once('listening', resolve)
      pending.server.once('error', reject)
    })

  const status = () => {
    const tokens = tokenStore.get()
    return {
      authenticated: Boolean(tokens?.refresh_token),
      hasClientId: Boolean(getClientId()),
      loginInProgress: Boolean(pending),
      persistent: tokenStore.isPersistent(),
      redirectUri
    }
  }

  const emit = () => onChange(status())

  return {
    redirectUri,
    status,

    async login() {
      const clientId = requireClientId()
      if (pending) {
        pending.reject(new AuthError('SUPERSEDED', 'A new login was started.'))
        closePending()
      }

      const { verifier, challenge } = createPkcePair()
      const state = base64url(crypto.randomBytes(16))
      const callback = waitForCallback(state)
      callback.catch(() => {}) // surfaced via the awaits below; avoid an unhandled rejection
      emit()

      try {
        await Promise.race([listening(), callback])
        await openExternal(buildAuthorizeUrl({ clientId, redirectUri, challenge, state }))
        const code = await callback
        const data = await requestToken({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier
        })
        saveTokenResponse(data)
        return status()
      } finally {
        closePending()
        emit()
      }
    },

    cancelLogin() {
      if (!pending) return
      pending.reject(new AuthError('CANCELLED', 'Login cancelled.'))
      closePending()
      emit()
    },

    logout() {
      tokenStore.clear()
      emit()
    },

    /** Returns a valid access token, refreshing it when needed. Null when signed out. */
    async getAccessToken({ forceRefresh = false } = {}) {
      const tokens = tokenStore.get()
      if (!tokens?.refresh_token) return null

      if (!forceRefresh && now() < tokens.expires_at - EXPIRY_SKEW_MS) {
        return { accessToken: tokens.access_token, expiresAt: tokens.expires_at, scope: tokens.scope }
      }

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const data = await requestToken({
              grant_type: 'refresh_token',
              refresh_token: tokens.refresh_token,
              client_id: requireClientId()
            })
            return saveTokenResponse(data, tokens)
          } catch (error) {
            // Only a rejected grant means the session is gone. Network errors keep
            // the tokens so the user is not logged out while offline.
            if (error.code === 'INVALID_GRANT') {
              tokenStore.clear()
              emit()
            }
            throw error
          } finally {
            refreshPromise = null
          }
        })()
      }

      const refreshed = await refreshPromise
      return { accessToken: refreshed.access_token, expiresAt: refreshed.expires_at, scope: refreshed.scope }
    },

    dispose: closePending
  }
}
