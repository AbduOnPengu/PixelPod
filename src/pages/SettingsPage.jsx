import { useState, useEffect } from 'react'
import { LogOut, Copy, Check, Speaker, ExternalLink } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { usePreferences } from '@/context/PreferencesContext'
import { useToast } from '@/context/ToastContext'
import { desktop } from '@/desktop/bridge'
import { THEMES, SKINS } from '@/constants/appearance'
import Artwork from '@/components/ui/Artwork'
import './pages.css'

const ACCENTS = [
  { id: 'ember', label: 'Ember', color: '#ff6b3d' },
  { id: 'mint', label: 'Mint', color: '#22d3a6' },
  { id: 'iris', label: 'Iris', color: '#8b7cff' },
  { id: 'gold', label: 'Gold', color: '#f5b841' }
]

const SHORTCUTS = [
  { action: 'Play / Pause', keys: 'Space' },
  { action: 'Next / Previous Track', keys: 'Ctrl + → / ←' },
  { action: 'Global Play / Pause (background)', keys: 'Ctrl + Alt + Space' },
  { action: 'Global Next / Previous', keys: 'Ctrl + Alt + → / ←' },
  { action: 'Quick Search', keys: 'Ctrl + K' },
  { action: 'Toggle Shuffle / Repeat', keys: 'S / R' },
  { action: 'Volume Up / Down / Mute', keys: '+ / - / M' },
  { action: 'Switch Classic iPod Mode', keys: 'Ctrl + Shift + C' }
]

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="pp-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="pp-switch__thumb" />
    </button>
  )
}

export default function SettingsPage({ onOpenDevices, onLogout }) {
  const { user, status, setClientId } = useAuth()
  const { userProfile } = useSpotify()
  const { playbackMode, activeDeviceName } = usePlayback()
  const { prefs, setPref } = usePreferences()
  const { showToast } = useToast()

  const [appInfo, setAppInfo] = useState(null)
  const [clientIdDraft, setClientIdDraft] = useState(prefs.clientId || '')
  const [copiedUri, setCopiedUri] = useState(false)

  useEffect(() => {
    setClientIdDraft(prefs.clientId || '')
  }, [prefs.clientId])

  useEffect(() => {
    desktop?.app?.getInfo().then(setAppInfo).catch(() => {})
  }, [])

  const profileName = userProfile?.name || user?.display_name || 'Spotify Listener'
  const profileEmail = userProfile?.email || user?.email || ''
  const profileImage = userProfile?.image || user?.images?.[0]?.url || null
  const redirectUri = status?.redirectUri || appInfo?.redirectUri || 'http://127.0.0.1:43821/callback'

  const handleSaveClientId = async () => {
    const trimmed = clientIdDraft.trim()
    if (trimmed && !/^[0-9a-f]{32}$/i.test(trimmed)) {
      showToast({
        title: 'Invalid Client ID',
        description: 'Spotify Client IDs are 32 hexadecimal characters.',
        tone: 'error'
      })
      return
    }
    try {
      await setClientId(trimmed)
      showToast({
        title: 'Spotify Client ID saved',
        description: trimmed ? 'Stored in desktop preferences.' : 'Cleared saved Client ID.',
        tone: 'success'
      })
    } catch (err) {
      showToast({ title: 'Could not save Client ID', description: err.message, tone: 'error' })
    }
  }

  return (
    <div className="pp-page">
      <div className="pp-page-header">
        <div>
          <div className="pp-eyebrow">Preferences</div>
          <h1 className="pp-page-title">Settings</h1>
          <p className="pp-page-subtitle">
            Customize appearance, desktop integration, playback devices, and account settings.
          </p>
        </div>
      </div>

      <div className="pp-settings-stack">
        {/* Account */}
        <section className="pp-settings-card" aria-labelledby="settings-account">
          <h2 id="settings-account" className="pp-settings-card__title">
            Spotify Account
          </h2>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Artwork
                src={profileImage}
                alt={profileName}
                size={52}
                round
                kind="artist"
                seed={profileName}
              />
              <div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 650 }}>{profileName}</div>
                {profileEmail && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-secondary)' }}>
                    {profileEmail}
                  </div>
                )}
                {userProfile?.product && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--pp-accent)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginTop: 2,
                      fontWeight: 650
                    }}
                  >
                    Spotify {userProfile.product}
                  </div>
                )}
              </div>
            </div>

            <button type="button" className="pp-btn pp-btn--danger" onClick={onLogout}>
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section className="pp-settings-card" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="pp-settings-card__title">
            Appearance &amp; Identity
          </h2>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Accent Color</div>
              <div className="pp-setting-row__desc">
                Highlights active playback indicators, controls, and focus rings.
              </div>
            </div>
            <div className="pp-swatch-row">
              {ACCENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`pp-swatch ${prefs.accent === item.id ? 'pp-swatch--active' : ''}`}
                  onClick={() => setPref('accent', item.id)}
                >
                  <span className="pp-swatch__dot" style={{ background: item.color }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Startup Interface</div>
              <div className="pp-setting-row__desc">
                Choose whether PixelPod opens in Modern Desktop view or Classic iPod Mode.
              </div>
            </div>
            <select
              className="pp-select"
              value={prefs.uiMode}
              onChange={(e) => setPref('uiMode', e.target.value)}
              aria-label="Startup interface mode"
            >
              <option value="modern">Modern Desktop</option>
              <option value="classic">Classic iPod Mode</option>
            </select>
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Now Playing Artwork Backdrop</div>
              <div className="pp-setting-row__desc">
                Subtle blurred ambient glow derived from the current album cover.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.artworkBackdrop)}
              onChange={(val) => setPref('artworkBackdrop', val)}
              label="Now Playing artwork backdrop"
            />
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Motion &amp; Animations</div>
              <div className="pp-setting-row__desc">
                Follow your operating system setting or override animations explicitly.
              </div>
            </div>
            <select
              className="pp-select"
              value={prefs.reducedMotion}
              onChange={(e) => setPref('reducedMotion', e.target.value)}
              aria-label="Motion preference"
            >
              <option value="system">Match System</option>
              <option value="full">Full Motion</option>
              <option value="reduce">Reduced Motion</option>
            </select>
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Classic iPod Shell &amp; Screen</div>
              <div className="pp-setting-row__desc">
                Hardware finish and LCD palette used in Classic iPod Mode.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="pp-select"
                value={prefs.classicSkin}
                onChange={(e) => setPref('classicSkin', e.target.value)}
                aria-label="Classic iPod skin"
              >
                {SKINS.map((s) => (
                  <option key={s.id} value={s.id}>
                    Shell: {s.label}
                  </option>
                ))}
              </select>
              <select
                className="pp-select"
                value={prefs.classicTheme}
                onChange={(e) => setPref('classicTheme', e.target.value)}
                aria-label="Classic iPod screen theme"
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    Screen: {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Audio & Playback */}
        <section className="pp-settings-card" aria-labelledby="settings-audio">
          <h2 id="settings-audio" className="pp-settings-card__title">
            Audio &amp; Playback
          </h2>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Active Playback Engine</div>
              <div className="pp-setting-row__desc">
                {playbackMode === 'sdk'
                  ? 'Built-in PixelPod Web Playback SDK (local audio)'
                  : `Spotify Connect (${activeDeviceName || 'remote device'})`}
              </div>
            </div>
            <button type="button" className="pp-btn" onClick={onOpenDevices}>
              <Speaker size={14} />
              <span>Switch Device</span>
            </button>
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Click-Wheel Tactile Sounds</div>
              <div className="pp-setting-row__desc">
                Play subtle mechanical click feedback when navigating the Classic iPod wheel.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.clickSounds)}
              onChange={(val) => setPref('clickSounds', val)}
              label="Click-wheel tactile sounds"
            />
          </div>
        </section>

        {/* Desktop Integration */}
        <section className="pp-settings-card" aria-labelledby="settings-desktop">
          <h2 id="settings-desktop" className="pp-settings-card__title">
            Desktop Integration
          </h2>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Close Button Minimizes to System Tray</div>
              <div className="pp-setting-row__desc">
                Keep music playing in the background when closing the window.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.closeToTray)}
              onChange={(val) => setPref('closeToTray', val)}
              label="Close button minimizes to system tray"
            />
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Minimize to System Tray</div>
              <div className="pp-setting-row__desc">
                Hide PixelPod from the taskbar when minimized.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.minimizeToTray)}
              onChange={(val) => setPref('minimizeToTray', val)}
              label="Minimize to system tray"
            />
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Global Media Shortcuts</div>
              <div className="pp-setting-row__desc">
                Control playback from any app with Ctrl+Alt+Space and Ctrl+Alt+Arrows.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.globalMediaShortcuts)}
              onChange={(val) => setPref('globalMediaShortcuts', val)}
              label="Global media shortcuts"
            />
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Track Change Notifications</div>
              <div className="pp-setting-row__desc">
                Show a silent desktop notification when a new song starts while unfocused.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.trackNotifications)}
              onChange={(val) => setPref('trackNotifications', val)}
              label="Track change notifications"
            />
          </div>

          <div className="pp-setting-row">
            <div>
              <div className="pp-setting-row__label">Launch PixelPod at Login</div>
              <div className="pp-setting-row__desc">
                Automatically start PixelPod when you sign in to your computer.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.launchOnStartup)}
              onChange={(val) => setPref('launchOnStartup', val)}
              label="Launch PixelPod at login"
            />
          </div>
        </section>

        {/* Keyboard Shortcuts Reference */}
        <section className="pp-settings-card" aria-labelledby="settings-shortcuts">
          <h2 id="settings-shortcuts" className="pp-settings-card__title">
            Keyboard Shortcuts
          </h2>

          {SHORTCUTS.map((item) => (
            <div key={item.action} className="pp-setting-row">
              <div className="pp-setting-row__label" style={{ fontWeight: 480 }}>
                {item.action}
              </div>
              <span className="pp-kbd" style={{ fontSize: '11.5px', padding: '3px 8px' }}>
                {item.keys}
              </span>
            </div>
          ))}
        </section>

        {/* Developer / OAuth Configuration */}
        {desktop && (
          <section className="pp-settings-card" aria-labelledby="settings-oauth">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="settings-oauth" className="pp-settings-card__title">
                Spotify OAuth Configuration
              </h2>
              <button
                type="button"
                className="pp-section__link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={() => desktop.app.openExternal('https://developer.spotify.com/dashboard')}
              >
                <span>Spotify Dashboard</span>
                <ExternalLink size={12} />
              </button>
            </div>

            <div>
              <div className="pp-setting-row__desc" style={{ marginBottom: 6 }}>
                Loopback Redirect URI (PKCE — no client secret used):
              </div>
              <div className="pp-code-field" data-selectable="true">
                <span>{redirectUri}</span>
                <button
                  type="button"
                  className="pp-icon-btn"
                  style={{ width: 26, height: 26 }}
                  aria-label="Copy redirect URI"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(redirectUri)
                      setCopiedUri(true)
                      setTimeout(() => setCopiedUri(false), 1600)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copiedUri ? <Check size={13} color="var(--status-success)" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="pp-search-box__input"
                style={{ height: 36, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                placeholder={
                  status?.clientIdSource === 'env'
                    ? 'Overridden by SPOTIFY_CLIENT_ID in .env'
                    : '32-character Spotify Client ID'
                }
                value={clientIdDraft}
                onChange={(e) => setClientIdDraft(e.target.value)}
                spellCheck={false}
                aria-label="Spotify Client ID"
              />
              <button type="button" className="pp-btn" onClick={handleSaveClientId}>
                Save
              </button>
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--fg-muted)' }}>
              PixelPod v{appInfo?.version || '2.0.0'} · Electron {appInfo?.electron || ''} · Token
              encryption: {appInfo?.tokenEncryption ? 'OS-backed (safeStorage)' : 'Session memory'}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

