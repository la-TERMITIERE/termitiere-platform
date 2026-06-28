import { useMemo, useState } from 'react'
import { Plus, FileSpreadsheet, Printer } from 'lucide-react'
import { genererRecuPaiement } from './recuPDF'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { formatMoney } from '../../utils/formatters'
import { TYPES_PAIEMENT, MODES_PAIEMENT, STATUTS_PAIEMENT, MOIS } from './data'
import { useGarderieStore } from './store/garderieStore'
import { exportRapportExcel } from '../../utils/excelReport'

const now = new Date()
const empty = () => ({
  enfantId: '', enfantNom: '',
  type: 'mensuel', mois: now.getMonth() + 1, annee: now.getFullYear(),
  montantDu: '', montantPaye: '', modePaiement: 'espece',
  statut: 'paye', date: todayStr(), notes: ''
})

export default function Paiements() {
  const { user } = useAuth()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: paiements } = useCollection('garderie_paiements')
  const params = useGarderieStore((s) => s.params)

  const [modal, setModal]     = useState(null)
  const [filtreEnfant, setFiltreEnfant] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreMois, setFiltreMois]     = useState(now.getMonth() + 1)
  const [filtreAnnee, setFiltreAnnee]   = useState(now.getFullYear())

  const enfantsActifs = useMemo(() => enfants.filter((e) => e.statut === 'actif'), [enfants])

  const liste = useMemo(() => {
    let rows = [...paiements]
    if (filtreEnfant) rows = rows.filter((p) => p.enfantId === filtreEnfant)
    if (filtreStatut) rows = rows.filter((p) => p.statut === filtreStatut)
    if (filtreMois)  rows = rows.filter((p) => Number(p.mois) === Number(filtreMois))
    if (filtreAnnee) rows = rows.filter((p) => Number(p.annee) === Number(filtreAnnee))
    return rows.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
  }, [paiements, filtreEnfant, filtreStatut, filtreMois, filtreAnnee])

  const totalPaye   = useMemo(() => liste.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0), [liste])
  const totalDu     = useMemo(() => liste.reduce((s, p) => s + (Number(p.montantDu) || 0), 0), [liste])

  function openCreate() {
    setModal({ data: { ...empty(), montantDu: params.tarifMensuel }, isNew: true })
  }

  async function handleSave() {
    const d = modal.data
    if (!d.enfantId) return toast.error('Sélectionnez un enfant')
    if (!d.montantDu || !d.montantPaye) return toast.error('Montants requis')
    const statut = Number(d.montantPaye) >= Number(d.montantDu) ? 'paye'
                 : Number(d.montantPaye) > 0 ? 'partiel' : 'impaye'
    const payload = { ...d, statut, montantDu: Number(d.montantDu), montantPaye: Number(d.montantPaye) }
    if (modal.isNew) {
      const id = genId()
      await setItem('garderie_paiements', id, { ...payload, id })
      audit('garderie', 'PAIEMENT_CREATE', d.enfantNom, { mois: d.mois, annee: d.annee, montant: d.montantPaye })
      notify({ type: 'info', title: `💰 Paiement reçu — ${d.enfantNom}`, body: `${Number(d.montantPaye).toLocaleString('fr-FR')} FCFA — ${statut === 'paye' ? 'Soldé' : statut === 'partiel' ? 'Partiel' : 'Impayé'}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/paiements' })
      toast.success('Paiement enregistré ✓')
    } else {
      const id = modal.id
      await setItem('garderie_paiements', id, { ...payload, id })
      audit('garderie', 'PAIEMENT_EDIT', d.enfantNom)
      toast.success('Paiement mis à jour ✓')
    }
    setModal(null)
  }

  function onEnfantChange(id) {
    const e = enfantsActifs.find((x) => x.id === id)
    setModal((m) => ({ ...m, data: { ...m.data, enfantId: id, enfantNom: e ? `${e.prenom} ${e.nom}` : '' } }))
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function exportXLSX() {
    const rows = liste.map((p) => ({
      Enfant: p.enfantNom || '—',
      Type: TYPES_PAIEMENT.find((t) => t.id === p.type)?.label || p.type,
      Période: `${MOIS[(p.mois || 1) - 1]} ${p.annee}`,
      'Montant dû': p.montantDu,
      'Montant payé': p.montantPaye,
      Mode: MODES_PAIEMENT.find((m) => m.id === p.modePaiement)?.label || p.modePaiement,
      Statut: STATUTS_PAIEMENT[p.statut]?.label || p.statut,
      Date: formatDateShort(p.date),
      Notes: p.notes || ''
    }))
    exportRapportExcel({ theme: 'garderie',
      filename: `paiements-garderie-${filtreAnnee}-${filtreMois}.xlsx`,
      sections: [{
        id: 'paiements', name: 'Paiements',
        title: 'Suivi des paiements — Garderie',
        subtitle: `${MOIS[(filtreMois || 1) - 1]} ${filtreAnnee} · ${liste.length} enregistrement(s)`,
        columns: [
          { key: 'Enfant', label: 'Enfant', width: 22 },
          { key: 'Type', label: 'Type', width: 20 },
          { key: 'Période', label: 'Période', width: 16 },
          { key: 'Montant dû', label: 'Montant dû (FCFA)', width: 18 },
          { key: 'Montant payé', label: 'Montant payé (FCFA)', width: 18 },
          { key: 'Mode', label: 'Mode paiement', width: 16 },
          { key: 'Statut', label: 'Statut', width: 12 },
          { key: 'Date', label: 'Date', width: 14 },
          { key: 'Notes', label: 'Notes', width: 30 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Mois</label>
          <Select value={filtreMois} onChange={(e) => setFiltreMois(Number(e.target.value))}>
            {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Année</label>
          <Input type="number" value={filtreAnnee} onChange={(e) => setFiltreAnnee(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Enfant</label>
          <Select value={filtreEnfant} onChange={(e) => setFiltreEnfant(e.target.value)}>
            <option value="">Tous</option>
            {enfantsActifs.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="font-semibold text-green-600">{formatMoney(totalPaye)} payés</p>
            <p className="text-xs text-gray-400">{formatMoney(totalDu)} attendus</p>
          </div>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export</Button>
          <Button onClick={openCreate}><Plus size={16} /> Nouveau paiement</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Période</th>
              <th className="px-3 py-2 text-right">Dû</th>
              <th className="px-3 py-2 text-right">Payé</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-sm text-gray-400">Aucun paiement sur la période.</td></tr>
            )}
            {liste.map((p) => (
              <tr key={p.id} className="hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">{p.enfantNom || '—'}</td>
                <td className="px-3 py-2">{TYPES_PAIEMENT.find((t) => t.id === p.type)?.label || p.type}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{MOIS[(p.mois || 1) - 1]} {p.annee}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatMoney(p.montantDu)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{formatMoney(p.montantPaye)}</td>
                <td className="px-3 py-2 text-xs">{MODES_PAIEMENT.find((m) => m.id === p.modePaiement)?.label || p.modePaiement}</td>
                <td className="px-3 py-2"><Badge tone={STATUTS_PAIEMENT[p.statut]?.tone}>{STATUTS_PAIEMENT[p.statut]?.label}</Badge></td>
                <td className="px-3 py-2 text-xs text-gray-400">{formatDateShort(p.date)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setModal({ data: { ...empty(), ...p }, isNew: false, id: p.id })}
                    className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">Éditer</button>
                  <button
                    onClick={() => {
                      const enfant = enfantsActifs.find((e) => e.id === p.enfantId)
                      genererRecuPaiement(p, enfant)
                    }}
                    title="Télécharger le reçu PDF"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 font-semibold">
                    <Printer size={12} /> Reçu
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Enregistrer un paiement' : 'Modifier le paiement'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Enfant *">
              <Select value={modal.data.enfantId} onChange={(e) => onEnfantChange(e.target.value)}>
                <option value="">— Choisir —</option>
                {enfantsActifs.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </Select>
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type de paiement">
                <Select value={modal.data.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPES_PAIEMENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Mode de paiement">
                <Select value={modal.data.modePaiement} onChange={(e) => set('modePaiement', e.target.value)}>
                  {MODES_PAIEMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Mois">
                <Select value={modal.data.mois} onChange={(e) => set('mois', Number(e.target.value))}>
                  {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Année">
                <Input type="number" value={modal.data.annee} onChange={(e) => set('annee', Number(e.target.value))} />
              </FormGroup>
              <FormGroup label="Montant dû (FCFA) *">
                <Input type="number" value={modal.data.montantDu} onChange={(e) => set('montantDu', e.target.value)} />
              </FormGroup>
              <FormGroup label="Montant payé (FCFA) *">
                <Input type="number" value={modal.data.montantPaye} onChange={(e) => set('montantPaye', e.target.value)} />
              </FormGroup>
              <FormGroup label="Date de paiement">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
            </div>
            <FormGroup label="Notes">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)} />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
