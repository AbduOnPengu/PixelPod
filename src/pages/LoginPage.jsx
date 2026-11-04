import { useState } from 'react'
import { ExternalLink, Copy, Check, KeyRound, Disc3, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usePreferences } from '@/context/PreferencesContext'
import { desktop } from '@/desktop/bridge'
import './pages.css'

const DEFAULT_REDIRECT = 'http://127.0.0.1:43821/callback'

export default function LoginPage() {
  const { isLoggingIn, error, status, login, cancelLogin, setClientId } = useAuth()
  const { prefs } = usePreferences()
  const [clientIdInput, setClientIdInput] = useState(prefs.clientId || '')
  const [clientIdError, setClientIdError] = useState(null)
  const [showSetup, setShowSetup] = useState(!status?.hasClientId)
  const [copied, setCopied] = useState(false)

  const redirectUri = status?.redirectUri || DEFAULT_REDIRECT

  const handleSaveAndConnect = async () => {
    setClientIdError(null)
    const trimmed = clientIdInput.trim()

    if (!status?.hasClientId || (trimmed && trimmed !== prefs.clientId)) {
      if (!/^[0-9a-f]{32}$/i.test(trimmed)) {
        setClientIdError('Enter a valid 32-character hexadecimal Spotify Client ID.')
        setShowSetup(true)
        return
      }
      try {
        await setClientId(trimmed)
      } catch (err) {
        setClientIdError(err.message)
        return
      }
    }

    await login()
  }

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore clipboard denial */
    }
  }

  return (
    <div className="pp-login-shell">
      <div className="pp-login-drag" />
      <main className="pp-login-center">
        <div className="pp-login-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="pp-brand-wheel" style={{ width: 42, height: 42, borderRadius: 12 }}>
              <div className="pp-brand-wheel__ring" style={{ width: 24, height: 24 }}>
                <div className="pp-brand-wheel__dot" style={{ width: 6, height: 6 }} />
              </div>
            </div>
            <div>
              <div className="pp-eyebrow" style={{ marginBottom: 1 }}>
                Desktop Music Player
              </div>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 750, letterSpacing: '-0.02em' }}>
                Welcome to PixelPod
              </h1>
            </div>
          </div>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-secondary)', lineHeight: 1.55 }}>
            Sign in with your Spotify account in your default browser using secure PKCE authentication.
            No client secret is ever stored or required.
          </p>

          {(error || clientIdError) && (
            <div
              role="alert"
              style={{
                padding: '11px 13px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.32)',
                fontSize: 'var(--text-xs)',
                color: '#fda4af'
              }}
            >
              {clientIdError || error}
            </div>
          )}

          {(showSetup || !status?.hasClientId) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 650 }}>
                  Spotify Developer App Setup
                </span>
                <button
                  type="button"
                  className="pp-section__link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() =>
                    desktop?.app?.openExternal('https://developer.spotify.com/dashboard')
                  }
                >
                  <span>Open Dashboard</span>
                  <ExternalLink size={12} />
                </button>
              </div>

              <div>
                <label
                  htmlFor="spotify-client-id"
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    color: 'var(--fg-secondary)',
                    marginBottom: 5
                  }}
                >
                  1. Add this Loopback Redirect URI to your Spotify App:
                </label>
                <div className="pp-code-field" data-selectable="true">
                  <span>{redirectUri}</span>
                  <button
                    type="button"
                    className="pp-icon-btn"
                    style={{ width: 26, height: 26 }}
                    onClick={handleCopyRedirect}
                    aria-label="Copy redirect URI"
                  >
                    {copied ? <Check size={13} color="var(--status-success)" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="spotify-client-id"
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    color: 'var(--fg-secondary)',
                    marginBottom: 5
                  }}
                >
                  2. Paste your 32-character Spotify Client ID:
                </label>
                <input
                  id="spotify-client-id"
                  type="text"
                  className="pp-search-box__input"
                  style={{ height: 36, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  placeholder={
                    status?.clientIdSource === 'env'
                      ? 'Loaded from SPOTIFY_CLIENT_ID (.env)'
                      : 'e.g. a1b2c3d4e5f60718293a4b5c6d7e8f90'
                  }
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isLoggingIn ? (
              <>
                <button type="button" className="pp-btn pp-btn--primary" disabled style={{ height: 42 }}>
                  Waiting for browser authorization…
                </button>
                <button type="button" className="pp-btn pp-btn--ghost" onClick={cancelLogin}>
                  Cancel sign-in
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pp-btn pp-btn--primary"
                style={{ height: 42, fontSize: 'var(--text-base)' }}
                onClick={handleSaveAndConnect}
              >
                <Disc3 size={17} />
                <span>Connect with Spotify</span>
              </button>
            )}

            {status?.hasClientId && (
              <button
                type="button"
                className="pp-btn pp-btn--ghost"
                style={{ fontSize: 'var(--text-xs)', height: 30 }}
                onClick={() => setShowSetup((prev) => !prev)}
              >
                <KeyRound size={13} />
                <span>
                  {showSetup
                    ? 'Hide Client ID settings'
                    : `Client ID configured (${status.clientIdSource || 'saved'})`}
                </span>
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
              color: 'var(--fg-muted)'
            }}
          >
            <ShieldCheck size={14} />
            <span>
              Tokens are encrypted with OS-native credential storage when available.
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
