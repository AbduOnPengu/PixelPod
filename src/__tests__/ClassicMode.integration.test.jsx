import { act, fireEvent, render, screen } from '@testing-library/react'
import ClassicModePage from '../pages/ClassicModePage'
import { QueueProvider } from '../context/QueueContext'
import { PreferencesProvider } from '../context/PreferencesContext'

const mockAuthState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  error: null
}))

const mockSpotifyState = vi.hoisted(() => ({
  playlists: [],
  currentPlaylistTracks: [],
  likedSongs: [],
  searchResults: { tracks: [], albums: [], artists: [], playlists: [] },
  selectedPlaylist: null,
  userProfile: { name: 'Pixel Listener', email: 'pixel@example.com' },
  isLoading: false,
  error: null,
  fetchPlaylists: vi.fn(),
  fetchLikedSongs: vi.fn(),
  selectPlaylist: vi.fn(),
  searchAll: vi.fn(),
  fetchUserProfile: vi.fn()
}))

const mockPlaybackState = vi.hoisted(() => ({
  isReady: true,
  isPlaying: false,
  isLoading: false,
  currentProgress: 6000,
  duration: 201000,
  volume: 50,
  shuffleEnabled: false,
  repeatMode: 'off',
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

function renderClassic() {
  return render(
    <PreferencesProvider>
      <QueueProvider>
        <ClassicModePage skipBoot={false} />
      </QueueProvider>
    </PreferencesProvider>
  )
}

function advanceToSettledScreen(ms = 2400) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

async function clickControl(name) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
    await Promise.resolve()
  })
}

function pressKey(key) {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

describe('Classic iPod Mode integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    const playlist = {
      id: 'playlist-1',
      uri: 'spotify:playlist:playlist-1',
      name: 'Favorites',
      trackCount: 2,
      image: null,
      owner: 'Pixel Listener'
    }

    const track = {
      id: 'track-1',
      uri: 'spotify:track:track-1',
      title: 'Clarity',
      artist: 'Zedd, Foxes',
      album: 'Clarity',
      albumArt: null,
      albumArtSmall: null
    }

    Object.assign(mockAuthState, {
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      error: null
    })

    Object.assign(mockSpotifyState, {
      playlists: [playlist],
      currentPlaylistTracks: [track],
      likedSongs: [track],
      searchResults: { tracks: [], albums: [], artists: [], playlists: [] },
      selectedPlaylist: null,
      userProfile: { name: 'Pixel Listener', email: 'pixel@example.com' },
      isLoading: false,
      error: null,
      fetchPlaylists: vi.fn(),
      fetchLikedSongs: vi.fn(),
      selectPlaylist: vi.fn(async (selectedPlaylist) => {
        mockSpotifyState.selectedPlaylist = selectedPlaylist
        return mockSpotifyState.currentPlaylistTracks
      }),
      searchAll: vi.fn(),
      fetchUserProfile: vi.fn()
    })

    Object.assign(mockPlaybackState, {
      isReady: true,
      isPlaying: false,
      isLoading: false,
      currentProgress: 6000,
      duration: 201000,
      volume: 50,
      shuffleEnabled: false,
      repeatMode: 'off',
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
      error: null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('supports keyboard navigation into Settings and back out to the main menu', () => {
    renderClassic()

    advanceToSettledScreen()
    pressKey('ArrowDown')
    pressKey('ArrowDown')
    pressKey('Enter')
    advanceToSettledScreen(400)

    expect(screen.getByText('Version 2.0.0')).toBeInTheDocument()

    pressKey('Escape')
    advanceToSettledScreen(400)

    expect(screen.getByText('Music')).toBeInTheDocument()
  })

  it('navigates from playlists into Now Playing and starts playback with playlist context', async () => {
    renderClassic()

    advanceToSettledScreen()
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    await clickControl('SELECT')
    advanceToSettledScreen(400)

    await clickControl('SELECT')
    advanceToSettledScreen(400)

    mockSpotifyState.selectedPlaylist = mockSpotifyState.playlists[0]
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    expect(mockSpotifyState.selectPlaylist).toHaveBeenCalledWith(mockSpotifyState.playlists[0])
    expect(mockPlaybackState.play).toHaveBeenCalledWith(
      'spotify:track:track-1',
      'spotify:playlist:playlist-1',
      0
    )
    expect(screen.getByText('Now Playing')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('toggles liked songs shuffle locally without restarting the current song', async () => {
    mockPlaybackState.isPlaying = true

    renderClassic()

    advanceToSettledScreen()
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    pressKey('ArrowDown')
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    await clickControl('SELECT')
    advanceToSettledScreen(400)

    expect(mockPlaybackState.play).toHaveBeenCalledTimes(1)
    expect(mockPlaybackState.play).toHaveBeenCalledWith(
      'spotify:track:track-1',
      null,
      0,
      ['spotify:track:track-1']
    )

    await clickControl('Shuffle off')

    expect(mockPlaybackState.toggleShuffle).toHaveBeenCalledWith({
      syncRemote: false,
      forceState: true
    })
    expect(mockPlaybackState.play).toHaveBeenCalledTimes(2)
    expect(mockPlaybackState.play).toHaveBeenLastCalledWith(
      'spotify:track:track-1',
      null,
      0,
      ['spotify:track:track-1'],
      6000
    )

    await clickControl('Shuffle on')

    expect(mockPlaybackState.toggleShuffle).toHaveBeenLastCalledWith({
      syncRemote: false,
      forceState: false
    })
    expect(mockPlaybackState.play).toHaveBeenCalledTimes(3)
    expect(mockPlaybackState.play).toHaveBeenLastCalledWith(
      'spotify:track:track-1',
      null,
      0,
      ['spotify:track:track-1'],
      6000
    )
  })

  it('turns off remote shuffle before starting liked songs queue playback', async () => {
    mockPlaybackState.shuffleEnabled = true

    renderClassic()

    advanceToSettledScreen()
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    pressKey('ArrowDown')
    await clickControl('SELECT')
    advanceToSettledScreen(400)

    await clickControl('SELECT')
    advanceToSettledScreen(400)

    expect(mockPlaybackState.toggleShuffle).toHaveBeenCalledWith({
      syncRemote: true,
      forceState: false
    })
    expect(mockPlaybackState.play).toHaveBeenCalledWith(
      'spotify:track:track-1',
      null,
      0,
      ['spotify:track:track-1']
    )
  })
})

