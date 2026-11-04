import { THEMES, SKINS } from '@/constants/appearance'
import './SettingsScreen.css'

function SettingsScreen({ userProfile, onLogout, theme, skin, onThemeChange, onSkinChange }) {
  const displayName = userProfile?.name || 'Spotify Listener'
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'PP'

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="settings-title">Settings</div>
      </div>

      <div className="settings-content">
        <div className="settings-card profile-card">
          <div className="profile-avatar">
            {userProfile?.image ? (
              <img src={userProfile.image} alt="" aria-hidden="true" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="profile-copy">
            <div className="profile-label">Account</div>
            <div className="profile-name">{displayName}</div>
            <div className="profile-subtitle">
              {userProfile?.email || 'Signed in with Spotify'}
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-section-title">Appearance</div>
          <div className="appearance-group">
            <div className="appearance-label-row">
              <span className="info-label">Theme</span>
              <span className="appearance-current">
                {THEMES.find((option) => option.id === theme)?.label || 'Classic'}
              </span>
            </div>
            <div className="appearance-options theme-grid">
              {THEMES.map((option) => (
                <button
                  key={option.id}
                  className={`appearance-option ${theme === option.id ? 'active' : ''}`}
                  onClick={() => onThemeChange?.(option.id)}
                >
                  <span className="appearance-option-title">{option.label}</span>
                  <span className="appearance-option-copy">{option.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-group">
            <div className="appearance-label-row">
              <span className="info-label">Skin</span>
              <span className="appearance-current">
                {SKINS.find((option) => option.id === skin)?.label || 'Silver'}
              </span>
            </div>
            <div className="appearance-options skins-grid">
              {SKINS.map((option) => (
                <button
                  key={option.id}
                  className={`appearance-option ${skin === option.id ? 'active' : ''} skin-option`}
                  onClick={() => onSkinChange?.(option.id)}
                >
                  <span className={`skin-swatch ${option.id}`}></span>
                  <span className="appearance-option-title">{option.label}</span>
                </button>
              ))}
            </div>
            <div className="appearance-footnote">
              {SKINS.find((option) => option.id === skin)?.note}
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-section-title">Details</div>
          <div className="info-row">
            <span className="info-label">Profile</span>
            <span className="info-value">{displayName}</span>
          </div>
          {userProfile?.email && (
            <div className="info-row">
              <span className="info-label">Email</span>
              <span className="info-value">{userProfile.email}</span>
            </div>
          )}
        </div>

        <div className="settings-card">
          <div className="settings-section-title">About PixelPod</div>
          <div className="settings-item">
            <span className="item-text">Version 2.0.0</span>
          </div>
          <div className="settings-item">
            <span className="item-text">
              Classic iPod-inspired Spotify player with rotary wheel navigation.
            </span>
          </div>
          <div className="settings-item">
            <span className="item-text">
              Synchronized with the PixelPod Desktop audio &amp; queue engine.
            </span>
          </div>
        </div>

        {onLogout && (
          <div className="settings-actions">
            <button className="logout-button" onClick={onLogout}>
              Log Out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsScreen
