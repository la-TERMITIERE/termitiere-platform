// Données de la Trésorerie : comptes, flux, soldes, ventes et créances, calculés une fois
// et partagés par tous les écrans (Trésorerie et Comptabilité). Les collections sont
// écoutées via le cache partagé de core/db (une seule écoute par collection).
import { useMemo } from 'react'
import { useCollection } from '../../../hooks/useFirestore'
import { COL } from '../data'
import { ventesUnifiees, avecEncaissements } from '../../../shared/ventes'
import {
  COL_TRESO, COLLECTIONS_BANQUE, comptesTresorerie, fluxTresorerie, soldesComptes, totauxParType,
  creances as calculerCreances, paramsEffectifs, compteAffecte, aujourdhui
} from './logic'

function useBanquesSecteurs() {
  // Nombre d'appels de hooks FIXE (règle des hooks) : une écoute par collection bancaire.
  const r = COLLECTIONS_BANQUE.map(({ col }) => useCollection(col)) // eslint-disable-line react-hooks/rules-of-hooks
  return useMemo(
    () => COLLECTIONS_BANQUE.flatMap(({ secteur }, i) => (r[i].data || []).map((m) => ({ ...m, secteur }))),
    r.map((x) => x.data) // eslint-disable-line react-hooks/exhaustive-deps
  )
}

export function useTresorerie() {
  const { data: comptesTreso, loading: l1 } = useCollection(COL_TRESO.comptes)
  const { data: mouvements, loading: l2 } = useCollection(COL_TRESO.mouvements)
  const { data: virements } = useCollection(COL_TRESO.virements)
  const { data: surcouches } = useCollection(COL_TRESO.creances)
  const { data: reglements } = useCollection(COL_TRESO.reglements)
  const { data: releves } = useCollection(COL_TRESO.releves)
  const { data: paramsDocs } = useCollection(COL_TRESO.params)
  const { data: banques } = useCollection(COL.banques)
  const mvtsBanque = useBanquesSecteurs()

  const { data: facturesAgro, loading: l3 } = useCollection('agro_factures')
  const { data: facturesLogistique } = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')
  const { data: facturesGym } = useCollection('gym_factures')
  const { data: paiementsGarderie } = useCollection('garderie_paiements')
  const { data: enfantsGarderie } = useCollection('garderie_enfants')
  const { data: versementsProjet } = useCollection('projet_versements_client')
  const { data: projets } = useCollection('projets')
  const { data: depenses } = useCollection('depense_depenses')
  const { data: revenusManuels } = useCollection('depense_revenus_manuels')

  const params = useMemo(() => paramsEffectifs(paramsDocs.find((d) => d.id === 'config')), [paramsDocs])
  const comptes = useMemo(() => comptesTresorerie({ comptes: comptesTreso, banques }), [comptesTreso, banques])

  const ventesBrutes = useMemo(() => ventesUnifiees({
    facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, paiementsGarderie, enfantsGarderie, versementsProjet, projets
  }), [facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, paiementsGarderie, enfantsGarderie, versementsProjet, projets])

  const ventes = useMemo(() => avecEncaissements(ventesBrutes, { creances: surcouches, reglements }), [ventesBrutes, surcouches, reglements])
  const listeCreances = useMemo(() => calculerCreances(ventes, params, aujourdhui()), [ventes, params])

  const flux = useMemo(() => fluxTresorerie({
    comptes, params, mouvements, virements, mvtsBanque, ventes, depenses, revenusManuels
  }), [comptes, params, mouvements, virements, mvtsBanque, ventes, depenses, revenusManuels])

  const soldes = useMemo(() => soldesComptes(comptes, flux), [comptes, flux])
  const totaux = useMemo(() => totauxParType(soldes), [soldes])
  const compteDepensesId = useMemo(() => compteAffecte(params, comptes, 'depense'), [params, comptes])
  const compteDepenses = comptes.find((c) => c.id === compteDepensesId)?.compteComptable || '530000'

  return {
    params, comptes, soldes, totaux, flux, mouvements, virements, releves, banques,
    ventes, creances: listeCreances, depenses, compteDepenses,
    loading: l1 || l2 || l3
  }
}
