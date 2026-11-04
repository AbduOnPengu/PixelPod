import { useState, useMemo } from 'react'
import { Play, Shuffle, Search, Heart, Clock } from 'lucide-react'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { useToast } from '@/context/ToastContext'
import Artwork from '@/components/ui/Artwork'
import TrackRow from '@/components/ui/TrackRow'
import { SkeletonTrackList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import { formatDuration, formatFollowers } from '@/utils/format'
import './pages.css'

/**
 * Renders Playlist Details, Album Details, Artist Top Tracks, Liked Songs,
 * or Recently Played with a unified editorial header and full TrackRow table.
 */
export default function CollectionPage({ kind = 'playlist' }) {
  const {
    selectedPlaylist,
    currentPlaylistTracks,
    selectedAlbum,
    selectedArtist,
    likedSongs,
    recentlyPlayed,
    isLoading,
    error,
    fetchPlaylistTracks,
    fetchLikedSongs,
    fetchRecentlyPlayed
  } = useSpotify()
  const { isPlaying, addToQueue } = usePlayback()
  const { currentTrack, playCollection } = useQueue()
  const { showToast } = useToast()

  const [filterText, setFilterText] = useState('')

  const descriptor = useMemo(() => {
    if (kind === 'liked') {
      return {
        eyebrow: 'Saved Collection',
        title: 'Liked Songs',
        description: 'Every song you have saved to Your Library in Spotify.',
        artworkUrl: null,
        customBadge: 'liked',
        meta: `${likedSongs.length} tracks`,
        tracks: likedSongs,
        contextUri: null,
        onRetry: fetchLikedSongs
      }
    }

    if (kind === 'recent') {
      return {
        eyebrow: 'Listening History',
        title: 'Recently Played',
        description: 'Tracks you recently listened to across Spotify and PixelPod.',
        artworkUrl: recentlyPlayed[0]?.albumArt || null,
        customBadge: 'recent',
        meta: `${recentlyPlayed.length} tracks`,
        tracks: recentlyPlayed,
        contextUri: null,
        onRetry: fetchRecentlyPlayed
      }
    }

    if (kind === 'album') {
      const tracks = selectedAlbum?.tracks || []
      return {
        eyebrow: 'Album',
        title: selectedAlbum?.title || 'Album',
        description: selectedAlbum?.artist || '',
        artworkUrl: selectedAlbum?.image || null,
        meta: [
          selectedAlbum?.releaseDate?.slice(0, 4),
          tracks.length ? `${tracks.length} tracks` : null,
          selectedAlbum?.label
        ]
          .filter(Boolean)
          .join(' · '),
        tracks,
        contextUri: selectedAlbum?.uri || null
      }
    }

    if (kind === 'artist') {
      const tracks = selectedArtist?.topTracks || []
      return {
        eyebrow: 'Artist',
        title: selectedArtist?.name || 'Artist',
        description:
          selectedArtist?.genres?.length > 0
            ? selectedArtist.genres.slice(0, 4).join(' · ')
            : '',
        artworkUrl: selectedArtist?.image || null,
        roundArtwork: true,
        meta: selectedArtist?.followers
          ? `${formatFollowers(selectedArtist.followers)} followers`
          : 'Popular tracks',
        tracks,
        contextUri: null
      }
    }

    return {
      eyebrow: 'Playlist',
      title: selectedPlaylist?.name || 'Playlist',
      description: selectedPlaylist?.description
        ? selectedPlaylist.description.replace(/<[^>]*>/g, '')
        : '',
      artworkUrl: selectedPlaylist?.image || null,
      meta: [
        selectedPlaylist?.owner ? `By ${selectedPlaylist.owner}` : null,
        `${currentPlaylistTracks.length} tracks`
      ]
        .filter(Boolean)
        .join(' · '),
      tracks: currentPlaylistTracks,
      contextUri: selectedPlaylist?.uri || null,
      onRetry: selectedPlaylist ? () => fetchPlaylistTracks(selectedPlaylist.id) : undefined
    }
  }, [
    kind,
    selectedPlaylist,
    currentPlaylistTracks,
    selectedAlbum,
    selectedArtist,
    likedSongs,
    recentlyPlayed,
    fetchPlaylistTracks,
    fetchLikedSongs,
    fetchRecentlyPlayed
  ])

  const filteredTracks = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return descriptor.tracks
    return descriptor.tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.album.toLowerCase().includes(q)
    )
  }, [descriptor.tracks, filterText])

  const totalDurationMs = useMemo(
    () => descriptor.tracks.reduce((acc, t) => acc + (t.duration || 0), 0),
    [descriptor.tracks]
  )

  const handleQueueAdd = async (track) => {
    try {
      await addToQueue(track)
      showToast({
        title: 'Added to queue',
        description: `${track.title} — ${track.artist}`,
        tone: 'success'
      })
    } catch (err) {
      showToast({ title: 'Could not add to queue', description: err.message, tone: 'error' })
    }
  }

  const handleCopyUri = async (track) => {
    try {
      await navigator.clipboard.writeText(track.uri)
      showToast({ title: 'Copied Spotify URI', description: track.uri, tone: 'info' })
    } catch {
      /* ignore clipboard error */
    }
  }

  const startFromIndex = (idx, shouldShuffle = false) => {
    const chosen = filteredTracks[idx]
    const originalIndex =
      descriptor.contextUri && chosen
        ? Math.max(
            0,
            descriptor.tracks.findIndex((t) => t.uri === chosen.uri)
          )
        : idx

    playCollection({
      tracks: descriptor.contextUri ? descriptor.tracks : filteredTracks,
      startIndex: originalIndex,
      contextUri: shouldShuffle ? null : descriptor.contextUri,
      sourceLabel: descriptor.title,
      shuffle: shouldShuffle
    })
  }

  return (
    <div className="pp-page">
      <div className="pp-collection-hero">
        {descriptor.customBadge === 'liked' ? (
          <div
            className="pp-collection-hero__art"
            style={{
              width: 172,
              height: 172,
              background: 'linear-gradient(135deg, var(--pp-accent), var(--pp-accent-2))',
              color: 'var(--pp-accent-fg)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <Heart size={64} fill="currentColor" />
          </div>
        ) : descriptor.customBadge === 'recent' && !descriptor.artworkUrl ? (
          <div
            className="pp-collection-hero__art"
            style={{
              width: 172,
              height: 172,
              background: 'var(--bg-elevated)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <Clock size={56} />
          </div>
        ) : (
          <Artwork
            src={descriptor.artworkUrl}
            alt={descriptor.title}
            size={172}
            round={Boolean(descriptor.roundArtwork)}
            kind={kind === 'artist' ? 'artist' : kind === 'album' ? 'album' : 'music'}
            seed={descriptor.title}
            className="pp-collection-hero__art"
          />
        )}

        <div className="pp-collection-hero__body">
          <div className="pp-eyebrow">{descriptor.eyebrow}</div>
          <h1 className="pp-collection-hero__title">{descriptor.title}</h1>
          {descriptor.description && (
            <p className="pp-collection-hero__desc">{descriptor.description}</p>
          )}
          <div className="pp-collection-hero__meta">
            <span>{descriptor.meta}</span>
            {totalDurationMs > 0 && (
              <>
                <span>·</span>
                <span>
                  {Math.max(1, Math.round(totalDurationMs / 60000))} min total
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pp-collection-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="pp-btn pp-btn--primary"
            disabled={filteredTracks.length === 0}
            onClick={() => startFromIndex(0, false)}
          >
            <Play size={15} fill="currentColor" />
            <span>Play</span>
          </button>

          <button
            type="button"
            className="pp-btn"
            disabled={filteredTracks.length < 2}
            onClick={() => startFromIndex(0, true)}
          >
            <Shuffle size={15} />
            <span>Shuffle</span>
          </button>
        </div>

        {descriptor.tracks.length > 5 && (
          <div className="pp-search-box" style={{ width: 240 }}>
            <Search size={14} className="pp-search-box__icon" />
            <input
              type="search"
              className="pp-search-box__input"
              style={{ height: 34, fontSize: 'var(--text-xs)' }}
              placeholder="Filter tracks…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label="Filter tracks in collection"
            />
          </div>
        )}
      </div>

      {error ? (
        <ErrorState
          title="Could not load tracks"
          description={error}
          onAction={descriptor.onRetry}
        />
      ) : isLoading && descriptor.tracks.length === 0 ? (
        <SkeletonTrackList rows={8} />
      ) : filteredTracks.length === 0 ? (
        <EmptyState
          title={filterText ? 'No tracks match your filter' : 'No playable tracks'}
          description={
            filterText
              ? 'Clear the search box above to see all tracks.'
              : 'This collection does not have any tracks yet.'
          }
        />
      ) : (
        <div>
          <div className="pp-track-table-head">
            <span>#</span>
            <span>Title</span>
            <span className="pp-track-table-head__album">Album</span>
            <span style={{ textAlign: 'right' }}>
              {formatDuration(filteredTracks[0]?.duration) ? 'Time' : ''}
            </span>
          </div>

          {filteredTracks.map((track, idx) => (
            <TrackRow
              key={`${track.id || track.uri}-${idx}`}
              track={track}
              index={idx}
              isActive={currentTrack?.uri === track.uri}
              isPlaying={isPlaying}
              onPlay={() => startFromIndex(idx, false)}
              onAddToQueue={handleQueueAdd}
              onCopyUri={handleCopyUri}
            />
          ))}
        </div>
      )}
    </div>
  )
}

