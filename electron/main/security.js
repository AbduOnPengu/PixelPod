import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCsp } from '../shared/csp.js'

export const APP_SCHEME = 'app'
export const APP_HOST = 'pixelpod'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

const ALLOWED_PERMISSIONS = new Set([
  'mediaKeySystem',
  'protected-media-identifier',
  'clipboard-sanitized-write',
  'fullscreen'
])

/** True if `url` belongs to the PixelPod renderer (packaged protocol or dev server). */
export function isAppUrl(url, devServerUrl) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST) return true
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
    return false
  } catch {
    return false
  }
}

export function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

/** Must run before `app.whenReady()`. */
export function registerAppScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Resolve a request path inside `distDir`, refusing anything that escapes it. */
export function resolveDistPath(distDir, requestUrl) {
  const { pathname } = new URL(requestUrl)
  const decoded = decodeURIComponent(pathname)
  const target = path.normalize(path.join(distDir, decoded))
  const root = path.normalize(distDir + path.sep)
  if (!target.startsWith(root)) return null
  return target
}

/** Serve the built renderer from `distDir` over app://pixelpod with a strict CSP. */
export function serveDist({ protocol, net, fs, distDir }) {
  const csp = buildCsp()
  protocol.handle(APP_SCHEME, async (request) => {
    let filePath = resolveDistPath(distDir, request.url)
    if (!filePath) return new Response('Forbidden', { status: 403 })

    const hasExtension = path.extname(filePath) !== ''
    if (!hasExtension || !fs.existsSync(filePath)) {
      // SPA fallback — but never mask missing assets as HTML.
      if (hasExtension) return new Response('Not found', { status: 404 })
      filePath = path.join(distDir, 'index.html')
    }

    const response = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', csp)
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: response.status, headers })
  })
}

/** Lock down a renderer: navigation, popups, webviews, permissions. */
export function hardenSession({ session, shell, devServerUrl }) {
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))

  return (contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, devServerUrl)) {
        event.preventDefault()
        if (isSafeExternalUrl(url)) shell.openExternal(url)
      }
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  }
}

