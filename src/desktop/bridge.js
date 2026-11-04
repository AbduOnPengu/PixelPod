/**
 * Renderer access to the desktop bridge exposed by electron/preload/index.cjs.
 *
 * `desktop` is null when the renderer runs outside Electron (unit tests, or
 * opening the Vite dev server in a normal browser). Callers must handle that.
 */
export const desktop = typeof window !== 'undefined' && window.pixelpod?.isDesktop ? window.pixelpod : null

export const isDesktop = Boolean(desktop)

/** Subscribe helper that tolerates a missing bridge; returns an unsubscribe fn. */
export function onDesktopEvent(group, event, callback) {
  const subscribe = desktop?.[group]?.[event]
  if (typeof subscribe !== 'function') return () => {}
  return subscribe(callback)
}

