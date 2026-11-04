import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/press-start-2p'
import App from './App.jsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { PreferencesProvider } from '@/context/PreferencesContext'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { PlaybackProvider } from '@/context/PlaybackContext'
import { SpotifyProvider } from '@/context/SpotifyContext'
import { QueueProvider } from '@/context/QueueContext'
import './styles/tokens.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PreferencesProvider>
        <ToastProvider>
          <AuthProvider>
            <PlaybackProvider>
              <SpotifyProvider>
                <QueueProvider>
                  <App />
                </QueueProvider>
              </SpotifyProvider>
            </PlaybackProvider>
          </AuthProvider>
        </ToastProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
