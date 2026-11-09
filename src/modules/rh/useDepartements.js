// Noms des départements créés par l'utilisateur (volet Départements), sans doublon et dans l'ordre alphabétique.
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { COL } from './store/rhStore'

export function useDepartements() {
  const { data } = useCollection(COL.departements)
  return useMemo(() => [...new Set(data.filter((d) => !d.masque).map((d) => d.nom).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [data])
}
