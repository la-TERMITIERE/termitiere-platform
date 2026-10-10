// Numéro de document (PREST-KARA-2026-000153) sur deux lignes courtes : le préfixe en petit
// au-dessus, l'année et le compteur dessous. Évite les numéros coupés en 4 lignes sur mobile.
export default function NumDoc({ num, className = '' }) {
  const n = String(num || '')
  const parts = n.split('-')
  if (parts.length < 4) return <span className={`whitespace-nowrap font-mono text-[11px] ${className}`}>{n || ':'}</span>
  return (
    <span className={`inline-block whitespace-nowrap font-mono text-[11px] leading-tight ${className}`}>
      <span className="block text-[9px] font-bold tracking-wide text-gray-400">{parts.slice(0, -2).join('-')}</span>
      <span className="font-semibold">{parts.slice(-2).join('-')}</span>
    </span>
  )
}
