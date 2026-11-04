import { AlertTriangle, Music2 } from 'lucide-react'
import './ui.css'

export function EmptyState({ icon: Icon = Music2, title, description, actionLabel, onAction }) {
  return (
    <div className="pp-state">
      <div className="pp-state__icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div className="pp-state__title">{title}</div>
      {description && <p className="pp-state__desc">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="pp-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', description, actionLabel = 'Try again', onAction }) {
  return (
    <div className="pp-state pp-state--error" role="alert">
      <div className="pp-state__icon" aria-hidden="true">
        <AlertTriangle size={20} />
      </div>
      <div className="pp-state__title">{title}</div>
      {description && <p className="pp-state__desc">{description}</p>}
      {onAction && (
        <button type="button" className="pp-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

