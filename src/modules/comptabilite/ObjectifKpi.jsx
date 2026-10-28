// KPI « Recettes du mois » d'un secteur : recettes déjà encaissées sur l'objectif du mois, et pourcentage atteint.
// L'objectif se fixe dans les Paramètres du module (cf. ObjectifParam). Sans objectif, la carte le rappelle sans afficher de pourcentage.
// Quand le tableau de bord a déjà une carte de chiffre d'affaires, on la complète avec `libelleObjectif` (sur le mois en cours) et on pose
// cette carte avec `seulementAvecObjectif` + `masque` : elle ne revient qu'avec une autre période, sans jamais répéter le même montant.
import { useState } from 'react'
import { Wallet } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import { formatMoney } from '../../utils/formatters'
import { useObjectifPole, texteEcart } from './quotas'
import DetailRecettesModal from './DetailRecettesModal'

// Détail d'objectif sur UNE seule ligne (même gabarit que le détail des autres cartes, la carte ne grandit pas) : « 🎯 500 000 FCFA · 86% ».
// Sans objectif fixé, renvoie vers les Paramètres du module pour qu'on sache où le régler. À passer en `variationLabel` d'une StatCard.
export const libelleObjectif = (o, court = false) => (o.cible > 0
  ? <>🎯 {court ? Math.round(o.cible).toLocaleString('fr-FR') : formatMoney(o.cible)} · <strong style={{ color: o.etat.couleur }}>{Math.round(o.pct)}%</strong></>
  : '🎯 Objectif non fixé (Paramètres)')

// Un clic ouvre le détail des recettes du mois (liste, réalisé, objectif, reste à réaliser).
export default function ObjectifKpi({ poleId, couleur = '#16a34a', titre = 'Recettes du mois', lien, seulementAvecObjectif = false, masque = false }) {
  const o = useObjectifPole(poleId)
  const [ouvert, setOuvert] = useState(false)
  if (masque || (seulementAvecObjectif && o.cible <= 0)) return null
  return (
    <>
      <StatCard glass title={titre} value={formatMoney(o.realise)} icon={Wallet} accent={couleur} onClick={() => setOuvert(true)}
        chip={texteEcart(o.ecart)} chipGood={o.ecart >= 0} variationLabel={libelleObjectif(o)} />
      {ouvert && <DetailRecettesModal poleId={poleId} couleur={couleur} titre={titre} lien={lien} onClose={() => setOuvert(false)} />}
    </>
  )
}
