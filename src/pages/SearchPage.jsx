import { useState, useEffect, useRef } from 'react'
import { Search, X, Clock, Play } from 'lucide-react'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import Artwork from '@/components/ui/Artwork'
import MediaCard from '@/components/ui/MediaCard'
import TrackRow from '@/components/ui/TrackRow'
import { SkeletonCardGrid, SkeletonTrackList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import { RECENT_SEARCHES_KEY, MAX_RECENT_SEARCHES } from '@/constants/search'
import { formatFollowers } from '@/utils/format'
import './pages.css'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' }
]

function loadRecentSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function SearchPage({
  focusSignal,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist
}) {
  const { searchResults, isLoading, error, searchAll, clearSearch } = useSpotify()
  const { isPlaying, addToQueue } = usePlayback()
  const { currentTrack, playCollection } = useQueue()
  const { showToast } = useToast()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches)
  const debouncedQuery = useDebounce(query, 400)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusSignal])

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 2) {
      if (!trimmed) clearSearch()
      return
    }

    searchAll(trimmed)
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      )
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
      } catch {
        /* ignore storage quota */
      }
      return next
    })
  }, [debouncedQuery, searchAll, clearSearch])

  const tracks = searchResults.tracks || []
  const albums = searchResults.albums || []
  const artists = searchResults.artists || []
  const playlists = searchResults.playlists || []

  const hasQuery = debouncedQuery.trim().length >= 2
  const hasAnyResults =
    tracks.length > 0 || albums.length > 0 || artists.length > 0 || playlists.length > 0
  const topTrack = tracks[0]

  const handleQueueAdd = async (track) => {
    try {
      await addToQueue(track)
      showToast({
        title: 'Added to queue',
        description: `${track.title} — ${track.artist}`,
        tone: 'success'
      })
    } catch (err) {
      showToast({ title: 'Queue error', description: err.message, tone: 'error' })
    }
  }

  const clearRecent = () => {
    setRecentSearches([])
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pp-page">
      <div className="pp-page-header">
        <div>
          <div className="pp-eyebrow">Catalog Search</div>
          <h1 className="pp-page-title">Search Spotify</h1>
        </div>
      </div>

      <div className="pp-toolbar">
        <div className="pp-search-box">
          <Search size={16} className="pp-search-box__icon" />
          <input
            ref={inputRef}
            type="search"
            className="pp-search-box__input"
            placeholder="Songs, albums, artists, or playlists…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search Spotify"
          />
          {query && (
            <button
              type="button"
              className="pp-icon-btn pp-search-box__clear"
              aria-label="Clear search query"
              onClick={() => {
                setQuery('')
                clearSearch()
                inputRef.current?.focus()
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {hasQuery && (
          <div className="pp-pills" role="tablist" aria-label="Filter search results">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`pp-pill ${activeTab === tab.id ? 'pp-pill--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasQuery ? (
        recentSearches.length > 0 ? (
          <section className="pp-section">
            <div className="pp-section__head">
              <h2 className="pp-section__title">Recent Searches</h2>
              <button type="button" className="pp-section__link" onClick={clearRecent}>
                Clear history
              </button>
            </div>
            <div className="pp-pills">
              {recentSearches.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="pp-pill"
                  onClick={() => setQuery(item)}
                >
                  <Clock size={12} style={{ marginRight: 6, verticalAlign: '-1px' }} />
                  {item}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={Search}
            title="Find anything on Spotify"
            description="Type at least two characters to search tracks, albums, artists, and playlists."
          />
        )
      ) : error ? (
        <ErrorState
          title="Search unavailable"
          description={error}
          onAction={() => searchAll(debouncedQuery.trim())}
        />
      ) : isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <SkeletonTrackList rows={5} />
          <SkeletonCardGrid count={6} />
        </div>
      ) : !hasAnyResults ? (
        <EmptyState
          icon={Search}
          title={`No results for "${debouncedQuery.trim()}"`}
          description="Check the spelling or try searching with a different keyword."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Top Result + Top Tracks split in "All" tab */}
          {activeTab === 'all' && topTrack && (
            <div className="pp-search-hero">
              <div>
                <div className="pp-section__head">
                  <h2 className="pp-section__title">Top Result</h2>
                </div>
                <div
                  className="pp-spotlight"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    playCollection({
                      tracks,
                      startIndex: 0,
                      sourceLabel: `Search: ${debouncedQuery.trim()}`
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      playCollection({
                        tracks,
                        startIndex: 0,
                        sourceLabel: `Search: ${debouncedQuery.trim()}`
                      })
                    }
                  }}
                >
                  <Artwork
                    src={topTrack.albumArt}
                    alt={topTrack.title}
                    size={96}
                    seed={topTrack.id}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 'var(--text-xl)',
                        fontWeight: 700,
                        letterSpacing: '-0.02em'
                      }}
                    >
                      {topTrack.title}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-secondary)', marginTop: 4 }}>
                      Song · {topTrack.artist}
                    </div>
                  </div>
                  <div>
                    <span className="pp-btn pp-btn--primary" style={{ height: 34 }}>
                      <Play size={14} fill="currentColor" />
                      <span>Play Track</span>
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="pp-section__head">
                  <h2 className="pp-section__title">Songs</h2>
                </div>
                <div>
                  {tracks.slice(0, 5).map((track, idx) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={idx}
                      compact
                      isActive={currentTrack?.uri === track.uri}
                      isPlaying={isPlaying}
                      onPlay={() =>
                        playCollection({
                          tracks,
                          startIndex: idx,
                          sourceLabel: `Search: ${debouncedQuery.trim()}`
                        })
                      }
                      onAddToQueue={handleQueueAdd}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Tracks Tab */}
          {activeTab === 'tracks' && tracks.length > 0 && (
            <section>
              <div className="pp-track-table-head">
                <span>#</span>
                <span>Title</span>
                <span className="pp-track-table-head__album">Album</span>
                <span style={{ textAlign: 'right' }}>Time</span>
              </div>
              {tracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  isActive={currentTrack?.uri === track.uri}
                  isPlaying={isPlaying}
                  onPlay={() =>
                    playCollection({
                      tracks,
                      startIndex: idx,
                      sourceLabel: `Search: ${debouncedQuery.trim()}`
                    })
                  }
                  onAddToQueue={handleQueueAdd}
                />
              ))}
            </section>
          )}

          {/* Albums */}
          {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
            <section>
              <div className="pp-section__head">
                <h2 className="pp-section__title">Albums</h2>
              </div>
              <div className="pp-media-grid">
                {(activeTab === 'all' ? albums.slice(0, 6) : albums).map((album) => (
                  <MediaCard
                    key={album.id}
                    title={album.title}
                    subtitle={`${album.artist}${
                      album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''
                    }`}
                    artworkUrl={album.image}
                    kind="album"
                    onOpen={() => onOpenAlbum(album.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {(activeTab === 'all' || activeTab === 'artists') && artists.length > 0 && (
            <section>
              <div className="pp-section__head">
                <h2 className="pp-section__title">Artists</h2>
              </div>
              <div className="pp-media-grid">
                {(activeTab === 'all' ? artists.slice(0, 6) : artists).map((artist) => (
                  <MediaCard
                    key={artist.id}
                    title={artist.name}
                    subtitle={
                      artist.followers
                        ? `${formatFollowers(artist.followers)} followers`
                        : 'Artist'
                    }
                    artworkUrl={artist.image}
                    kind="artist"
                    roundArtwork
                    onOpen={() => onOpenArtist(artist.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Playlists */}
          {(activeTab === 'all' || activeTab === 'playlists') && playlists.length > 0 && (
            <section>
              <div className="pp-section__head">
                <h2 className="pp-section__title">Playlists</h2>
              </div>
              <div className="pp-media-grid">
                {(activeTab === 'all' ? playlists.slice(0, 6) : playlists).map((playlist) => (
                  <MediaCard
                    key={playlist.id}
                    title={playlist.name}
                    subtitle={`By ${playlist.owner}`}
                    artworkUrl={playlist.image}
                    onOpen={() => onOpenPlaylist(playlist)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
