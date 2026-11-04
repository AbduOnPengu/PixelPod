import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  if (typeof window !== 'undefined') {
    cleanup()
    window.localStorage?.clear?.()
    window.sessionStorage?.clear?.()
  }
  vi.restoreAllMocks()
})

beforeAll(() => {
  if (typeof window === 'undefined') return

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })

  if (typeof HTMLElement !== 'undefined') {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn()
    })
  }
})
