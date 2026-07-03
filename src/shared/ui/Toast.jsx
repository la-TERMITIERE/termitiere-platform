// Conteneur de toasts global (à monter une fois dans App).
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useNotifStore } from '../../core/notifications'

const CONF = {
  success: { icon: CheckCircle, cls: 'border-green-500 bg-green-50 text-green-800' },
  error: { icon: XCircle, cls: 'border-red-500 bg-red-50 text-red-800' },
  warning: { icon: AlertTriangle, cls: 'border-amber-500 bg-amber-50 text-amber-800' },
  info: { icon: Info, cls: 'border-sky-500 bg-sky-50 text-sky-800' }
}

export default function ToastContainer() {
  const { toasts, dismiss } = useNotifStore()
  return (
    <div className="fixed left-1/2 top-3 z-[60] flex w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:translate-x-0">
      {toasts.map((t) => {
        const c = CONF[t.type] || CONF.info
        const Icon = c.icon
        return (
          <div
            key={t.id}
            role="alert"
            className={`toast-enter flex items-start gap-3 rounded-lg border-l-4 bg-white p-3 shadow-lg ${c.cls}`}
          >
            <Icon size={20} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Fermer" className="text-current/60 hover:text-current">
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
