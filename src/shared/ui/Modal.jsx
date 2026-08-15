// Fenêtre modale accessible. Fermeture par overlay, croix ou touche Échap.
import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export default function Modal({ open, onClose, title, children, footer, size = 'md', panelClassName = 'bg-white dark:bg-[#1d2226]', overlayClassName = 'bg-black/50', panelStyle, overlayStyle }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${overlayClassName}`}
      style={overlayStyle}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${SIZES[size]} ${panelClassName} rounded-t-2xl sm:rounded-2xl shadow-xl
          max-h-[92vh] flex flex-col`}
        style={panelStyle}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-white/10">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-gray-800 dark:text-gray-100">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-white/10">{footer}</div>
        )}
      </div>
    </div>
  )
}
