// Liste VIVANTE des départements — source unique pour tous les écrans RH.
// Tant que la collection rh_departements est vide, on retombe sur les défauts
// (DEPARTEMENTS) ; dès qu'elle est amorcée (écran Départements), elle fait foi —
// ce qui rend chaque département éditable, renommable et supprimable, et propage
// le changement partout (les menus lisent cette même liste).
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { DEPARTEMENTS, COL } from './store/rhStore'

export function useDepartements() {
  const { data: records } = useCollection(COL.departements)
  const noms = useMemo(() => {
    if (records && records.length) return [...new Set(records.map((d) => d.nom).filter(Boolean))]
    return DEPARTEMENTS
  }, [records])
  return { records: records || [], noms }
}
