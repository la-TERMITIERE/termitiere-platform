// Relance des AGENTS : matériel pas rendu alors que la période de la prestation est terminée.
// Une vraie notification (cloche + alerte système) par prestation et par jour, envoyée à
// l'agent qui a saisi la prestation ; les autres rôles n'ont qu'une alerte fermable sur le
// Dashboard (cf. RetardsRetoursAlerte). Composant « headless », monté dans AppShell pour les agents.
import { useEffect, useRef } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { claimOnce } from '../../core/db'
import { notify } from '../../core/notify'
import { todayStr } from '../../utils/formatters'
import { retoursEnRetard } from './retoursEnRetard'
import { useAuth } from '../../hooks/useAuth'
import { siteLabel, allowedSitesFor } from './site/useSite'

const CHECK_MS = 10 * 60 * 1000

export default function RelanceRetoursEnRetard() {
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: retours } = useCollection('logistique_retours')
  const { data: demandes } = useCollection('logistique_demandes')
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function relancer({ p, restant, jours }, cle) {
      try {
        // Réclamation atomique : un seul envoi par prestation et par jour, même avec plusieurs agents connectés.
        // Sans agent identifié, pas de notification (l'alerte du Dashboard couvre ce cas) : jamais d'envoi à tous les agents.
        if (!p.agentId) return
        const gagne = await claimOnce('logistique_relance_retours', cle, { prestationId: p.id }).catch(() => false)
        if (!gagne) return
        await notify({
          type: 'warning',
          title: 'Retour de matériel en retard ⏳',
          body: `${siteLabel(p.site)} : ${p.clientNom || ''} : ${restant} pièce(s) pas encore rendue(s) depuis ${jours} jour(s) (prestation ${p.num}).`,
          module: 'logistique',
          forUsers: [p.agentId],
          link: `/logistique/${p.site || 'lome'}/retours?ids=${p.id}`
        })
      } catch { /* best effort */ }
    }

    function verifier() {
      const jour = todayStr()
      // Seuls les sites auxquels CET agent a droit : pas de mélange Lomé / Kara.
      const sites = allowedSitesFor(user, role)
      for (const x of retoursEnRetard(prestations, retours, jour, demandes)) {
        if (!sites.includes(x.p.site || 'lome')) continue
        const cle = `${x.p.id}_${jour}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle)
        if (!annule) relancer(x, cle)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [prestations, retours, demandes, user, role])

  return null
}
