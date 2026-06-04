// Journal d'activité : accès verrouillé par code PIN. Historique de TOUT ce qui
// se passe sur l'application (saisies, factures, demandes, santé, utilisateurs,
// connexions, logistique, événementiel…), avec sélecteur de période (calendrier
// + plage personnalisée) et filtre par type d'événement.
import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Table from '../../shared/ui/Table'
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
        Module: moduleLabel(l.module),
        Événement: evInfo(l.action).label,
        Détails: l.details || ''
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

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date / heure', render: (r) => <span className="whitespace-nowrap font-mono text-xs">{formatDateTime(r._ms)}</span> },
            { key: 'event', label: 'Événement', render: (r) => <span className="font-semibold">{evInfo(r.action).emoji} {evInfo(r.action).label}</span> },
            { key: 'module', label: 'Module', render: (r) => <Badge tone="neutral">{moduleLabel(r.module)}</Badge> },
            { key: 'user', label: 'Utilisateur', render: (r) => r.userNom || '—' },
            { key: 'details', label: 'Détails', render: (r) => <span className="text-gray-600">{r.details || '—'}</span> }
          ]}
          rows={lignes}
          rowKey="id"
          empty="Aucun événement sur la période."
        />
      </Card>
    </div>
  )
}
