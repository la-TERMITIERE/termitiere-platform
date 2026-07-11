// Suivi des dépenses détaillé par projet.
import { useState, useMemo, useEffect, Fragment } from 'react'
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
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { STATUTS_PROJET } from './data'
import { METIERS_PRESTATAIRE, TYPES_PAIEMENT_PRESTA, ChampMetier, nomsPrestatairesConnus, coordonneesPrestataires } from './prestataire'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'
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

const VIDE = {
  projetId: '', tacheId: '', date: '', montant: '', categorie: '', description: '',
  fournisseur: '', prestataireMetier: '', prestataireTelephone: '',
  typePaiement: 'total'
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
  const { data: projetsTous }  = useCollection('projets')
  const { data: depensesTous } = useCollection('projet_depenses')
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: notes }        = useCollection('projet_depenses_notes')
  const { user, role } = useAuthStore()
  // Le chef de projet ne fait que consulter les dépenses — c'est la secrétaire qui les renseigne.
  const peutModifier = role !== 'chef_projet'
  // La secrétaire, l'agent et le superviseur créent/modifient les dépenses, mais ne les suppriment pas.
  const peutSupprimer = !['chef_projet', 'secretaire', 'agent', 'superviseur'].includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'projetDepenses') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que ses projets et leurs dépenses/tâches.
  const projets  = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const depenses = useMemo(() => scopeParProjets(depensesTous, projets), [depensesTous, projets])
  const taches   = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])

  const [filtreProjet, setFiltreProjet]     = useState('')
  const [filtreCategorie, setFiltreCateg]   = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [noteDepId, setNoteDepId] = useState(null)
  const [noteTexte, setNoteTexte] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [detail, setDetail] = useState(null)

  const notesDeDepense = (depId) => notes.filter((n) => n.depenseId === depId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  const prestatairesConnus = useMemo(() => nomsPrestatairesConnus(depenses, taches), [depenses, taches])
  const coordPrestataires  = useMemo(() => coordonneesPrestataires(depenses, taches), [depenses, taches])

  const envoyerNote = async () => {
    if (!noteTexte.trim() || !noteDepId) return
    setNoteSaving(true)
    try {
      const texte = noteTexte.trim()
      await addItem('projet_depenses_notes', {
        depenseId: noteDepId,
        texte,
        auteur: user?.nom || user?.login || 'Anonyme',
        createdAt: Date.now()
      })
      // Le commentaire est adressé au responsable du projet — notification directe.
      const dep = depenses.find((d) => d.id === noteDepId)
      const projet = dep ? projets.find((p) => p.id === dep.projetId) : null
      if (projet?.responsableUid && projet.responsableUid !== user?.uid) {
        await notify({
          type: 'info',
          title: `💬 Commentaire — ${projet.nom}`,
          body: `${user?.nom || user?.login || 'Quelqu\'un'} : ${texte.slice(0, 140)}`,
          module: 'projet', forUsers: [projet.responsableUid], link: '/projet/depenses'
        }).catch(() => {})
      }
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
      .sort((a, b) => (b.date || 0) - (a.date || 0)),
  [depenses, filtreProjet, filtreCategorie])

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

  // Dépenses regroupées par tâche (suivi tâche → prestataire)
  const groupesParTache = useMemo(() => {
    const map = {}
    liste.forEach((d) => {
      const key = d.tacheId || '__aucune__'
      if (!map[key]) map[key] = []
      map[key].push(d)
    })
    const groups = Object.entries(map).map(([key, deps]) => {
      const tache = key === '__aucune__' ? null : taches.find((t) => t.id === key)
      const totalVerse = deps.reduce((s, d) => s + (Number(d.montant) || 0), 0)
      const prevu = tache ? (Number(tache.montantPrevu) || 0) : 0
      return { key, tache, deps, totalVerse, prevu, reste: prevu - totalVerse }
    })
    // Tâches d'abord (par titre), « Dépenses générales » en dernier
    groups.sort((a, b) => {
      if (a.key === '__aucune__') return 1
      if (b.key === '__aucune__') return -1
      return (a.tache?.titre || '').localeCompare(b.tache?.titre || '')
    })
    return groups
  }, [liste, taches])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setEditing(null); setModal(true) }
  const openEdit   = (d) => {
    setForm({
      projetId:    d.projetId    || '',
      tacheId:     d.tacheId     || '',
      date:        d.date ? new Date(d.date).toISOString().slice(0, 10) : '',
      montant:     d.montant     ?? '',
      categorie:   d.categorie   || 'autre',
      description: d.description || '',
      fournisseur: d.fournisseur || '',
      prestataireMetier:    d.prestataireMetier    || '',
      prestataireTelephone: d.prestataireTelephone || '',
      typePaiement:         d.typePaiement         || 'total'
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
        // Recalculer le total dépenses du projet (le montant a pu changer)
        const totalProjet = depenses
          .filter((d) => d.id !== editing.id && d.projetId === form.projetId)
          .reduce((s, d) => s + (Number(d.montant) || 0), 0) + Number(form.montant)
        await updateItem('projets', form.projetId, { depenses: totalProjet, updatedAt: now })
      } else {
        await addItem('projet_depenses', { ...payload, createdAt: now, ajoutePar: user?.nom || user?.login || null })
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
    if (!peutSupprimer) return
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

  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id

  const exportExcel = () => {
    const rows = liste.map((d) => ({
      Date:        d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '',
      Projet:      projets.find((p) => p.id === d.projetId)?.nom || d.projetId,
      Tâche:       taches.find((t) => t.id === d.tacheId)?.titre || '',
      Catégorie:   catLabel(d.categorie),
      Description: d.description || '',
      Prestataire: d.fournisseur || '',
      Métier:      METIERS_PRESTATAIRE.find((m) => m.id === d.prestataireMetier)?.label || d.prestataireMetier || '',
      Téléphone:   d.prestataireTelephone || '',
      'Type paiement': TYPES_PAIEMENT_PRESTA[d.typePaiement || 'total']?.label || 'Somme totale',
      'Montant (FCFA)': Number(d.montant) || 0,
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
      head: [['Date', 'Projet', 'Tâche', 'Catégorie', 'Description', 'Prestataire', 'Métier', 'Téléphone', 'Type', 'Montant (FCFA)']],
      body: liste.map((d) => [
        d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '',
        projets.find((p) => p.id === d.projetId)?.nom || '',
        taches.find((t) => t.id === d.tacheId)?.titre || '',
        catLabel(d.categorie),
        d.description || '',
        d.fournisseur || '',
        METIERS_PRESTATAIRE.find((m) => m.id === d.prestataireMetier)?.label || d.prestataireMetier || '',
        d.prestataireTelephone || '',
        TYPES_PAIEMENT_PRESTA[d.typePaiement || 'total']?.label || 'Somme totale',
        formatNumber(d.montant || 0),
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
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreCategorie} onChange={(e) => setFiltreCateg(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {peutModifier && (
          <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouvelle dépense</Button>
        )}
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
        <div className="overflow-x-auto rounded-3xl border border-white/50 bg-white/70 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07)] backdrop-blur-xl backdrop-saturate-150">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Projet</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Prestataire</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {groupesParTache.map((g) => (
                <Fragment key={g.key}>
                  {/* En-tête de groupe : tâche + suivi budget */}
                  <tr className="border-y border-teal-100/80 bg-gradient-to-r from-teal-50/90 to-teal-50/40">
                    <td colSpan={7} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-teal-800">
                          {g.tache ? <>📋 {g.tache.titre}</> : <span className="text-gray-500">📁 Dépenses générales (sans tâche)</span>}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {g.prevu > 0 && (
                            <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
                              Arrêté <b className="text-gray-800">{formatMoney(g.prevu)}</b>
                            </span>
                          )}
                          <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
                            Versé <b className="text-teal-700">{formatMoney(g.totalVerse)}</b>
                          </span>
                          {g.prevu > 0 && (
                            <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
                              Reste <b className={g.reste > 0 ? 'text-amber-600' : 'text-green-600'}>{formatMoney(g.reste > 0 ? g.reste : 0)}</b>
                            </span>
                          )}
                          {g.prevu > 0 && (
                            g.reste <= 0
                              ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700 shadow-sm">✓ Soldé</span>
                              : g.totalVerse > 0
                                ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 shadow-sm">Tranche versée</span>
                                : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500 shadow-sm">Non payé</span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {g.deps.map((d) => {
                    const projet = projets.find((p) => p.id === d.projetId)
                    return (
                  <tr key={d.id} onClick={() => setDetail(d)} className="group cursor-pointer border-b border-gray-50 transition-colors odd:bg-white/40 even:bg-transparent hover:bg-teal-50/50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(d.date)}</td>
                    <td className="px-4 py-3">
                      {projet && <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{projet.nom}</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">{catLabel(d.categorie)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{d.description}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {d.fournisseur && <p className="font-semibold text-gray-700">{d.fournisseur}</p>}
                      {d.prestataireMetier && (
                        <p className="text-gray-400">{METIERS_PRESTATAIRE.find((m) => m.id === d.prestataireMetier)?.label || d.prestataireMetier}</p>
                      )}
                      {d.prestataireTelephone && <p className="text-gray-400">{d.prestataireTelephone}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono text-[15px] font-bold text-gray-800">{formatMoney(d.montant)}</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${d.typePaiement === 'avance' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                        {TYPES_PAIEMENT_PRESTA[d.typePaiement || 'total']?.label || 'Somme totale'}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <button onClick={() => setNoteDepId(noteDepId === d.id ? null : d.id)}
                          title="Commentaires"
                          className={`relative rounded-lg p-1.5 shadow-sm transition-all hover:scale-105 ${noteDepId === d.id ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-teal-500 hover:text-white'}`}>
                          <MessageSquare size={13} />
                          {notesDeDepense(d.id).length > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white">
                              {notesDeDepense(d.id).length}
                            </span>
                          )}
                        </button>
                        {peutModifier && (
                          <button onClick={() => openEdit(d)} title="Modifier" className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 shadow-sm transition-all hover:scale-105 hover:border-teal-300 hover:bg-teal-100"><Pencil size={13} /></button>
                        )}
                        {peutSupprimer && (
                          <button onClick={() => handleDelete(d)} title="Supprimer" className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 shadow-sm transition-all hover:scale-105 hover:border-red-300 hover:bg-red-100"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail dépense */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail de la dépense"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (() => {
          const d = detail
          const projet = projets.find((p) => p.id === d.projetId)
          const tache  = taches.find((t) => t.id === d.tacheId)
          const metierLabel = METIERS_PRESTATAIRE.find((m) => m.id === d.prestataireMetier)?.label || d.prestataireMetier
          return (
            <div className="space-y-4">
              {/* En-tête glassmorphism — montant bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.92) 0%, rgba(15,84,80,0.88) 100%)' }}>
                <p className="font-mono text-xs text-white/70">{formatDateShort(d.date)}</p>
                <p className="mt-0.5 text-lg font-extrabold leading-snug">{formatMoney(d.montant)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {catLabel(d.categorie)}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {TYPES_PAIEMENT_PRESTA[d.typePaiement || 'total']?.label || 'Somme totale'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><span className="text-gray-500">Projet : </span><span className="font-semibold">{projet?.nom || '—'}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Tâche liée : </span><span className="font-semibold">{tache?.titre || '— (dépense générale)'}</span></div>
                <div><span className="text-gray-500">Prestataire : </span><span className="font-semibold">{d.fournisseur || '—'}</span></div>
                <div><span className="text-gray-500">Téléphone : </span><span className="font-semibold">{d.prestataireTelephone || '—'}</span></div>
                <div><span className="text-gray-500">Métier : </span><span className="font-semibold">{metierLabel || '—'}</span></div>
                <div><span className="text-gray-500">Ajouté par : </span><span className="font-semibold">{d.ajoutePar || '—'}</span></div>
              </div>

              {d.description && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.description}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <Button variant="ghost" onClick={() => { setDetail(null); setNoteDepId(d.id) }}>
                  <MessageSquare size={14} className="mr-1" />Commentaires
                </Button>
                {peutModifier && (
                  <Button onClick={() => { setDetail(null); openEdit(d) }}>
                    <Pencil size={14} className="mr-1" />Modifier
                  </Button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Fenêtre commentaires dépense */}
      {(() => {
        const dep = noteDepId ? liste.find((d) => d.id === noteDepId) : null
        const nsListe = noteDepId ? notesDeDepense(noteDepId) : []
        const projet = dep ? projets.find((p) => p.id === dep.projetId) : null
        return (
          <Modal
            open={!!noteDepId}
            onClose={() => { setNoteDepId(null); setNoteTexte('') }}
            title={dep ? `Commentaires — ${dep.description || catLabel(dep.categorie)}` : 'Commentaires'}
          >
            {dep && (
              <>
                {projet && (
                  <p className="mb-3 text-xs text-teal-600">
                    {projet.nom} · {formatMoney(dep.montant)}
                    {projet.responsable && <span className="ml-1 text-gray-400">· Responsable : {projet.responsable}</span>}
                  </p>
                )}
                {!nsListe.length
                  ? <p className="mb-3 text-xs text-gray-400 italic">Aucun commentaire — soyez le premier à commenter.</p>
                  : <div className="mb-3 space-y-2">
                      {nsListe.map((n) => (
                        <div key={n.id} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                            {(n.auteur || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-700">{n.auteur}</p>
                            <p className="text-sm text-gray-600">{n.texte}</p>
                            <p className="text-[10px] text-gray-400">{n.createdAt ? new Date(n.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}</p>
                          </div>
                          <button onClick={() => supprimerNote(n)} className="rounded-lg border border-red-200 bg-red-50 p-1 text-red-500 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                }
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="Ajouter un commentaire… (envoyé au responsable du projet)"
                    value={noteTexte}
                    onChange={(e) => setNoteTexte(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerNote() } }}
                  />
                  <button onClick={envoyerNote} disabled={noteSaving || !noteTexte.trim()}
                    className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40">
                    <Send size={13} />
                  </button>
                </div>
              </>
            )}
          </Modal>
        )
      })()}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet *</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value, tacheId: '' }))}>
              <option value="">— Sélectionner —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          {form.projetId && (() => {
            const tachesDuProjet = taches.filter((t) => t.projetId === form.projetId)
            return (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tâche liée</label>
                <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.tacheId}
                  onChange={(e) => {
                    const tache = tachesDuProjet.find((t) => t.id === e.target.value)
                    setForm((f) => ({
                      ...f,
                      tacheId: e.target.value,
                      // Pré-remplit les coordonnées du prestataire depuis la tâche (évite de les ressaisir à chaque tranche)
                      fournisseur:           f.fournisseur           || tache?.prestataireNom       || '',
                      prestataireMetier:     f.prestataireMetier     || tache?.prestataireMetier     || '',
                      prestataireTelephone:  f.prestataireTelephone  || tache?.prestataireTelephone  || ''
                    }))
                  }}>
                  <option value="">— Aucune (dépense générale du projet) —</option>
                  {tachesDuProjet.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
                </select>
                {!tachesDuProjet.length && (
                  <p className="mt-1 text-[11px] text-gray-400">Aucune tâche pour ce projet — créez-en une dans l'onglet Tâches.</p>
                )}
              </div>
            )
          })()}
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
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 space-y-3">
            <p className="text-xs font-bold uppercase text-teal-700">Coordonnées du prestataire</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nom du prestataire</label>
                <input list="prestataires-connus" autoComplete="off"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex: Kofi Adjovi"
                  value={form.fournisseur}
                  onChange={(e) => {
                    const val = e.target.value
                    const coord = coordPrestataires.get(val.trim().toLowerCase())
                    setForm((f) => ({
                      ...f, fournisseur: val,
                      prestataireTelephone: f.prestataireTelephone || coord?.telephone || f.prestataireTelephone,
                      prestataireMetier:    f.prestataireMetier    || coord?.metier    || f.prestataireMetier
                    }))
                  }} />
                <datalist id="prestataires-connus">
                  {prestatairesConnus.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex: 90 00 00 00"
                  value={form.prestataireTelephone} onChange={(e) => setForm((f) => ({ ...f, prestataireTelephone: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Métier / Spécialité</label>
                <ChampMetier
                  value={form.prestataireMetier}
                  onChange={(v) => setForm((f) => ({ ...f, prestataireMetier: v }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Type de paiement</label>
                <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.typePaiement} onChange={(e) => setForm((f) => ({ ...f, typePaiement: e.target.value }))}>
                  {Object.entries(TYPES_PAIEMENT_PRESTA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
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
