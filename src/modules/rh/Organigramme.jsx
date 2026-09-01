// RH — Organigramme interactif (Structure RH). Vue hiérarchique par département.
import { useMemo } from 'react'
import { Users } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { DEPARTEMENTS, COL } from './store/rhStore'
import { PageHeader } from './rhui'

export default function Organigramme() {
  const { data: employes } = useCollection(COL.employes)
  const { data: departements } = useCollection(COL.departements)

  const depts = useMemo(() => {
    const noms = [...new Set([...DEPARTEMENTS, ...departements.map((d) => d.nom), ...employes.map((e) => e.departement).filter(Boolean)])]
    return noms.map((nom) => ({
      nom,
      responsable: departements.find((d) => d.nom === nom)?.responsable,
      membres: employes.filter((e) => e.departement === nom)
    })).filter((d) => d.membres.length > 0 || d.responsable)
  }, [employes, departements])

  return (
    <div className="space-y-5">
      <PageHeader icon={Users} sousModule="Structure RH" titre="Organigramme Interactif"
        sousTitre="Hiérarchie de l'organisation, département par département." />

      {depts.length === 0
        ? <Card><p className="py-8 text-center text-sm text-gray-400">Ajoutez des employés et des départements pour visualiser l'organigramme.</p></Card>
        : (
          <div className="grid gap-4 md:grid-cols-2">
            {depts.map((d) => (
              <Card key={d.nom} className="!p-0 overflow-hidden">
                <div className="bg-sky-600 px-4 py-2.5 text-white">
                  <p className="font-bold">{d.nom}</p>
                  <p className="text-xs text-white/80">{d.responsable ? `Responsable : ${d.responsable}` : `${d.membres.length} collaborateur(s)`}</p>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-white/10">
                  {d.membres.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Aucun membre affecté.</li>}
                  {d.membres.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">{(e.nom || '?').charAt(0).toUpperCase()}</div>
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{e.nom}</p>
                        <p className="text-xs text-gray-500">{e.poste || 'Poste non défini'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
    </div>
  )
}
