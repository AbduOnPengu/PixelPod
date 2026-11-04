import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockGetAccessToken = vi.fn()
const mockLogout = vi.fn()

vi.mock('@/desktop/bridge', () => ({
  desktop: {
    isDesktop: true,
    auth: {
      getAccessToken: (...args) => mockGetAccessToken(...args),
      getStatus: vi.fn(async () => ({ authenticated: true, hasClientId: true })),
      login: vi.fn(async () => ({ authenticated: true })),
      cancelLogin: vi.fn(async () => {}),
      logout: (...args) => mockLogout(...args)
    }
  }
}))

import {
  getTokenInfo,
  getValidToken,
  resetTokenCache,
  tokenHasScopes,
  clearTokens
} from '@/utils/spotifyAuth'
import useNavigation from '@/hooks/useNavigation'
import useQueueManager from '@/hooks/useQueueManager'

describe('Renderer spotifyAuth Token Cache', () => {
  beforeEach(() => {
    resetTokenCache()
    mockGetAccessToken.mockReset()
    mockLogout.mockReset()
  })

  it('caches fresh tokens in memory and refreshes when forced or expired', async () => {
    mockGetAccessToken
      .mockResolvedValueOnce({
        accessToken: 'tok-1',
        expiresAt: Date.now() + 600_000,
        scope: 'streaming user-read-private'
      })
      .mockResolvedValueOnce({
        accessToken: 'tok-2',
        expiresAt: Date.now() + 600_000,
        scope: 'streaming user-read-private'
      })

    const first = await getTokenInfo()
    const second = await getTokenInfo()
    expect(first.accessToken).toBe('tok-1')
    expect(second.accessToken).toBe('tok-1')
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1)

    const forced = await getTokenInfo({ forceRefresh: true })
    expect(forced.accessToken).toBe('tok-2')
    expect(mockGetAccessToken).toHaveBeenCalledWith({ forceRefresh: true })

    expect(tokenHasScopes(forced.scope, ['streaming', 'user-read-private'])).toBe(true)
    expect(tokenHasScopes(forced.scope, ['user-top-read'])).toBe(false)

    await clearTokens()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('returns null from getValidToken instead of throwing on IPC errors', async () => {
    mockGetAccessToken.mockRejectedValueOnce(new Error('IPC offline'))
    expect(await getValidToken()).toBeNull()
  })
})

describe('useNavigation Hook (Classic iPod Hierarchy)', () => {
  it('pushes and restores screen + selectedIndex history and builds status entries', () => {
    const selectPlaylist = vi.fn()
    const { result, rerender } = renderHook(
      (props) => useNavigation(props),
      {
        initialProps: {
          playlists: [{ id: 'p1', name: 'Synthwave' }, { id: 'p2', name: 'Focus' }],
          currentPlaylistTracks: [],
          likedSongs: [],
          searchResults: { tracks: [] },
          spotifyLoading: false,
          spotifyError: null,
          authError: null,
          selectPlaylist
        }
      }
    )

    act(() => result.current.setCurrentScreen('main'))
    expect(result.current.getMenuItems()).toEqual(['Music', 'Now Playing', 'Settings'])

    // Move selection to index 2 ('Settings') then navigate forward
    act(() => {
      result.current.handleNext()
      result.current.handleNext()
    })
    expect(result.current.selectedIndex).toBe(2)

    act(() => result.current.navigateForward('settings'))
    expect(result.current.currentScreen).toBe('settings')
    expect(result.current.selectedIndex).toBe(0)

    // Going back restores both 'main' and selectedIndex 2
    act(() => result.current.handleBack())
    expect(result.current.currentScreen).toBe('main')
    expect(result.current.selectedIndex).toBe(2)

    // Expired auth error builds an AUTH status item
    rerender({
      playlists: [],
      currentPlaylistTracks: [],
      likedSongs: [],
      searchResults: { tracks: [] },
      spotifyLoading: false,
      spotifyError: 'Session token expired',
      authError: null,
      selectPlaylist
    })
    act(() => result.current.navigateForward('playlists'))
    expect(result.current.getMenuItems()[0]).toMatchObject({
      type: 'status',
      code: 'AUTH',
      title: 'Login Expired'
    })
  })
})

describe('useQueueManager Hook', () => {
  const sampleTracks = [
    { id: 't1', title: 'One', uri: 'spotify:track:1' },
    { id: 't2', title: 'Two', uri: 'spotify:track:2' },
    { id: 't3', title: 'Three', uri: 'spotify:track:3' }
  ]

  it('rotates linear queues from the selected track and keeps selected track first when shuffled', () => {
    const play = vi.fn(async () => {})
    const toggleShuffle = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useQueueManager({
        playbackTrack: null,
        playbackReady: true,
        play,
        next: vi.fn(),
        previous: vi.fn(),
        toggleShuffle,
        shuffleEnabled: false,
        isPlaying: false,
        currentProgress: 0
      })
    )

    const linear = result.current.createLikedSongsQueue(sampleTracks, 't2', false)
    expect(linear.map((t) => t.id)).toEqual(['t2', 't3', 't1'])

    const shuffled = result.current.createLikedSongsQueue(sampleTracks, 't3', true)
    expect(shuffled[0].id).toBe('t3')
    expect(shuffled).toHaveLength(3)
  })

  it('plays collections via contextUri or custom queue and skips forward/back cleanly', async () => {
    const play = vi.fn(async () => {})
    const toggleShuffle = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useQueueManager({
        playbackTrack: null,
        playbackReady: true,
        play,
        next: vi.fn(),
        previous: vi.fn(),
        toggleShuffle,
        shuffleEnabled: true,
        isPlaying: true,
        currentProgress: 1200
      })
    )

    // Custom queue playback disables remote Spotify shuffle first so custom URI order wins
    await act(async () => {
      await result.current.playCollection({
        tracks: sampleTracks,
        startIndex: 1,
        sourceLabel: 'Liked Songs'
      })
    })

    expect(toggleShuffle).toHaveBeenCalledWith({ syncRemote: true, forceState: false })
    expect(play).toHaveBeenCalledWith(
      'spotify:track:2',
      null,
      0,
      ['spotify:track:2', 'spotify:track:3', 'spotify:track:1']
    )
    expect(result.current.currentTrack.id).toBe('t2')

    // Skip forward rotates queue to t3
    act(() => result.current.handleSkipForward())
    expect(result.current.currentTrack.id).toBe('t3')

    // Context playback uses native playlist contextUri + offset
    play.mockClear()
    await act(async () => {
      await result.current.playCollection({
        tracks: sampleTracks,
        startIndex: 2,
        contextUri: 'spotify:playlist:abc',
        sourceLabel: 'Roadtrip'
      })
    })
    expect(play).toHaveBeenCalledWith('spotify:track:3', 'spotify:playlist:abc', 2)

    act(() => result.current.resetQueue())
    expect(result.current.currentTrack).toBeNull()
    expect(result.current.currentTrackList).toEqual([])
  })
})

