import { useState, useMemo, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, ChevronDown, X, Play, CheckCircle2, FileDown, Loader2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, removeItem, updateItem, addItem } from '../../core/db'
import { STATUTS_PROJET, TYPES_PROJET, PRIORITES, UNITES_SUPERFICIE, uniteSuperficie } from './data'
import { SECTEURS as SECTEURS_DEPENSE } from '../depense/data'
import { avancementProjet, genererNumProjet, projetsVisibles } from './logic'
import { formatDateShort, formatMoney, formatDateTime } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'
import { genererRapportProjetPDF } from './rapportPdf'
import { marquerVoletVu } from './vues'

// ── Champ collaborateurs : plusieurs utilisateurs, chacun avec un accès complet
// au projet (comme le responsable) une fois cloisonné (rôle chef de projet). ──
function ChampCollaborateurs({ value = [], onChange, users }) {
  const [open, setOpen]     = useState(false)
  const [filtre, setFiltre] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dejaAjoute = (u) => value.some((c) => c.uid === (u.uid || u.login))

  const suggestions = useMemo(() => {
    const q = filtre.toLowerCase()
    return users
      .filter((u) => !dejaAjoute(u))
      .filter((u) => (u.nom || u.login || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q))
      .slice(0, 10)
  }, [users, filtre, value])

  const ajouter = (u) => {
    const uid = u.uid || u.login
    if (!uid || dejaAjoute(u)) { setFiltre(''); setOpen(false); return }
    onChange([...value, { nom: u.nom || u.login || '', uid }])
    setFiltre('')
    setOpen(false)
  }

  const retirer = (uid) => onChange(value.filter((c) => c.uid !== uid))

  const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || r || ''

  return (
    <div ref={ref} className="relative space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c.uid} className="flex items-center gap-1 rounded-full bg-teal-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-teal-700">
              {c.nom}
              <button type="button" onClick={() => retirer(c.uid)} className="rounded-full p-0.5 text-teal-400 hover:bg-teal-100 hover:text-teal-700">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        placeholder="Rechercher un utilisateur à ajouter…"
        value={filtre}
        onChange={(e) => { setFiltre(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length ? (
            <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur trouvé.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {suggestions.map((u) => {
                const nom = u.nom || u.login || ''
                const rl  = roleLabel(u.role)
                return (
                  <li key={u.uid || u.login}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-teal-50"
                    onMouseDown={(e) => { e.preventDefault(); ajouter(u) }}>
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

const RUBRIQUES_DOC = [
  { id: 'cahier_charges', label: 'Cahier des charges' },
  { id: 'contrat',        label: 'Contrat / Accord'   },
  { id: 'rapport',        label: 'Rapport'             },
  { id: 'devis',          label: 'Devis / Facture'     },
  { id: 'plan',           label: 'Plan / Schéma'       },
  { id: 'autre',          label: 'Autre'               }
]

// ── Champ responsable : liste utilisateurs + saisie libre ────────────────────
// onChange(nom, uid) — uid vide si saisie libre (le projet ne sera alors visible
// par aucun rôle cloisonné tant qu'un vrai compte n'est pas choisi dans la liste).
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
    onChange(u.nom || u.login || '', u.uid || u.login || '')
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
          onChange={(e) => { setFiltre(e.target.value); onChange(e.target.value, ''); setOpen(true) }}
          onFocus={() => { setFiltre(value || ''); setOpen(true) }}
        />
        {value && (
          <button type="button" onClick={() => { onChange('', ''); setFiltre('') }}
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

const VIDE = { nom: '', type: 'autre', secteurId: '', statut: 'planification', priorite: 'normale', responsable: '', responsableUid: '', collaborateurs: [], dateDebut: '', dateFin: '', dureeIndeterminee: false, budget: '', description: '', superficie: '', superficieUnite: 'ha' }

// Couleur d'accent (barre latérale de la carte) selon le statut du projet.
const STATUT_ACCENT = { planification: '#3b82f6', en_cours: '#f59e0b', en_pause: '#94a3b8', termine: '#16a34a', annule: '#dc2626' }
// Emoji illustrant le type de projet.
const TYPE_EMOJI = { construction: '🏗️', amenagement: '🌳', informatique: '💻', agricole: '🌱', elevage: '🐄', commercial: '📈', evenementiel: '🎪', autre: '📦' }

export default function Projets() {
  const { data: projetsTous }  = useCollection('projets')
  const { data: taches }       = useCollection('projet_taches')
  const { data: depenses }     = useCollection('projet_depenses')
  const { data: commentaires } = useCollection('projet_commentaires')
  const { data: users }        = useCollection('users')
  const [generatingPdf, setGeneratingPdf] = useState(null)
  const { user, role }    = useAuthStore()
  // Seuls le superviseur et le partenaire sont en lecture seule stricte. La secrétaire
  // et l'agent ont un accès complet aux projets (créer, modifier, Démarrer/Terminer) —
  // seule la SUPPRESSION leur reste interdite.
  const lectureSeule      = ['superviseur', 'partenaire'].includes(role)
  const sansActionsDecision = ['superviseur', 'partenaire'].includes(role)
  // Le chef de projet et le superviseur créent/modifient/suivent les projets, mais ne les suppriment pas.
  const peutSupprimer = !['secretaire', 'agent', 'chef_projet', 'superviseur', 'partenaire'].includes(role)
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])

  // Total dépensé par projet — recalculé en temps réel à chaque dépense saisie.
  const depenseParProjet = useMemo(() => {
    const map = {}
    depenses.forEach((d) => { if (d.projetId) map[d.projetId] = (map[d.projetId] || 0) + (Number(d.montant) || 0) })
    return map
  }, [depenses])
  useEffect(() => { marquerVoletVu(user?.uid, 'projetProjets') }, [user?.uid])
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]         = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreResponsable, setFiltreResponsable] = useState('')
  const [tri, setTri]               = useState('date_desc')
  const [mesProjets, setMesProjets] = useState(false)
  const [detail, setDetail]         = useState(null)
  const [commTexte, setCommTexte]   = useState('')
  const [commSending, setCommSending] = useState(false)

  // Ouvre directement la fiche du projet concerné quand on arrive depuis une
  // alerte du Dashboard (clic « Aller corriger ») — évite de devoir le rechercher.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const id = location.state?.openProjetId
    if (!id) return
    const p = projets.find((x) => x.id === id)
    if (p) {
      // Alerte « Budget dépassé » → droit au formulaire de révision du budget.
      if (location.state?.openRevision) ouvrirRevision(p)
      else setDetail(p)
    }
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, projets])

  // Révision du budget — garde une trace (ancien/nouveau/motif) au lieu d'écraser
  // silencieusement la valeur, utile en cas de litige ou de contrôle budgétaire.
  const [revision, setRevision]     = useState(null)
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revSaving, setRevSaving]   = useState(false)

  const ouvrirRevision = (p) => { setRevision(p); setRevMontant(String(p.budget ?? '')); setRevMotif('') }

  const confirmerRevision = async () => {
    if (!revision) return
    const nouveau = Number(revMontant)
    if (!nouveau || nouveau <= 0 || !revMotif.trim()) return
    setRevSaving(true)
    try {
      const ancien = Number(revision.budget) || 0
      const revisions = [
        ...(revision.revisionsBudget || []),
        { id: `rev_${Date.now()}`, ancien, nouveau, motif: revMotif.trim(), date: Date.now(), auteur: user?.nom || user?.login || null }
      ]
      await setItem('projets', revision.id, { ...revision, budget: nouveau, revisionsBudget: revisions, updatedAt: Date.now() })
      await audit('projet', 'projet_budget_revise', `${revision.nom} — ${formatMoney(ancien)} → ${formatMoney(nouveau)} (${revMotif.trim()})`)
      setRevision(null)
      setDetail((d) => (d && d.id === revision.id ? { ...d, budget: nouveau, revisionsBudget: revisions } : d))
    } finally { setRevSaving(false) }
  }

  const nomConnecte = user?.nom || user?.login || ''

  // Suggestions de recherche — liste des projets déjà inscrits correspondant à la saisie.
  const searchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projets
      .filter((p) => !q || p.nom?.toLowerCase().includes(q) || p.num?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [projets, search])

  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Chefs de projet distincts — pour le filtre "Chef de projet".
  const chefsDeProjet = useMemo(() =>
    [...new Set(projets.map((p) => p.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  [projets])

  const liste = useMemo(() => {
    let result = projets
      .filter((p) => (!search || p.nom?.toLowerCase().includes(search.toLowerCase()) || p.num?.includes(search)))
      .filter((p) => !filtreStatut || p.statut === filtreStatut)
      .filter((p) => !filtreResponsable || p.responsable === filtreResponsable)
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
  }, [projets, taches, search, filtreStatut, filtreResponsable, tri, mesProjets, nomConnecte])

  const openCreate = () => { setForm(VIDE); setEditing(null); setModal(true) }
  const openEdit   = (p) => {
    setForm({
      nom: p.nom || '', type: p.type || 'autre', secteurId: p.secteurId || '', statut: p.statut || 'planification',
      priorite: p.priorite || 'normale', responsable: p.responsable || '', responsableUid: p.responsableUid || '',
      collaborateurs: p.collaborateurs || [],
      dateDebut: p.dateDebut ? new Date(p.dateDebut).toISOString().slice(0,10) : '',
      dateFin:   p.dateFin   ? new Date(p.dateFin).toISOString().slice(0,10)   : '',
      dureeIndeterminee: !!p.dureeIndeterminee,
      budget: p.budget ?? '', description: p.description || '',
      superficie: p.superficie ?? '', superficieUnite: p.superficieUnite || 'ha'
    })
    setEditing(p)
    setModal(true)
  }

  // Le budget est optionnel — un projet peut être créé avant que le budget soit établi.
  // S'il est saisi, il doit être positif.
  const budgetValide = form.budget === '' || Number(form.budget) > 0

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
          createdBy: user?.uid || null
        })
        await audit('projet', 'projet_cree', `${form.nom} (${num})`)
      }
      setModal(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (!peutSupprimer) return
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

  // ── Documents & commentaires du projet (directement depuis la fiche) ───────
  const handleAddPiece = async (piece) => {
    if (lectureSeule || !detail) return
    const pieces = [...(detail.pieces || []), { ...piece, id: `pj_${Date.now()}` }]
    await updateItem('projets', detail.id, { pieces, updatedAt: Date.now() })
    setDetail((d) => ({ ...d, pieces }))
    await audit('projet', 'document_ajoute', `${piece.nom} → ${detail.nom}`)
  }

  const handleRemovePiece = async (piece) => {
    if (lectureSeule || !detail) return
    if (!window.confirm(`Supprimer "${piece.nom}" ?`)) return
    const pieces = (detail.pieces || []).filter((p) => p.id !== piece.id)
    await updateItem('projets', detail.id, { pieces, updatedAt: Date.now() })
    setDetail((d) => ({ ...d, pieces }))
  }

  const envoyerCommentaire = async () => {
    if (lectureSeule || !commTexte.trim() || !detail) return
    setCommSending(true)
    try {
      const texte = commTexte.trim()
      await addItem('projet_commentaires', {
        projetId: detail.id, texte,
        auteur: user?.nom || user?.login || 'Anonyme',
        role: role || '', userId: user?.uid || null
      })
      await audit('projet', 'commentaire_ajoute', detail.nom)
      if (detail.responsableUid && detail.responsableUid !== user?.uid) {
        await notify({
          type: 'info', title: `💬 Commentaire — ${detail.nom}`,
          body: `${user?.nom || user?.login || 'Quelqu\'un'} : ${texte.slice(0, 140)}`,
          module: 'projet', forUsers: [detail.responsableUid], link: '/projet/projets'
        }).catch(() => {})
      }
      setCommTexte('')
    } finally { setCommSending(false) }
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
        <div ref={searchRef} className="relative flex-1 min-w-[200px]">
          <input
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Rechercher un projet…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
              <ul className="max-h-64 overflow-y-auto py-1">
                {searchSuggestions.map((p) => (
                  <li key={p.id}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-teal-50"
                    onMouseDown={(e) => { e.preventDefault(); setSearch(p.nom); setSearchOpen(false) }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-700">{p.nom}</p>
                      <p className="font-mono text-[10px] text-gray-400">{p.num}</p>
                    </div>
                    <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <select
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_PROJET).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreResponsable} onChange={(e) => setFiltreResponsable(e.target.value)}
        >
          <option value="">Tous les chefs de projet</option>
          {chefsDeProjet.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
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
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              mesProjets
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 bg-white/70 text-gray-500 hover:border-teal-300 hover:text-teal-600'
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
        <div className="flex items-center gap-2 rounded-2xl border border-teal-200/60 bg-teal-50/60 px-4 py-2.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
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
            const statutAccent = STATUT_ACCENT[p.statut] || '#94a3b8'
            const tachesTerminees = tachesDuProjet.filter((t) => t.statut === 'terminee').length
            return (
              <Card key={p.id} onClick={() => setDetail(p)}
                className="group cursor-pointer border-l-4 !p-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_10px_28px_-10px_rgba(13,148,136,0.25)] hover:ring-teal-200"
                style={{ borderLeftColor: statutAccent }}>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    {/* En-tête : icône type + nom + badges */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl shadow-sm" style={{ background: statutAccent + '18' }}>
                        {TYPE_EMOJI[p.type] || '📦'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-[15px] font-bold text-gray-800">{p.nom}</h3>
                          <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                          <Badge tone={PRIORITES[p.priorite]?.tone}>{PRIORITES[p.priorite]?.label}</Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                          <span className="font-mono">{p.num}</span>
                          <span>· {TYPES_PROJET.find((t) => t.id === p.type)?.label || p.type}</span>
                        </div>
                        {p.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{p.description}</p>}
                      </div>
                    </div>

                    {/* Méta : responsable, dates, superficie */}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      {p.responsable && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">👤 {p.responsable}</span>}
                      {p.dateDebut && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">📅 {formatDateShort(p.dateDebut)}{!p.dureeIndeterminee && p.dateFin ? ` → ${formatDateShort(p.dateFin)}` : ''}</span>}
                      {p.dureeIndeterminee && <span className="rounded-full bg-gray-100 px-2 py-0.5 italic text-gray-400">Durée indéterminée</span>}
                      {p.type === 'agricole' && superficie > 0 && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">🌱 {superficie} {uniteSuperficie(p.superficieUnite)}</span>
                      )}
                    </div>

                    {/* Suivi budgétaire — le reste diminue à chaque dépense */}
                    {budget > 0 && (
                      <div className="mt-2.5 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                          <span className="text-gray-500">Budget <b className="text-gray-700">{formatMoney(budget)}</b></span>
                          <span className="text-gray-500">Dépensé <b className="text-amber-600">{formatMoney(depense)}</b></span>
                          <span className="text-gray-500">Reste <b className={reste < 0 ? 'text-red-600' : 'text-green-600'}>{formatMoney(reste)}</b></span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200/70">
                          <div className={`h-2 rounded-full transition-all ${pctBudget >= 100 ? 'bg-red-500' : pctBudget >= 80 ? 'bg-amber-500' : 'bg-teal-500'}`}
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
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="whitespace-nowrap text-[10px] font-bold text-gray-500">
                          {pct}% · {tachesTerminees}/{tachesDuProjet.length} tâches
                        </span>
                      </div>
                    )}
                  </div>
                  {!lectureSeule && (
                  <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="rounded-lg border border-teal-200 bg-teal-50 p-1 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={15} /></button>
                      {peutSupprimer && (
                        <button onClick={() => handleDelete(p)} className="rounded-lg border border-red-200 bg-red-50 p-1 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={15} /></button>
                      )}
                    </div>
                    {!sansActionsDecision && p.statut === 'planification' && (
                      <button onClick={() => demarrer(p)}
                        title="Démarrer maintenant, avant la date de début prévue (sinon le projet démarre automatiquement à cette date)"
                        className="mt-1 flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-600 transition-colors">
                        <Play size={11} />Démarrer maintenant
                      </button>
                    )}
                    {!sansActionsDecision && p.statut === 'en_cours' && (
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

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le projet' : 'Nouveau projet'}
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-200/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="space-y-4">
          {/* ── Informations générales ── */}
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📋 Informations générales</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nom du projet *</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : Poulailler Kara — extension"
                value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {TYPES_PROJET.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Secteur concerné</label>
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.secteurId} onChange={(e) => setForm((f) => ({ ...f, secteurId: e.target.value }))}>
                  <option value="">— Auto (selon le type) —</option>
                  {SECTEURS_DEPENSE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))}>
                  {Object.entries(STATUTS_PROJET).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Priorité</label>
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                  {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Équipe ── */}
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">👤 Équipe</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Responsable</label>
              <ChampResponsable
                value={form.responsable}
                onChange={(nom, uid) => setForm((f) => ({ ...f, responsable: nom, responsableUid: uid }))}
                users={users}
              />
              {form.responsable && !form.responsableUid && (
                <p className="mt-1 text-[11px] text-amber-500">⚠ Nom libre — choisissez un compte dans la liste pour que ce projet soit visible par un chef de projet cloisonné.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Collaborateurs</label>
              <ChampCollaborateurs
                value={form.collaborateurs}
                onChange={(collaborateurs) => setForm((f) => ({ ...f, collaborateurs }))}
                users={users}
              />
              <p className="mt-1 text-[11px] text-gray-400">Chaque collaborateur ajouté a le même accès complet au projet que le responsable.</p>
            </div>
          </div>

          {/* ── Planning ── */}
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📅 Planning</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Date début</label>
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
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
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50 disabled:text-gray-400"
                  disabled={form.dureeIndeterminee}
                  value={form.dateFin} onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))} />
              </div>
            </div>
            {form.type === 'agricole' && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Superficie cultivée</label>
                  <input type="number" step="any" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="ex : 2.5"
                    value={form.superficie} onChange={(e) => setForm((f) => ({ ...f, superficie: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Unité</label>
                  <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={form.superficieUnite} onChange={(e) => setForm((f) => ({ ...f, superficieUnite: e.target.value }))}>
                    {Object.entries(UNITES_SUPERFICIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ── Budget & description ── */}
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">💰 Budget & description</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Budget prévu (FCFA)</label>
              <input type="number" min="0"
                placeholder="Laisser vide si le budget n'est pas encore établi"
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${form.budget !== '' && !budgetValide ? 'border-red-300' : 'border-gray-200'}`}
                value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
              {form.budget !== '' && !budgetValide
                ? <p className="mt-1 text-[11px] text-red-500">Le budget doit être supérieur à 0.</p>
                : <p className="mt-1 text-[11px] text-gray-400">Optionnel — peut être établi plus tard. Les dépenses réelles se calculent automatiquement à partir des décaissements saisis dans l'onglet Dépenses.</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
              <textarea rows={3} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.nom.trim() || !budgetValide}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Fiche détail d'un projet ── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail du projet"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
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
              {/* En-tête glassmorphism — nom du projet bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.92) 0%, rgba(15,84,80,0.88) 100%)' }}>
                <p className="font-mono text-xs text-white/70">{d.num}</p>
                <p className="mt-0.5 text-lg font-extrabold leading-snug">{d.nom}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {STATUTS_PROJET[d.statut]?.label}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {PRIORITES[d.priorite]?.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Type : </span><span className="font-semibold">{typeLabel}</span></div>
                <div><span className="text-gray-500">Responsable : </span><span className="font-semibold">{d.responsable || '—'}</span></div>
                <div><span className="text-gray-500">Début : </span><span className="font-semibold">{d.dateDebut ? formatDateShort(d.dateDebut) : '—'}</span></div>
                <div>
                  <span className="text-gray-500">Fin prévue : </span>
                  <span className="font-semibold">{d.dureeIndeterminee ? 'Durée indéterminée' : (d.dateFin ? formatDateShort(d.dateFin) : '—')}</span>
                </div>
                {(d.collaborateurs || []).length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Collaborateurs : </span>
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {d.collaborateurs.map((c) => (
                        <span key={c.uid} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{c.nom}</span>
                      ))}
                    </span>
                  </div>
                )}
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
                <div className="rounded-2xl border border-teal-100/70 bg-teal-50/60 p-3.5 shadow-sm backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase text-teal-700">Suivi budgétaire</p>
                    <button onClick={() => ouvrirRevision(d)}
                      className="rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-700 shadow-sm transition-all duration-200 hover:bg-teal-50 hover:shadow-[0_0_14px_2px_rgba(13,148,136,0.55)]">
                      Réviser le budget
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-500">Budget : <b className="text-gray-700">{formatMoney(budget)}</b></span>
                    <span className="text-gray-500">Dépensé : <b className="text-amber-600">{formatMoney(depense)}</b></span>
                    <span className="text-gray-500">Reste : <b className={reste < 0 ? 'text-red-600' : 'text-green-600'}>{formatMoney(reste)}</b></span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200/70">
                    <div className={`h-1.5 rounded-full transition-all ${pctBudget >= 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, pctBudget)}%` }} />
                  </div>
                  {reste < 0 && (
                    <p className="mt-1 text-xs font-bold text-red-600">⚠ Budget dépassé de {formatMoney(-reste)}</p>
                  )}
                  {coutParUnite !== null && (
                    <p className="mt-1 text-xs font-semibold text-green-700">Coût par {uniteSuperficie(d.superficieUnite)} : {formatMoney(coutParUnite)}</p>
                  )}
                  {(d.revisionsBudget || []).length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-teal-100 pt-2">
                      <p className="text-xs font-semibold text-gray-500">Historique des révisions du budget</p>
                      {[...d.revisionsBudget].sort((a, b) => (b.date || 0) - (a.date || 0)).map((r) => (
                        <div key={r.id} className="rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">{formatMoney(r.ancien)} → <span className="font-mono font-bold text-gray-700">{formatMoney(r.nouveau)}</span></span>
                            <span className="text-gray-400">{formatDateShort(r.date)}</span>
                          </div>
                          <p className="mt-0.5 text-gray-600">{r.motif}</p>
                          <p className="text-[10px] text-gray-400">par {r.auteur || '—'}</p>
                        </div>
                      ))}
                    </div>
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

              {/* Documents du projet */}
              <div className="border-t border-gray-100 pt-4">
                <PiecesJointes
                  pieces={d.pieces || []}
                  onAdd={handleAddPiece}
                  onRemove={handleRemovePiece}
                  readOnly={lectureSeule}
                  rubriques={RUBRIQUES_DOC}
                  label="Documents du projet"
                  withLegende
                />
              </div>

              {/* Commentaires du projet — adressés au responsable */}
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Commentaires</p>
                {(() => {
                  const commsProjet = commentaires
                    .filter((c) => c.projetId === d.id)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                  return !commsProjet.length
                    ? <p className="mb-2 text-xs text-gray-400 italic">Aucun commentaire pour l'instant.</p>
                    : (
                      <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                        {commsProjet.map((c) => (
                          <div key={c.id} className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2.5">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                              {(c.auteur || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-700">{c.auteur}</p>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.texte}</p>
                              <p className="text-[10px] text-gray-400">{formatDateTime(c.createdAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                })()}
                {!lectureSeule && (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      placeholder="Ajouter un commentaire… (envoyé au responsable)"
                      value={commTexte}
                      onChange={(e) => setCommTexte(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerCommentaire() } }}
                    />
                    <Button size="sm" onClick={envoyerCommentaire} disabled={commSending || !commTexte.trim()}>
                      {commSending ? '…' : 'Envoyer'}
                    </Button>
                  </div>
                )}
              </div>

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

      {/* Révision du budget */}
      <Modal open={!!revision} onClose={() => setRevision(null)} title={revision ? `Réviser le budget — ${revision.nom}` : 'Réviser le budget'}>
        {revision && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Budget actuel : <b className="text-gray-700">{formatMoney(revision.budget)}</b>
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nouveau budget (FCFA) *</label>
              <input type="number" min="0" autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={revMontant} onChange={(e) => setRevMontant(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Motif de la révision *</label>
              <textarea rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : Ajout de travaux supplémentaires constatés lors de la visite du 15/07"
                value={revMotif} onChange={(e) => setRevMotif(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setRevision(null)}>Annuler</Button>
              <Button onClick={confirmerRevision} disabled={revSaving || !revMontant || Number(revMontant) <= 0 || !revMotif.trim()}>
                {revSaving ? 'Enregistrement…' : 'Confirmer la révision'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
