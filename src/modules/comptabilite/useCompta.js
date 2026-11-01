// Hook d'accès aux données comptables : centralise le chargement des collections
// et l'exposition du plan effectif + des mouvements aplatis (cf. logic.js).
//
// Inclut les écritures AUTOMATIQUES issues des autres modules (passerelles.js) :
// les dépenses/revenus saisis ailleurs remontent en écritures comptables virtuelles
// (lecture seule), fusionnées avec les écritures saisies à la main.
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { COL } from './data'
import { planEffectif, mouvements } from './logic'
import { ecrituresAuto } from './passerelles'
import { useTresorerie } from './tresorerie/useTresorerie'

export function useCompta() {
  const { data: comptesPerso, loading: lc } = useCollection(COL.comptes)
  const { data: ecrituresManuelles, loading: le } = useCollection(COL.ecritures)
  const { data: immobilisations, loading: li } = useCollection(COL.immobilisations)
  const { data: patrimoine, loading: lp } = useCollection(COL.patrimoine)
  const { data: exercices } = useCollection(COL.exercices)
  const { data: tiers } = useCollection(COL.tiers)
  const { data: centres } = useCollection(COL.centres)

  // Sources externes converties automatiquement en écritures (passerelles).
  const { data: depenses, loading: ld } = useCollection('depense_depenses')
  const { data: revenusManuels, loading: lr } = useCollection('depense_revenus_manuels')
  const { data: bulletins } = useCollection('rh_bulletins')
  const { data: paramsCompta } = useCollection(COL.params)
  const tva = useMemo(() => paramsCompta.find((d) => d.id === 'tva') || null, [paramsCompta])
  // Ventes de tous les secteurs, encaissements et mouvements de trésorerie (module Trésorerie).
  const treso = useTresorerie()

  const plan = useMemo(() => planEffectif(comptesPerso), [comptesPerso])

  const ecrituresAutomatiques = useMemo(
    () => ecrituresAuto({
      depenses, revenusManuels, bulletins,
      ventes: treso.creances, flux: treso.flux, comptes: treso.comptes, compteDepenses: treso.compteDepenses,
      facturesFournisseurs: treso.facturesFournisseurs, tva
    }),
    [depenses, revenusManuels, bulletins, treso.creances, treso.flux, treso.comptes, treso.compteDepenses, treso.facturesFournisseurs, tva]
  )

  // Toutes les écritures : saisies manuellement + générées automatiquement.
  const ecritures = useMemo(
    () => [...ecrituresManuelles, ...ecrituresAutomatiques],
    [ecrituresManuelles, ecrituresAutomatiques]
  )

  // Par défaut, seules les écritures VALIDÉES alimentent les états (balance, grand
  // livre, résultat…). Les écritures auto sont toujours « validee ». Les brouillons
  // saisis à la main restent visibles dans l'écran Écritures uniquement.
  const mvtsValides = useMemo(() => mouvements(ecritures, { statut: 'validee' }), [ecritures])
  const mvtsTous = useMemo(() => mouvements(ecritures), [ecritures])

  return {
    comptesPerso, immobilisations, patrimoine, exercices, tiers, centres,
    ecrituresManuelles, ecrituresAutomatiques, ecritures,
    plan, mvtsValides, mvtsTous,
    treso, tva,
    loading: lc || le || li || lp || ld || lr || treso.loading
  }
}
