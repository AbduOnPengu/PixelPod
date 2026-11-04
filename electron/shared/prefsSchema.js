/**
 * Preference schema. Every persisted preference must be declared here with a
 * default and a validator; unknown keys and invalid values are rejected.
 */

const oneOf = (...values) => (value) => values.includes(value)
const isBoolean = (value) => typeof value === 'boolean'
const isClientId = (value) => value === '' || (typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value))

export const PREF_SCHEMA = Object.freeze({
  uiMode: { default: 'modern', validate: oneOf('modern', 'classic') },
  classicTheme: { default: 'classic', validate: oneOf('classic', 'modern') },
  classicSkin: { default: 'silver', validate: oneOf('silver', 'graphite', 'blue') },
  accent: { default: 'ember', validate: oneOf('ember', 'mint', 'iris', 'gold') },
  artworkBackdrop: { default: true, validate: isBoolean },
  reducedMotion: { default: 'system', validate: oneOf('system', 'reduce', 'full') },
  sidebarCollapsed: { default: false, validate: isBoolean },
  libraryView: { default: 'grid', validate: oneOf('grid', 'list') },
  clickSounds: { default: true, validate: isBoolean },
  closeToTray: { default: false, validate: isBoolean },
  minimizeToTray: { default: false, validate: isBoolean },
  launchOnStartup: { default: false, validate: isBoolean },
  trackNotifications: { default: false, validate: isBoolean },
  globalMediaShortcuts: { default: true, validate: isBoolean },
  clientId: { default: '', validate: isClientId }
})

export const getDefaultPrefs = () =>
  Object.fromEntries(Object.entries(PREF_SCHEMA).map(([key, def]) => [key, def.default]))

export const isValidPref = (key, value) =>
  typeof key === 'string' && Object.hasOwn(PREF_SCHEMA, key) && PREF_SCHEMA[key].validate(value)

/** Merge raw (possibly corrupt / outdated) data over defaults, dropping invalid entries. */
export const sanitizePrefs = (raw) => {
  const prefs = getDefaultPrefs()
  if (!raw || typeof raw !== 'object') return prefs
  for (const [key, value] of Object.entries(raw)) {
    if (isValidPref(key, value)) prefs[key] = value
  }
  return prefs
}

