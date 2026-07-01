import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, History, ChevronDown, X, Play, Eye, CheckCircle2, CalendarClock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, removeItem } from '../../core/db'
import { STATUTS_TACHE, PRIORITES } from './data'
import { ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'

function ChampAssignee({ value, onChange, users }) {
  const [open, setOpen]     = useState(false)
  const [filtre, setFiltre] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const suggestions = useMemo(() => {
    const q = filtre.toLowerCase()
    return users.filter((u) =>
      (u.nom || u.login || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q)
    ).slice(0, 10)
  }, [users, filtre])

  const choisir = (u) => { onChange(u.nom || u.login || ''); setFiltre(''); setOpen(false) }
  const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || r || ''

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Nom ou saisie libre…"
          value={open ? filtre : value}
          onChange={(e) => { setFiltre(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button type="button" onClick={() => { onChange(''); setFiltre('') }}
            className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-red-400"><X size={14} /></button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-teal-600"><ChevronDown size={14} /></button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length
            ? <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur — votre saisie sera utilisée.</p>
            : <ul className="max-h-48 overflow-y-auto py-1">
                {suggestions.map((u) => {
                  const nom = u.nom || u.login || ''
                  return (
                    <li key={u.uid || u.login}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-teal-50"
                      onMouseDown={(e) => { e.preventDefault(); choisir(u) }}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                        {nom.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{nom}</p>
                        {u.role && <p className="text-[10px] text-gray-400">{roleLabel(u.role)}</p>}
                      </div>
                    </li>
                  )
                })}
              </ul>
          }
        </div>
      )}
    </div>
  )
}
import { formatDateShort } from '../../utils/formatters'
import { audit } from '../../core/audit'

const VIDE_TACHE = { titre: '', projetId: '', assignee: '', priorite: 'normale', statut: 'a_faire', echeance: '', note: '' }

// ─── Onglet Tâches ────────────────────────────────────────────────────────────

function OngletTaches({ taches, projets, users }) {
  const { user }              = useAuthStore()
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE_TACHE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [mesTaches, setMesTaches]       = useState(false)

  const nomConnecte = user?.nom || user?.login || ''

  const liste = useMemo(() => taches
    .filter((t) => !filtreProjet || t.projetId === filtreProjet)
    .filter((t) => !filtreStatut || t.statut === filtreStatut)
    .filter((t) => !mesTaches || !nomConnecte || t.assignee === nomConnecte)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [taches, filtreProjet, filtreStatut, mesTaches, nomConnecte])

  const openCreate = () => { setForm(VIDE_TACHE); setEditing(null); setModal(true) }
  const openEdit   = (t) => {
    setForm({
      titre: t.titre||'', projetId: t.projetId||'', assignee: t.assignee||'',
      priorite: t.priorite||'normale', statut: t.statut||'a_faire',
      echeance: t.echeance ? new Date(t.echeance).toISOString().slice(0,10) : '',
      note: t.note||''
    })
    setEditing(t); setModal(true)
  }

  const handleSave = async () => {
    if (!form.titre.trim()) return
    setSaving(true)
    try {
      const now = Date.now()
      const payload = { ...form, echeance: form.echeance ? new Date(form.echeance).getTime() : null, updatedAt: now }
      if (editing) {
        await setItem('projet_taches', editing.id, { ...editing, ...payload })
        await audit('projet', 'tache_modifiee', form.titre)
      } else {
        const id = `tache_${now}`
        await setItem('projet_taches', id, { id, ...payload, createdAt: now, createdBy: null })
        await audit('projet', 'tache_creee', form.titre)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (t) => {
    if (!window.confirm(`Supprimer la tâche "${t.titre}" ?`)) return
    await removeItem('projet_taches', t.id)
    await audit('projet', 'tache_supprimee', t.titre)
  }

  const PROGRESSION = { a_faire: 'en_cours', en_cours: 'en_revision', en_revision: 'terminee' }
  const LABEL_BTN   = { a_faire: 'Commencer', en_cours: 'Soumettre', en_revision: 'Valider' }
  const ICONE_BTN   = { a_faire: <Play size={11} />, en_cours: <Eye size={11} />, en_revision: <CheckCircle2 size={11} /> }
  const COLOR_BTN   = { a_faire: 'bg-teal-500 hover:bg-teal-600', en_cours: 'bg-amber-500 hover:bg-amber-600', en_revision: 'bg-green-500 hover:bg-green-600' }

  const avancer = async (t) => {
    const next = PROGRESSION[t.statut]
    if (!next) return
    await setItem('projet_taches', t.id, { ...t, statut: next, updatedAt: Date.now() })
    await audit('projet', 'tache_modifiee', `${t.titre} → ${next}`)
  }

  const [reportId, setReportId]     = useState(null)
  const [nouvelleDate, setNouvelleDate] = useState('')

  const ouvrirReport = (t) => {
    setReportId(t.id)
    setNouvelleDate(t.echeance ? new Date(t.echeance).toISOString().slice(0, 10) : '')
  }

  const confirmerReport = async (t) => {
    if (!nouvelleDate) return
    await setItem('projet_taches', t.id, { ...t, echeance: new Date(nouvelleDate).getTime(), updatedAt: Date.now() })
    await audit('projet', 'tache_modifiee', `${t.titre} — reportée au ${nouvelleDate}`)
    setReportId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_TACHE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {nomConnecte && (
          <button
            onClick={() => setMesTaches((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mesTaches
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600'
            }`}
          >
            Mes tâches
          </button>
        )}
        <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouvelle tâche</Button>
      </div>

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucune tâche trouvée.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((t) => {
            const projet = projets.find((p) => p.id === t.projetId)
            const enRetard = t.echeance && t.statut !== 'terminee' && t.statut !== 'annulee' && t.echeance < Date.now()
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUTS_TACHE[t.statut]?.tone}>{STATUTS_TACHE[t.statut]?.label}</Badge>
                      <Badge tone={PRIORITES[t.priorite]?.tone}>{PRIORITES[t.priorite]?.label}</Badge>
                      {enRetard && <Badge tone="danger">En retard</Badge>}
                    </div>
                    <p className="mt-1 font-semibold text-gray-800">{t.titre}</p>
                    {projet && <p className="text-xs text-teal-600">{projet.nom}</p>}
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
                      {t.assignee && <span>Assigné à : {t.assignee}</span>}
                      {t.echeance && <span className={enRetard ? 'text-red-500 font-semibold' : ''}>Échéance : {formatDateShort(t.echeance)}</span>}
                    </div>
                    {t.note && <p className="mt-1 text-xs text-gray-500">{t.note}</p>}

                    {/* Reporter */}
                    {reportId === t.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input type="date"
                          className="rounded-lg border border-amber-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={nouvelleDate}
                          onChange={(e) => setNouvelleDate(e.target.value)}
                        />
                        <button onClick={() => confirmerReport(t)}
                          className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-600">
                          Confirmer
                        </button>
                        <button onClick={() => setReportId(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-teal-600"><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(t)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                    {PROGRESSION[t.statut] && (
                      <button onClick={() => avancer(t)}
                        className={`mt-1 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white transition-colors ${COLOR_BTN[t.statut]}`}>
                        {ICONE_BTN[t.statut]}{LABEL_BTN[t.statut]}
                      </button>
                    )}
                    {!['terminee','annulee'].includes(t.statut) && (
                      <button onClick={() => ouvrirReport(t)}
                        className="flex items-center gap-1 rounded-full border border-amber-300 px-3 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 transition-colors">
                        <CalendarClock size={11} />Reporter
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la tâche' : 'Nouvelle tâche'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Titre *</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
              <option value="">— Sélectionner un projet —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))}>
                {Object.entries(STATUTS_TACHE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Priorité</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                {Object.entries(PRIORITES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Assigné à</label>
              <ChampAssignee
                value={form.assignee}
                onChange={(v) => setForm((f) => ({ ...f, assignee: v }))}
                users={users}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Échéance</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.echeance} onChange={(e) => setForm((f) => ({ ...f, echeance: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Note</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.titre.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Onglet Historique ────────────────────────────────────────────────────────

const ACTIONS_TACHE = new Set(['tache_creee', 'tache_modifiee', 'tache_supprimee'])

const CFG_ACTION = {
  tache_creee:     { label: 'Tâche créée',     color: 'bg-teal-100 text-teal-700'  },
  tache_modifiee:  { label: 'Tâche modifiée',  color: 'bg-amber-100 text-amber-700' },
  tache_supprimee: { label: 'Tâche supprimée', color: 'bg-red-100 text-red-700'    },
}

function OngletHistorique({ projets }) {
  const { data: audit_global } = useCollection('audit_global')
  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreAction, setFiltreAction] = useState('')

  const lignes = useMemo(() => {
    let result = audit_global
      .filter((e) => ACTIONS_TACHE.has(e.action))
      .filter((e) => !filtreAction || e.action === filtreAction)
    if (filtreProjet) {
      const p = projets.find((x) => x.id === filtreProjet)
      if (p) result = result.filter((e) => (e.details || '').includes(p.nom) || (e.details || '').includes(filtreProjet))
    }
    return result.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  }, [audit_global, filtreProjet, filtreAction, projets])

  const parJour = useMemo(() => {
    const groupes = {}
    lignes.forEach((e) => {
      const d = new Date(e.ts || 0)
      const cle = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      if (!groupes[cle]) groupes[cle] = []
      groupes[cle].push(e)
    })
    return Object.entries(groupes)
  }, [lignes])

  const heureStr = (ts) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const estAujourdhui = (label) => {
    const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return label === auj
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
          <option value="">Toutes les actions</option>
          {Object.entries(CFG_ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {lignes.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{lignes.length} événement{lignes.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {!lignes.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <History size={32} className="opacity-30" />
            <p className="text-sm">Aucun historique de tâche pour le moment.</p>
            <p className="text-xs">Les modifications apparaîtront ici au fur et à mesure.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {parJour.map(([jour, evenements]) => (
            <div key={jour}>
              {/* ── En-tête du jour ── */}
              <div className="mb-3 flex items-center gap-3">
                <div className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${estAujourdhui(jour) ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {estAujourdhui(jour) ? "Aujourd'hui" : jour}
                </div>
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[10px] text-gray-400">{evenements.length} action{evenements.length > 1 ? 's' : ''}</span>
              </div>

              {/* ── Timeline du jour ── */}
              <div className="ml-2 border-l-2 border-gray-100 pl-4 space-y-3">
                {evenements.map((e) => {
                  const cfg = CFG_ACTION[e.action] || { label: e.action, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={e.id || e.ts} className="relative flex items-start gap-3">
                      {/* point sur la ligne */}
                      <div className="absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />
                      <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-gray-400">{heureStr(e.ts)}</span>
                        </div>
                        {e.details && <p className="mt-1 text-sm font-medium text-gray-700">{e.details}</p>}
                        {e.user && <p className="mt-0.5 text-[11px] text-gray-400">par <span className="font-semibold text-gray-500">{e.user}</span></p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Taches() {
  const { data: taches }  = useCollection('projet_taches')
  const { data: projets } = useCollection('projets')
  const { data: users }   = useCollection('users')
  const [onglet, setOnglet] = useState('taches')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'taches',      label: '✅ Tâches'     },
          { id: 'historique',  label: '🕐 Historique' }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${onglet===o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'taches'
        ? <OngletTaches taches={taches} projets={projets} users={users} />
        : <OngletHistorique projets={projets} />
      }
    </div>
  )
}
