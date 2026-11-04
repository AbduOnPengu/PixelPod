import electron from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INVOKE_CHANNELS, SEND_CHANNELS, EVENT_CHANNELS, NAVIGATE_TARGETS } from '../shared/channels.js'
import { createPrefsStore } from './prefsStore.js'
import { createTokenStore } from './tokenStore.js'
import { createAuthService, DEFAULT_OAUTH_PORT } from './auth.js'
import { APP_ORIGIN, registerAppScheme, serveDist, hardenSession, isAppUrl, isSafeExternalUrl } from './security.js'
import { loadWindowState, trackWindowState, MIN_SIZE } from './windowState.js'
import { guardHandler, sanitizePlayerState, isPlayerCommand, isAudioCommand } from './ipcValidation.js'
import { createDesktopIntegration } from './desktop.js'
import { createAudioHost } from './audioHost.js'

const { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage, screen, session, nativeTheme } = electron

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const DIST_DIR = path.join(ROOT, 'dist')
const PRELOAD = path.join(ROOT, 'electron', 'preload', 'index.cjs')
const RESOURCES_DIR = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(ROOT, 'resources')
const DEV_SERVER_URL = app.isPackaged ? null : process.env.VITE_DEV_SERVER_URL || null
const IS_SMOKE_TEST = process.argv.includes('--smoke-test')

// ── Pre-ready setup ──────────────────────────────────────────────────────────
app.setName('PixelPod')
if (process.platform === 'win32') app.setAppUserModelId('com.pixelpod.app')
// Allow Spotify Web Playback SDK's cross-origin iframe to start audio after async Web API calls
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

if (!app.isPackaged) {
  // Development convenience: read SPOTIFY_CLIENT_ID from the project .env.
  // Packaged builds never read .env files.
  try {
    process.loadEnvFile(path.join(ROOT, '.env'))
  } catch {
    /* no .env */
  }
}

registerAppScheme(protocol)

// ── Services ─────────────────────────────────────────────────────────────────
let mainWindow = null
let isQuitting = false

const userData = app.getPath('userData')
const prefs = createPrefsStore({ filePath: path.join(userData, 'preferences.json') })
const tokenStore = createTokenStore({ filePath: path.join(userData, 'tokens.bin'), safeStorage })

const envClientId = () => {
  const value = (process.env.SPOTIFY_CLIENT_ID || '').trim()
  return /^[0-9a-f]{32}$/i.test(value) ? value : ''
}
const getClientId = () => envClientId() || prefs.get('clientId')

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const auth = createAuthService({
  getClientId,
  tokenStore,
  port: Number(process.env.PIXELPOD_OAUTH_PORT) || DEFAULT_OAUTH_PORT,
  openExternal: (url) => shell.openExternal(url),
  onChange: (status) => send(EVENT_CHANNELS.AUTH_CHANGED, { ...status, clientIdSource: clientIdSource() })
})

const audioHost = createAudioHost({
  userDataDir: userData,
  getAccessToken: (options) => auth.getAccessToken(options),
  onEvent: (payload) => send(EVENT_CHANNELS.AUDIO_EVENT, payload)
})

const clientIdSource = () => (envClientId() ? 'env' : prefs.get('clientId') ? 'settings' : null)

const showWindow = () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const navigate = (target) => {
  if (!NAVIGATE_TARGETS.includes(target)) return
  showWindow()
  send(EVENT_CHANNELS.NAVIGATE, target)
}

const quit = () => {
  isQuitting = true
  app.quit()
}

const desktop = createDesktopIntegration({
  electron,
  resourcesDir: RESOURCES_DIR,
  prefs,
  getWindow: () => mainWindow,
  showWindow,
  sendCommand: (command) => {
    if (isPlayerCommand(command)) send(EVENT_CHANNELS.PLAYER_COMMAND, command)
  },
  navigate,
  quit
})

// ── IPC ──────────────────────────────────────────────────────────────────────
const isTrusted = (url) => isAppUrl(url, DEV_SERVER_URL)

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, guardHandler(isTrusted, fn))

  handle(INVOKE_CHANNELS.AUTH_STATUS, () => ({ ...auth.status(), clientIdSource: clientIdSource() }))
  handle(INVOKE_CHANNELS.AUTH_LOGIN, async () => ({ ...(await auth.login()), clientIdSource: clientIdSource() }))
  handle(INVOKE_CHANNELS.AUTH_CANCEL, () => auth.cancelLogin())
  handle(INVOKE_CHANNELS.AUTH_LOGOUT, () => {
    audioHost.stop()
    return auth.logout()
  })
  handle(INVOKE_CHANNELS.AUTH_TOKEN, (options) =>
    auth.getAccessToken({ forceRefresh: options?.forceRefresh === true })
  )

  handle(INVOKE_CHANNELS.AUDIO_START, () => audioHost.start())
  handle(INVOKE_CHANNELS.AUDIO_STOP, () => audioHost.stop())
  handle(INVOKE_CHANNELS.AUDIO_COMMAND, (action, value) => {
    if (!isAudioCommand(action)) {
      throw Object.assign(new Error('Invalid audio command'), { code: 'INVALID_COMMAND' })
    }
    return audioHost.command(action, value)
  })

  handle(INVOKE_CHANNELS.PREFS_GET_ALL, () => prefs.getAll())
  handle(INVOKE_CHANNELS.PREFS_SET, (key, value) => prefs.set(key, value))

  handle(INVOKE_CHANNELS.APP_INFO, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    widevine: Boolean(electron.components || audioHost.browserInfo()),
    audioEngine: audioHost.browserInfo()?.name || null,
    tokenEncryption: tokenStore.isPersistent(),
    redirectUri: auth.redirectUri
  }))
  handle(INVOKE_CHANNELS.APP_OPEN_EXTERNAL, (url) => {
    if (!isSafeExternalUrl(url)) throw Object.assign(new Error('Only https links can be opened'), { code: 'INVALID_URL' })
    return shell.openExternal(url)
  })

  ipcMain.on(SEND_CHANNELS.PLAYER_STATE, (event, raw) => {
    if (!isTrusted(event.senderFrame?.url)) return
    const state = sanitizePlayerState(raw)
    if (state) desktop.updatePlayer(state)
  })

  prefs.onChange((key, value, all) => {
    send(EVENT_CHANNELS.PREFS_CHANGED, all)
    if (key === 'clientId') send(EVENT_CHANNELS.AUTH_CHANGED, { ...auth.status(), clientIdSource: clientIdSource() })
  })
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const statePath = path.join(userData, 'window-state.json')
  const state = loadWindowState({ filePath: statePath, displays: screen.getAllDisplays() })
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    ...state,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    title: 'PixelPod',
    backgroundColor: '#0b0b0d',
    icon: path.join(RESOURCES_DIR, 'icon.png'),
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 14 } }
      : { titleBarOverlay: { color: '#0b0b0d', symbolColor: '#a1a1aa', height: 40 } }),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false // keep playback state in sync while hidden in tray
    }
  })

  if (state.isMaximized && !IS_SMOKE_TEST) mainWindow.maximize()
  trackWindowState(mainWindow, { filePath: statePath })

  if (!IS_SMOKE_TEST) {
    mainWindow.once('ready-to-show', () => mainWindow.show())
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting && prefs.get('closeToTray')) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('minimize', (event) => {
    if (prefs.get('minimizeToTray')) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (DEV_SERVER_URL) mainWindow.loadURL(DEV_SERVER_URL)
  else mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
let harden = null

app.on('second-instance', showWindow)

app.on('web-contents-created', (_event, contents) => {
  harden?.(contents)
})

app.whenReady().then(async () => {
  // If no OEM browser audio host is installed, wait boundedly for castLabs Widevine CDM;
  // otherwise kick it off in the background so window startup is instantaneous.
  if (electron.components?.whenReady && !IS_SMOKE_TEST) {
    if (audioHost.browserInfo()) {
      electron.components.whenReady().catch(() => {})
    } else {
      try {
        await Promise.race([
          electron.components.whenReady(),
          new Promise((resolve) => setTimeout(resolve, 15000))
        ])
      } catch (error) {
        console.error('[pixelpod] Widevine component failed to load', error)
      }
    }
  }

  nativeTheme.themeSource = 'dark'
  // Present a standard Chromium desktop User-Agent so Spotify's SDK & Widevine license
  // endpoints do not reject Electron-specific UA tokens.
  const cleanUa = session.defaultSession
    .getUserAgent()
    .replace(/\s+(?:Electron|PixelPod)\/[^\s]+/gi, '')
  session.defaultSession.setUserAgent(cleanUa)

  harden = hardenSession({ session: session.defaultSession, shell, devServerUrl: DEV_SERVER_URL })
  if (!DEV_SERVER_URL) serveDist({ protocol, net, fs, distDir: DIST_DIR })

  registerIpc()
  createWindow()
  if (!IS_SMOKE_TEST) desktop.init()

  if (IS_SMOKE_TEST && mainWindow) {
    const failTimer = setTimeout(() => {
      console.error('[smoke-test] Timed out waiting for renderer')
      process.exit(1)
    }, 15000)

    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 350))
        const probe = await mainWindow.webContents.executeJavaScript(`
          (async () => {
            const info = await window.pixelpod.app.getInfo();
            return {
              hasBridge: Boolean(window.pixelpod && window.pixelpod.isDesktop),
              hasNodeLeak: typeof window.process !== 'undefined' || typeof window.require !== 'undefined',
              rootChildren: document.getElementById('root')?.childElementCount || 0,
              info
            };
          })()
        `)
        clearTimeout(failTimer)
        if (!probe.hasBridge || probe.hasNodeLeak || probe.rootChildren < 1) {
          console.error('[smoke-test] Probe failed:', JSON.stringify(probe))
          process.exit(1)
        }
        console.warn('[smoke-test] PASS', JSON.stringify(probe))
        quit()
      } catch (err) {
        clearTimeout(failTimer)
        console.error('[smoke-test] Exception:', err)
        process.exit(1)
      }
    })
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  audioHost.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  audioHost.stop()
  desktop.dispose()
  auth.dispose()
})

process.on('exit', () => {
  audioHost.stop()
})
