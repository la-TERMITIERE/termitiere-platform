// Suivi des dépenses détaillé par projet.
import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Wallet, TrendingDown, ChevronDown, MessageSquare, Send, FileSpreadsheet, FileText } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import StatCard from '../../shared/ui/StatCard'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuthStore } from '../../core/auth'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { STATUTS_PROJET } from './data'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const CATEGORIES = [
  { id: 'main_oeuvre',  label: 'Main d\'œuvre'   },
  { id: 'materiaux',    label: 'Matériaux'        },
  { id: 'equipement',   label: 'Équipement'       },
  { id: 'transport',    label: 'Transport'        },
  { id: 'sous_traitance', label: 'Sous-traitance' },
  { id: 'administratif', label: 'Administratif'   },
  { id: 'autre',        label: 'Autre'            }
]

const VIDE = { projetId: '', date: '', montant: '', categorie: '', description: '', fournisseur: '', statut: 'en_attente' }

const STATUTS_DEP = {
  en_attente: { label: 'En attente',  tone: 'warning' },
  approuvee:  { label: 'Approuvée',   tone: 'success' },
  rejetee:    { label: 'Rejetée',     tone: 'danger'  },
}

// ── Champ catégorie : liste prédéfinie + saisie libre ──────────────────────
function ChampCategorie({ value, onChange }) {
  const [libre, setLibre] = useState(!CATEGORIES.find((c) => c.id === value) && !!value)

  const handleSelect = (e) => {
    const val = e.target.value
    if (val === '__libre__') { setLibre(true); onChange('') }
    else { setLibre(false); onChange(val) }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none"
          value={libre ? '__libre__' : (value || '')}
          onChange={handleSelect}
        >
          <option value="">— Choisir —</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value="__libre__">✏️ Saisir une catégorie…</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      {libre && (
        <input
          autoFocus
          className="w-full rounded-lg border border-teal-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Nom de la catégorie…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export default function Depenses() {
  const { data: projets }  = useCollection('projets')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: notes }    = useCollection('projet_depenses_notes')
  const { user } = useAuthStore()

  const canApprove = FULL_ACCESS_ROLES.includes(user?.role)

  const [filtreProjet, setFiltreProjet]     = useState('')
  const [filtreCategorie, setFiltreCateg]   = useState('')
  const [filtreStatutDep, setFiltreStatutDep] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [noteDepId, setNoteDepId] = useState(null)
  const [noteTexte, setNoteTexte] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  const notesDeDepense = (depId) => notes.filter((n) => n.depenseId === depId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  const envoyerNote = async () => {
    if (!noteTexte.trim() || !noteDepId) return
    setNoteSaving(true)
    try {
      await addItem('projet_depenses_notes', {
        depenseId: noteDepId,
        texte: noteTexte.trim(),
        auteur: user?.nom || user?.login || 'Anonyme',
        createdAt: Date.now()
      })
      setNoteTexte('')
    } finally { setNoteSaving(false) }
  }

  const supprimerNote = async (n) => {
    await removeItem('projet_depenses_notes', n.id)
  }

  // ── Données filtrées ─────────────────────────────────────────────────────

  const liste = useMemo(() =>
    depenses
      .filter((d) => !filtreProjet    || d.projetId  === filtreProjet)
      .filter((d) => !filtreCategorie || d.categorie === filtreCategorie)
      .filter((d) => !filtreStatutDep || (d.statut || 'en_attente') === filtreStatutDep)
      .sort((a, b) => (b.date || 0) - (a.date || 0)),
  [depenses, filtreProjet, filtreCategorie, filtreStatutDep])

  const totalFiltre = useMemo(() => liste.reduce((s, d) => s + (Number(d.montant) || 0), 0), [liste])

  // KPI global
  const kpi = useMemo(() => {
    const totalBudget   = projets.reduce((s, p) => s + (Number(p.budget) || 0), 0)
    const totalDepenses = depenses.reduce((s, d) => s + (Number(d.montant) || 0), 0)
    return { totalBudget, totalDepenses, ecart: totalBudget - totalDepenses }
  }, [projets, depenses])

  // Par catégorie
  const parCategorie = useMemo(() => {
    const map = {}
    liste.forEach((d) => { map[d.categorie] = (map[d.categorie] || 0) + (Number(d.montant) || 0) })
    return CATEGORIES.filter((c) => map[c.id]).map((c) => ({ ...c, total: map[c.id] }))
  }, [liste])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setEditing(null); setModal(true) }
  const openEdit   = (d) => {
    setForm({
      projetId:    d.projetId    || '',
      date:        d.date ? new Date(d.date).toISOString().slice(0, 10) : '',
      montant:     d.montant     ?? '',
      categorie:   d.categorie   || 'autre',
      description: d.description || '',
      fournisseur: d.fournisseur || ''
    })
    setEditing(d); setModal(true)
  }

  const handleSave = async () => {
    if (!form.montant || !form.projetId) return
    setSaving(true)
    try {
      const now = Date.now()
      const payload = {
        ...form,
        montant: Number(form.montant),
        date: form.date ? new Date(form.date).getTime() : now,
        updatedAt: now
      }
      if (editing) {
        await setItem('projet_depenses', editing.id, { ...editing, ...payload })
      } else {
        await addItem('projet_depenses', { ...payload, statut: 'en_attente', createdAt: now, ajoutePar: user?.nom || user?.login || null })
        // Mettre à jour le total dépenses du projet
        const projet = projets.find((p) => p.id === form.projetId)
        if (projet) {
          const totalProjet = depenses
            .filter((d) => d.projetId === form.projetId)
            .reduce((s, d) => s + (Number(d.montant) || 0), 0) + Number(form.montant)
          await updateItem('projets', form.projetId, { depenses: totalProjet, updatedAt: now })
        }
        const projet2 = projets.find((p) => p.id === form.projetId)
        await audit('projet', 'depense_ajoutee', `${Number(form.montant).toLocaleString('fr-FR')} FCFA — ${projet2?.nom || form.projetId}`)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (d) => {
    if (!window.confirm('Supprimer cette dépense ?')) return
    await removeItem('projet_depenses', d.id)
    // Recalculer le total du projet
    const projet = projets.find((p) => p.id === d.projetId)
    if (projet) {
      const totalProjet = depenses
        .filter((dep) => dep.id !== d.id && dep.projetId === d.projetId)
        .reduce((s, dep) => s + (Number(dep.montant) || 0), 0)
      await updateItem('projets', d.projetId, { depenses: totalProjet, updatedAt: Date.now() })
    }
  }

  const approuver = async (d) => {
    await updateItem('projet_depenses', d.id, { statut: 'approuvee', approuvePar: user?.nom || user?.login, approuveAt: Date.now() })
    await audit('projet', 'depense_approuvee', `${formatMoney(d.montant)} — ${d.description || d.categorie}`)
  }

  const rejeter = async (d) => {
    await updateItem('projet_depenses', d.id, { statut: 'rejetee', rejetePar: user?.nom || user?.login, rejeteAt: Date.now() })
    await audit('projet', 'depense_rejetee', `${formatMoney(d.montant)} — ${d.description || d.categorie}`)
  }

  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id

  const exportExcel = () => {
    const rows = liste.map((d) => ({
      Date:        d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '',
      Projet:      projets.find((p) => p.id === d.projetId)?.nom || d.projetId,
      Catégorie:   catLabel(d.categorie),
      Description: d.description || '',
      Fournisseur: d.fournisseur || '',
      'Montant (FCFA)': Number(d.montant) || 0,
      Statut:      STATUTS_DEP[d.statut || 'en_attente']?.label || d.statut || 'En attente',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Dépenses')
    XLSX.writeFile(wb, `depenses_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(14)
    doc.text('Relevé des dépenses', 14, 14)
    doc.setFontSize(9)
    doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')} — Total : ${formatMoney(totalFiltre)}`, 14, 21)
    autoTable(doc, {
      startY: 26,
      head: [['Date', 'Projet', 'Catégorie', 'Description', 'Fournisseur', 'Montant (FCFA)', 'Statut']],
      body: liste.map((d) => [
        d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '',
        projets.find((p) => p.id === d.projetId)?.nom || '',
        catLabel(d.categorie),
        d.description || '',
        d.fournisseur || '',
        (Number(d.montant) || 0).toLocaleString('fr-FR'),
        STATUTS_DEP[d.statut || 'en_attente']?.label || 'En attente',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 148, 136] },
    })
    doc.save(`depenses_${new Date().toISOString().slice(0,10)}.pdf`)
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard title={<span className="flex items-center gap-1">Budget total <InfoBulle texte="Somme des budgets prévus de tous les projets." /></span>}
          value={formatMoney(kpi.totalBudget)} icon={Wallet} accent="#0d9488" />
        <StatCard title={<span className="flex items-center gap-1">Dépenses totales <InfoBulle texte="Somme de toutes les dépenses enregistrées dans le module." /></span>}
          value={formatMoney(kpi.totalDepenses)} icon={TrendingDown} accent="#f59e0b" />
        <StatCard title={<span className="flex items-center gap-1">Solde restant <InfoBulle texte="Budget total − Dépenses totales. Vert = sous contrôle, Rouge = budget dépassé." /></span>}
          value={formatMoney(kpi.ecart)} icon={Wallet} accent={kpi.ecart >= 0 ? '#16a34a' : '#ef4444'} />
      </div>

      {/* Filtres + bouton */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreCategorie} onChange={(e) => setFiltreCateg(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreStatutDep} onChange={(e) => setFiltreStatutDep(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_DEP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouvelle dépense</Button>
        {liste.length > 0 && (
          <>
            <span className="ml-auto text-sm font-bold text-gray-700">Total : {formatMoney(totalFiltre)}</span>
            <button onClick={exportExcel} title="Exporter Excel"
              className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100">
              <FileSpreadsheet size={14} /> Excel
            </button>
            <button onClick={exportPDF} title="Exporter PDF"
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">
              <FileText size={14} /> PDF
            </button>
          </>
        )}
      </div>

      {/* Répartition par catégorie */}
      {parCategorie.length > 0 && (
        <Card title={<span className="flex items-center gap-1">Répartition par catégorie <InfoBulle texte="Pourcentage de chaque catégorie = montant catégorie ÷ total des dépenses filtrées × 100." /></span>}>
          <div className="space-y-2">
            {parCategorie.sort((a, b) => b.total - a.total).map((c) => {
              const pct = totalFiltre > 0 ? Math.round((c.total / totalFiltre) * 100) : 0
              return (
                <div key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 truncate text-xs text-gray-600">{c.label}</span>
                  <div className="flex-1 rounded-full bg-gray-100 h-2">
                    <div className="h-2 rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-bold text-gray-500">{pct}%</span>
                  <span className="w-36 text-right text-xs font-semibold text-gray-700">{formatMoney(c.total)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Liste dépenses */}
      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucune dépense enregistrée.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Projet</th>
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Fournisseur</th>
                <th className="px-3 py-2 text-right">Montant</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {liste.map((d) => {
                const projet = projets.find((p) => p.id === d.projetId)
                return (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(d.date)}</td>
                    <td className="px-3 py-2">
                      {projet && <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{projet.nom}</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">{catLabel(d.categorie)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">{d.description}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{d.fournisseur}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-700">{formatMoney(d.montant)}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const s = d.statut || 'en_attente'
                        const cfg = STATUTS_DEP[s]
                        const colors = { warning: 'bg-amber-50 text-amber-700 border border-amber-200', success: 'bg-green-50 text-green-700 border border-green-200', danger: 'bg-red-50 text-red-700 border border-red-200' }
                        return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors[cfg?.tone] || ''}`}>{cfg?.label || s}</span>
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <button onClick={() => setNoteDepId(noteDepId === d.id ? null : d.id)}
                          title="Commentaires"
                          className={`relative rounded px-2 py-1 shadow-sm transition-colors ${noteDepId === d.id ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-teal-500 hover:text-white'}`}>
                          <MessageSquare size={13} />
                          {notesDeDepense(d.id).length > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white">
                              {notesDeDepense(d.id).length}
                            </span>
                          )}
                        </button>
                        {canApprove && (d.statut || 'en_attente') !== 'approuvee' && (
                          <button onClick={() => approuver(d)} title="Approuver"
                            className="rounded px-2 py-1 text-xs font-bold bg-green-500 text-white hover:bg-green-600 shadow-sm">✓</button>
                        )}
                        {canApprove && (d.statut || 'en_attente') !== 'rejetee' && (
                          <button onClick={() => rejeter(d)} title="Rejeter"
                            className="rounded px-2 py-1 text-xs font-bold bg-red-500 text-white hover:bg-red-600 shadow-sm">✗</button>
                        )}
                        <button onClick={() => openEdit(d)} className="rounded p-1 text-gray-400 hover:text-teal-600"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(d)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Panneau commentaires dépense */}
      {noteDepId && (() => {
        const dep = liste.find((d) => d.id === noteDepId)
        const nsListe = notesDeDepense(noteDepId)
        if (!dep) return null
        const projet = projets.find((p) => p.id === dep.projetId)
        return (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-teal-800">Commentaires — {dep.description || catLabel(dep.categorie)}</p>
                {projet && <p className="text-xs text-teal-600">{projet.nom} · {formatMoney(dep.montant)}</p>}
              </div>
              <button onClick={() => { setNoteDepId(null); setNoteTexte('') }}
                className="rounded p-1 text-teal-400 hover:text-teal-700">✕</button>
            </div>
            {!nsListe.length
              ? <p className="mb-3 text-xs text-teal-500 italic">Aucun commentaire — soyez le premier à commenter.</p>
              : <div className="mb-3 space-y-2">
                  {nsListe.map((n) => (
                    <div key={n.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                        {(n.auteur || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-700">{n.auteur}</p>
                        <p className="text-sm text-gray-600">{n.texte}</p>
                        <p className="text-[10px] text-gray-400">{n.createdAt ? new Date(n.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}</p>
                      </div>
                      <button onClick={() => supprimerNote(n)} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
            }
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Ajouter un commentaire…"
                value={noteTexte}
                onChange={(e) => setNoteTexte(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerNote() } }}
              />
              <button onClick={envoyerNote} disabled={noteSaving || !noteTexte.trim()}
                className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40">
                <Send size={13} />
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet *</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
              <option value="">— Sélectionner —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Montant (FCFA) *</label>
              <input type="number" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.montant} onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Catégorie</label>
              <ChampCategorie
                value={form.categorie}
                onChange={(v) => setForm((f) => ({ ...f, categorie: v }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fournisseur</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.fournisseur} onChange={(e) => setForm((f) => ({ ...f, fournisseur: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.montant || !form.projetId}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
