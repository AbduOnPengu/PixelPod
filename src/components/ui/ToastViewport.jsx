import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import './ui.css'

export default function ToastViewport() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="pp-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error'
              ? AlertCircle
              : Info

        return (
          <div key={toast.id} className={`pp-toast pp-toast--${toast.tone}`}>
            <Icon
              size={17}
              style={{
                marginTop: 1,
                flexShrink: 0,
                color:
                  toast.tone === 'success'
                    ? 'var(--status-success)'
                    : toast.tone === 'error'
                      ? 'var(--status-danger)'
                      : 'var(--pp-accent)'
              }}
            />
            <div className="pp-toast__body">
              <div className="pp-toast__title">{toast.title}</div>
              {toast.description && <div className="pp-toast__desc">{toast.description}</div>}
            </div>
            <button
              type="button"
              className="pp-icon-btn"
              style={{ width: 24, height: 24 }}
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

