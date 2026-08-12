// Filtre de période réutilisable : un sélecteur de granularité (Jour / Mois)
// suivi d'UN SEUL champ de saisie, dont le TYPE change selon le mode choisi
// (calendrier jour, ou sélecteur mois/année natif) — au lieu de deux champs
// séparés à remplir/effacer indépendamment. Utilisé par Sources de revenus
// (E-DÉPENSES) et Facturation/Prestations (MAXI LOGISTIQUE) pour que le même
// filtre se comporte et se présente identiquement d'un écran à l'autre.
import Select from '../forms/Select'

export default function FiltrePeriode({
  label = 'Période',
  mode, onModeChange,
  valeurJour, onJourChange,
  valeurMois, onMoisChange
}) {
  const valeurActive = mode === 'mois' ? valeurMois : valeurJour
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <div className="flex items-center gap-1.5">
        <Select className="w-[88px]" value={mode} onChange={(e) => onModeChange(e.target.value)}>
          <option value="jour">Jour</option>
          <option value="mois">Mois</option>
        </Select>
        {mode === 'mois' ? (
          <input type="month" value={valeurMois} onChange={(e) => onMoisChange(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        ) : (
          <input type="date" value={valeurJour} onChange={(e) => onJourChange(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        )}
        {valeurActive && (
          <button onClick={() => (mode === 'mois' ? onMoisChange('') : onJourChange(''))}
            title="Effacer le filtre de période"
            className="rounded-lg px-2 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
        )}
      </div>
    </div>
  )
}
