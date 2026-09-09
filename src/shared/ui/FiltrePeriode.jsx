// Filtre de période réutilisable : un sélecteur de granularité (Jour / Mois /
// Plage personnalisée) suivi du ou des champs de saisie correspondants — au lieu
// de champs séparés à remplir/effacer indépendamment. Utilisé par Sources de
// revenus (E-DÉPENSES) et Facturation/Prestations (MAXI LOGISTIQUE) pour que le
// même filtre se comporte et se présente identiquement d'un écran à l'autre.
// `avecPlage` (opt-in, false par défaut) ajoute le mode « Plage personnalisée »
// (du/au) — les écrans qui ne fournissent pas `valeurDebut/valeurFin` n'affichent
// pas cette option et ne sont donc pas affectés.
// `avecAnnee` (opt-in) ajoute le mode « Année » — toute une année sans choisir de
// mois précis ; les écrans qui ne fournissent pas `valeurAnnee/onAnneeChange`
// n'affichent pas cette option et ne sont donc pas affectés.
// `variant="glass"` (opt-in) : rendu translucide blanc-sur-couleur, pour poser le
// filtre directement DANS le bandeau dégradé d'en-tête d'un écran (au lieu d'une
// ligne séparée en dessous) — même effet que le sélecteur de mois de MAXI-GYM/
// E-DÉPENSES Dashboard, généralisé ici à tous les écrans à filtre Jour/Mois/Plage.
import Select from '../forms/Select'

export default function FiltrePeriode({
  label = 'Période',
  variant = 'light', // 'light' (défaut, fond blanc/carte) | 'glass' (bandeau coloré)
  mode, onModeChange,
  valeurJour, onJourChange,
  valeurMois, onMoisChange,
  avecAnnee = false,
  valeurAnnee, onAnneeChange,
  avecPlage = false,
  valeurDebut, onDebutChange,
  valeurFin, onFinChange
}) {
  const glass = variant === 'glass'
  const valeurActive = mode === 'mois' ? valeurMois : mode === 'annee' ? valeurAnnee : mode === 'plage' ? (valeurDebut || valeurFin) : valeurJour
  const effacer = () => {
    if (mode === 'mois') onMoisChange('')
    else if (mode === 'annee') onAnneeChange('')
    else if (mode === 'plage') { onDebutChange?.(''); onFinChange?.('') }
    else onJourChange('')
  }

  const selectCls = glass
    ? 'w-[78px] rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-800'
    : 'w-[88px]'
  const inputCls = glass
    ? 'rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50'
    : 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
  const inputStyle = glass ? { colorScheme: 'dark' } : undefined
  const clearCls = glass
    ? 'rounded-xl px-2 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/20 hover:text-white'
    : 'rounded-lg px-2 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600'

  const champs = (
    <>
      <Select className={selectCls} value={mode} onChange={(e) => onModeChange(e.target.value)}>
        <option value="jour">Jour</option>
        <option value="mois">Mois</option>
        {avecAnnee && <option value="annee">Année</option>}
        {avecPlage && <option value="plage">Plage…</option>}
      </Select>
      {mode === 'mois' ? (
        <input type="month" value={valeurMois} onChange={(e) => onMoisChange(e.target.value)} style={inputStyle} className={inputCls} />
      ) : mode === 'annee' ? (
        <input type="number" min="2000" max="2100" placeholder="Année" value={valeurAnnee}
          onChange={(e) => onAnneeChange(e.target.value)} style={inputStyle}
          className={`${glass ? 'w-20' : 'w-24'} ${inputCls}`} />
      ) : mode === 'plage' ? (
        <>
          <input type="date" value={valeurDebut || ''} max={valeurFin || undefined} onChange={(e) => onDebutChange(e.target.value)} style={inputStyle} className={inputCls} />
          <span className={glass ? 'text-xs text-white/60' : 'text-xs text-gray-400'}>→</span>
          <input type="date" value={valeurFin || ''} min={valeurDebut || undefined} onChange={(e) => onFinChange(e.target.value)} style={inputStyle} className={inputCls} />
        </>
      ) : (
        <input type="date" value={valeurJour} onChange={(e) => onJourChange(e.target.value)} style={inputStyle} className={inputCls} />
      )}
      {valeurActive && (
        <button onClick={effacer} title="Effacer le filtre de période" className={clearCls}>✕</button>
      )}
    </>
  )

  if (glass) {
    // `w-full ... sm:w-auto` (pas `shrink-0`) sur le bloc RACINE — c'est lui qui est
    // posé directement comme enfant flex du bandeau : plein largeur sur mobile pour
    // forcer le retour à la ligne sous le titre (flex-wrap) plutôt que d'écraser le
    // bloc titre `min-w-0 flex-1` à côté, largeur automatique et en ligne à partir de
    // `sm:` (même correctif que le sélecteur de mois du Dashboard E-DÉPENSES/MAXI-GYM).
    return (
      <div className="w-full sm:w-auto sm:ml-auto">
        {label && <label className="mb-1 block text-xs font-semibold text-white/80">{label}</label>}
        <div className="flex w-full flex-wrap items-center gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm sm:w-auto">
          {champs}
        </div>
      </div>
    )
  }
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>}
      <div className="flex flex-wrap items-center gap-1.5">
        {champs}
      </div>
    </div>
  )
}
