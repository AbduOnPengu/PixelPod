import {
  cancelSpotifyLogin,
  clearAuthSession,
  completeLogin,
  restoreAuthSession
} from '../authService'

const mockSpotifyAuth = vi.hoisted(() => ({
  getAuthStatus: vi.fn(),
  getValidToken: vi.fn(),
  initiateLogin: vi.fn(),
  cancelLogin: vi.fn(),
  clearTokens: vi.fn()
}))

vi.mock('../../utils/spotifyAuth', () => mockSpotifyAuth)

describe('authService', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('returns unauthenticated without error when no desktop session exists', async () => {
    mockSpotifyAuth.getAuthStatus.mockResolvedValue({ authenticated: false, hasClientId: true })

    await expect(restoreAuthSession()).resolves.toEqual({
      isAuthenticated: false,
      user: null,
      error: null,
      status: { authenticated: false, hasClientId: true }
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an expired-session message when a stored grant is rejected on refresh', async () => {
    mockSpotifyAuth.getAuthStatus
      .mockResolvedValueOnce({ authenticated: true, hasClientId: true })
      .mockResolvedValueOnce({ authenticated: false, hasClientId: true })
    mockSpotifyAuth.getValidToken.mockResolvedValue(null)

    await expect(restoreAuthSession()).resolves.toEqual({
      isAuthenticated: false,
      user: null,
      error: 'Login expired. Connect Spotify again.',
      status: { authenticated: false, hasClientId: true }
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('restores the authenticated user profile when a valid token exists', async () => {
    const status = { authenticated: true, hasClientId: true }
    mockSpotifyAuth.getAuthStatus.mockResolvedValue(status)
    mockSpotifyAuth.getValidToken.mockResolvedValue('access-token')
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'user-1', display_name: 'Pixel Listener' })
    })

    await expect(restoreAuthSession()).resolves.toEqual({
      isAuthenticated: true,
      user: { id: 'user-1', display_name: 'Pixel Listener' },
      error: null,
      status
    })

    expect(fetch).toHaveBeenCalledWith('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: 'Bearer access-token'
      }
    })
  })

  it('completes the PKCE login flow via the main process and fetches the profile', async () => {
    const status = { authenticated: true, hasClientId: true }
    mockSpotifyAuth.initiateLogin.mockResolvedValue(status)
    mockSpotifyAuth.getValidToken.mockResolvedValue('fresh-token')
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'user-2', display_name: 'Fresh Session' })
    })

    await expect(completeLogin()).resolves.toEqual({
      isAuthenticated: true,
      user: { id: 'user-2', display_name: 'Fresh Session' },
      error: null,
      status
    })

    expect(mockSpotifyAuth.initiateLogin).toHaveBeenCalledTimes(1)
  })

  it('delegates cancel and logout actions to the auth bridge', async () => {
    mockSpotifyAuth.cancelLogin.mockResolvedValue(undefined)
    mockSpotifyAuth.clearTokens.mockResolvedValue(undefined)

    await cancelSpotifyLogin()
    await clearAuthSession()

    expect(mockSpotifyAuth.cancelLogin).toHaveBeenCalledTimes(1)
    expect(mockSpotifyAuth.clearTokens).toHaveBeenCalledTimes(1)
  })
})
