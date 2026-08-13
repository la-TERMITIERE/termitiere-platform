// Besoins BRIQUETERIE — volet simple et autonome (non lié aux projets).
// Un agent remonte un besoin (matériaux, équipement, main d'œuvre…) avec sa
// quantité, un montant estimé et un motif ; l'administration VALIDE ou REFUSE.
// Chaque agent peut créer et gérer SES besoins tant qu'ils sont « en attente ».
import { useMemo, useState } from 'react'
import { PackagePlus, Plus, FilePen, Trash2, Check, X, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { APPROVER_ROLES, isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { genId, todayStr, formatDateShort, formatMoney } from '../../utils/formatters'

const CATEGORIES = ['Matériaux', 'Équipement', 'Main d\'œuvre', 'Transport', 'Financier', 'Autre']

const VALIDATION_META = {
  en_attente: { label: '⏳ En attente', tone: 'warning' },
  valide:     { label: '✅ Validé', tone: 'success' },
  refuse:     { label: '❌ Refusé', tone: 'danger' }
}
const validationDe = (b) => b.validation || 'en_attente'

const vide = () => ({ categorie: 'Matériaux', designation: '', quantite: '', montantEstime: '', motif: '', date: todayStr() })

export default function Besoins() {
  const { user, role } = useAuth()
  const peutCreer = !isReadOnlyRole(role)
  const peutValider = isFullAccessRole(role)
  const { data: besoins } = useCollection('evenementiel_besoins')

  const [modal, setModal] = useState(null)       // { data, isNew, id }
  const [refus, setRefus] = useState(null)       // besoin en cours de refus
  const [refusMotif, setRefusMotif] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)

  const liste = useMemo(
    () => [...besoins].sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || (a.date < b.date ? 1 : -1)),
    [besoins]
  )
  const estMien = (b) => b.demandeurUid && user?.uid && b.demandeurUid === user.uid

  async function enregistrer() {
    if (saving) return
    const d = modal.data
    if (!d.designation.trim()) return toast.error('Précisez ce dont vous avez besoin')
    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('evenementiel_besoins', id, {
          id, ...d, designation: d.designation.trim(),
          demandeurUid: user.uid, demandeurNom: user.nom || '',
          validation: 'en_attente', satisfait: false, createdAt: Date.now()
        })
        await audit('evenementiel', 'BESOIN_CREATE', `${d.designation} (${d.quantite || '—'})`)
        await notify({
          type: 'demande', title: 'Nouveau besoin — Briqueterie 🧱',
          body: `${d.designation}${d.quantite ? ` · ${d.quantite}` : ''}${d.montantEstime ? ` · ~${formatMoney(d.montantEstime)}` : ''} — demandé par ${user.nom || ''}`,
          module: 'evenementiel', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/evenementiel/besoins'
        })
        toast.success('Besoin envoyé à l\'administration ✓')
      } else {
        await setItem('evenementiel_besoins', modal.id, { ...modal.dataInitial, ...d, id: modal.id, designation: d.designation.trim() })
        await audit('evenementiel', 'BESOIN_EDIT', d.designation)
        toast.success('Besoin mis à jour ✓')
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  async function decider(b, validation, motif = '') {
    await setItem('evenementiel_besoins', b.id, {
      ...b, validation, decisionMotif: (motif || '').trim(),
      decisionPar: user.nom || '', decisionLe: Date.now()
    })
    await audit('evenementiel', validation === 'valide' ? 'BESOIN_VALIDE' : 'BESOIN_REFUSE', `${b.designation}${motif ? ' — ' + motif : ''}`)
    if (b.demandeurUid) {
      await notify({
        type: validation === 'valide' ? 'approuve' : 'refus',
        title: validation === 'valide' ? 'Besoin validé ✅' : 'Besoin refusé ⛔',
        body: `${b.designation}${motif ? ' — ' + motif : ''}`,
        module: 'evenementiel', forUsers: [b.demandeurUid], excludeUid: user.uid, link: '/evenementiel/besoins'
      })
    }
    toast.success(validation === 'valide' ? 'Besoin validé ✓' : 'Besoin refusé')
  }

  async function confirmerRefus() {
    const b = refus
    setRefus(null)
    await decider(b, 'refuse', refusMotif)
    setRefusMotif('')
  }

  async function marquerSatisfait(b) {
    await setItem('evenementiel_besoins', b.id, { ...b, satisfait: !b.satisfait })
    await audit('evenementiel', 'BESOIN_SATISFAIT', `${b.designation} — ${!b.satisfait ? 'satisfait' : 'rouvert'}`)
    toast.success(!b.satisfait ? 'Marqué satisfait ✓' : 'Rouvert')
  }

  async function supprimer() {
    const b = toDelete
    setToDelete(null)
    await removeItem('evenementiel_besoins', b.id)
    await audit('evenementiel', 'BESOIN_DELETE', b.designation)
    toast.success('Besoin supprimé ✓')
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <p className="font-bold">🧱 Besoins de la briqueterie</p>
          <p>Remontez ici ce dont vous avez besoin (matériaux, équipement, main d'œuvre…). L'administration valide ou refuse chaque besoin.</p>
        </div>
        {peutCreer && (
          <Button style={{ backgroundColor: '#7c3aed' }} onClick={() => setModal({ data: vide(), isNew: true })}>
            <Plus size={16} /> Nouveau besoin
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Catégorie</th>
              <th className="px-3 py-2 text-left">Besoin</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2 text-right">Montant estimé</th>
              <th className="px-3 py-2 text-left">Demandeur</th>
              <th className="px-3 py-2 text-center">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.map((b) => {
              const v = validationDe(b)
              const meta = VALIDATION_META[v]
              const modifiable = (estMien(b) && v === 'en_attente') || peutValider
              return (
                <tr key={b.id} className={b.satisfait ? 'bg-green-50/40' : ''}>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(b.date)}</td>
                  <td className="px-3 py-2 text-gray-600">{b.categorie || '—'}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{b.designation}</p>
                    {b.motif && <p className="text-xs text-gray-400">{b.motif}</p>}
                    {v === 'refuse' && b.decisionMotif && <p className="text-xs text-red-500">Motif du refus : {b.decisionMotif}</p>}
                  </td>
                  <td className="px-3 py-2 text-center">{b.quantite || '—'}</td>
                  <td className="px-3 py-2 text-right">{b.montantEstime ? formatMoney(b.montantEstime) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{b.demandeurNom || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {b.satisfait && <Badge tone="success">Satisfait</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {peutValider && v === 'en_attente' && (
                        <>
                          <button onClick={() => decider(b, 'valide')} title="Valider"
                            className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"><Check size={16} /></button>
                          <button onClick={() => { setRefus(b); setRefusMotif('') }} title="Refuser"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><X size={16} /></button>
                        </>
                      )}
                      {peutValider && v === 'valide' && (
                        <button onClick={() => marquerSatisfait(b)} title={b.satisfait ? 'Rouvrir' : 'Marquer satisfait'}
                          className={`rounded-lg p-1.5 ${b.satisfait ? 'text-gray-400 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'}`}><CheckCircle2 size={16} /></button>
                      )}
                      {estMien(b) && v === 'en_attente' && (
                        <button onClick={() => setModal({ data: { ...vide(), ...b }, dataInitial: b, isNew: false, id: b.id })} title="Modifier"
                          className="rounded-lg p-1.5 text-violet-600 hover:bg-violet-50"><FilePen size={15} /></button>
                      )}
                      {modifiable && (
                        <button onClick={() => setToDelete(b)} title="Supprimer"
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!liste.length && (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <PackagePlus size={32} className="opacity-30" />
            <p className="text-sm">Aucun besoin pour l'instant.</p>
          </div>
        )}
      </Card>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Nouveau besoin' : 'Modifier le besoin'}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#7c3aed' }} onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3 rounded-lg bg-white p-3">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Catégorie">
                <Select value={modal.data.categorie} onChange={(e) => set('categorie', e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
            </div>
            <FormGroup label="Besoin (désignation)" required>
              <Input value={modal.data.designation} onChange={(e) => set('designation', e.target.value)} placeholder="ex : Sacs de ciment, brouette, main d'œuvre…" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Quantité">
                <Input value={modal.data.quantite} onChange={(e) => set('quantite', e.target.value)} placeholder="ex : 20 sacs" />
              </FormGroup>
              <FormGroup label="Montant estimé (FCFA)">
                <Input type="number" min="0" value={modal.data.montantEstime} onChange={(e) => set('montantEstime', e.target.value)} placeholder="optionnel" />
              </FormGroup>
            </div>
            <FormGroup label="Motif / précision">
              <Input value={modal.data.motif} onChange={(e) => set('motif', e.target.value)} placeholder="Pourquoi ce besoin ?" />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal refus */}
      <Modal open={!!refus} onClose={() => setRefus(null)} size="sm" title="Refuser ce besoin ?"
        footer={<><Button variant="outline" onClick={() => setRefus(null)}>Annuler</Button><Button variant="danger" onClick={confirmerRefus}>Refuser</Button></>}>
        {refus && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Vous refusez « <strong>{refus.designation}</strong> ». Un motif est utile pour le demandeur.</p>
            <Input value={refusMotif} onChange={(e) => setRefusMotif(e.target.value)} placeholder="Motif du refus (optionnel)" />
          </div>
        )}
      </Modal>

      {/* Modal suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer ce besoin ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={supprimer}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Voulez-vous vraiment supprimer « {toDelete.designation} » ?</p>}
      </Modal>
    </div>
  )
}
