// Purge automatique des dépenses E-DÉPENSES trop anciennes — selon la durée de
// conservation définie dans Paramètres (depense_params/retention, en années).
// Réglage INDÉPENDANT de celui d'E-G.Pro (cf. ProjetPurgeWatcher) : chaque module
// a sa propre durée de conservation, dans sa propre collection de paramètres.
//
// Contrairement à E-G.Pro (où une dépense est rattachée à un projet encore actif
// ou non), une dépense E-DÉPENSES n'a pas de statut « projet en cours » à
// respecter : la purge se base uniquement sur sa date.
//
// Composant « headless » (aucun rendu), mêmes conventions que ProjetPurgeWatcher.
// Ne s'exécute que pour les rôles à accès complet (housekeeping automatique).
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { useAuthStore } from '../core/auth'
import { removeItem, claimOnce } from '../core/db'
import { audit } from '../core/audit'
import { FULL_ACCESS_ROLES } from '../core/roles'

const CHECK_MS = 6 * 60 * 60 * 1000 // pas urgent : vérifie toutes les 6h
const AN_MS = 365 * 24 * 3600 * 1000

export default function DepensePurgeWatcher() {
  const { role } = useAuthStore()
  const { data: depenses } = useCollection('depense_depenses')
  const { data: configs }  = useCollection('depense_params')
  const dejaPurgees = useRef(new Set())

  useEffect(() => {
    if (!FULL_ACCESS_ROLES.includes(role)) return
    let annule = false

    async function purger() {
      const cfg = configs.find((c) => c.id === 'retention')
      const annees = Number(cfg?.anneesDepenses) || 0
      if (annees <= 0) return // désactivé

      const seuil = Date.now() - annees * AN_MS
      const aPurger = depenses.filter((d) => {
        if (dejaPurgees.current.has(d.id)) return false
        const date = d.date ? new Date(d.date).getTime() : d.createdAt
        return date && date < seuil
      })
      if (!aPurger.length) return

      // Réclamation atomique par exécution journalière : évite que chaque session
      // ouverte (plusieurs admins) relance la purge en double le même jour.
      const jour = new Date().toISOString().slice(0, 10)
      const gagne = await claimOnce('depense_purge_log', jour, { count: aPurger.length }).catch(() => false)
      if (!gagne) { aPurger.forEach((d) => dejaPurgees.current.add(d.id)); return }

      for (const d of aPurger) {
        if (annule) break
        dejaPurgees.current.add(d.id)
        await removeItem('depense_depenses', d.id).catch(() => {})
      }
      await audit('depense', 'depenses_purgees', `${aPurger.length} dépense(s) de plus de ${annees} an(s) supprimée(s) automatiquement`).catch(() => {})
    }

    purger()
    const timer = setInterval(purger, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [role, depenses, configs])

  return null
}
