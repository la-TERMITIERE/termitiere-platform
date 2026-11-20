// Choix de département dans les formulaires (employé, poste) : les départements déjà créés s'affichent avec leur logo, suivis des modules
// de l'entreprise pas encore ajoutés comme département (les départements sont les modules). Choisir un module non encore créé
// le crée à l'enregistrement de la fiche.
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { COL } from './store/rhStore'
import { MODULES_DEPARTEMENTS, visuelDepartement, LogoDepartement } from './departementsVisuel'

const norme = (t) => String(t || '').trim().toLowerCase()

export function useChoixDepartement() {
  const { data: docs } = useCollection(COL.departements)
  return useMemo(() => {
    const crees = [...new Set(docs.filter((d) => !d.masque && d.nom).map((d) => d.nom.trim()))].sort((a, b) => a.localeCompare(b, 'fr'))
    const modules = MODULES_DEPARTEMENTS.map((m) => m.nom).filter((n) => !crees.some((c) => norme(c) === norme(n)))
    return {
      options: [...crees, ...modules],
      iconeOption: (nom) => <LogoDepartement visuel={visuelDepartement(docs.find((d) => norme(d.nom) === norme(nom)) || { nom })} taille={20} />
    }
  }, [docs])
}
