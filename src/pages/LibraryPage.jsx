import { useState, useMemo } from 'react'
import { LayoutGrid, List, Search, RefreshCw, Play, Heart } from 'lucide-react'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { usePreferences } from '@/context/PreferencesContext'
import Artwork from '@/components/ui/Artwork'
import MediaCard from '@/components/ui/MediaCard'
import TrackRow from '@/components/ui/TrackRow'
import { SkeletonCardGrid, SkeletonTrackList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import './pages.css'

export default function LibraryPage({
  onOpenPlaylist,
  onOpenAlbum,
  onOpenLiked
}) {
  const {
    playlists,
    likedSongs,
    savedAlbums,
    isLoading,
    error,
    fetchPlaylists,
    fetchLikedSongs,
    fetchSavedAlbums
  } = useSpotify()
  const { isPlaying } = usePlayback()
  const { currentTrack, currentPlaybackSource, playCollection } = useQueue()
  const { prefs, setPref } = usePreferences()

  const [section, setSection] = useState('playlists') // 'playlists' | 'albums' | 'liked'
  const [filterText, setFilterText] = useState('')
  const [sortBy, setSortBy] = useState('default') // 'default' | 'alpha' | 'count'

  const viewMode = prefs.libraryView || 'grid'

  const handleRefresh = () => {
    if (section === 'playlists') fetchPlaylists()
    else if (section === 'albums') fetchSavedAlbums()
    else fetchLikedSongs()
  }

  const handleSwitchSection = (nextSection) => {
    setSection(nextSection)
    if (nextSection === 'albums' && savedAlbums.length === 0) {
      fetchSavedAlbums()
    } else if (nextSection === 'liked' && likedSongs.length === 0) {
      fetchLikedSongs()
    }
  }

  const filteredPlaylists = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const list = q
      ? playlists.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.owner || '').toLowerCase().includes(q)
        )
      : [...playlists]

    if (sortBy === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'count') {
      list.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0))
    }
    return list
  }, [playlists, filterText, sortBy])

  const filteredAlbums = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const list = q
      ? savedAlbums.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            (a.artist || '').toLowerCase().includes(q)
        )
      : [...savedAlbums]

    if (sortBy === 'alpha') {
      list.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy === 'count') {
      list.sort((a, b) => (b.totalTracks || 0) - (a.totalTracks || 0))
    }
    return list
  }, [savedAlbums, filterText, sortBy])

  const filteredLiked = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return likedSongs
    return likedSongs.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    )
  }, [likedSongs, filterText])

  return (
    <div className="pp-page">
      <div className="pp-page-header">
        <div>
          <div className="pp-eyebrow">Collection</div>
          <h1 className="pp-page-title">Your Library</h1>
        </div>

        <button type="button" className="pp-btn" onClick={handleRefresh}>
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="pp-toolbar">
        <div className="pp-pills" role="tablist" aria-label="Library sections">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'playlists'}
            className={`pp-pill ${section === 'playlists' ? 'pp-pill--active' : ''}`}
            onClick={() => handleSwitchSection('playlists')}
          >
            Playlists {playlists.length > 0 ? `(${playlists.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'liked'}
            className={`pp-pill ${section === 'liked' ? 'pp-pill--active' : ''}`}
            onClick={() => handleSwitchSection('liked')}
          >
            Liked Songs {likedSongs.length > 0 ? `(${likedSongs.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'albums'}
            className={`pp-pill ${section === 'albums' ? 'pp-pill--active' : ''}`}
            onClick={() => handleSwitchSection('albums')}
          >
            Albums {savedAlbums.length > 0 ? `(${savedAlbums.length})` : ''}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="pp-search-box" style={{ width: 220 }}>
            <Search size={14} className="pp-search-box__icon" />
            <input
              type="search"
              className="pp-search-box__input"
              style={{ height: 32, fontSize: 'var(--text-xs)' }}
              placeholder="Filter library…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label="Filter library items"
            />
          </div>

          {section !== 'liked' && (
            <>
              <select
                className="pp-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort library"
              >
                <option value="default">Sort: Recent</option>
                <option value="alpha">Sort: A–Z</option>
                <option value="count">Sort: Track count</option>
              </select>

              <button
                type="button"
                className={`pp-icon-btn ${viewMode === 'grid' ? 'pp-icon-btn--active' : ''}`}
                onClick={() => setPref('libraryView', 'grid')}
                aria-label="Grid view"
                title="Grid view"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={`pp-icon-btn ${viewMode === 'list' ? 'pp-icon-btn--active' : ''}`}
                onClick={() => setPref('libraryView', 'list')}
                aria-label="List view"
                title="List view"
              >
                <List size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState title="Library unavailable" description={error} onAction={handleRefresh} />
      ) : section === 'playlists' ? (
        isLoading && playlists.length === 0 ? (
          <SkeletonCardGrid count={8} />
        ) : filteredPlaylists.length === 0 ? (
          <EmptyState
            title={filterText ? 'No matching playlists' : 'No playlists saved'}
            description={
              filterText
                ? 'Try clearing your filter.'
                : 'Playlists you create or follow in Spotify will appear here.'
            }
          />
        ) : viewMode === 'grid' ? (
          <div className="pp-media-grid">
            {/* Pinned Liked Songs card */}
            {!filterText && (
              <div
                className="pp-card"
                role="button"
                tabIndex={0}
                onClick={onOpenLiked}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenLiked()
                  }
                }}
                style={{
                  background:
                    'linear-gradient(145deg, rgba(var(--pp-accent-rgb), 0.24), var(--bg-card) 75%)'
                }}
              >
                <div
                  className="pp-card__art-wrap"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, var(--pp-accent), var(--pp-accent-2))',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--pp-accent-fg)'
                  }}
                >
                  <Heart size={42} fill="currentColor" />
                </div>
                <div className="pp-card__body">
                  <div className="pp-card__title">Liked Songs</div>
                  <div className="pp-card__subtitle">
                    {likedSongs.length > 0 ? `${likedSongs.length} tracks` : 'Saved tracks'}
                  </div>
                </div>
              </div>
            )}

            {filteredPlaylists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.name}
                subtitle={
                  Number.isFinite(playlist.trackCount)
                    ? `${playlist.trackCount} tracks · ${playlist.owner}`
                    : playlist.owner
                }
                artworkUrl={playlist.image}
                isPlaying={isPlaying && currentPlaybackSource?.contextUri === playlist.uri}
                onOpen={() => onOpenPlaylist(playlist)}
                onPlay={() => onOpenPlaylist(playlist, { autoPlay: true })}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                className="pp-track-row pp-track-row--compact"
                role="button"
                tabIndex={0}
                onClick={() => onOpenPlaylist(playlist)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenPlaylist(playlist)
                  }
                }}
              >
                <span className="pp-track-row__index">
                  <Play size={13} />
                </span>
                <div className="pp-track-row__main">
                  <Artwork src={playlist.image} alt={playlist.name} size={40} seed={playlist.id} />
                  <div className="pp-track-row__meta">
                    <div className="pp-track-row__title">{playlist.name}</div>
                    <div className="pp-track-row__artist">By {playlist.owner}</div>
                  </div>
                </div>
                <span className="pp-track-row__duration">
                  {Number.isFinite(playlist.trackCount) ? `${playlist.trackCount} tracks` : ''}
                </span>
              </div>
            ))}
          </div>
        )
      ) : section === 'albums' ? (
        isLoading && savedAlbums.length === 0 ? (
          <SkeletonCardGrid count={8} />
        ) : filteredAlbums.length === 0 ? (
          <EmptyState
            title={filterText ? 'No matching albums' : 'No saved albums'}
            description="Save albums in Spotify to browse them here."
          />
        ) : viewMode === 'grid' ? (
          <div className="pp-media-grid">
            {filteredAlbums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.title}
                subtitle={album.artist}
                artworkUrl={album.image}
                kind="album"
                onOpen={() => onOpenAlbum(album.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredAlbums.map((album) => (
              <div
                key={album.id}
                className="pp-track-row pp-track-row--compact"
                role="button"
                tabIndex={0}
                onClick={() => onOpenAlbum(album.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenAlbum(album.id)
                  }
                }}
              >
                <span className="pp-track-row__index">
                  <Play size={13} />
                </span>
                <div className="pp-track-row__main">
                  <Artwork
                    src={album.imageSmall || album.image}
                    alt={album.title}
                    size={40}
                    kind="album"
                    seed={album.id}
                  />
                  <div className="pp-track-row__meta">
                    <div className="pp-track-row__title">{album.title}</div>
                    <div className="pp-track-row__artist">{album.artist}</div>
                  </div>
                </div>
                <span className="pp-track-row__duration">
                  {album.totalTracks ? `${album.totalTracks} tracks` : ''}
                </span>
              </div>
            ))}
          </div>
        )
      ) : isLoading && likedSongs.length === 0 ? (
        <SkeletonTrackList rows={8} />
      ) : filteredLiked.length === 0 ? (
        <EmptyState
          title={filterText ? 'No matching liked songs' : 'No liked songs yet'}
          description="Save tracks to your Spotify library to see them here."
        />
      ) : (
        <div>
          <div className="pp-track-table-head">
            <span>#</span>
            <span>Title</span>
            <span className="pp-track-table-head__album">Album</span>
            <span style={{ textAlign: 'right' }}>Time</span>
          </div>
          {filteredLiked.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              isActive={currentTrack?.uri === track.uri}
              isPlaying={isPlaying}
              onPlay={() =>
                playCollection({
                  tracks: filteredLiked,
                  startIndex: idx,
                  sourceLabel: 'Liked Songs'
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

