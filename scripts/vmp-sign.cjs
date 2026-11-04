/**
 * Optional Widevine VMP signing hook for electron-builder.
 *
 * When PIXELPOD_VMP_SIGN=1 is set, signs the packaged bundle with the
 * developer's castLabs EVS certificate (`castlabs_evs.vmp sign-pkg`).
 * By default, PixelPod streams encrypted Spotify audio through its built-in
 * OEM-certified system Chromium Audio Host (`electron/main/audioHost.js`),
 * so no paid EVS signing account is required.
 */
const { execFileSync } = require('node:child_process')

function sign(context, phase) {
  if (process.env.PIXELPOD_VMP_SIGN !== '1') return

  const platform = context.electronPlatformName
  const wanted = platform === 'darwin' ? 'afterPack' : platform === 'win32' ? 'afterSign' : null
  if (phase !== wanted) return

  const python = process.env.PYTHON || 'python'
  console.log(`[vmp-sign] ${phase}: signing ${context.appOutDir}`)
  execFileSync(python, ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], { stdio: 'inherit' })
}

exports.afterPack = async (context) => sign(context, 'afterPack')
exports.afterSign = async (context) => sign(context, 'afterSign')
