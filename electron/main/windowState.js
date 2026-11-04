import fs from 'node:fs'
import { readJson, writeJsonAtomic } from './prefsStore.js'

export const DEFAULT_BOUNDS = Object.freeze({ width: 1280, height: 820 })
export const MIN_SIZE = Object.freeze({ width: 960, height: 640 })

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n)

/** True when at least a 100×60 px area of the window lies on some display. */
export function isVisibleOnSomeDisplay(bounds, displays) {
  return displays.some(({ workArea: a }) => {
    const overlapX = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x)
    const overlapY = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y)
    return overlapX >= 100 && overlapY >= 60
  })
}

export function loadWindowState({ filePath, displays, fsImpl = fs }) {
  const raw = readJson(fsImpl, filePath)
  const state = { ...DEFAULT_BOUNDS, isMaximized: false }
  if (!raw) return state

  if (isFiniteNumber(raw.width) && isFiniteNumber(raw.height)) {
    state.width = Math.max(MIN_SIZE.width, Math.round(raw.width))
    state.height = Math.max(MIN_SIZE.height, Math.round(raw.height))
  }
  if (isFiniteNumber(raw.x) && isFiniteNumber(raw.y)) {
    const candidate = { x: Math.round(raw.x), y: Math.round(raw.y), width: state.width, height: state.height }
    if (isVisibleOnSomeDisplay(candidate, displays)) {
      state.x = candidate.x
      state.y = candidate.y
    }
  }
  state.isMaximized = raw.isMaximized === true
  return state
}

/** Persist bounds (debounced) whenever the window moves/resizes, and on close. */
export function trackWindowState(win, { filePath, fsImpl = fs }) {
  let timer = null
  const save = () => {
    if (win.isDestroyed()) return
    const bounds = win.getNormalBounds()
    writeJsonAtomic(fsImpl, filePath, { ...bounds, isMaximized: win.isMaximized() })
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 400)
  }
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) win.on(event, schedule)
  win.on('close', () => {
    clearTimeout(timer)
    save()
  })
}

