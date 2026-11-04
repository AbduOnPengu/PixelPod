/* eslint-env node */
/**
 * Optional castLabs EVS VMP signing for electron-builder.
 *
 * Widevine "Verified Media Path" signing is required by some DRM providers for
 * production builds. Skipped unless PIXELPOD_VMP_SIGN=1 and the castLabs EVS
 * CLI is installed and logged in:
 *
 *   python -m pip install --upgrade castlabs-evs
 *   python -m castlabs_evs.account signup   # or: reauth
 *
 * castLabs requires macOS packages to be VMP-signed BEFORE code signing
 * (afterPack) and Windows packages AFTER code signing (afterSign).
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
