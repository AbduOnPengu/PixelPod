import { Heart, Disc3, Play } from 'lucide-react'
import { useSpotify } from '@/context/SpotifyContext'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { useToast } from '@/context/ToastContext'
import Artwork from '@/components/ui/Artwork'
import MediaCard from '@/components/ui/MediaCard'
import TrackRow from '@/components/ui/TrackRow'
import { SkeletonCardGrid, SkeletonTrackList } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/StatePanel'
import { formatFollowers } from '@/utils/format'
import './pages.css'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function HomePage({
  onOpenPlaylist,
  onOpenLiked,
  onOpenRecent,
  onOpenArtist,
  onOpenLibrary,
  onSwitchClassic
}) {
  const {
    userProfile,
    playlists,
    likedSongs,
    recentlyPlayed,
    topTracks,
    topArtists,
    isLoading,
    isHomeLoading
  } = useSpotify()
  const { isPlaying, addToQueue } = usePlayback()
  const { currentTrack, currentPlaybackSource, playCollection } = useQueue()
  const { showToast } = useToast()

  const firstName = userProfile?.name?.split(' ')[0]
  const quickPlaylists = playlists.slice(0, 5)

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

  return (
    <div className="pp-page">
      <div className="pp-page-header">
        <div>
          <div className="pp-eyebrow">PixelPod Desktop</div>
          <h1 className="pp-page-title">
            {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
          </h1>
          <p className="pp-page-subtitle">
            Pick up right where you left off or spin the classic click wheel anytime.
          </p>
        </div>

        <button type="button" className="pp-btn" onClick={onSwitchClassic}>
          <Disc3 size={15} />
          <span>Launch Classic iPod</span>
        </button>
      </div>

      {/* Quick-Resume Tiles */}
      <div className="pp-quick-grid">
        <button
          type="button"
          className="pp-quick-tile pp-quick-tile--liked"
          onClick={onOpenLiked}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--pp-accent), var(--pp-accent-2))',
              color: 'var(--pp-accent-fg)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <Heart size={20} fill="currentColor" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pp-quick-tile__title">Liked Songs</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-secondary)' }}>
              {likedSongs.length > 0 ? `${likedSongs.length} saved tracks` : 'Your saved favorites'}
            </div>
          </div>
        </button>

        {quickPlaylists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className="pp-quick-tile"
            onClick={() => onOpenPlaylist(playlist)}
          >
            <Artwork src={playlist.image} alt={playlist.name} size={46} seed={playlist.id} />
            <div className="pp-quick-tile__title">{playlist.name}</div>
          </button>
        ))}
      </div>

      {/* Recently Played */}
      <section className="pp-section" aria-labelledby="home-recent-heading">
        <div className="pp-section__head">
          <h2 id="home-recent-heading" className="pp-section__title">
            Recently Played
          </h2>
          {recentlyPlayed.length > 6 && (
            <button type="button" className="pp-section__link" onClick={onOpenRecent}>
              See all
            </button>
          )}
        </div>

        {isHomeLoading && recentlyPlayed.length === 0 ? (
          <SkeletonTrackList rows={5} />
        ) : recentlyPlayed.length > 0 ? (
          <div>
            {recentlyPlayed.slice(0, 6).map((track, idx) => (
              <TrackRow
                key={`${track.id}-${idx}`}
                track={track}
                index={idx}
                isActive={currentTrack?.uri === track.uri}
                isPlaying={isPlaying}
                onPlay={() =>
                  playCollection({
                    tracks: recentlyPlayed,
                    startIndex: idx,
                    sourceLabel: 'Recently Played'
                  })
                }
                onAddToQueue={handleQueueAdd}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Play}
            title="No recent listening history yet"
            description="Play a track in PixelPod or Spotify and your recent listening history will appear here."
          />
        )}
      </section>

      {/* Your Playlists */}
      <section className="pp-section" aria-labelledby="home-playlists-heading">
        <div className="pp-section__head">
          <h2 id="home-playlists-heading" className="pp-section__title">
            Your Playlists
          </h2>
          {playlists.length > 6 && (
            <button type="button" className="pp-section__link" onClick={onOpenLibrary}>
              Browse library
            </button>
          )}
        </div>

        {isLoading && playlists.length === 0 ? (
          <SkeletonCardGrid count={6} />
        ) : playlists.length > 0 ? (
          <div className="pp-media-grid">
            {playlists.slice(0, 8).map((playlist) => {
              const active =
                isPlaying && currentPlaybackSource?.contextUri === playlist.uri
              return (
                <MediaCard
                  key={playlist.id}
                  title={playlist.name}
                  subtitle={
                    Number.isFinite(playlist.trackCount)
                      ? `${playlist.trackCount} tracks · ${playlist.owner}`
                      : playlist.owner
                  }
                  artworkUrl={playlist.image}
                  isPlaying={active}
                  onOpen={() => onOpenPlaylist(playlist)}
                  onPlay={() => onOpenPlaylist(playlist, { autoPlay: true })}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="No playlists in your library"
            description="Create or save playlists in Spotify to browse them here."
          />
        )}
      </section>

      {/* Heavy Rotation / Top Tracks */}
      {topTracks.length > 0 && (
        <section className="pp-section" aria-labelledby="home-top-tracks-heading">
          <div className="pp-section__head">
            <h2 id="home-top-tracks-heading" className="pp-section__title">
              On Repeat Right Now
            </h2>
          </div>

          <div>
            {topTracks.slice(0, 8).map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                isActive={currentTrack?.uri === track.uri}
                isPlaying={isPlaying}
                onPlay={() =>
                  playCollection({
                    tracks: topTracks,
                    startIndex: idx,
                    sourceLabel: 'On Repeat'
                  })
                }
                onAddToQueue={handleQueueAdd}
              />
            ))}
          </div>
        </section>
      )}

      {/* Top Artists */}
      {topArtists.length > 0 && (
        <section className="pp-section" aria-labelledby="home-top-artists-heading">
          <div className="pp-section__head">
            <h2 id="home-top-artists-heading" className="pp-section__title">
              Your Favorite Artists
            </h2>
          </div>

          <div className="pp-media-grid">
            {topArtists.slice(0, 6).map((artist) => (
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
    </div>
  )
}

