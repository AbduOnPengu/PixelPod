// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  EVENT_CHANNELS
} from '../shared/channels.js'
import { getDefaultPrefs, isValidPref, sanitizePrefs } from '../shared/prefsSchema.js'
import { buildCsp } from '../shared/csp.js'
import { createPrefsStore } from '../main/prefsStore.js'
import { createTokenStore } from '../main/tokenStore.js'
import { sanitizePlayerState, guardHandler, isPlayerCommand } from '../main/ipcValidation.js'
import { loadWindowState, isVisibleOnSomeDisplay, MIN_SIZE, DEFAULT_BOUNDS } from '../main/windowState.js'
import { resolveDistPath, isAppUrl, isSafeExternalUrl, APP_ORIGIN } from '../main/security.js'
import { createPkcePair, buildAuthorizeUrl, base64url, createAuthService } from '../main/auth.js'

function createInMemoryServerHarness() {
  let activeHandler = null
  const createServer = (handler) => {
    activeHandler = handler
    const srv = new EventEmitter()
    srv.listening = false
    srv.listen = (_port, _host) => {
      srv.listening = true
      process.nextTick(() => srv.emit('listening'))
      return srv
    }
    srv.close = () => {
      srv.listening = false
    }
    return srv
  }

  const dispatchRequest = (urlPath) => {
    let statusCode = 200
    let headers = {}
    let body = ''
    const res = {
      writeHead(code, hdrs = {}) {
        statusCode = code
        headers = hdrs
        return res
      },
      end(chunk = '') {
        body += chunk
      }
    }
    activeHandler({ url: urlPath }, res)
    return { status: statusCode, headers, body }
  }

  return { createServer, dispatchRequest }
}

describe('Electron Preload & Shared IPC Channels', () => {
  it('keeps preload channel literals synchronized with shared channels and freezes window.pixelpod', async () => {
    const preloadPath = path.resolve('electron/preload/index.cjs')
    const preloadSource = fs.readFileSync(preloadPath, 'utf8')

    for (const channel of [
      ...Object.values(INVOKE_CHANNELS),
      ...Object.values(SEND_CHANNELS),
      ...Object.values(EVENT_CHANNELS)
    ]) {
      expect(preloadSource).toContain(`'${channel}'`)
    }

    let exposedName = null
    let exposedApi = null
    const listeners = new Map()
    const invokeCalls = []
    const sendCalls = []

    const mockElectron = {
      contextBridge: {
        exposeInMainWorld: (name, api) => {
          exposedName = name
          exposedApi = api
        }
      },
      ipcRenderer: {
        invoke: async (channel, ...args) => {
          invokeCalls.push({ channel, args })
          if (channel === INVOKE_CHANNELS.AUTH_LOGIN) {
            return { ok: false, error: { code: 'NO_CLIENT_ID', message: 'Missing client ID' } }
          }
          return { ok: true, data: { channel, args } }
        },
        send: (channel, payload) => {
          sendCalls.push({ channel, payload })
        },
        on: (channel, fn) => {
          listeners.set(channel, fn)
        },
        removeListener: (channel, fn) => {
          if (listeners.get(channel) === fn) listeners.delete(channel)
        }
      }
    }

    const sandbox = {
      require: (id) => {
        if (id === 'electron') return mockElectron
        throw new Error(`Unexpected require: ${id}`)
      },
      process: { platform: 'win32' },
      Object,
      Error,
      TypeError,
      Boolean,
      String
    }

    vm.runInNewContext(preloadSource, sandbox, { filename: preloadPath })

    expect(exposedName).toBe('pixelpod')
    expect(Object.isFrozen(exposedApi)).toBe(true)
    expect(exposedApi.isDesktop).toBe(true)

    const tokenRes = await exposedApi.auth.getAccessToken({ forceRefresh: true })
    expect(tokenRes).toEqual({
      channel: INVOKE_CHANNELS.AUTH_TOKEN,
      args: [{ forceRefresh: true }]
    })

    await expect(exposedApi.auth.login()).rejects.toMatchObject({
      code: 'NO_CLIENT_ID',
      message: 'Missing client ID'
    })

    exposedApi.player.reportState({ isPlaying: true, title: 'Song' })
    expect(sendCalls).toEqual([
      { channel: SEND_CHANNELS.PLAYER_STATE, payload: { isPlaying: true, title: 'Song' } }
    ])

    const received = []
    const unsub = exposedApi.player.onCommand((cmd) => received.push(cmd))
    listeners.get(EVENT_CHANNELS.PLAYER_COMMAND)?.({}, 'playPause')
    expect(received).toEqual(['playPause'])
    unsub()
    expect(listeners.has(EVENT_CHANNELS.PLAYER_COMMAND)).toBe(false)
  })
})

describe('IPC Validation & Security Helpers', () => {
  it('blocks untrusted sender frames in guardHandler and wraps handler errors', async () => {
    const isTrusted = (url) => isAppUrl(url, 'http://127.0.0.1:5174')
    const guarded = guardHandler(isTrusted, async (x) => {
      if (x === 'boom') {
        const err = new Error('Exploded')
        err.code = 'BOOM'
        throw err
      }
      return x * 2
    })

    const untrusted = await guarded({ senderFrame: { url: 'https://evil.example/' } }, 21)
    expect(untrusted).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Untrusted sender' }
    })

    const trustedApp = await guarded({ senderFrame: { url: `${APP_ORIGIN}/index.html` } }, 21)
    expect(trustedApp).toEqual({ ok: true, data: 42 })

    const trustedDev = await guarded({ senderFrame: { url: 'http://127.0.0.1:5174/' } }, 5)
    expect(trustedDev).toEqual({ ok: true, data: 10 })

    const errored = await guarded({ senderFrame: { url: `${APP_ORIGIN}/` } }, 'boom')
    expect(errored).toEqual({
      ok: false,
      error: { code: 'BOOM', message: 'Exploded' }
    })
  })

  it('sanitizes player state snapshots and rejects unsafe artwork URLs', () => {
    expect(sanitizePlayerState(null)).toBeNull()
    expect(sanitizePlayerState({ isPlaying: 'yes' })).toBeNull()
    expect(
      sanitizePlayerState({
        isPlaying: true,
        title: 'Track',
        artworkUrl: 'http://insecure.example/art.jpg'
      })
    ).toBeNull()

    expect(
      sanitizePlayerState({
        isPlaying: true,
        title: 'Midnight City',
        artist: 'M83',
        album: 'Hurry Up, We Are Dreaming',
        artworkUrl: 'https://i.scdn.co/image/abc123',
        mode: 'sdk'
      })
    ).toEqual({
      isPlaying: true,
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, We Are Dreaming',
      artworkUrl: 'https://i.scdn.co/image/abc123',
      mode: 'sdk'
    })

    expect(isPlayerCommand('playPause')).toBe(true)
    expect(isPlayerCommand('eval')).toBe(false)
  })

  it('prevents encoded path traversal in resolveDistPath and validates external URLs and CSP', () => {
    const distDir = path.resolve('dist')
    expect(resolveDistPath(distDir, 'app://pixelpod/assets/index.js')).toBe(
      path.join(distDir, 'assets', 'index.js')
    )
    expect(resolveDistPath(distDir, 'app://pixelpod/..%2f..%2fpackage.json')).toBeNull()
    expect(resolveDistPath(distDir, 'app://pixelpod/..%5cpackage.json')).toBeNull()

    expect(isSafeExternalUrl('https://developer.spotify.com/dashboard')).toBe(true)
    expect(isSafeExternalUrl('http://developer.spotify.com/dashboard')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('https://user:pass@example.com')).toBe(false)

    const prodCsp = buildCsp({ dev: false })
    expect(prodCsp).toContain("default-src 'self'")
    expect(prodCsp).toContain('https://sdk.scdn.co')
    expect(prodCsp).not.toContain('unsafe-eval')
  })
})

describe('Preferences, Encrypted Token Store & Window State', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpod-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('validates, persists, and reloads preferences atomically while rejecting invalid values', () => {
    const filePath = path.join(tmpDir, 'preferences.json')
    fs.writeFileSync(
      filePath,
      JSON.stringify({ uiMode: 'classic', accent: 'invalid-color', unknownKey: 123 }),
      'utf8'
    )

    const store = createPrefsStore({ filePath })
    expect(store.get('uiMode')).toBe('classic')
    expect(store.get('accent')).toBe(getDefaultPrefs().accent)
    expect(store.getAll()).not.toHaveProperty('unknownKey')

    const changes = []
    const unsub = store.onChange((key, value) => changes.push([key, value]))

    const validClientId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    store.set('clientId', validClientId)
    expect(changes).toEqual([['clientId', validClientId]])
    expect(() => store.set('clientId', 'not-hex')).toThrow(/Invalid preference/)
    expect(() => store.set('evilKey', true)).toThrow(/Invalid preference/)

    unsub()
    store.set('sidebarCollapsed', true)
    expect(changes).toHaveLength(1)

    const reloaded = createPrefsStore({ filePath })
    expect(reloaded.get('clientId')).toBe(validClientId)
    expect(reloaded.get('sidebarCollapsed')).toBe(true)
    expect(isValidPref('accent', 'mint')).toBe(true)
    expect(sanitizePrefs(null)).toEqual(getDefaultPrefs())
  })

  it('encrypts tokens with safeStorage and never writes plaintext when encryption is unavailable', () => {
    const encPath = path.join(tmpDir, 'tokens.bin')
    const mockSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (str) => Buffer.from(`ENC:${Buffer.from(str, 'utf8').toString('base64')}`),
      decryptString: (buf) => {
        const str = buf.toString('utf8')
        if (!str.startsWith('ENC:')) throw new Error('Corrupt cipher')
        return Buffer.from(str.slice(4), 'base64').toString('utf8')
      }
    }

    const store1 = createTokenStore({ filePath: encPath, safeStorage: mockSafeStorage })
    const sample = {
      access_token: 'secret-access-token',
      refresh_token: 'secret-refresh-token',
      expires_at: Date.now() + 3600_000,
      scope: 'streaming'
    }
    store1.set(sample)

    const rawOnDisk = fs.readFileSync(encPath, 'utf8')
    expect(rawOnDisk).not.toContain('secret-access-token')
    expect(rawOnDisk).not.toContain('secret-refresh-token')

    const store2 = createTokenStore({ filePath: encPath, safeStorage: mockSafeStorage })
    expect(store2.get()).toEqual(sample)
    store2.clear()
    expect(fs.existsSync(encPath)).toBe(false)

    // Fallback: OS encryption unavailable -> memory only, zero disk writes
    const memPath = path.join(tmpDir, 'mem-tokens.bin')
    const unencryptedStore = createTokenStore({
      filePath: memPath,
      safeStorage: { isEncryptionAvailable: () => false }
    })
    expect(unencryptedStore.isPersistent()).toBe(false)
    unencryptedStore.set(sample)
    expect(unencryptedStore.get()).toEqual(sample)
    expect(fs.existsSync(memPath)).toBe(false)
  })

  it('clamps window bounds to minimum dimensions and drops off-screen positions', () => {
    const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
    const filePath = path.join(tmpDir, 'window-state.json')

    expect(loadWindowState({ filePath, displays })).toEqual({
      ...DEFAULT_BOUNDS,
      isMaximized: false
    })

    // Off-screen coordinates from a disconnected monitor should be discarded
    fs.writeFileSync(
      filePath,
      JSON.stringify({ x: 3400, y: 100, width: 500, height: 400, isMaximized: true }),
      'utf8'
    )
    const clamped = loadWindowState({ filePath, displays })
    expect(clamped.width).toBe(MIN_SIZE.width)
    expect(clamped.height).toBe(MIN_SIZE.height)
    expect(clamped.x).toBeUndefined()
    expect(clamped.y).toBeUndefined()
    expect(clamped.isMaximized).toBe(true)

    expect(
      isVisibleOnSomeDisplay({ x: 200, y: 120, width: 1280, height: 820 }, displays)
    ).toBe(true)
  })
})

describe('Main-Process PKCE Auth Broker', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpod-auth-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generates RFC 7636 S256 PKCE pairs and completes loopback OAuth login + refresh', async () => {
    const { verifier, challenge } = createPkcePair()
    const expectedChallenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    expect(challenge).toBe(expectedChallenge)

    const { createServer, dispatchRequest } = createInMemoryServerHarness()
    const port = 43821
    let nowMs = 1_700_000_000_000
    const tokenStore = createTokenStore({
      filePath: path.join(tmpDir, 'tokens.bin'),
      safeStorage: { isEncryptionAvailable: () => false }
    })

    const tokenRequests = []
    const fetchMock = vi.fn(async (_url, options) => {
      const params = new URLSearchParams(options.body)
      tokenRequests.push(Object.fromEntries(params.entries()))

      if (params.get('grant_type') === 'authorization_code') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'initial-access',
            refresh_token: 'initial-refresh',
            expires_in: 3600,
            scope: 'streaming user-read-private'
          })
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'refreshed-access',
          expires_in: 3600
        })
      }
    })

    let openedAuthorizeUrl = null
    const auth = createAuthService({
      getClientId: () => 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      tokenStore,
      port,
      createServer,
      now: () => nowMs,
      fetchImpl: fetchMock,
      openExternal: async (authorizeUrl) => {
        openedAuthorizeUrl = new URL(authorizeUrl)
        const state = openedAuthorizeUrl.searchParams.get('state')

        // 0. Non-callback path returns 404
        expect(dispatchRequest('/favicon.ico').status).toBe(404)

        // 1. CSRF attempt with wrong state must return 400 and NOT resolve login
        const badRes = dispatchRequest('/callback?code=evil&state=wrong')
        expect(badRes.status).toBe(400)
        expect(badRes.body).toContain('Login not recognised')

        // 2. Legitimate loopback redirect with matching state resolves login
        const goodRes = dispatchRequest(
          `/callback?code=spotify-auth-code&state=${encodeURIComponent(state)}`
        )
        expect(goodRes.status).toBe(200)
        expect(goodRes.body).toContain('Connected to Spotify')
      }
    })

    const loginStatus = await auth.login()
    expect(loginStatus.authenticated).toBe(true)
    expect(openedAuthorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(openedAuthorizeUrl.searchParams.get('redirect_uri')).toBe(
      `http://127.0.0.1:${port}/callback`
    )
    expect(tokenRequests[0].grant_type).toBe('authorization_code')
    expect(tokenRequests[0].code).toBe('spotify-auth-code')
    expect(tokenRequests[0]).not.toHaveProperty('client_secret')

    // Fresh token returned without network refresh
    const firstToken = await auth.getAccessToken()
    expect(firstToken.accessToken).toBe('initial-access')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Advance clock near expiry -> triggers automatic refresh while keeping refresh_token
    nowMs += 3580 * 1000
    const secondToken = await auth.getAccessToken()
    expect(secondToken.accessToken).toBe('refreshed-access')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(tokenRequests[1].grant_type).toBe('refresh_token')
    expect(tokenRequests[1].refresh_token).toBe('initial-refresh')

    // Build authorize URL helper sanity check
    const built = buildAuthorizeUrl({
      clientId: 'abc',
      redirectUri: auth.redirectUri,
      challenge: 'xyz',
      state: 'st'
    })
    expect(built).toContain('code_challenge=xyz')

    auth.logout()
    expect(auth.status().authenticated).toBe(false)
    expect(await auth.getAccessToken()).toBeNull()
  })
})
