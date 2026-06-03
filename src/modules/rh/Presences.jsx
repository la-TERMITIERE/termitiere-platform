// Présences & Congés — grille de saisie quotidienne par employé.
import { useMemo, useState } from 'react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { todayStr } from '../../utils/formatters'
import { TYPES_PRESENCE } from './store/rhStore'

export default function Presences() {
  const { data: employes } = useCollection('rh_employes')
  const { data: presences } = useCollection('rh_presences')
  const [date, setDate] = useState(todayStr())

  // Statut d'un employé à la date sélectionnée
  const statutOf = useMemo(() => {
    const map = {}
    presences.filter((p) => p.date === date).forEach((p) => (map[p.employeId] = p))
    return map
  }, [presences, date])

  async function setStatut(emp, statut) {
    // id déterministe : date_employe → un seul enregistrement par jour/employé
    await setItem('rh_presences', `${date}_${emp.id}`, {
      date, employeId: emp.id, employeNom: emp.nom, statut
    })
    toast.success(`${emp.nom} : ${TYPES_PRESENCE[statut].label}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div><label className="mb-1 block text-xs font-semibold text-gray-600">Date</label><Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>

      <Card className="p-0">
        {employes.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Ajoutez d'abord des employés.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {employes.map((emp) => {
              const cur = statutOf[emp.id]?.statut
              return (
                <li key={emp.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div>
                    <p className="font-semibold text-gray-800">{emp.nom}</p>
                    <p className="text-xs text-gray-400">{emp.poste} · {emp.departement}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cur && <Badge tone={TYPES_PRESENCE[cur]?.tone}>{TYPES_PRESENCE[cur]?.label}</Badge>}
                    <Select className="!w-auto !py-1" value={cur || ''} onChange={(e) => setStatut(emp, e.target.value)}>
                      <option value="" disabled>Pointer…</option>
                      {Object.entries(TYPES_PRESENCE).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
                    </Select>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
