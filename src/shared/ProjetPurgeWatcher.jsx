// Purge automatique des dépenses E-G.Pro trop anciennes — selon la durée de
// conservation définie dans Paramètres (projet_params/retention, en années).
// Ne supprime QUE les dépenses des projets déjà CLÔTURÉS (terminé/annulé) depuis
// plus longtemps que ce délai : jamais celles d'un projet encore actif, pour ne
// jamais fausser un calcul de solde/reste encore utilisé (cf. tacheSolde).
//
// Composant « headless » (aucun rendu), mêmes conventions que ProjetAlerteWatcher.
// Ne s'exécute que pour les rôles à accès complet (housekeeping automatique, pas
// une action qu'un agent doit pouvoir déclencher).
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { useAuthStore } from '../core/auth'
import { removeItem, claimOnce } from '../core/db'
import { audit } from '../core/audit'
import { FULL_ACCESS_ROLES } from '../core/roles'

const CHECK_MS = 6 * 60 * 60 * 1000 // pas urgent : vérifie toutes les 6h
const AN_MS = 365 * 24 * 3600 * 1000
const STATUTS_CLOTURES = ['termine', 'annule']

export default function ProjetPurgeWatcher() {
  const { role } = useAuthStore()
  const { data: projets }  = useCollection('projets')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: configs }  = useCollection('projet_params')
  const dejaPurgees = useRef(new Set())

  useEffect(() => {
    if (!FULL_ACCESS_ROLES.includes(role)) return
    let annule = false

    async function purger() {
      const cfg = configs.find((c) => c.id === 'retention')
      const annees = Number(cfg?.anneesDepenses) || 0
      if (annees <= 0) return // désactivé

      const seuil = Date.now() - annees * AN_MS
      const projetsClotures = new Map(
        projets.filter((p) => STATUTS_CLOTURES.includes(p.statut) && p.updatedAt && p.updatedAt < seuil)
          .map((p) => [p.id, p])
      )
      if (!projetsClotures.size) return

      const aPurger = depenses.filter((d) =>
        d.projetId && projetsClotures.has(d.projetId) && !dejaPurgees.current.has(d.id)
      )
      if (!aPurger.length) return

      // Réclamation atomique par exécution journalière : évite que chaque session
      // ouverte (plusieurs admins) relance la purge en double le même jour.
      const jour = new Date().toISOString().slice(0, 10)
      const gagne = await claimOnce('projet_purge_log', jour, { count: aPurger.length }).catch(() => false)
      if (!gagne) { aPurger.forEach((d) => dejaPurgees.current.add(d.id)); return }

      for (const d of aPurger) {
        if (annule) break
        dejaPurgees.current.add(d.id)
        await removeItem('projet_depenses', d.id).catch(() => {})
      }
      await audit('projet', 'depenses_purgees', `${aPurger.length} dépense(s) de projet(s) clôturé(s) depuis plus de ${annees} an(s) supprimée(s) automatiquement`).catch(() => {})
    }

    purger()
    const timer = setInterval(purger, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [role, projets, depenses, configs])

  return null
}
