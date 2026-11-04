import { act, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { QueueProvider } from '../context/QueueContext'
import { PreferencesProvider } from '../context/PreferencesContext'
import { ToastProvider } from '../context/ToastContext'

const mockAuthState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  isLoggingIn: false,
  status: { authenticated: true, hasClientId: true, redirectUri: 'http://127.0.0.1:43821/callback' },
  login: vi.fn(),
  cancelLogin: vi.fn(),
  logout: vi.fn(),
  setClientId: vi.fn(),
  error: null,
  user: { display_name: 'Pixel Listener', email: 'pixel@example.com' }
}))

const mockSpotifyState = vi.hoisted(() => ({
  playlists: [],
  currentPlaylistTracks: [],
  likedSongs: [],
  savedAlbums: [],
  recentlyPlayed: [],
  topTracks: [],
  topArtists: [],
  searchResults: { tracks: [], albums: [], artists: [], playlists: [] },
  selectedPlaylist: null,
  selectedAlbum: null,
  selectedArtist: null,
  userProfile: { name: 'Pixel Listener', email: 'pixel@example.com', product: 'premium' },
  isLoading: false,
  isHomeLoading: false,
  error: null,
  fetchPlaylists: vi.fn(),
  fetchPlaylistTracks: vi.fn(),
  fetchLikedSongs: vi.fn(),
  fetchSavedAlbums: vi.fn(),
  fetchRecentlyPlayed: vi.fn(),
  fetchHomeDiscovery: vi.fn(),
  selectPlaylist: vi.fn(),
  openAlbum: vi.fn(),
  openArtist: vi.fn(),
  searchAll: vi.fn(),
  clearSearch: vi.fn(),
  fetchUserProfile: vi.fn(),
  resetLibrary: vi.fn()
}))

const mockPlaybackState = vi.hoisted(() => ({
  isReady: true,
  isPlaying: false,
  isLoading: false,
  currentProgress: 12000,
  duration: 210000,
  volume: 65,
  shuffleEnabled: false,
  repeatMode: 'off',
  playbackMode: 'sdk',
  sdkDeviceId: 'sdk-device-1',
  deviceId: 'sdk-device-1',
  activeDeviceName: 'PixelPod (This Computer)',
  devices: [],
  remoteQueue: [],
  currentTrack: null,
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  togglePlayPause: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  seek: vi.fn(),
  toggleShuffle: vi.fn(),
  cycleRepeatMode: vi.fn(),
  setVolume: vi.fn(),
  selectDevice: vi.fn(),
  refreshDevices: vi.fn(),
  refreshRemoteQueue: vi.fn(),
  addToQueue: vi.fn(),
  error: null
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState
}))

vi.mock('../context/SpotifyContext', () => ({
  useSpotify: () => mockSpotifyState
}))

vi.mock('../context/PlaybackContext', () => ({
  usePlayback: () => mockPlaybackState
}))

vi.mock('../utils/sounds', () => ({
  playClickSound: vi.fn(),
  playSelectSound: vi.fn(),
  playBackSound: vi.fn(),
  initAudio: vi.fn()
}))

function renderDesktopApp() {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        <QueueProvider>
          <App />
        </QueueProvider>
      </ToastProvider>
    </PreferencesProvider>
  )
}

describe('Desktop App integration', () => {
  const samplePlaylist = {
    id: 'playlist-1',
    uri: 'spotify:playlist:playlist-1',
    name: 'Midnight Drive',
    description: 'Late-night synthwave',
    trackCount: 1,
    image: null,
    owner: 'Pixel Listener'
  }

  const sampleTrack = {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    title: 'Nightcall',
    artist: 'Kavinsky',
    album: 'OutRun',
    albumArt: null,
    albumArtSmall: null,
    duration: 258000
  }

  beforeEach(() => {
    Object.assign(mockAuthState, {
      isAuthenticated: true,
      isLoading: false,
      isLoggingIn: false,
      login: vi.fn(),
      logout: vi.fn(),
      setClientId: vi.fn(),
      error: null
    })

    Object.assign(mockSpotifyState, {
      playlists: [samplePlaylist],
      currentPlaylistTracks: [sampleTrack],
      likedSongs: [sampleTrack],
      recentlyPlayed: [sampleTrack],
      topTracks: [],
      topArtists: [],
      selectedPlaylist: null,
      fetchPlaylists: vi.fn(),
      fetchLikedSongs: vi.fn(),
      fetchHomeDiscovery: vi.fn(),
      fetchUserProfile: vi.fn(),
      selectPlaylist: vi.fn(async (pl) => {
        mockSpotifyState.selectedPlaylist = pl
        return mockSpotifyState.currentPlaylistTracks
      })
    })

    Object.assign(mockPlaybackState, {
      isReady: true,
      isPlaying: false,
      currentTrack: null,
      play: vi.fn(),
      togglePlayPause: vi.fn()
    })
  })

  it('hydrates library on mount and navigates across Sidebar pages with Back/Forward support', async () => {
    renderDesktopApp()

    expect(mockSpotifyState.fetchUserProfile).toHaveBeenCalled()
    expect(mockSpotifyState.fetchPlaylists).toHaveBeenCalled()
    expect(mockSpotifyState.fetchLikedSongs).toHaveBeenCalled()
    expect(mockSpotifyState.fetchHomeDiscovery).toHaveBeenCalled()

    // Navigate to Your Library
    fireEvent.click(screen.getByRole('button', { name: /Your Library/i }))
    expect(screen.getByRole('heading', { name: 'Your Library' })).toBeInTheDocument()

    // Navigate to Settings
    fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()

    // Use TitleBar Back button
    fireEvent.click(screen.getByRole('button', { name: 'Navigate back' }))
    expect(screen.getByRole('heading', { name: 'Your Library' })).toBeInTheDocument()
  })

  it('plays a track from Home and synchronizes the persistent bottom PlayerBar', async () => {
    renderDesktopApp()

    const trackRow = screen.getByRole('row', { name: /Nightcall by Kavinsky/i })
    await act(async () => {
      fireEvent.click(trackRow)
    })

    expect(mockPlaybackState.play).toHaveBeenCalledWith(
      'spotify:track:track-1',
      null,
      0,
      ['spotify:track:track-1']
    )

    // Persistent bottom player shows the selected track
    expect(screen.getByRole('button', { name: 'Nightcall' })).toBeInTheDocument()
  })

  it('switches into Classic iPod Mode and preserves shared playback state', async () => {
    mockPlaybackState.currentTrack = sampleTrack
    renderDesktopApp()

    fireEvent.click(screen.getByRole('button', { name: 'Launch Classic iPod' }))

    // Classic iPod rotary SELECT button is mounted inside the desktop shell
    expect(screen.getByRole('button', { name: 'SELECT' })).toBeInTheDocument()

    // Return to Desktop View
    fireEvent.click(screen.getByRole('button', { name: /Desktop View/i }))
    expect(screen.getByRole('button', { name: 'Launch Classic iPod' })).toBeInTheDocument()
  })

  it('renders the PKCE onboarding screen with Client ID validation when signed out', async () => {
    mockAuthState.isAuthenticated = false
    mockAuthState.status = {
      authenticated: false,
      hasClientId: false,
      redirectUri: 'http://127.0.0.1:43821/callback'
    }

    renderDesktopApp()

    expect(screen.getByRole('heading', { name: 'Welcome to PixelPod' })).toBeInTheDocument()
    expect(screen.getByText('http://127.0.0.1:43821/callback')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Connect with Spotify/i }))
    expect(
      screen.getByText(/Enter a valid 32-character hexadecimal Spotify Client ID/i)
    ).toBeInTheDocument()
  })
})
