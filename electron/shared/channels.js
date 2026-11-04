/**
 * IPC channel names shared by the main process and (by copy) the preload.
 * The preload script runs sandboxed as CommonJS and cannot import this ESM file,
 * so it keeps its own literal list — keep them in sync (a test enforces this).
 */
export const INVOKE_CHANNELS = Object.freeze({
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
})

export const SEND_CHANNELS = Object.freeze({
  PLAYER_STATE: 'player:state'
})

export const EVENT_CHANNELS = Object.freeze({
  AUTH_CHANGED: 'auth:changed',
  AUDIO_EVENT: 'audio:event',
  PREFS_CHANGED: 'prefs:changed',
  PLAYER_COMMAND: 'player:command',
  NAVIGATE: 'ui:navigate'
})

export const AUDIO_COMMANDS = Object.freeze([
  'pause',
  'resume',
  'nextTrack',
  'previousTrack',
  'seek',
  'setVolume',
  'getState'
])
export const PLAYER_COMMANDS = Object.freeze(['playPause', 'next', 'previous'])
export const NAVIGATE_TARGETS = Object.freeze(['home', 'search', 'library', 'settings', 'nowPlaying', 'classic'])

