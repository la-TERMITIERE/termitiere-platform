// MAXI-GYM : suppression automatique des clients dont l'abonnement (ou la séance) est terminé depuis plus longtemps que
// le délai réglé dans Paramètres. Désactivée tant que l'administration ne l'a pas activée. Elle s'exécute quand un
// agent ou Info ouvre le Dashboard de la salle, au plus une fois par jour et par session.
import { useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { peutPurgerClientGym } from '../../core/roles'
import { todayStr } from '../../utils/formatters'
import { useGymParams } from './useGymParams'
import { matchSite } from './site/useSite'
import { candidatsAutoSuppression, purgerDossier } from './purgeClient'

const MAX_PAR_PASSAGE = 30

export function useAutoSuppressionGym(site) {
  const role = useAuth((s) => s.role)
  const params = useGymParams(site)
  const { data: allClients, loading: l1 } = useCollection('gym_clients')
  const { data: allAbonnements, loading: l2 } = useCollection('gym_abonnements')
  const { data: allSeances, loading: l3 } = useCollection('gym_seances')
  const { data: allPresences, loading: l4 } = useCollection('gym_presences')
  const clients = useMemo(() => allClients.filter((x) => matchSite(x, site)), [allClients, site])
  const abonnements = useMemo(() => allAbonnements.filter((x) => matchSite(x, site)), [allAbonnements, site])
  const seances = useMemo(() => allSeances.filter((x) => matchSite(x, site)), [allSeances, site])
  const presences = useMemo(() => allPresences.filter((x) => matchSite(x, site)), [allPresences, site])
  const charge = !(l1 || l2 || l3 || l4)
  const autorise = peutPurgerClientGym(role) && params.autoSuppressionActive

  useEffect(() => {
    if (!autorise || !charge) return
    const marque = `gym-autosuppression-${site}-${todayStr()}`
    try { if (sessionStorage.getItem(marque)) return } catch { /* stockage indisponible : on continue */ }
    try { sessionStorage.setItem(marque, '1') } catch { /* idem */ }
    const candidats = candidatsAutoSuppression({ clients, abonnements, seances, presences, params, site }).slice(0, MAX_PAR_PASSAGE)
    if (!candidats.length) return
    ;(async () => {
      let n = 0
      for (const c of candidats) {
        try { await purgerDossier(c.dossier, role, { auto: true }); n += 1 } catch (e) { console.warn('[gym] suppression automatique impossible', c.dossier.nom, e) }
      }
      if (n) toast.success(`${n} client${n > 1 ? 's' : ''} terminé${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''} automatiquement de la base`)
    })()
  }, [autorise, charge, site]) // eslint-disable-line react-hooks/exhaustive-deps
}
