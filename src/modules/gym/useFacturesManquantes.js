// MAXI-GYM : génère automatiquement la facture des abonnements et séances DU MOIS qui n'en ont pas.
// Sans facture, un abonnement n'était compté ni dans le Dashboard, ni dans la Facturation, ni dans la Comptabilité,
// ni dans E-DÉPENSES (tous lisent `gym_factures`). Elle s'exécute quand un agent ou Info ouvre le Dashboard ou la
// Facturation de la salle ; les mois passés se régularisent depuis la Facturation (cf. facturesManquantes.js).
import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { peutEcrireGym } from '../../core/roles'
import { todayStr } from '../../utils/formatters'
import { trouverManquants, facturerManquants } from './facturesManquantes'

export function useFacturesManquantesGym(site) {
  const { user, role } = useAuth()
  const { data: allFactures, loading: l1 } = useCollection('gym_factures')
  const { data: allAbonnements, loading: l2 } = useCollection('gym_abonnements')
  const { data: allSeances, loading: l3 } = useCollection('gym_seances')
  const { data: allClients } = useCollection('gym_clients')
  const charge = !(l1 || l2 || l3)
  const autorise = peutEcrireGym(role)
  const dejaTente = useRef(new Set())

  const manquants = useMemo(
    () => trouverManquants({ factures: allFactures, abonnements: allAbonnements, seances: allSeances, site, moisSeul: todayStr().slice(0, 7) }),
    [allFactures, allAbonnements, allSeances, site]
  )

  useEffect(() => {
    if (!autorise || !charge || !manquants.length) return
    const aFaire = manquants.filter((m) => !dejaTente.current.has(`${m.type}:${m.src.id}`))
    if (!aFaire.length) return
    aFaire.forEach((m) => dejaTente.current.add(`${m.type}:${m.src.id}`))
    ;(async () => {
      const n = await facturerManquants(aFaire, { clients: allClients, site, user })
      if (n) toast.success(`${n} facture${n > 1 ? 's' : ''} manquante${n > 1 ? 's' : ''} générée${n > 1 ? 's' : ''} : ${n > 1 ? 'ces ventes sont' : 'cette vente est'} maintenant comptabilisée${n > 1 ? 's' : ''}`)
    })()
  }, [autorise, charge, manquants]) // eslint-disable-line react-hooks/exhaustive-deps
}
