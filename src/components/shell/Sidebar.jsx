import {
  Home,
  Search,
  Library,
  Heart,
  Clock,
  Disc3,
  Radio,
  Settings,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import Artwork from '@/components/ui/Artwork'
import './shell.css'

const PRIMARY_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'library', label: 'Your Library', icon: Library },
  { id: 'liked', label: 'Liked Songs', icon: Heart },
  { id: 'recent', label: 'Recently Played', icon: Clock },
  { id: 'nowPlaying', label: 'Now Playing', icon: Radio }
]

export default function Sidebar({
  activeRoute,
  selectedPlaylistId,
  collapsed,
  playlists = [],
  userProfile,
  onNavigate,
  onOpenPlaylist,
  onToggleCollapse
}) {
  return (
    <aside className="pp-sidebar" aria-label="Primary navigation">
      <div className="pp-sidebar__brand">
        <div className="pp-brand-mark">
          <div className="pp-brand-wheel" aria-hidden="true">
            <div className="pp-brand-wheel__ring">
              <div className="pp-brand-wheel__dot" />
            </div>
          </div>
          <span className="pp-brand-name">PixelPod</span>
        </div>

        <button
          type="button"
          className="pp-icon-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="pp-sidebar__nav">
        {PRIMARY_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeRoute === id
          return (
            <button
              key={id}
              type="button"
              className={`pp-nav-item ${isActive ? 'pp-nav-item--active' : ''}`}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={17} strokeWidth={1.9} />
              <span className="pp-nav-item__label">{label}</span>
            </button>
          )
        })}

        <button
          type="button"
          className={`pp-nav-item pp-nav-item--classic ${
            activeRoute === 'classic' ? 'pp-nav-item--active' : ''
          }`}
          onClick={() => onNavigate('classic')}
          title={collapsed ? 'Classic iPod Mode' : 'Switch to virtual click-wheel iPod'}
          aria-current={activeRoute === 'classic' ? 'page' : undefined}
        >
          <Disc3 size={17} strokeWidth={1.9} />
          <span className="pp-nav-item__label">Classic iPod</span>
        </button>
      </nav>

      <div className="pp-sidebar__divider" />

      <div className="pp-sidebar__section-head">
        <span>Playlists</span>
        {playlists.length > 0 && <span>{playlists.length}</span>}
      </div>

      <div className="pp-sidebar__playlists" role="list">
        {playlists.map((playlist) => {
          const active = activeRoute === 'playlist' && selectedPlaylistId === playlist.id
          return (
            <button
              key={playlist.id}
              type="button"
              role="listitem"
              className={`pp-playlist-link ${active ? 'pp-playlist-link--active' : ''}`}
              onClick={() => onOpenPlaylist(playlist)}
              title={playlist.name}
            >
              <Artwork
                src={playlist.image}
                alt={playlist.name}
                size={28}
                seed={playlist.id}
              />
              <span className="pp-playlist-link__name">{playlist.name}</span>
            </button>
          )
        })}
      </div>

      <div className="pp-sidebar__footer">
        <button
          type="button"
          className={`pp-nav-item ${activeRoute === 'settings' ? 'pp-nav-item--active' : ''}`}
          onClick={() => onNavigate('settings')}
          title={collapsed ? 'Settings' : undefined}
          aria-current={activeRoute === 'settings' ? 'page' : undefined}
        >
          <Settings size={17} strokeWidth={1.9} />
          <span className="pp-nav-item__label">
            {userProfile?.name ? `Settings · ${userProfile.name}` : 'Settings'}
          </span>
        </button>
      </div>
    </aside>
  )
}

