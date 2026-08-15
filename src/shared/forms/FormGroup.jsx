// Groupe de formulaire : label + champ + message d'erreur optionnel.
export default function FormGroup({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && (
        <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}
