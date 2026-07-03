import { Fragment, useMemo, useState } from 'react'
import { FileSpreadsheet, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Select from '../../shared/forms/Select'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateTime, formatDateShort } from '../../utils/formatters'

const EVENTS = {
  ENFANT_CREATE:              { label: 'Enfant inscrit',          emoji: '👶' },
  ENFANT_EDIT:                { label: 'Fiche enfant modifiée',   emoji: '✏️' },
  PERSONNEL_CREATE:           { label: 'Personnel ajouté',        emoji: '👩' },
  PERSONNEL_EDIT:             { label: 'Personnel modifié',       emoji: '✏️' },
  PERSONNEL_POINTAGE_ARRIVEE: { label: 'Arrivée personnel',       emoji: '🟢' },
  PERSONNEL_POINTAGE_DEPART:  { label: 'Départ personnel',        emoji: '🔴' },
  PRESENCE_ARRIVEE:           { label: 'Arrivée enfant',          emoji: '✅' },
  PRESENCE_DEPART:            { label: 'Départ enfant',           emoji: '👋' },
  PRESENCE_STATUT:            { label: 'Statut présence',         emoji: '📋' },
  PAIEMENT_CREATE:            { label: 'Paiement enregistré',     emoji: '💰' },
  PAIEMENT_EDIT:              { label: 'Paiement modifié',        emoji: '✏️' },
  INCIDENT_CREATE:            { label: 'Incident signalé',        emoji: '⚠️' },
  INCIDENT_EDIT:              { label: 'Incident modifié',        emoji: '✏️' },
  INCIDENT_RESOLU:            { label: 'Incident résolu',         emoji: '✅' },
  PARAMS_SAVE:                { label: 'Paramètres modifiés',     emoji: '⚙️' }
}
const evInfo = (a) => EVENTS[a] || { label: a || 'Action', emoji: '•' }
const tsOf = (e) => (typeof e.timestamp === 'number' ? e.timestamp : (e.createdAt || 0))
const dayOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')
// Convertit n'importe quelle valeur en chaîne lisible
// Si c'est un objet user (ancien bug), on extrait juste le nom
const safeStr = (v) => {
  if (v == null) return '—'
  if (typeof v === 'string') return v || '—'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    // Ancien bug : objet user stocké comme details
    if (v.nom) return `par ${v.nom}`
    if (v.login) return v.login
    try { return JSON.stringify(v) } catch { return '—' }
  }
  return '—'
}

export default function Journal() {
  const { data: events, loading } = useCollection('audit_global')
  const [type, setType] = useState('')
  const [who, setWho]   = useState('')
  const [openRow, setOpenRow] = useState(null)
  const { start, end, node: periodNode } = usePeriodSelect('30')

  const evenements = useMemo(
    () => events.filter((e) => e.module === 'garderie' && e.action !== 'CONNEXION'),
    [events]
  )

  const typesPresents = useMemo(
    () => [...new Set(evenements.map((e) => e.action).filter(Boolean))].sort(),
    [evenements]
  )
  const usersPresents = useMemo(
    () => [...new Set(evenements.map((e) => e.userNom).filter(Boolean))].sort(),
    [evenements]
  )

  const lignes = useMemo(() => {
    return evenements
      .map((e) => ({ ...e, _ms: tsOf(e), _day: dayOf(tsOf(e)) }))
      .filter((e) =>
        (e._day >= start && e._day <= end) &&
        (!type || e.action === type) &&
        (!who  || e.userNom === who)
      )
      .sort((a, b) => b._ms - a._ms)
  }, [evenements, start, end, type, who])

  function exportXLSX() {
    const rows = lignes.map((l) => ({
      'Date / Heure': formatDateTime(l._ms),
      Utilisateur: l.userNom || '—',
      Rôle: l.userRole || '—',
      Événement: evInfo(l.action).label,
      Détails: l.details || '—'
    }))
    exportRapportExcel({ theme: 'garderie',
      filename: `journal-garderie-${start}_${end}.xlsx`,
      sections: [{
        id: 'journal', name: 'Journal Garderie',
        title: 'Journal d\'activité — Garderie',
        subtitle: `Période : du ${formatDateShort(start)} au ${formatDateShort(end)} · ${lignes.length} événement(s)`,
        columns: [
          { key: 'Date / Heure', label: 'Date / Heure', width: 20 },
          { key: 'Utilisateur', label: 'Utilisateur', width: 20 },
          { key: 'Rôle', label: 'Rôle', width: 14 },
          { key: 'Événement', label: 'Événement', width: 28 },
          { key: 'Détails', label: 'Détails', width: 40 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        {periodNode}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Type d'événement</label>
          <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous</option>
            {typesPresents.map((t) => <option key={t} value={t}>{evInfo(t).emoji} {evInfo(t).label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Utilisateur</label>
          <Select className="w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Tous</option>
            {usersPresents.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{lignes.length} événement(s)</span>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-6 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">Date / heure</th>
              <th className="px-3 py-2 text-left">Événement</th>
              <th className="px-3 py-2 text-left">Utilisateur</th>
              <th className="px-3 py-2 text-left">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                <Loader2 size={20} className="mx-auto animate-spin mb-2" />
                Chargement du journal…
              </td></tr>
            )}
            {!loading && lignes.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Aucun événement sur la période.</td></tr>
            )}
            {lignes.map((r) => {
              const hasMeta = r.meta && Object.keys(r.meta).length > 0
              const isOpen  = openRow === r.id
              return (
                <Fragment key={r.id}>
                  <tr className={hasMeta ? 'cursor-pointer hover:bg-gray-50' : ''} onClick={() => hasMeta && setOpenRow(isOpen ? null : r.id)}>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {hasMeta && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatDateTime(r._ms)}</td>
                    <td className="px-3 py-2 font-semibold">{evInfo(r.action).emoji} {evInfo(r.action).label}</td>
                    <td className="px-3 py-2">
                      {r.userNom || '—'}
                      {r.userRole && <span className="ml-1 text-xs capitalize text-gray-400">· {r.userRole}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{safeStr(r.details)}</td>
                  </tr>
                  {hasMeta && isOpen && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={4} className="px-3 py-2">
                        <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-xs">
                          {typeof r.meta === 'object' && r.meta !== null
                            ? Object.entries(r.meta).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <span className="min-w-[100px] font-semibold capitalize text-gray-500">{k}</span>
                                <span className="text-gray-700">{safeStr(v)}</span>
                              </div>
                            ))
                            : <span className="text-gray-500">{safeStr(r.meta)}</span>
                          }
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
