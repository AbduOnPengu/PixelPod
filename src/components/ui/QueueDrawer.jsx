import { useEffect, useState } from 'react'
import { X, RefreshCw, Speaker, Smartphone, Laptop, Check } from 'lucide-react'
import { usePlayback } from '@/context/PlaybackContext'
import { useQueue } from '@/context/QueueContext'
import { useToast } from '@/context/ToastContext'
import Artwork from './Artwork'
import { EmptyState } from './StatePanel'
import { formatDuration } from '@/utils/format'
import './ui.css'

function DeviceIcon({ type = '' }) {
  const normalized = type.toLowerCase()
  if (normalized.includes('smartphone') || normalized.includes('phone')) {
    return <Smartphone size={16} />
  }
  if (normalized.includes('computer')) {
    return <Laptop size={16} />
  }
  return <Speaker size={16} />
}

export default function QueueDrawer({ open, initialTab = 'queue', onClose }) {
  const [tab, setTab] = useState(initialTab)
  const {
    isPlaying,
    deviceId,
    sdkDeviceId,
    playbackMode,
    sdkFallbackReason,
    devices,
    activeDeviceName,
    remoteQueue,
    selectDevice,
    refreshDevices,
    refreshRemoteQueue
  } = usePlayback()
  const {
    currentTrack,
    currentTrackList,
    currentTrackIndex,
    currentPlaybackSource,
    playCollection,
    playSingleTrack
  } = useQueue()
  const { showToast } = useToast()

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab, open])

  useEffect(() => {
    if (!open) return
    if (tab === 'devices') {
      refreshDevices()
    } else {
      refreshRemoteQueue()
    }
  }, [open, tab, refreshDevices, refreshRemoteQueue])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const localUpNext =
    currentTrackList.length > 1
      ? currentTrackList.slice(currentTrackIndex + 1, currentTrackIndex + 25)
      : []
  const upcomingTracks = localUpNext.length > 0 ? localUpNext : remoteQueue.slice(0, 25)

  const handlePickDevice = async (targetId, name) => {
    await selectDevice(targetId)
    showToast({
      title: 'Playback device updated',
      description: `Connected to ${name}`,
      tone: 'success'
    })
  }

  return (
    <div
      className="pp-drawer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <aside className="pp-drawer" aria-label="Queue and playback devices">
        <div className="pp-drawer__header">
          <div className="pp-drawer__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'queue'}
              className={`pp-drawer__tab ${tab === 'queue' ? 'pp-drawer__tab--active' : ''}`}
              onClick={() => setTab('queue')}
            >
              Queue
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'devices'}
              className={`pp-drawer__tab ${tab === 'devices' ? 'pp-drawer__tab--active' : ''}`}
              onClick={() => setTab('devices')}
            >
              Devices
            </button>
          </div>
          <button
            type="button"
            className="pp-icon-btn"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="pp-drawer__content">
          {tab === 'queue' ? (
            <>
              <div>
                <div className="pp-drawer__section-label">Now Playing</div>
                {currentTrack ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-default)'
                    }}
                  >
                    <Artwork
                      src={currentTrack.albumArtSmall || currentTrack.albumArt}
                      alt={currentTrack.title}
                      size={46}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--pp-accent)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {currentTrack.title}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {currentTrack.artist}
                      </div>
                    </div>
                    {isPlaying && (
                      <span className="pp-eq" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title="Nothing playing yet"
                    description="Choose a playlist, album, or track to start your queue."
                  />
                )}
              </div>

              {upcomingTracks.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}
                  >
                    <span className="pp-drawer__section-label" style={{ marginBottom: 0 }}>
                      Next Up
                      {currentPlaybackSource?.label ? ` · ${currentPlaybackSource.label}` : ''}
                    </span>
                    <button
                      type="button"
                      className="pp-icon-btn"
                      title="Refresh queue"
                      aria-label="Refresh queue"
                      onClick={() => refreshRemoteQueue()}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {upcomingTracks.map((track, idx) => (
                      <div
                        key={`${track.id || track.uri}-${idx}`}
                        className="pp-track-row pp-track-row--compact"
                        style={{ height: '46px', padding: '0 8px' }}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (localUpNext.length > 0) {
                            const targetIndex = currentTrackIndex + 1 + idx
                            playCollection({
                              tracks: currentTrackList,
                              startIndex: targetIndex,
                              contextUri: currentPlaybackSource?.contextUri || null,
                              sourceLabel: currentPlaybackSource?.label || null
                            })
                          } else {
                            playSingleTrack(track)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            playSingleTrack(track)
                          }
                        }}
                      >
                        <span className="pp-track-row__index">{idx + 1}</span>
                        <div className="pp-track-row__main">
                          <Artwork
                            src={track.albumArtSmall || track.albumArt}
                            alt={track.title}
                            size={34}
                          />
                          <div className="pp-track-row__meta">
                            <div className="pp-track-row__title">{track.title}</div>
                            <div className="pp-track-row__artist">{track.artist}</div>
                          </div>
                        </div>
                        <span className="pp-track-row__duration">
                          {formatDuration(track.duration)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div className="pp-drawer__section-label" style={{ marginBottom: 2 }}>
                    Active Output
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    {activeDeviceName || 'Waiting for Spotify device'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                    Mode: {playbackMode === 'sdk' ? 'Built-in PixelPod Player' : 'Spotify Connect'}
                  </div>
                </div>
                <button
                  type="button"
                  className="pp-btn pp-btn--ghost"
                  onClick={() => refreshDevices()}
                >
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </button>
              </div>

              {sdkFallbackReason && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(245, 158, 11, 0.09)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--fg-secondary)'
                  }}
                >
                  {sdkFallbackReason}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="pp-drawer__section-label" style={{ marginBottom: 0 }}>
                  Available Spotify Devices
                </div>

                {sdkDeviceId && !devices.some((d) => d.id === sdkDeviceId) && (
                  <button
                    type="button"
                    className={`pp-device-item ${
                      deviceId === sdkDeviceId ? 'pp-device-item--active' : ''
                    }`}
                    onClick={() => handlePickDevice(sdkDeviceId, 'PixelPod (This Computer)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Laptop size={16} />
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                          PixelPod (This Computer)
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-secondary)' }}>
                          Built-in desktop audio
                        </div>
                      </div>
                    </div>
                    {deviceId === sdkDeviceId && <Check size={16} color="var(--pp-accent)" />}
                  </button>
                )}

                {devices.length === 0 && !sdkDeviceId ? (
                  <EmptyState
                    icon={Speaker}
                    title="No active Spotify devices found"
                    description="Open the Spotify app on your desktop, phone, or speaker and click Refresh."
                    actionLabel="Refresh devices"
                    onAction={refreshDevices}
                  />
                ) : (
                  devices.map((dev) => {
                    const selected = dev.id === deviceId || dev.is_active
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        className={`pp-device-item ${selected ? 'pp-device-item--active' : ''}`}
                        onClick={() => handlePickDevice(dev.id, dev.name)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <DeviceIcon type={dev.type} />
                          <div>
                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                              {dev.name}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-secondary)' }}>
                              {dev.type}
                              {typeof dev.volume_percent === 'number'
                                ? ` · ${dev.volume_percent}%`
                                : ''}
                            </div>
                          </div>
                        </div>
                        {selected && <Check size={16} color="var(--pp-accent)" />}
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

