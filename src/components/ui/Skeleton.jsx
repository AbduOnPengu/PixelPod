import './ui.css'

export function SkeletonCardGrid({ count = 6 }) {
  return (
    <div className="pp-skeleton-grid" aria-busy="true" aria-label="Loading items">
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="pp-skeleton-card">
          <div className="pp-skeleton" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '7px' }} />
          <div className="pp-skeleton" style={{ width: '74%', height: '14px' }} />
          <div className="pp-skeleton" style={{ width: '48%', height: '11px' }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTrackList({ rows = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} aria-busy="true" aria-label="Loading tracks">
      {Array.from({ length: rows }, (_, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            height: '52px',
            padding: '0 12px'
          }}
        >
          <div className="pp-skeleton" style={{ width: '38px', height: '38px', borderRadius: '6px' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="pp-skeleton" style={{ width: `${48 + ((idx * 13) % 30)}%`, height: '13px' }} />
            <div className="pp-skeleton" style={{ width: '32%', height: '10px' }} />
          </div>
          <div className="pp-skeleton" style={{ width: '40px', height: '11px' }} />
        </div>
      ))}
    </div>
  )
}

