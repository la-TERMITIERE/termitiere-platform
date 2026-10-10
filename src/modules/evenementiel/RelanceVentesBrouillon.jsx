// Rappel à l'AGENT : une vente enregistrée mais dont l'autorisation de sortie n'a jamais été demandée
// reste en BROUILLON. 10 minutes après l'enregistrement (puis 20 et 30 minutes), l'agent qui l'a saisie
// reçoit une notification lui disant de cliquer sur l'avion violet « Demander l'autorisation ».
// Les ventes de plus de 40 minutes ne sont plus relancées ici (alerte « autorisées à facturer » ensuite).
// Composant « headless » (aucun rendu), monté dans AppShell.
import { useEffect, useRef } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { claimOnce, getAll } from '../../core/db'
import { notify } from '../../core/notify'

const DELAI_MS = 10 * 60 * 1000
const CHECK_MS = 30 * 1000
const MAX_RAPPELS = 3

export default function RelanceVentesBrouillon() {
  const { data: ventes } = useCollection('evenementiel_ventes')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function relancer(v, rang) {
      try {
        // Un seul envoi par vente et par rappel, même si plusieurs sessions sont ouvertes.
        const gagne = await claimOnce('evenementiel_relance_ventes_brouillon', `${v.id}#${rang}`, { venteId: v.id }).catch(() => false)
        if (!gagne) return
        // Notification réservée aux agents : un administrateur qui a créé la vente n'est pas relancé.
        const users = await getAll('users')
        const auteur = users.find((u) => u.uid === v.agentId)
        if (!auteur || auteur.role !== 'agent') return
        await notify({
          type: 'warning',
          title: 'Vente sans autorisation de sortie ⏳',
          body: `${v.clientNom || ''} : la vente ${v.num} est enregistrée mais l'autorisation de sortie n'est pas demandée (rappel ${rang}/${MAX_RAPPELS}). Ouvrez-la et cliquez sur l'avion violet « Demander l'autorisation ».`,
          module: 'evenementiel',
          forUsers: [v.agentId],
          link: '/evenementiel/ventes'
        })
      } catch { /* best effort */ }
    }

    function verifier() {
      const now = Date.now()
      for (const v of ventes) {
        if (v.statut !== 'brouillon' || !v.agentId) continue
        if (typeof v.createdAt !== 'number') continue
        const rang = Math.floor((now - v.createdAt) / DELAI_MS)
        if (rang < 1 || rang > MAX_RAPPELS) continue
        const cle = `${v.id}#${rang}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle)
        if (!annule) relancer(v, rang)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [ventes])

  return null
}
