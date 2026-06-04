// Journal d'activité : accès verrouillé par code PIN. Historique de TOUT ce qui
// se passe sur l'application (saisies, factures, demandes, santé, utilisateurs,
// connexions, logistique, événementiel…), avec sélecteur de période (calendrier
// + plage personnalisée) et filtre par type d'événement.
import { Fragment, useMemo, useState } from 'react'
import { FileSpreadsheet, ChevronRight, ChevronDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Select from '../../shared/forms/Select'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { exportExcel } from '../../utils/exportExcel'
import { formatDateTime } from '../../utils/formatters'

// Libellé + icône par type d'événement.
const EVENTS = {
  SAISIE:         { label: 'Saisie journalière', emoji: '📝' },
  FACTURE:        { label: 'Facture créée', emoji: '🧾' },
  FACTURE_EDIT:   { label: 'Facture modifiée', emoji: '✏️' },
  FACTURE_DELETE: { label: 'Facture supprimée', emoji: '🗑️' },
  DEMANDE:        { label: 'Demande de sortie', emoji: '📤' },
  APPROBATION:    { label: 'Demande approuvée', emoji: '✅' },
  REFUS:          { label: 'Demande refusée', emoji: '⛔' },
  SANTE:          { label: 'Fiche santé', emoji: '🩺' },
  VACCIN:         { label: 'Vaccination / traitement', emoji: '💉' },
  RDV:            { label: 'Rendez-vous programmé', emoji: '📅' },
  RDV_FAIT:       { label: 'Rendez-vous clôturé', emoji: '✔️' },
  STOCK_VACCIN:   { label: 'Stock vaccins / produits', emoji: '🧪' },
  USER_CREATE:    { label: 'Utilisateur créé', emoji: '👤' },
  USER_EDIT:      { label: 'Utilisateur modifié', emoji: '🪪' },
  USER_DELETE:    { label: 'Utilisateur supprimé', emoji: '🚫' },
  CONNEXION:      { label: 'Connexion', emoji: '🔑' },
  VEHICULE:       { label: 'Véhicule', emoji: '🚚' },
  LIVRAISON:      { label: 'Livraison', emoji: '📦' },
  EVENEMENT:      { label: 'Événement', emoji: '🎪' },
  STATUT:         { label: 'Changement de statut', emoji: '🔁' }
}
const evInfo = (a) => EVENTS[a] || { label: a || 'Action', emoji: '•' }

const MODULES_LBL = {
  agro: 'MAXI-AGRO', logistique: 'Logistique', evenementiel: 'Événementiel',
  rh: 'RH', portail: 'Portail'
}
const moduleLabel = (m) => MODULES_LBL[m] || m || '—'

// Horodatage robuste (ms). Replie sur createdAt si besoin.
const tsOf = (e) => (typeof e.timestamp === 'number' ? e.timestamp : (e.createdAt || 0))
const dayOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')

export default function Journal() {
  const { data: events } = useCollection('audit_global')

  const [type, setType] = useState('')      // filtre type d'événement
  const [who, setWho] = useState('')         // filtre utilisateur
  const [openRow, setOpenRow] = useState(null) // ligne dépliée (détails)
  const { start, end, node: periodNode } = usePeriodSelect('30')

  // Types présents dans les données (pour alimenter le filtre).
  const typesPresents = useMemo(
    () => [...new Set(events.map((e) => e.action).filter(Boolean))].sort(),
    [events]
  )
  const usersPresents = useMemo(
    () => [...new Set(events.map((e) => e.userNom).filter(Boolean))].sort(),
    [events]
  )

  const lignes = useMemo(() => {
    return events
      .map((e) => ({ ...e, _ms: tsOf(e), _day: dayOf(tsOf(e)) }))
      .filter((e) =>
        (e._day >= start && e._day <= end) &&
        (!type || e.action === type) &&
        (!who || e.userNom === who)
      )
      .sort((a, b) => b._ms - a._ms)
  }, [events, start, end, type, who])

  function exportXLSX() {
    exportExcel(
      lignes.map((l) => ({
        'Date / heure': formatDateTime(l._ms),
        Utilisateur: l.userNom,
        Rôle: l.userRole || '',
        Module: moduleLabel(l.module),
        Événement: evInfo(l.action).label,
        Détails: l.details || '',
        'Détails complets': metaToText(l.meta)
      })),
      'journal-activite.xlsx',
      'Journal'
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtres : période + type d'événement + utilisateur */}
      <div className="flex flex-wrap items-end gap-3">
        {periodNode}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Type d'événement</label>
          <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les événements</option>
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
              <th className="px-3 py-2 text-left">Module</th>
              <th className="px-3 py-2 text-left">Utilisateur</th>
              <th className="px-3 py-2 text-left">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">Aucun événement sur la période.</td></tr>
            )}
            {lignes.map((r) => {
              const hasMeta = r.meta && Object.keys(r.meta).length > 0
              const isOpen = openRow === r.id
              return (
                <Fragment key={r.id}>
                  <tr
                    className={hasMeta ? 'cursor-pointer hover:bg-gray-50' : ''}
                    onClick={() => hasMeta && setOpenRow(isOpen ? null : r.id)}
                  >
                    <td className="px-2 py-2 text-center text-gray-400">
                      {hasMeta && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatDateTime(r._ms)}</td>
                    <td className="px-3 py-2 font-semibold">{evInfo(r.action).emoji} {evInfo(r.action).label}</td>
                    <td className="px-3 py-2"><Badge tone="neutral">{moduleLabel(r.module)}</Badge></td>
                    <td className="px-3 py-2">
                      {r.userNom || '—'}
                      {r.userRole && <span className="ml-1 text-xs capitalize text-gray-400">· {r.userRole}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.details || '—'}</td>
                  </tr>
                  {hasMeta && isOpen && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={5} className="px-3 py-2">
                        <MetaDetail meta={r.meta} />
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

// Affiche le détail structuré (meta) d'un événement de façon lisible.
function MetaDetail({ meta }) {
  return (
    <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-xs">
      {Object.entries(meta).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="min-w-[120px] font-semibold capitalize text-gray-500">{k}</span>
          <span className="text-gray-700">
            {v && typeof v === 'object'
              ? <span className="space-y-0.5">{Object.entries(v).map(([k2, v2]) => <span key={k2} className="block">• <strong>{k2}</strong> : {String(v2)}</span>)}</span>
              : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Convertit un objet meta en texte plat (export Excel).
function metaToText(meta) {
  if (!meta || typeof meta !== 'object') return ''
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${v && typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a}=${b}`).join('; ') : v}`)
    .join(' | ')
}
