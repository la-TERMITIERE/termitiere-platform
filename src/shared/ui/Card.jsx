// Conteneur "carte" en verre dépoli (glassmorphism) avec coins arrondis et ombre douce.
export default function Card({ children, className = '', title, action, ...props }) {
  return (
    <div className={`card p-4 md:p-5 ${className}`} {...props}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-base font-bold text-gray-800">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
