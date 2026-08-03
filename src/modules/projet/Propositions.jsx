// Propositions de projets — boîte à idées ouverte à TOUT LE MONDE (contrairement au
// reste d'E-G.Pro, pas de restriction de rôle) : n'importe qui peut suggérer un projet ;
// l'administration décide de l'accepter ou de la refuser. Une proposition acceptée reste
// ici (comme trace) — la créer réellement comme projet se fait ensuite normalement dans
// le volet Projets, cet écran n'automatise pas la conversion.
import { useState, useMemo, useEffect } from 'react'
import { Lightbulb, Plus, Pencil, Trash2, Check, X, Sparkles } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { formatDateTime } from '../../utils/formatters'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { TYPES_PROJET } from './data'
import { SECTEURS } from '../depense/data'
import { marquerVoletVu } from './vues'

const STATUTS = {
  en_attente: { label: '⏳ En attente', tone: 'warning' },
  approuvee:  { label: '✅ Approuvée',  tone: 'success' },
  rejetee:    { label: '❌ Rejetée',    tone: 'danger'  }
}

const VIDE = { titre: '', secteurId: '', type: '', budgetEstime: '', description: '' }

export default function Propositions() {
  const { data: propositionsTous } = useCollection('projet_propositions')
  const { user, role } = useAuth()
  const estAdmin = FULL_ACCESS_ROLES.includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'projetPropositions') }, [user?.uid])

  const [filtreStatut, setFiltreStatut] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)

  const propositions = useMemo(
    () => [...propositionsTous].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [propositionsTous]
  )
  const liste = useMemo(
    () => propositions.filter((p) => !filtreStatut || (p.statut || 'en_attente') === filtreStatut),
    [propositions, filtreStatut]
  )
  const compteur = (st) => propositions.filter((p) => (p.statut || 'en_attente') === st).length

  // Chacun ne peut modifier/supprimer que SA proposition, et seulement tant qu'elle est
  // encore en attente (une fois décidée, elle devient une trace) — l'administration peut
  // tout modifier/supprimer à tout moment.
  const peutGerer = (p) => estAdmin || (p.demandeParUid === user?.uid && (p.statut || 'en_attente') === 'en_attente')

  const openCreate = () => { setForm(VIDE); setEditing(null); setModal(true) }
  const openEdit = (p) => {
    setForm({ titre: p.titre || '', secteurId: p.secteurId || '', type: p.type || '', budgetEstime: p.budgetEstime ?? '', description: p.description || '' })
    setEditing(p); setModal(true)
  }

  const formValide = form.titre.trim() !== '' && form.description.trim() !== ''

  const handleSave = async () => {
    if (!formValide) return
    setSaving(true)
    try {
      const payload = {
        titre: form.titre.trim(), secteurId: form.secteurId, type: form.type,
        budgetEstime: Number(form.budgetEstime) || 0, description: form.description.trim(),
        updatedAt: Date.now()
      }
      if (editing) {
        await updateItem('projet_propositions', editing.id, payload)
        await audit('projet', 'proposition_modifiee', payload.titre)
      } else {
        await addItem('projet_propositions', {
          ...payload, statut: 'en_attente', createdAt: Date.now(),
          demandePar: user?.nom || user?.login || null, demandeParUid: user?.uid || null
        })
        await audit('projet', 'proposition_creee', payload.titre)
        await notify({
          type: 'info', title: '💡 Nouvelle proposition de projet', body: payload.titre,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/projet/propositions'
        }).catch(() => {})
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (p) => {
    if (!peutGerer(p)) return
    if (!window.confirm(`Supprimer la proposition « ${p.titre} » ?`)) return
    await removeItem('projet_propositions', p.id)
    await audit('projet', 'proposition_supprimee', p.titre)
  }

  async function decider(p, statut, motif = '') {
    await updateItem('projet_propositions', p.id, {
      statut, motifRejet: statut === 'rejetee' ? motif : '',
      decisionParText: user?.nom || user?.login || '—', decisionLe: Date.now()
    })
    await audit('projet', 'proposition_' + statut, `${p.titre}${motif ? ' — ' + motif : ''}`)
    if (p.demandeParUid && p.demandeParUid !== user?.uid) {
      await notify({
        type: statut === 'approuvee' ? 'success' : 'refus',
        title: statut === 'approuvee' ? '✅ Proposition approuvée' : '❌ Proposition rejetée',
        body: `${p.titre}${motif ? ' — ' + motif : ''}`,
        module: 'projet', forUsers: [p.demandeParUid], link: '/projet/propositions'
      }).catch(() => {})
    }
  }
  const approuver = (p) => decider(p, 'approuvee')
  const rejeter = (p) => {
    const motif = window.prompt(`Motif du refus de « ${p.titre} » (optionnel) :`)
    if (motif === null) return
    decider(p, 'rejetee', motif.trim())
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.88) 0%, rgba(26,26,26,0.88) 100%)' }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Lightbulb size={26} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Propositions de projets</h2>
          <p className="text-sm text-white/80">Ouvert à tout le monde — suggère un projet, l'administration décide.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {[['', `Toutes (${propositions.length})`], ...Object.entries(STATUTS).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'toutes'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm" className="ml-auto"><Plus size={14} className="mr-1" />Nouvelle proposition</Button>
      </div>

      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Sparkles size={32} className="opacity-30" />
            <p className="text-sm">Aucune proposition{filtreStatut ? ' dans cette catégorie' : ' pour l\'instant'}.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {liste.map((p) => {
            const secteur = SECTEURS.find((s) => s.id === p.secteurId)
            const type = TYPES_PROJET.find((t) => t.id === p.type)
            const statut = STATUTS[p.statut || 'en_attente']
            return (
              <Card key={p.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-bold text-gray-800">{p.titre}</p>
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {secteur && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: secteur.color }}>{secteur.label}</span>}
                  {type && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{type.label}</span>}
                  {Number(p.budgetEstime) > 0 && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                      ~{Number(p.budgetEstime).toLocaleString('fr-FR')} FCFA
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-line text-sm text-gray-600">{p.description}</p>
                {p.statut === 'rejetee' && p.motifRejet && (
                  <p className="text-xs text-red-500">Motif du refus : {p.motifRejet}</p>
                )}
                <p className="text-[11px] text-gray-400">
                  Proposé par {p.demandePar || '—'}{p.createdAt ? ` · ${formatDateTime(p.createdAt)}` : ''}
                  {p.decisionParText && ` · décidé par ${p.decisionParText}`}
                </p>

                {estAdmin && (p.statut || 'en_attente') === 'en_attente' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="success" onClick={() => approuver(p)}><Check size={13} /> Approuver</Button>
                    <Button size="sm" variant="danger" onClick={() => rejeter(p)}><X size={13} /> Rejeter</Button>
                  </div>
                )}

                {peutGerer(p) && (
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => openEdit(p)} className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={14} /></button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la proposition' : 'Nouvelle proposition de projet'}>
        <div className="space-y-3">
          <FormGroup label="Titre du projet proposé" required>
            <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="ex : Extension du poulailler de Kara"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Secteur" hint="Optionnel">
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.secteurId} onChange={(e) => setForm((f) => ({ ...f, secteurId: e.target.value }))}>
                <option value="">— Non précisé —</option>
                {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Type de projet" hint="Optionnel">
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="">— Non précisé —</option>
                {TYPES_PROJET.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </FormGroup>
          </div>
          <FormGroup label="Budget estimatif (FCFA)" hint="Optionnel — une estimation approximative suffit">
            <input type="number" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="ex : 500 000"
              value={form.budgetEstime} onChange={(e) => setForm((f) => ({ ...f, budgetEstime: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Description" required hint="Pourquoi ce projet ? Ce qu'il apporterait.">
            <textarea rows={4} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormGroup>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !formValide}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
