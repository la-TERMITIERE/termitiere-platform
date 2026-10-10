// Rappel à l'AGENT : une prestation enregistrée mais jamais facturée reste en BROUILLON, sans facture ni
// demande de sortie. 10 minutes après l'enregistrement (puis 20 et 30 minutes), l'agent qui l'a saisie
// reçoit une notification lui disant de cliquer sur l'avion rouge « Facturer et demander la sortie ».
// Rien ne change côté données. Les prestations de plus de 40 minutes ne sont plus relancées ici : le
// repère « À facturer » de la page Prestations prend le relais (2 jours après la fin).
// Composant « headless » (aucun rendu), monté dans AppShell.
import { useEffect, useRef } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { claimOnce, getAll } from '../../core/db'
import { notify } from '../../core/notify'
import { siteLabel } from './site/useSite'

const DELAI_MS = 10 * 60 * 1000
const CHECK_MS = 30 * 1000
const MAX_RAPPELS = 3

export default function RelancePrestationsBrouillon() {
  const { data: prestations } = useCollection('logistique_prestations')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function relancer(p, rang) {
      try {
        // Un seul envoi par prestation et par rappel, même si plusieurs sessions sont ouvertes.
        const gagne = await claimOnce('logistique_relance_prestations', `${p.id}#${rang}`, { prestationId: p.id }).catch(() => false)
        if (!gagne) return
        // Notification réservée aux agents : un administrateur qui a créé la prestation n'est pas relancé.
        const users = await getAll('users')
        const auteur = users.find((u) => u.uid === p.agentId)
        if (!auteur || auteur.role !== 'agent') return
        await notify({
          type: 'warning',
          title: 'Prestation à facturer ⏳',
          body: `${siteLabel(p.site)} : ${p.clientNom || ''} : la prestation ${p.num} est enregistrée mais pas encore facturée (rappel ${rang}/${MAX_RAPPELS}). Ouvrez-la et cliquez sur l'avion rouge « Facturer et demander la sortie ».`,
          module: 'logistique',
          forUsers: [p.agentId],
          link: `/logistique/${p.site || 'lome'}/prestations`
        })
      } catch { /* best effort */ }
    }

    function verifier() {
      const now = Date.now()
      for (const p of prestations) {
        if (p.statut !== 'brouillon' || p.factureId || !p.agentId) continue
        if (typeof p.createdAt !== 'number') continue
        const rang = Math.floor((now - p.createdAt) / DELAI_MS)
        if (rang < 1 || rang > MAX_RAPPELS) continue
        const cle = `${p.id}#${rang}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle)
        if (!annule) relancer(p, rang)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [prestations])

  return null
}
