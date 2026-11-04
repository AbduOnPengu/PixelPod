/**
 * PixelPod preload — the only bridge between the sandboxed renderer and Electron.
 *
 * Exposes a frozen `window.pixelpod` object with a fixed set of functions.
 * Raw ipcRenderer and Node APIs are never exposed. Channel names must match
 * electron/shared/channels.js (enforced by a unit test).
 */
const { contextBridge, ipcRenderer } = require('electron')

const INVOKE = {
  AUTH_STATUS: 'auth:status',
  AUTH_LOGIN: 'auth:login',
  AUTH_CANCEL: 'auth:cancel',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_TOKEN: 'auth:token',
  AUDIO_START: 'audio:start',
  AUDIO_STOP: 'audio:stop',
  AUDIO_COMMAND: 'audio:command',
  PREFS_GET_ALL: 'prefs:getAll',
  PREFS_SET: 'prefs:set',
  APP_INFO: 'app:info',
  APP_OPEN_EXTERNAL: 'app:openExternal'
}
const SEND = { PLAYER_STATE: 'player:state' }
const EVENTS = {
  AUTH_CHANGED: 'auth:changed',
  AUDIO_EVENT: 'audio:event',
  PREFS_CHANGED: 'prefs:changed',
  PLAYER_COMMAND: 'player:command',
  NAVIGATE: 'ui:navigate'
}

/** Unwrap the `{ ok, data | error }` envelope produced by guardHandler. */
async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args)
  if (result && result.ok) return result.data
  const error = new Error(result?.error?.message || 'Request failed')
  error.code = result?.error?.code || 'ERROR'
  throw error
}

/** Subscribe to a main→renderer event; returns an unsubscribe function. */
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  isDesktop: true,
  platform: process.platform,
  auth: {
    getStatus: () => invoke(INVOKE.AUTH_STATUS),
    login: () => invoke(INVOKE.AUTH_LOGIN),
    cancelLogin: () => invoke(INVOKE.AUTH_CANCEL),
    logout: () => invoke(INVOKE.AUTH_LOGOUT),
    getAccessToken: (options) => invoke(INVOKE.AUTH_TOKEN, { forceRefresh: Boolean(options && options.forceRefresh) }),
    onChanged: (callback) => subscribe(EVENTS.AUTH_CHANGED, callback)
  },
  audio: {
    start: () => invoke(INVOKE.AUDIO_START),
    stop: () => invoke(INVOKE.AUDIO_STOP),
    command: (action, value) => invoke(INVOKE.AUDIO_COMMAND, String(action), value),
    onEvent: (callback) => subscribe(EVENTS.AUDIO_EVENT, callback)
  },
  prefs: {
    getAll: () => invoke(INVOKE.PREFS_GET_ALL),
    set: (key, value) => invoke(INVOKE.PREFS_SET, key, value),
    onChanged: (callback) => subscribe(EVENTS.PREFS_CHANGED, callback)
  },
  app: {
    getInfo: () => invoke(INVOKE.APP_INFO),
    openExternal: (url) => invoke(INVOKE.APP_OPEN_EXTERNAL, String(url))
  },
  player: {
    reportState: (state) => ipcRenderer.send(SEND.PLAYER_STATE, state),
    onCommand: (callback) => subscribe(EVENTS.PLAYER_COMMAND, callback)
  },
  ui: {
    onNavigate: (callback) => subscribe(EVENTS.NAVIGATE, callback)
  }
}

contextBridge.exposeInMainWorld('pixelpod', Object.freeze(api))

