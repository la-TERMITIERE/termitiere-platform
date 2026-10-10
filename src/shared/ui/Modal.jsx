// Fenêtre modale accessible. Fermeture par overlay, croix ou touche Échap.
import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export default function Modal({ open, onClose, title, children, footer, size = 'md', panelClassName = 'bg-white/90 dark:bg-[#1d2226]/95 border border-white/70 dark:border-white/10 backdrop-blur-2xl', overlayClassName = 'bg-black/40 backdrop-blur-md', panelStyle, overlayStyle }) {
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
        className={`modal-glass relative w-full ${SIZES[size]} ${panelClassName} overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-2xl
          max-h-[92vh] flex flex-col`}
        style={panelStyle}
      >
        {/* Reflet de verre en haut de la fenêtre. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/60 to-transparent dark:from-white/5" />
        <div className="relative flex items-center justify-between border-b border-white/60 bg-white/30 px-5 py-3 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative overflow-y-auto px-5 py-4 text-gray-800 dark:text-gray-100">{children}</div>
        {footer && (
          <div className="relative flex justify-end gap-2 border-t border-white/60 bg-white/40 px-5 py-3 backdrop-blur-md dark:border-white/10 dark:bg-white/5">{footer}</div>
        )}
      </div>
    </div>
  )
}
