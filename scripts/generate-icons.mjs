/**
 * Generates PixelPod's app and tray icons procedurally (no image dependencies).
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs:
 *   resources/icon.png           512×512 app icon (window + electron-builder source)
 *   resources/tray.png           32×32  tray icon (Windows/Linux)
 *   resources/trayTemplate.png   22×22  monochrome template icon (macOS)
 *   build/icon.png               1024×1024 for electron-builder (generates .ico/.icns)
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')

// ── PNG encoding ─────────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ── Drawing helpers (supersampled signed-distance shapes) ───────────────────
const mix = (a, b, t) => a + (b - a) * t
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function render(size, shade, samples = 4) {
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size
          const v = (y + (sy + 0.5) / samples) / size
          const [cr, cg, cb, ca] = shade(u, v)
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca
        }
      }
      const n = samples * samples
      const i = (y * size + x) * 4
      out[i + 3] = Math.round((a / n) * 255)
      if (a > 0) {
        out[i] = Math.round(r / a)
        out[i + 1] = Math.round(g / a)
        out[i + 2] = Math.round(b / a)
      }
    }
  }
  return out
}

const roundedRect = (u, v, inset, radius) => {
  const qx = Math.abs(u - 0.5) - (0.5 - inset - radius)
  const qy = Math.abs(v - 0.5) - (0.5 - inset - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

const EMBER = hex('#ff7a45')
const ROSE = hex('#ff3d6e')
const BG_TOP = hex('#24242b')
const BG_BOTTOM = hex('#0c0c0f')

/** Full-color app icon: dark tile, gradient click-wheel ring, glowing center. */
function appIcon(u, v) {
  if (roundedRect(u, v, 0.06, 0.2) > 0) return [0, 0, 0, 0]
  const d = Math.hypot(u - 0.5, v - 0.56)
  const t = Math.min(1, Math.max(0, (u + v) / 2))
  const accent = [mix(EMBER[0], ROSE[0], t), mix(EMBER[1], ROSE[1], t), mix(EMBER[2], ROSE[2], t)]

  // Click wheel ring
  if (d > 0.2 && d < 0.3) return [...accent, 1]
  // Center button
  if (d < 0.09) return [245, 245, 247, 1]
  // Screen bar above the wheel
  const sx = Math.abs(u - 0.5), sy = Math.abs(v - 0.2)
  if (sx < 0.2 && sy < 0.035) return [...accent.map((c) => c * 0.5 + 40), 1]

  const bg = BG_TOP.map((c, i) => mix(c, BG_BOTTOM[i], v))
  const glow = Math.max(0, 0.18 - Math.abs(d - 0.25)) * 1.6
  return [bg[0] + glow * accent[0], bg[1] + glow * accent[1], bg[2] + glow * accent[2], 1]
}

/** Monochrome tray glyph: ring + center dot. */
const trayIcon = (color) => (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5)
  if ((d > 0.3 && d < 0.46) || d < 0.12) return [...color, 1]
  return [0, 0, 0, 0]
}

function write(relPath, size, shade) {
  const file = path.join(ROOT, relPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodePng(size, render(size, shade)))
  console.log('wrote', relPath)
}

write('resources/icon.png', 512, appIcon)
write('build/icon.png', 1024, appIcon)
write('resources/tray.png', 32, trayIcon([236, 236, 241]))
write('resources/trayTemplate.png', 22, trayIcon([0, 0, 0]))

