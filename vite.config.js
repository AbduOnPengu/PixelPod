import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { buildCsp } from './electron/shared/csp.js'

const DEV_ORIGIN = 'http://127.0.0.1:5174'

/** Inject the Content-Security-Policy meta tag (relaxed only for Vite HMR in dev). */
const cspPlugin = (isDev) => ({
  name: 'pixelpod-csp',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp({ dev: isDev, devOrigin: DEV_ORIGIN }) },
        injectTo: 'head-prepend'
      }
    ]
  }
})

export default defineConfig(({ command }) => ({
  plugins: [react(), cspPlugin(command === 'serve')],
  // Keep Electron's console output visible next to Vite's.
  clearScreen: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'chrome120',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
    css: true,
    restoreMocks: true,
    clearMocks: true,
    include: ['src/**/*.test.{js,jsx}', 'electron/**/*.test.js']
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true
  }
}))
