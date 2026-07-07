import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, X, Play, CheckCircle2, FileDown, Loader2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, removeItem } from '../../core/db'
import { STATUTS_PROJET, TYPES_PROJET, PRIORITES, UNITES_SUPERFICIE, uniteSuperficie } from './data'
import { avancementProjet, genererNumProjet } from './logic'
import { formatDateShort, formatMoney } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'
import { genererRapportProjetPDF } from './rapportPdf'
import { marquerVoletVu } from './vues'

// ── Champ responsable : liste utilisateurs + saisie libre ────────────────────
function ChampResponsable({ value, onChange, users }) {
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

  const choisir = (u) => {
    onChange(u.nom || u.login || '')
    setFiltre('')
    setOpen(false)
  }

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
            className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-red-400">
            <X size={14} />
          </button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-teal-600">
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length ? (
            <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur trouvé — votre saisie sera utilisée.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {suggestions.map((u) => {
                const nom = u.nom || u.login || ''
                const rl  = roleLabel(u.role)
                return (
                  <li key={u.uid || u.login}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-teal-50"
                    onMouseDown={(e) => { e.preventDefault(); choisir(u) }}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                      {nom.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-700 truncate">{nom}</p>
                      {rl && <p className="text-[10px] text-gray-400">{rl}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const VIDE = { nom: '', type: 'autre', statut: 'planification', priorite: 'normale', responsable: '', dateDebut: '', dateFin: '', dureeIndeterminee: false, budget: '', description: '', superficie: '', superficieUnite: 'ha' }

export default function Projets() {
  const { data: projets }      = useCollection('projets')
  const { data: taches }       = useCollection('projet_taches')
  const { data: depenses }     = useCollection('projet_depenses')
  const { data: commentaires } = useCollection('projet_commentaires')
  const { data: users }        = useCollection('users')
  const [generatingPdf, setGeneratingPdf] = useState(null)

  // Total dépensé par projet — recalculé en temps réel à chaque dépense saisie.
  const depenseParProjet = useMemo(() => {
    const map = {}
    depenses.forEach((d) => { if (d.projetId) map[d.projetId] = (map[d.projetId] || 0) + (Number(d.montant) || 0) })
    return map
  }, [depenses])
  const { user, role }    = useAuthStore()
  const lectureSeule      = role === 'chef_projet'
  useEffect(() => { marquerVoletVu(user?.uid, 'projetProjets') }, [user?.uid])
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]         = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [tri, setTri]               = useState('date_desc')
  const [mesProjets, setMesProjets] = useState(false)
  const [detail, setDetail]         = useState(null)

  const nomConnecte = user?.nom || user?.login || ''

  const liste = useMemo(() => {
    let result = projets
      .filter((p) => (!search || p.nom?.toLowerCase().includes(search.toLowerCase()) || p.num?.includes(search)))
      .filter((p) => !filtreStatut || p.statut === filtreStatut)
      .filter((p) => !mesProjets || !nomConnecte || p.responsable === nomConnecte)

    switch (tri) {
      case 'nom_asc':    result = [...result].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')); break
      case 'nom_desc':   result = [...result].sort((a, b) => (b.nom || '').localeCompare(a.nom || '')); break
      case 'date_desc':  result = [...result].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); break
      case 'date_asc':   result = [...result].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); break
      case 'fin_asc':    result = [...result].sort((a, b) => (a.dateFin || Infinity) - (b.dateFin || Infinity)); break
      case 'priorite':   result = [...result].sort((a, b) => {
        const ordre = { critique: 0, haute: 1, normale: 2, basse: 3 }
        return (ordre[a.priorite] ?? 9) - (ordre[b.priorite] ?? 9)
      }); break
      case 'avancement': result = [...result].sort((a, b) => {
        const pctA = avancementProjet(taches.filter((t) => t.projetId === a.id), a)
        const pctB = avancementProjet(taches.filter((t) => t.projetId === b.id), b)
        return pctB - pctA
      }); break
      case 'budget_desc': result = [...result].sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0)); break
    }
    return result
  }, [projets, taches, search, filtreStatut, tri, mesProjets, nomConnecte])

  const openCreate = () => { setForm(VIDE); setEditing(null); setModal(true) }
  const openEdit   = (p) => {
    setForm({
      nom: p.nom || '', type: p.type || 'autre', statut: p.statut || 'planification',
      priorite: p.priorite || 'normale', responsable: p.responsable || '',
      dateDebut: p.dateDebut ? new Date(p.dateDebut).toISOString().slice(0,10) : '',
      dateFin:   p.dateFin   ? new Date(p.dateFin).toISOString().slice(0,10)   : '',
      dureeIndeterminee: !!p.dureeIndeterminee,
      budget: p.budget ?? '', description: p.description || '',
      superficie: p.superficie ?? '', superficieUnite: p.superficieUnite || 'ha'
    })
    setEditing(p)
    setModal(true)
  }

  const budgetValide = form.budget !== '' && Number(form.budget) > 0

  const handleSave = async () => {
    if (!form.nom.trim() || !budgetValide) return
    setSaving(true)
    try {
      const now = Date.now()
      if (editing) {
        await setItem('projets', editing.id, {
          ...editing,
          ...form,
          dateDebut: form.dateDebut ? new Date(form.dateDebut).getTime() : null,
          dateFin:   (!form.dureeIndeterminee && form.dateFin) ? new Date(form.dateFin).getTime() : null,
          budget:   form.budget   !== '' ? Number(form.budget)   : null,
          superficie: (form.type === 'agricole' && form.superficie !== '') ? Number(form.superficie) : null,
          updatedAt: now
        })
        await audit('projet', 'projet_modifie', `${form.nom} (${editing.id})`)
      } else {
        const num = genererNumProjet(projets.length + 1)
        const id  = `prj_${now}`
        await setItem('projets', id, {
          id, num, ...form,
          dateDebut: form.dateDebut ? new Date(form.dateDebut).getTime() : null,
          dateFin:   (!form.dureeIndeterminee && form.dateFin) ? new Date(form.dateFin).getTime() : null,
          budget: form.budget !== '' ? Number(form.budget) : null,
          superficie: (form.type === 'agricole' && form.superficie !== '') ? Number(form.superficie) : null,
          createdAt: now, updatedAt: now,
          createdBy: null
        })
        await audit('projet', 'projet_cree', `${form.nom} (${num})`)
      }
      setModal(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Supprimer le projet "${p.nom}" ?`)) return
    await removeItem('projets', p.id)
    await audit('projet', 'projet_supprime', `${p.nom} (${p.id})`)
  }

  const demarrer = async (p) => {
    await setItem('projets', p.id, { ...p, statut: 'en_cours', dateDebut: p.dateDebut || Date.now(), updatedAt: Date.now() })
    await audit('projet', 'projet_modifie', `${p.nom} — démarré`)
  }

  const terminer = async (p) => {
    if (!window.confirm(`Marquer "${p.nom}" comme terminé ?`)) return
    await setItem('projets', p.id, { ...p, statut: 'termine', updatedAt: Date.now() })
    await audit('projet', 'projet_modifie', `${p.nom} — terminé`)
  }

  const telechargerPDF = async (p) => {
    setGeneratingPdf(p.id)
    try {
      await genererRapportProjetPDF(p, taches, depenses, commentaires)
      await audit('projet', 'rapport_pdf_genere', p.nom)
    } catch (e) {
      console.error(e)
      alert('Erreur lors de la génération du PDF.')
    } finally {
      setGeneratingPdf(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Rechercher un projet…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_PROJET).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={tri} onChange={(e) => setTri(e.target.value)}
        >
          <option value="date_desc">Plus récent</option>
          <option value="date_asc">Plus ancien</option>
          <option value="nom_asc">Nom A → Z</option>
          <option value="nom_desc">Nom Z → A</option>
          <option value="fin_asc">Échéance proche</option>
          <option value="priorite">Priorité</option>
          <option value="avancement">Avancement ↓</option>
          <option value="budget_desc">Budget ↓</option>
        </select>
        {nomConnecte && (
          <button
            onClick={() => setMesProjets((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mesProjets
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600'
            }`}
          >
            Mes projets
          </button>
        )}
        {!lectureSeule && (
          <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouveau projet</Button>
        )}
      </div>

      {liste.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5">
          <span className="text-lg">💡</span>
          <p className="text-sm font-semibold text-teal-800">
            Clique sur un projet pour voir tous ses détails et télécharger son rapport PDF.
          </p>
        </div>
      )}

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucun projet trouvé.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((p) => {
            const tachesDuProjet = taches.filter((t) => t.projetId === p.id)
            const depense    = depenseParProjet[p.id] || 0
            const budget     = Number(p.budget) || 0
            const reste      = budget - depense
            const pctBudget  = budget > 0 ? Math.round((depense / budget) * 100) : 0
            const superficie = Number(p.superficie) || 0
            const coutParUnite = (p.type === 'agricole' && superficie > 0 && depense > 0) ? depense / superficie : null
            // Avancement basé sur les tâches ; sans tâche, on retombe sur le taux de consommation du budget.
            const pct = avancementProjet(tachesDuProjet, { ...p, depenses: depense })
            return (
              <Card key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">{p.num}</span>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                      <Badge tone={PRIORITES[p.priorite]?.tone}>{PRIORITES[p.priorite]?.label}</Badge>
                    </div>
                    <p className="mt-1 font-semibold text-gray-800">{p.nom}</p>
                    {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
                      {p.responsable && <span>Resp. : {p.responsable}</span>}
                      {p.dateDebut   && <span>Début : {formatDateShort(p.dateDebut)}</span>}
                      {p.dureeIndeterminee
                        ? <span className="italic text-gray-400">Durée indéterminée</span>
                        : p.dateFin && <span>Fin : {formatDateShort(p.dateFin)}</span>}
                      {p.type === 'agricole' && superficie > 0 && (
                        <span className="font-medium text-green-700">🌱 {superficie} {uniteSuperficie(p.superficieUnite)}</span>
                      )}
                    </div>

                    {/* Suivi budgétaire — le reste diminue à chaque dépense */}
                    {budget > 0 && (
                      <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                          <span className="text-gray-500">Budget : <b className="text-gray-700">{formatMoney(budget)}</b></span>
                          <span className="text-gray-500">Dépensé : <b className="text-amber-600">{formatMoney(depense)}</b></span>
                          <span className="text-gray-500">Reste : <b className={reste < 0 ? 'text-red-600' : 'text-green-600'}>{formatMoney(reste)}</b></span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-gray-200">
                          <div className={`h-1.5 rounded-full transition-all ${pctBudget >= 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, pctBudget)}%` }} />
                        </div>
                        {reste < 0 && (
                          <p className="mt-1 text-[10px] font-bold text-red-600">⚠ Budget dépassé de {formatMoney(-reste)}</p>
                        )}
                        {coutParUnite !== null && (
                          <p className="mt-1 text-[10px] font-semibold text-green-700">Coût par {uniteSuperficie(p.superficieUnite)} : {formatMoney(coutParUnite)}</p>
                        )}
                      </div>
                    )}

                    {/* Avancement des tâches */}
                    {tachesDuProjet.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">
                          {pct}% — {tachesDuProjet.filter(t=>t.statut==='terminee').length}/{tachesDuProjet.length} tâches
                        </span>
                      </div>
                    )}
                  </div>
                  {!lectureSeule && (
                  <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-teal-600"><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(p)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                    {p.statut === 'planification' && (
                      <button onClick={() => demarrer(p)}
                        className="mt-1 flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-600 transition-colors">
                        <Play size={11} />Démarrer
                      </button>
                    )}
                    {p.statut === 'en_cours' && (
                      <button onClick={() => terminer(p)}
                        className="mt-1 flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-green-600 transition-colors">
                        <CheckCircle2 size={11} />Terminer
                      </button>
                    )}
                  </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le projet' : 'Nouveau projet'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nom du projet *</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES_PROJET.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))}>
                {Object.entries(STATUTS_PROJET).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Priorité</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Responsable</label>
              <ChampResponsable
                value={form.responsable}
                onChange={(v) => setForm((f) => ({ ...f, responsable: v }))}
                users={users}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Date début</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-gray-600">Date fin prévue</label>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={form.dureeIndeterminee}
                    onChange={(e) => setForm((f) => ({ ...f, dureeIndeterminee: e.target.checked, dateFin: e.target.checked ? '' : f.dateFin }))} />
                  Durée indéterminée
                </label>
              </div>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                disabled={form.dureeIndeterminee}
                value={form.dateFin} onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))} />
            </div>
          </div>
          {form.type === 'agricole' && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-green-100 bg-green-50 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Superficie cultivée</label>
                <input type="number" step="any" min="0" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="ex : 2.5"
                  value={form.superficie} onChange={(e) => setForm((f) => ({ ...f, superficie: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Unité</label>
                <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                  value={form.superficieUnite} onChange={(e) => setForm((f) => ({ ...f, superficieUnite: e.target.value }))}>
                  {Object.entries(UNITES_SUPERFICIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Budget prévu (FCFA) *</label>
            <input type="number" min="0" required
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${form.budget !== '' && !budgetValide ? 'border-red-300' : 'border-gray-200'}`}
              value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
            {form.budget !== '' && !budgetValide
              ? <p className="mt-1 text-[11px] text-red-500">Le budget doit être supérieur à 0.</p>
              : <p className="mt-1 text-[11px] text-gray-400">Les dépenses réelles se calculent automatiquement à partir des décaissements saisis dans l'onglet Dépenses.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.nom.trim() || !budgetValide}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Fiche détail d'un projet ── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.nom || ''}>
        {detail && (() => {
          const d = detail
          const tachesDuProjet = taches.filter((t) => t.projetId === d.id)
          const depense    = depenseParProjet[d.id] || 0
          const budget     = Number(d.budget) || 0
          const reste      = budget - depense
          const pctBudget  = budget > 0 ? Math.round((depense / budget) * 100) : 0
          const superficie = Number(d.superficie) || 0
          const coutParUnite = (d.type === 'agricole' && superficie > 0 && depense > 0) ? depense / superficie : null
          const pct = avancementProjet(tachesDuProjet, { ...d, depenses: depense })
          const typeLabel = TYPES_PROJET.find((t) => t.id === d.type)?.label || d.type || '—'

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-gray-400">{d.num}</span>
                <Badge tone={STATUTS_PROJET[d.statut]?.tone}>{STATUTS_PROJET[d.statut]?.label}</Badge>
                <Badge tone={PRIORITES[d.priorite]?.tone}>{PRIORITES[d.priorite]?.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Type : </span><span className="font-semibold">{typeLabel}</span></div>
                <div><span className="text-gray-500">Responsable : </span><span className="font-semibold">{d.responsable || '—'}</span></div>
                <div><span className="text-gray-500">Début : </span><span className="font-semibold">{d.dateDebut ? formatDateShort(d.dateDebut) : '—'}</span></div>
                <div>
                  <span className="text-gray-500">Fin prévue : </span>
                  <span className="font-semibold">{d.dureeIndeterminee ? 'Durée indéterminée' : (d.dateFin ? formatDateShort(d.dateFin) : '—')}</span>
                </div>
                {d.type === 'agricole' && superficie > 0 && (
                  <div><span className="text-gray-500">Superficie : </span><span className="font-semibold text-green-700">🌱 {superficie} {uniteSuperficie(d.superficieUnite)}</span></div>
                )}
              </div>

              {d.description && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.description}</p>
                </div>
              )}

              {/* Suivi budgétaire */}
              {budget > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase text-gray-500">Suivi budgétaire</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-500">Budget : <b className="text-gray-700">{formatMoney(budget)}</b></span>
                    <span className="text-gray-500">Dépensé : <b className="text-amber-600">{formatMoney(depense)}</b></span>
                    <span className="text-gray-500">Reste : <b className={reste < 0 ? 'text-red-600' : 'text-green-600'}>{formatMoney(reste)}</b></span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                    <div className={`h-1.5 rounded-full transition-all ${pctBudget >= 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, pctBudget)}%` }} />
                  </div>
                  {reste < 0 && (
                    <p className="mt-1 text-xs font-bold text-red-600">⚠ Budget dépassé de {formatMoney(-reste)}</p>
                  )}
                  {coutParUnite !== null && (
                    <p className="mt-1 text-xs font-semibold text-green-700">Coût par {uniteSuperficie(d.superficieUnite)} : {formatMoney(coutParUnite)}</p>
                  )}
                </div>
              )}

              {/* Avancement des tâches */}
              {tachesDuProjet.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Avancement des tâches</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-500">
                      {pct}% — {tachesDuProjet.filter(t => t.statut === 'terminee').length}/{tachesDuProjet.length} tâches
                    </span>
                  </div>
                </div>
              )}

              {/* Export PDF — bien visible en bas de la fiche */}
              <div className="border-t border-gray-100 pt-4">
                <Button onClick={() => telechargerPDF(d)} disabled={generatingPdf === d.id} className="w-full justify-center">
                  {generatingPdf === d.id
                    ? <><Loader2 size={15} className="mr-2 animate-spin" />Génération du PDF…</>
                    : <><FileDown size={15} className="mr-2" />Télécharger le rapport PDF</>
                  }
                </Button>
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  Ce PDF reprend toutes les informations ci-dessus, ainsi que le détail complet des tâches, dépenses et du journal de bord du projet.
                </p>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
