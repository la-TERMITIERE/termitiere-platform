// Rappel à l'AGENT : une facture émise mais dont l'autorisation de sortie n'a
// jamais été soumise reste en BROUILLON indéfiniment — l'auto-certification à
// 10 min (cf. AutoApproveWorkflow) ne s'applique qu'à une demande DÉJÀ soumise,
// elle ne force personne à la soumettre en premier lieu. Ce composant relance
// donc l'agent lui-même (jamais l'administration) toutes les 10 minutes, jusqu'à
// 3 fois, tant qu'aucune demande n'a été créée pour sa facture. La facture reste
// visible en « Brouillon » pour tout le monde — ce composant ne change aucun statut.
// Composant « headless » (aucun rendu), monté dans AppShell.
import { useEffect, useRef } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { notify } from '../../core/notify'
import { siteLabel } from './site/useSite'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes entre chaque rappel
const CHECK_MS = 30 * 1000      // fréquence de vérification
const MAX_RAPPELS = 3

export default function RelanceFacturesBrouillon() {
  const { data: factures } = useCollection('logistique_factures')
  const { data: demandes } = useCollection('logistique_demandes')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function relancer(f, prochainRang) {
      const cle = `${f.id}#${prochainRang}`
      try {
        await updateItem('logistique_factures', f.id, {
          relanceBrouillon: { count: prochainRang, dernierEnvoiLe: Date.now() }
        })
        await notify({
          type: 'warning',
          title: `Facture ${f.num} toujours en brouillon ⏳`,
          body: `${siteLabel(f.site)} — ${f.clientNom || ''} : l'autorisation de sortie n'a pas encore été soumise (rappel ${prochainRang}/${MAX_RAPPELS}).`,
          module: 'logistique',
          forUsers: [f.agentId],
          link: `/logistique/${f.site || 'lome'}/factures`
        })
      } catch (e) { /* best effort — un autre client réessaiera au prochain tick */ }
      traitees.current.add(cle)
    }

    function verifier() {
      const now = Date.now()
      const factureIdsAvecDemande = new Set(demandes.map((d) => d.factureId).filter(Boolean))
      for (const f of factures) {
        if (f.statut !== 'brouillon') continue
        if (!f.agentId) continue // facture créée avant ce dispositif — pas de destinataire fiable
        if (factureIdsAvecDemande.has(f.id)) continue // demande déjà soumise, plus rien à relancer
        if (typeof f.createdAt !== 'number') continue
        const dejaEnvoyes = f.relanceBrouillon?.count || 0
        if (dejaEnvoyes >= MAX_RAPPELS) continue
        const prochainRang = dejaEnvoyes + 1
        const echeance = f.createdAt + prochainRang * DELAI_MS
        if (now < echeance) continue
        const cle = `${f.id}#${prochainRang}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle) // réserve immédiatement, avant l'écriture async
        if (!annule) relancer(f, prochainRang)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [factures, demandes])

  return null
}
