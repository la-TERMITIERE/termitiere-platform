// Pastilles « Par tranche » / « Totalité » (et autres couples Oui/Non à deux
// tons) — dégradé plein + halo lumineux une fois active, cliquer sur celle déjà
// active l'annule (retour à aucun choix) plutôt que de forcer un choix. Partagé
// entre Enfants.jsx (paiement saisi à l'inscription) et Paiements.jsx (même
// bascule quand le paiement est réglé après coup).
export function toggleScolariteClass(active, tone) {
  const plein = tone === 'blue'
    ? 'bg-gradient-to-br from-sky-400 to-blue-600 shadow-[0_6px_18px_-4px_rgba(2,132,199,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
    : 'bg-gradient-to-br from-green-400 to-emerald-600 shadow-[0_6px_18px_-4px_rgba(34,197,94,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
  return `inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${active
    ? `scale-105 text-white ${plein}`
    : 'border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:shadow-sm'}`
}
