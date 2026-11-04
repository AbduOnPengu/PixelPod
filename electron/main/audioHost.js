import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { AUDIO_COMMANDS } from '../shared/channels.js'

const STARTUP_TIMEOUT_MS = 15000
const COMMAND_TIMEOUT_MS = 6000
const MAX_EVENT_BODY_BYTES = 64 * 1024

const DESKTOP_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    : process.platform === 'linux'
      ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

/**
 * Locate an installed OEM-certified Chromium browser (Edge, Chrome, or Brave)
 * whose production Widevine VMP / PlayReady CDM is accepted by Spotify's
 * `/v1/widevine-license/v1/audio/license` endpoint.
 */
export function findAudioBrowserBinary({
  platform = process.platform,
  env = process.env,
  existsSync = fs.existsSync
} = {}) {
  const override = (env.PIXELPOD_AUDIO_BROWSER || '').trim()
  if (override && existsSync(override)) {
    return { name: path.basename(override), executablePath: override }
  }

  const candidates = []

  if (platform === 'win32') {
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const pf = env.ProgramFiles || 'C:\\Program Files'
    const local = env.LOCALAPPDATA || ''

    candidates.push(
      { name: 'Microsoft Edge', executablePath: path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { name: 'Microsoft Edge', executablePath: path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      ...(local
        ? [{ name: 'Microsoft Edge', executablePath: path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe') }]
        : []),
      { name: 'Google Chrome', executablePath: path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'Google Chrome', executablePath: path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      ...(local
        ? [{ name: 'Google Chrome', executablePath: path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') }]
        : []),
      { name: 'Brave', executablePath: path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') },
      ...(local
        ? [{ name: 'Brave', executablePath: path.join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') }]
        : [])
    )
  } else if (platform === 'darwin') {
    candidates.push(
      { name: 'Google Chrome', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { name: 'Microsoft Edge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { name: 'Brave', executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' }
    )
  } else {
    candidates.push(
      { name: 'Google Chrome', executablePath: '/usr/bin/google-chrome' },
      { name: 'Google Chrome', executablePath: '/usr/bin/google-chrome-stable' },
      { name: 'Microsoft Edge', executablePath: '/usr/bin/microsoft-edge' },
      { name: 'Microsoft Edge', executablePath: '/usr/bin/microsoft-edge-stable' },
      { name: 'Brave', executablePath: '/usr/bin/brave-browser' }
    )
  }

  for (const candidate of candidates) {
    if (candidate.executablePath && existsSync(candidate.executablePath)) {
      return candidate
    }
  }
  return null
}

function buildWorkerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PixelPod Audio Engine</title>
</head>
<body>
<script>
(() => {
  const secret = window.location.hash ? window.location.hash.slice(1) : '';
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', '/player');
  }
  if (!secret) {
    window.close();
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-PixelPod-Key': secret
  };

  let player = null;
  let shuttingDown = false;
  let missedPings = 0;

  const postEvent = (payload) => {
    if (shuttingDown) return Promise.resolve();
    return fetch('/api/event', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }).catch(() => {});
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { player?.disconnect?.(); } catch {}
    try { window.close(); } catch {}
  };

  // Parent-process heartbeat watchdog: self-terminates if PixelPod exits abruptly
  setInterval(async () => {
    if (shuttingDown) return;
    try {
      const res = await fetch('/api/ping', { headers: { 'X-PixelPod-Key': secret } });
      if (res.ok) missedPings = 0;
      else missedPings += 1;
    } catch {
      missedPings += 1;
    }
    if (missedPings >= 2) shutdown();
  }, 2500);

  const serializeTrack = (t) => {
    if (!t) return null;
    return {
      id: t.id || null,
      uri: t.uri || null,
      name: t.name || '',
      duration_ms: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
      artists: Array.isArray(t.artists) ? t.artists.map((a) => ({ name: a?.name || '' })) : [],
      album: t.album
        ? {
            name: t.album.name || '',
            uri: t.album.uri || null,
            images: Array.isArray(t.album.images)
              ? t.album.images.map((img) => ({ url: img?.url || '' }))
              : []
          }
        : null,
      linked_from: t.linked_from ? { id: t.linked_from.id || null, uri: t.linked_from.uri || null } : null
    };
  };

  const serializeState = (s) => {
    if (!s) return null;
    return {
      paused: Boolean(s.paused),
      position: typeof s.position === 'number' ? s.position : 0,
      duration: typeof s.duration === 'number' ? s.duration : 0,
      shuffle: Boolean(s.shuffle),
      repeat_mode: typeof s.repeat_mode === 'number' ? s.repeat_mode : 0,
      track_window: {
        current_track: serializeTrack(s.track_window?.current_track)
      }
    };
  };

  const fetchAccessToken = async (forceRefresh = false) => {
    const res = await fetch('/api/token' + (forceRefresh ? '?refresh=1' : ''), {
      headers: { 'X-PixelPod-Key': secret }
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data?.accessToken || '';
  };

  const handleCommand = async (msg) => {
    const { id, action, value } = msg || {};
    if (action === 'shutdown') {
      shutdown();
      return;
    }
    if (!player) {
      await postEvent({ type: 'reply', id, ok: false, error: 'Audio player not initialized' });
      return;
    }
    try {
      let result = null;
      if (action === 'pause') await player.pause();
      else if (action === 'resume') await player.resume();
      else if (action === 'nextTrack') await player.nextTrack();
      else if (action === 'previousTrack') await player.previousTrack();
      else if (action === 'seek') await player.seek(Math.max(0, Math.round(Number(value) || 0)));
      else if (action === 'setVolume') {
        const vol = Math.max(0, Math.min(1, Number(value)));
        await player.setVolume(Number.isFinite(vol) ? vol : 0.5);
      } else if (action === 'getState') {
        const st = await player.getCurrentState();
        result = serializeState(st);
      }
      await postEvent({ type: 'reply', id, ok: true, result });
    } catch (err) {
      await postEvent({ type: 'reply', id, ok: false, error: err?.message || String(err) });
    }
  };

  const connectStream = () => {
    const es = new EventSource('/api/stream?k=' + encodeURIComponent(secret));
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        handleCommand(parsed);
      } catch {}
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) shutdown();
    };
  };

  connectStream();

  window.onSpotifyWebPlaybackSDKReady = async () => {
    try {
      player = new window.Spotify.Player({
        name: 'PixelPod',
        getOAuthToken: (cb) => {
          fetchAccessToken(false).then((tok) => cb(tok)).catch(() => cb(''));
        },
        volume: 0.5
      });

      player.addListener('ready', ({ device_id }) => {
        postEvent({ type: 'ready', deviceId: device_id });
      });

      player.addListener('not_ready', ({ device_id }) => {
        postEvent({ type: 'not_ready', deviceId: device_id });
      });

      player.addListener('player_state_changed', (state) => {
        postEvent({ type: 'state', state: serializeState(state) });
      });

      for (const kind of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
        player.addListener(kind, (err) => {
          if (kind === 'authentication_error') {
            fetchAccessToken(true).catch(() => {});
          }
          postEvent({ type: 'error', kind, message: err?.message || kind });
        });
      }

      const ok = await player.connect();
      if (!ok) {
        postEvent({ type: 'error', kind: 'initialization_error', message: 'Could not connect Spotify Web Playback SDK' });
      }
    } catch (err) {
      postEvent({ type: 'error', kind: 'initialization_error', message: err?.message || 'SDK init failed' });
    }
  };

  const script = document.createElement('script');
  script.src = 'https://sdk.scdn.co/spotify-player.js';
  script.async = true;
  script.onerror = () => {
    postEvent({ type: 'error', kind: 'initialization_error', message: 'Failed to load Spotify SDK script' });
  };
  document.head.appendChild(script);
})();
</script>
</body>
</html>`
}

function safeEqualHex(expectedHex, provided) {
  if (typeof provided !== 'string' || provided.length !== expectedHex.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHex, 'utf8'), Buffer.from(provided, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Manages the invisible OEM-certified browser worker hosting Spotify's official
 * Web Playback SDK so encrypted full-track audio streams without VMP rejections.
 */
export function createAudioHost({
  userDataDir,
  getAccessToken,
  onEvent = () => {},
  findBrowser = findAudioBrowserBinary,
  createServer = http.createServer,
  spawnImpl = spawn
}) {
  let server = null
  let child = null
  let secret = null
  let sseClient = null
  let deviceId = null
  let lastState = null
  let startPromise = null
  let readyResolve = null
  let commandSeq = 0
  let stopping = false
  const pendingCommands = new Map()

  const rejectAllPending = (reason) => {
    for (const [, entry] of pendingCommands) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    pendingCommands.clear()
  }

  const cleanup = () => {
    stopping = true
    rejectAllPending('Audio engine stopped')

    if (sseClient) {
      try {
        sseClient.write(`data: ${JSON.stringify({ action: 'shutdown' })}\n\n`)
        sseClient.end()
      } catch {
        /* ignore */
      }
      sseClient = null
    }

    if (server) {
      try {
        server.close()
      } catch {
        /* ignore */
      }
      server = null
    }

    if (child) {
      const proc = child
      child = null
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    }

    secret = null
    deviceId = null
    lastState = null
    if (readyResolve) {
      const resolve = readyResolve
      readyResolve = null
      resolve(null)
    }
    stopping = false
  }

  const sendSse = (payload) => {
    if (!sseClient) return false
    try {
      sseClient.write(`data: ${JSON.stringify(payload)}\n\n`)
      return true
    } catch {
      return false
    }
  }

  const handleWorkerEvent = (payload) => {
    if (!payload || typeof payload !== 'object') return

    if (payload.type === 'reply') {
      const entry = pendingCommands.get(payload.id)
      if (!entry) return
      pendingCommands.delete(payload.id)
      clearTimeout(entry.timer)
      if (payload.ok) entry.resolve(payload.result ?? null)
      else entry.reject(new Error(payload.error || 'Audio command failed'))
      return
    }

    if (payload.type === 'ready' && typeof payload.deviceId === 'string') {
      deviceId = payload.deviceId
      if (readyResolve) {
        const resolve = readyResolve
        readyResolve = null
        resolve(deviceId)
      }
      onEvent({ type: 'ready', deviceId })
      return
    }

    if (payload.type === 'not_ready') {
      onEvent({ type: 'not_ready', deviceId: payload.deviceId || deviceId })
      return
    }

    if (payload.type === 'state') {
      lastState = payload.state || null
      onEvent({ type: 'state', state: lastState })
      return
    }

    if (payload.type === 'error') {
      if (readyResolve && payload.kind === 'initialization_error') {
        const resolve = readyResolve
        readyResolve = null
        resolve(null)
      }
      onEvent({
        type: 'error',
        kind: String(payload.kind || 'playback_error'),
        message: String(payload.message || 'Audio playback error')
      })
    }
  }

  return {
    browserInfo() {
      return findBrowser()
    },

    async start() {
      if (server && child && deviceId) {
        const browser = findBrowser()
        return {
          available: true,
          browserName: browser?.name || 'System Browser',
          deviceId,
          state: lastState
        }
      }

      if (startPromise) return startPromise

      startPromise = (async () => {
        const browser = findBrowser()
        if (!browser) {
          startPromise = null
          return {
            available: false,
            reason: 'No supported Chromium browser (Edge, Chrome, or Brave) found for Widevine VMP audio.'
          }
        }

        const tokenInfo = await getAccessToken().catch(() => null)
        if (!tokenInfo?.accessToken) {
          startPromise = null
          return { available: false, reason: 'Not authenticated with Spotify.' }
        }

        cleanup()
        secret = crypto.randomBytes(32).toString('hex')
        const workerHtml = buildWorkerHtml()

        let port = 0
        await new Promise((resolve, reject) => {
          const srv = createServer(async (req, res) => {
            try {
              const hostHeader = req.headers.host || ''
              const expectedOrigin = `http://127.0.0.1:${port}`
              const reqOrigin = req.headers.origin
              if (reqOrigin && reqOrigin !== expectedOrigin) {
                res.writeHead(403).end('Forbidden')
                return
              }

              const parsed = new URL(req.url || '/', `http://${hostHeader || `127.0.0.1:${port}`}`)

              if (req.method === 'GET' && parsed.pathname === '/player') {
                res.writeHead(200, {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-store',
                  'Referrer-Policy': 'no-referrer'
                })
                res.end(workerHtml)
                return
              }

              const headerKey = req.headers['x-pixelpod-key']
              const queryKey = parsed.searchParams.get('k')
              const candidateKey = typeof headerKey === 'string' ? headerKey : queryKey
              if (!secret || !safeEqualHex(secret, candidateKey)) {
                res.writeHead(403).end('Forbidden')
                return
              }

              if (req.method === 'GET' && parsed.pathname === '/api/ping') {
                res.writeHead(204).end()
                return
              }

              if (req.method === 'GET' && parsed.pathname === '/api/token') {
                const forceRefresh = parsed.searchParams.get('refresh') === '1'
                const fresh = await getAccessToken({ forceRefresh }).catch(() => null)
                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store'
                })
                res.end(JSON.stringify({ accessToken: fresh?.accessToken || '' }))
                return
              }

              if (req.method === 'GET' && parsed.pathname === '/api/stream') {
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache, no-store',
                  Connection: 'keep-alive'
                })
                res.write(': connected\n\n')
                sseClient = res
                req.on('close', () => {
                  if (sseClient === res) sseClient = null
                })
                return
              }

              if (req.method === 'POST' && parsed.pathname === '/api/event') {
                let raw = ''
                let tooLarge = false
                req.on('data', (chunk) => {
                  raw += chunk
                  if (raw.length > MAX_EVENT_BODY_BYTES) {
                    tooLarge = true
                    req.destroy()
                  }
                })
                req.on('end', () => {
                  if (tooLarge) return
                  res.writeHead(204).end()
                  try {
                    handleWorkerEvent(JSON.parse(raw))
                  } catch {
                    /* ignore malformed JSON */
                  }
                })
                return
              }

              res.writeHead(404).end()
            } catch {
              if (!res.headersSent) res.writeHead(500).end()
            }
          })

          srv.once('error', reject)
          srv.listen(0, '127.0.0.1', () => {
            server = srv
            port = srv.address().port
            resolve()
          })
        })

        const profileDir = path.join(userDataDir, 'audio-engine-profile')
        fs.mkdirSync(profileDir, { recursive: true })

        const readyWait = new Promise((resolve) => {
          readyResolve = resolve
          setTimeout(() => {
            if (readyResolve === resolve) {
              readyResolve = null
              resolve(null)
            }
          }, STARTUP_TIMEOUT_MS)
        })

        const spawnEnv = { ...process.env }
        delete spawnEnv.ELECTRON_RUN_AS_NODE

        const args = [
          '--headless=new',
          `--user-agent=${DESKTOP_USER_AGENT}`,
          '--autoplay-policy=no-user-gesture-required',
          '--disable-features=HardwareMediaKeyHandling,MediaSessionService',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-extensions',
          '--disable-sync',
          '--disable-default-apps',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${profileDir}`,
          `http://127.0.0.1:${port}/player#${secret}`
        ]

        const spawned = spawnImpl(browser.executablePath, args, {
          stdio: 'ignore',
          windowsHide: true,
          env: spawnEnv
        })
        child = spawned

        spawned.on('error', () => {
          if (!stopping && child === spawned) {
            cleanup()
            onEvent({ type: 'closed' })
          }
        })

        spawned.on('exit', () => {
          if (!stopping && child === spawned) {
            cleanup()
            onEvent({ type: 'closed' })
          }
        })

        const registeredDeviceId = await readyWait

        if (!registeredDeviceId) {
          cleanup()
          return {
            available: false,
            reason: `${browser.name} audio worker did not finish registering with Spotify in time.`
          }
        }

        return {
          available: true,
          browserName: browser.name,
          deviceId: registeredDeviceId,
          state: lastState
        }
      })()
        .catch((err) => {
          cleanup()
          return { available: false, reason: err?.message || 'Failed to launch audio host' }
        })
        .finally(() => {
          startPromise = null
        })

      return startPromise
    },

    async command(action, value = null) {
      if (!AUDIO_COMMANDS.includes(action)) {
        throw Object.assign(new Error(`Unsupported audio command: ${action}`), { code: 'INVALID_COMMAND' })
      }
      if (!server || !sseClient) {
        throw Object.assign(new Error('Audio engine is not connected'), { code: 'AUDIO_OFFLINE' })
      }

      const id = ++commandSeq
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingCommands.delete(id)
          reject(Object.assign(new Error(`Audio command timed out: ${action}`), { code: 'TIMEOUT' }))
        }, COMMAND_TIMEOUT_MS)

        pendingCommands.set(id, { resolve, reject, timer })
        if (!sendSse({ id, action, value })) {
          clearTimeout(timer)
          pendingCommands.delete(id)
          reject(Object.assign(new Error('Failed to send command to audio worker'), { code: 'SEND_FAILED' }))
        }
      })
    },

    stop() {
      cleanup()
      return { stopped: true }
    }
  }
}
