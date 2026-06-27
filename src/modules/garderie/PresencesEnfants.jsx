import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { STATUTS_PRESENCE } from './data'
import { exportRapportExcel } from '../../utils/excelReport'

const heureNow = () => new Date().toTimeString().slice(0, 5)

export default function PresencesEnfants() {
  const { user } = useAuth()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: presences } = useCollection('garderie_presences')

  const [dateFiltre, setDateFiltre] = useState(todayStr())

  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif').sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1),
    [enfants]
  )

  const presencesDuJour = useMemo(
    () => presences.filter((p) => p.date === dateFiltre && p.enfantId),
    [presences, dateFiltre]
  )

  const getPresence = (enfantId) => presencesDuJour.find((p) => p.enfantId === enfantId)

  async function marquerArrivee(enfant) {
    const existing = getPresence(enfant.id)
    if (existing) return toast.info('Présence déjà enregistrée pour cet enfant')
    const heure = heureNow()
    const id = genId()
    await addItem('garderie_presences', {
      id, enfantId: enfant.id, enfantNom: `${enfant.prenom} ${enfant.nom}`,
      date: dateFiltre, heureArrivee: heure, statut: 'present'
    })
    audit('garderie', 'PRESENCE_ARRIVEE', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure })
    notify({ type: 'info', title: `✅ Arrivée — ${enfant.prenom} ${enfant.nom}`, body: `Arrivé(e) à ${heure}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/presences' })
    toast.success(`Arrivée de ${enfant.prenom} à ${heure} ✓`)
  }

  async function marquerDepart(enfant) {
    const existing = getPresence(enfant.id)
    if (!existing) return toast.error('Aucune arrivée enregistrée')
    if (existing.heureDepart) return toast.info('Départ déjà enregistré')
    const heure = heureNow()
    await updateItem('garderie_presences', existing.id, { heureDepart: heure })
    audit('garderie', 'PRESENCE_DEPART', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure })
    toast.success(`Départ de ${enfant.prenom} à ${heure} ✓`)
  }

  async function marquerAbsent(enfant, statut) {
    const existing = getPresence(enfant.id)
    if (existing) {
      await updateItem('garderie_presences', existing.id, { statut })
    } else {
      const id = genId()
      await addItem('garderie_presences', {
        id, enfantId: enfant.id, enfantNom: `${enfant.prenom} ${enfant.nom}`,
        date: dateFiltre, statut
      })
    }
    audit('garderie', 'PRESENCE_STATUT', `${enfant.prenom} ${enfant.nom}`, { statut })
    notify({ type: 'info', title: `📋 Présence — ${enfant.prenom} ${enfant.nom}`, body: statut === 'absent' ? 'Marqué(e) absent(e)' : 'Marqué(e) excusé(e)', module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/presences' })
    toast.success('Statut mis à jour ✓')
  }

  const stats = useMemo(() => {
    const presents  = presencesDuJour.filter((p) => p.statut === 'present').length
    const absents   = presencesDuJour.filter((p) => p.statut === 'absent').length
    const excuses   = presencesDuJour.filter((p) => p.statut === 'excuse').length
    const nonPoints = enfantsActifs.length - presencesDuJour.length
    return { presents, absents, excuses, nonPoints }
  }, [presencesDuJour, enfantsActifs])

  function exportXLSX() {
    const rows = enfantsActifs.map((e) => {
      const p = getPresence(e.id)
      return {
        'Prénom Nom': `${e.prenom} ${e.nom}`,
        Statut: p ? (STATUTS_PRESENCE[p.statut]?.label || p.statut) : 'Non pointé',
        Arrivée: p?.heureArrivee || '—',
        Départ: p?.heureDepart || '—'
      }
    })
    exportRapportExcel({ theme: 'garderie',
      filename: `presences-garderie-${dateFiltre}.xlsx`,
      sections: [{
        id: 'presences', name: 'Présences',
        title: `Feuille de présences — ${formatDateShort(dateFiltre)}`,
        subtitle: `${stats.presents} présent(s) · ${stats.absents} absent(s) · ${stats.excuses} excusé(s)`,
        columns: [
          { key: 'Prénom Nom', label: 'Prénom Nom', width: 24 },
          { key: 'Statut', label: 'Statut', width: 14 },
          { key: 'Arrivée', label: 'Heure arrivée', width: 16 },
          { key: 'Départ', label: 'Heure départ', width: 16 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <Input type="date" value={dateFiltre} onChange={(e) => setDateFiltre(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-600 font-semibold">✓ {stats.presents} présents</span>
            <span className="text-red-500 font-semibold">✗ {stats.absents} absents</span>
            <span className="text-yellow-600 font-semibold">~ {stats.excuses} excusés</span>
            <span className="text-gray-400">? {stats.nonPoints} non pointés</span>
          </div>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Arrivée</th>
              <th className="px-3 py-2 text-left">Départ</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {enfantsActifs.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Aucun enfant actif inscrit.</td></tr>
            )}
            {enfantsActifs.map((e) => {
              const p = getPresence(e.id)
              return (
                <tr key={e.id} className={`transition-colors ${p?.statut === 'present' ? 'bg-green-50' : p?.statut === 'absent' ? 'bg-red-50' : p?.statut === 'excuse' ? 'bg-yellow-50' : ''}`}>
                  <td className="px-3 py-2 font-semibold">{e.prenom} {e.nom}</td>
                  <td className="px-3 py-2">
                    {p
                      ? <Badge tone={STATUTS_PRESENCE[p.statut]?.tone}>{STATUTS_PRESENCE[p.statut]?.label}</Badge>
                      : <Badge tone="neutral">Non pointé</Badge>
                    }
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">{p?.heureArrivee || '—'}</td>
                  <td className="px-3 py-2 font-mono text-sm">{p?.heureDepart || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!p && (
                        <button onClick={() => marquerArrivee(e)}
                          className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                          <CheckCircle2 size={12} /> Arrivée
                        </button>
                      )}
                      {p?.statut === 'present' && !p.heureDepart && (
                        <button onClick={() => marquerDepart(e)}
                          className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200">
                          <Clock size={12} /> Départ
                        </button>
                      )}
                      {(!p || p.statut !== 'absent') && (
                        <button onClick={() => marquerAbsent(e, 'absent')}
                          className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200">
                          <XCircle size={12} /> Absent
                        </button>
                      )}
                      {(!p || p.statut !== 'excuse') && (
                        <button onClick={() => marquerAbsent(e, 'excuse')}
                          className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-200">
                          ~ Excusé
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
