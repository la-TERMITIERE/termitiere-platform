// Filtre de période réutilisable : un sélecteur de granularité (Jour / Mois /
// Plage personnalisée) suivi du ou des champs de saisie correspondants — au lieu
// de champs séparés à remplir/effacer indépendamment. Utilisé par Sources de
// revenus (E-DÉPENSES) et Facturation/Prestations (MAXI LOGISTIQUE) pour que le
// même filtre se comporte et se présente identiquement d'un écran à l'autre.
// `avecPlage` (opt-in, false par défaut) ajoute le mode « Plage personnalisée »
// (du/au) — les écrans qui ne fournissent pas `valeurDebut/valeurFin` n'affichent
// pas cette option et ne sont donc pas affectés.
import Select from '../forms/Select'

export default function FiltrePeriode({
  label = 'Période',
  mode, onModeChange,
  valeurJour, onJourChange,
  valeurMois, onMoisChange,
  avecPlage = false,
  valeurDebut, onDebutChange,
  valeurFin, onFinChange
}) {
  const valeurActive = mode === 'mois' ? valeurMois : mode === 'plage' ? (valeurDebut || valeurFin) : valeurJour
  const effacer = () => {
    if (mode === 'mois') onMoisChange('')
    else if (mode === 'plage') { onDebutChange?.(''); onFinChange?.('') }
    else onJourChange('')
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select className="w-[88px]" value={mode} onChange={(e) => onModeChange(e.target.value)}>
          <option value="jour">Jour</option>
          <option value="mois">Mois</option>
          {avecPlage && <option value="plage">Plage…</option>}
        </Select>
        {mode === 'mois' ? (
          <input type="month" value={valeurMois} onChange={(e) => onMoisChange(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        ) : mode === 'plage' ? (
          <>
            <input type="date" value={valeurDebut || ''} max={valeurFin || undefined} onChange={(e) => onDebutChange(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={valeurFin || ''} min={valeurDebut || undefined} onChange={(e) => onFinChange(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </>
        ) : (
          <input type="date" value={valeurJour} onChange={(e) => onJourChange(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        )}
        {valeurActive && (
          <button onClick={effacer}
            title="Effacer le filtre de période"
            className="rounded-lg px-2 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
        )}
      </div>
    </div>
  )
}
