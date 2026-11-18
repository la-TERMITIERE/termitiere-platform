// MAXI-AGRO : bande verte en tête de chaque volet (même recette que les autres modules, cf. shared/ui/BandeauVolet).
// Les tris par date et par période, la recherche et les actions principales se posent DANS la bande.
import { useState } from 'react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'

export const COULEUR_AGRO = '#2EAA3F'

export default function BandeAgro(props) {
  return <BandeauVolet couleur={COULEUR_AGRO} surtitre="MAXI AGRO" {...props} />
}

// Filtre de période (Jour / Mois / Année / Plage) pour les listes : `node` se pose dans la bande,
// `dansPeriode(date)` filtre les lignes. Sans valeur choisie, tout est affiché.
export function usePeriodeBande() {
  const [mode, setMode] = useState('mois')
  const [jour, setJour] = useState('')
  const [mois, setMois] = useState('')
  const [annee, setAnnee] = useState('')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const node = (
    <FiltrePeriode variant="glass" label="" mode={mode} onModeChange={setMode}
      valeurJour={jour} onJourChange={setJour} valeurMois={mois} onMoisChange={setMois}
      avecAnnee valeurAnnee={annee} onAnneeChange={setAnnee}
      avecPlage valeurDebut={debut} onDebutChange={setDebut} valeurFin={fin} onFinChange={setFin} />
  )
  const dansPeriode = (date) => {
    const d = date || ''
    if (mode === 'mois' && mois) return d.startsWith(mois)
    if (mode === 'annee' && annee) return d.startsWith(annee)
    if (mode === 'plage' && (debut || fin)) return (!debut || d >= debut) && (!fin || d <= fin)
    if (mode === 'jour' && jour) return d === jour
    return true
  }
  const cle = [mode, jour, mois, annee, debut, fin].join('|')
  return { node, dansPeriode, cle }
}
