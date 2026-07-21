// Liste des dépenses — saisie, filtres, justificatif.
import { useMemo, useState, useRef, useEffect } from 'react'
import { Plus, Search, FilePen, Trash2, Paperclip, Eye, ChevronDown, Receipt } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { SECTEURS, CATEGORIES_DEPENSE, STATUTS_DECAISSEMENT, NATURES_FLUX, natureFluxDefaut, SOURCES_FINANCEMENT, sourceFinancementDefaut } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { notifierBeneficiaire } from './notifications'
import { isFullAccessRole, FULL_ACCESS_ROLES, isReadOnlyRole } from '../../core/roles'

const empty = () => ({
  secteurId: '', categorie: '', montant: '', date: todayStr(),
  description: '', piece: null, recurrente: false, imprevue: false,
  natureFlux: natureFluxDefaut, sourceFinancement: sourceFinancementDefaut,
  beneficiaireType: 'interne', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: ''
})

// ── Champ bénéficiaire (membre de l'entreprise) : saisie libre + suggestions ──
function ChampBeneficiaire({ value, onChange, onSelectUser, users }) {
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
    return users.filter((u) => u.actif !== false && (u.nom || u.login || '').toLowerCase().includes(q)).slice(0, 10)
  }, [users, filtre])

  const choisir = (u) => { onSelectUser(u); setFiltre(''); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Nom du bénéficiaire…"
          value={open ? filtre : value}
          onChange={(e) => { setFiltre(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-primary"><ChevronDown size={14} /></button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length
            ? <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur — votre saisie sera utilisée.</p>
            : <ul className="max-h-48 overflow-y-auto py-1">
                {suggestions.map((u) => (
                  <li key={u.uid}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-primary/10"
                    onMouseDown={(e) => { e.preventDefault(); choisir(u) }}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary-dark">
                      {(u.nom || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">{u.nom}</p>
                      {u.poste && <p className="text-[10px] text-gray-400">{u.poste}</p>}
                    </div>
                  </li>
                ))}
              </ul>
          }
        </div>
      )}
    </div>
  )
}

export default function Depenses() {
  const { user, role } = useAuth()
  const isAdmin = isFullAccessRole(role)
  const lectureSeule = isReadOnlyRole(role)
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: users }   = useCollection('users')

  // Dépenses de E-G.Pro (secteur MAXI BAT) incluses en lecture seule dans la liste,
  // avec tous les détails (projet, tâche, prestataire) — pas de double saisie ici,
  // elles restent gérées uniquement depuis E-G.Pro.
  const { data: depensesProjet } = useCollection('projet_depenses')
  const { data: projetsTous }    = useCollection('projets')
  const { data: tachesTous }     = useCollection('projet_taches')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const depenses = useMemo(
    () => [
      ...depensesReelles,
      ...depensesProjetVersSecteurs(depensesProjet, projetsTous, tachesTous),
      ...coutsMatieresBriqueterie(inventairesBriq)
    ],
    [depensesReelles, depensesProjet, projetsTous, tachesTous, inventairesBriq]
  )

  const [recherche, setRecherche] = useState('')
  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreNature, setFiltreNature] = useState('')
  const [filtreSource, setFiltreSource] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  // La fenêtre de détail est indexée par id (pas par snapshot) : ainsi, si un chef de
  // projet modifie la dépense dans E-G.Pro pendant qu'elle est ouverte ici, le détail
  // se met à jour tout seul (la liste `depenses` est en temps réel).
  const detail = detailId ? depenses.find((d) => d.id === detailId) || null : null

  const liste = useMemo(() => {
    let rows = [...depenses]
    if (filtreSecteur)   rows = rows.filter((d) => d.secteurId === filtreSecteur)
    if (filtreCategorie) rows = rows.filter((d) => d.categorie === filtreCategorie)
    if (filtreNature)    rows = rows.filter((d) => (d.natureFlux || natureFluxDefaut) === filtreNature)
    if (filtreSource)    rows = rows.filter((d) => (d.sourceFinancement || sourceFinancementDefaut) === filtreSource)
    if (filtreMois)      rows = rows.filter((d) => (d.date || '').startsWith(filtreMois))
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => (d.description || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [depenses, filtreSecteur, filtreCategorie, filtreNature, filtreSource, filtreMois, recherche])

  // Total financé par le PAU (apport personnel) sur la liste affichée — traçabilité.
  const totalApportPau = useMemo(
    () => liste.filter((d) => (d.sourceFinancement || sourceFinancementDefaut) === 'pau')
      .reduce((s, d) => s + (Number(d.montant) || 0), 0),
    [liste]
  )

  const totalListe = liste.reduce((s, d) => s + (Number(d.montant) || 0), 0)

  // Suggestions de catégories : catégories prédéfinies + celles déjà saisies par les utilisateurs.
  const categorieSuggestions = useMemo(() => {
    const saisies = depenses.map((d) => d.categorie).filter(Boolean)
    return [...new Set([...CATEGORIES_DEPENSE.map((c) => c.label), ...saisies])].sort()
  }, [depenses])

  const categoriesPresentes = useMemo(
    () => [...new Set(depenses.map((d) => d.categorie).filter(Boolean))].sort(),
    [depenses]
  )

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  function openEdit(d)  { setModal({ data: { ...empty(), ...d }, isNew: false, id: d.id }) }
  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handlePieceChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const piece = await lireFichier(file)
      set('piece', piece)
    } catch (err) {
      toast.error(err.message || 'Fichier illisible')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.secteurId) return toast.error('Secteur requis')
    if (!d.categorie) return toast.error('Catégorie requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (!d.date) return toast.error('Date requise')

    setSaving(true)
    try {
      const secteur = SECTEURS.find((s) => s.id === d.secteurId)
      if (modal.isNew) {
        const id = genId()
        // Prévue (déjà budgétée) → comptée immédiatement. Imprévue (hors budget) → autorisation de décaissement.
        const statutInitial = d.imprevue ? 'en_attente' : 'decaissee'
        const depenseFinale = { ...d, id, statut: statutInitial, enregistrePar: user?.nom || '—', createdAt: Date.now() }
        await setItem('depense_depenses', id, depenseFinale)
        await audit('depense', 'DEPENSE_CREATE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA${(d.sourceFinancement || sourceFinancementDefaut) === 'pau' ? ' (apport PAU)' : ''}`, { secteurId: d.secteurId, categorie: d.categorie, montant: d.montant, imprevue: !!d.imprevue, sourceFinancement: d.sourceFinancement || sourceFinancementDefaut })
        toast.success(d.imprevue ? 'Demande de décaissement soumise — en attente d\'autorisation ✓' : 'Dépense enregistrée ✓')
        if (statutInitial === 'decaissee') await notifierBeneficiaire(depenseFinale, secteur?.label || d.secteurId)
      } else {
        await setItem('depense_depenses', modal.id, { ...d, id: modal.id })
        await audit('depense', 'DEPENSE_EDIT', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Dépense mise à jour ✓')
      }
      await alerterSiDepassement(d, secteur)
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  // Notifie les rôles financiers si le secteur atteint 80%+ de son budget mensuel.
  async function alerterSiDepassement(d, secteur) {
    const [annee, mois] = (d.date || '').split('-').map(Number)
    if (!annee || !mois) return
    const alloue = budgetSecteur(budgets, d.secteurId, annee, mois)
    if (alloue <= 0) return
    const depenseTotal = totalDepenses(depensesSecteurMois([...depenses.filter((x) => x.id !== modal.id), d], d.secteurId, annee, mois))
    const pct = Math.round((depenseTotal / alloue) * 100)
    const statut = statutBudget(pct)
    if (statut.key === 'ok') return
    await notify({
      type: statut.key === 'depasse' ? 'danger' : 'warning',
      title: statut.key === 'depasse' ? `🔴 Budget dépassé — ${secteur?.label || d.secteurId}` : `🟠 Budget en alerte — ${secteur?.label || d.secteurId}`,
      body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
    })
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    const target = toDelete
    setToDelete(null)
    try {
      const secteur = SECTEURS.find((s) => s.id === target.secteurId)
      if (target.source === 'projet') {
        // Dépense récupérée d'E-G.Pro : l'enregistrement réel vit dans `projet_depenses`.
        // La supprimer ici la retire aussi d'E-G.Pro — on recalcule alors le total du projet
        // pour garder les deux modules cohérents (même logique que la suppression côté E-G.Pro).
        const realId = String(target.id).replace(/^projet_/, '')
        await removeItem('projet_depenses', realId)
        const totalProjet = depensesProjet
          .filter((dep) => dep.id !== realId && dep.projetId === target.projetId)
          .reduce((s, dep) => s + (Number(dep.montant) || 0), 0)
        await updateItem('projets', target.projetId, { depenses: totalProjet, updatedAt: Date.now() })
        await audit('depense', 'DEPENSE_PROJET_DELETE', `${secteur?.label || target.secteurId} — ${Number(target.montant).toLocaleString('fr-FR')} FCFA (dépense E-G.Pro : ${target.projetNom || target.projetId})`)
      } else {
        await removeItem('depense_depenses', target.id)
        await audit('depense', 'DEPENSE_DELETE', `${secteur?.label || target.secteurId} — ${Number(target.montant).toLocaleString('fr-FR')} FCFA`)
      }
      toast.success('Dépense supprimée ✓')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        <strong>Prévue vs imprévue :</strong> une dépense <strong>prévue</strong> (déjà budgétée) est comptée immédiatement. Une dépense <strong>imprévue</strong> (hors budget) passe par <strong>Autorisation de décaissement</strong> (en attente → approuvée → décaissée) avant de compter dans le budget du secteur.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
          <input
            className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher une description…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Mois</label>
          <input type="month" value={filtreMois} onChange={(e) => setFiltreMois(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Secteur</label>
          <Select value={filtreSecteur} onChange={(e) => setFiltreSecteur(e.target.value)}>
            <option value="">Tous les secteurs</option>
            {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Catégorie</label>
          <Select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)}>
            <option value="">Toutes</option>
            {categoriesPresentes.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Nature du flux</label>
          <Select value={filtreNature} onChange={(e) => setFiltreNature(e.target.value)}>
            <option value="">Toutes</option>
            {Object.entries(NATURES_FLUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Source de financement</label>
          <Select value={filtreSource} onChange={(e) => setFiltreSource(e.target.value)}>
            <option value="">Toutes</option>
            {Object.entries(SOURCES_FINANCEMENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{liste.length} dépense(s) · {totalListe.toLocaleString('fr-FR')} FCFA</span>
          {!lectureSeule && <Button onClick={openCreate}><Plus size={16} /> Ajouter une dépense</Button>}
        </div>
      </div>

      {totalApportPau > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800">
          <span className="font-semibold">💜 Apport du PAU (sélection en cours) :</span>
          <span className="font-bold">{totalApportPau.toLocaleString('fr-FR')} FCFA</span>
          <span className="text-xs text-violet-500">— financé personnellement par le promoteur</span>
        </div>
      )}

      {liste.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <Receipt size={34} className="opacity-30" />
            <p className="text-sm">Aucune dépense trouvée.</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-y-2.5 text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 pb-1 text-left font-bold">Date & secteur</th>
                <th className="px-4 pb-1 text-left font-bold">Dépense</th>
                <th className="px-4 pb-1 text-left font-bold">Bénéficiaire</th>
                <th className="px-4 pb-1 text-right font-bold">Montant</th>
                <th className="px-4 pb-1 text-center font-bold">Statut</th>
                <th className="px-4 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((d) => {
                const secteur = SECTEURS.find((s) => s.id === d.secteurId)
                const secteurColor = secteur?.color || '#64748b'
                const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
                const nature = NATURES_FLUX[d.natureFlux || natureFluxDefaut]
                const source = SOURCES_FINANCEMENT[d.sourceFinancement || sourceFinancementDefaut]
                const depuisProjet = d.source === 'projet'
                const importe = !!d.source // dépense reprise d'un autre module (E-G.Pro, Briqueterie) : non modifiable ici
                const estPau = (d.sourceFinancement || sourceFinancementDefaut) === 'pau'
                const modifiable = !importe && (isAdmin || d.statut === 'en_attente' || !d.statut)
                const cell = 'bg-white py-3 align-middle transition-colors group-hover:bg-amber-50/40'
                return (
                  <tr key={d.id} onClick={() => setDetailId(d.id)}
                    className="group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_18px_-6px_rgba(180,83,9,0.18)] hover:ring-amber-200">
                    {/* Date & secteur — accent coloré du secteur à gauche */}
                    <td className={`${cell} rounded-l-2xl border-l-[3px] px-4`} style={{ borderColor: secteurColor }}>
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-700">{formatDateShort(d.date)}</p>
                      <span className="mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: secteurColor + '1a', color: secteurColor }}>
                        {secteur?.label || d.secteurId}
                      </span>
                    </td>

                    {/* Dépense : description + catégorie/nature */}
                    <td className={`${cell} px-4`}>
                      {depuisProjet ? (
                        <>
                          <p className="line-clamp-2 max-w-[320px] font-semibold text-gray-800">{d.projetNom || d.description || '—'}</p>
                          {d.tacheTitre && <p className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-gray-500">🔧 {d.tacheTitre}</p>}
                        </>
                      ) : (
                        <p className="line-clamp-2 max-w-[320px] font-medium text-gray-700">{d.description || '—'}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{d.categorie || '—'}</span>
                        <Badge tone={nature.tone}>{nature.label}</Badge>
                      </div>
                    </td>

                    {/* Bénéficiaire : qui a payé → qui a reçu */}
                    <td className={`${cell} px-4`}>
                      <div className="space-y-1 text-[11px]">
                        <p className="text-gray-400">✍️ <span className="font-semibold text-gray-600">{d.enregistrePar || '—'}</span></p>
                        {d.beneficiaireNom ? (
                          <p className="text-gray-400">
                            → 👤 <span className="font-semibold text-gray-700">{d.beneficiaireNom}</span>
                            {d.beneficiaireFonction ? <span className="text-gray-400"> · {d.beneficiaireFonction}</span> : ''}
                            <span className="ml-1 text-[10px] text-gray-400">
                              {d.beneficiaireUid
                                ? (d.recuConfirme ? '✅ reçu confirmé' : d.statut === 'decaissee' ? '⏳ à confirmer' : '')
                                : '· externe'}
                            </span>
                          </p>
                        ) : <p className="text-gray-300">—</p>}
                      </div>
                    </td>

                    {/* Montant */}
                    <td className={`${cell} whitespace-nowrap px-4 text-right`}>
                      <span className="text-base font-extrabold text-gray-900">{Number(d.montant).toLocaleString('fr-FR')}</span>
                      <span className="ml-0.5 text-[10px] font-semibold text-gray-400">FCFA</span>
                      {estPau && <span className="mt-1 block"><Badge tone={source.tone}>💜 {source.label}</Badge></span>}
                    </td>

                    {/* Statut + justificatif */}
                    <td className={`${cell} px-4 text-center`}>
                      <Badge tone={statut.tone}>{statut.label}</Badge>
                      {d.piece && (
                        <button onClick={(e) => { e.stopPropagation(); ouvrirPiece(d.piece) }} title="Voir le justificatif"
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20">
                          <Paperclip size={11} /> justif.
                        </button>
                      )}
                      {!d.piece && depuisProjet && d.noteOrigine && (
                        <p className="mx-auto mt-1 line-clamp-2 max-w-[150px] text-[10px] italic text-gray-400">{d.noteOrigine}</p>
                      )}
                    </td>

                    {/* Actions */}
                    <td className={`${cell} rounded-r-2xl px-3`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => setDetailId(d.id)} title="Voir les détails" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Eye size={15} /></button>
                        {modifiable && (
                          <>
                            <button onClick={() => openEdit(d)} title="Modifier" className="rounded-lg p-1.5 text-primary hover:bg-primary/10"><FilePen size={15} /></button>
                            <button onClick={() => setToDelete(d)} title="Supprimer" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                          </>
                        )}
                        {/* Les dépenses récupérées d'E-G.Pro ne sont pas modifiables ici, mais un
                            admin peut les supprimer (la suppression se répercute sur E-G.Pro). */}
                        {depuisProjet && isAdmin && (
                          <button onClick={() => setToDelete(d)} title="Supprimer (retire aussi d'E-G.Pro)" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
        title={modal?.isNew ? 'Ajouter une dépense' : 'Modifier la dépense'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Enregistrer' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-3">
            {/* Détails de la dépense */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">💰 Détails de la dépense</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Secteur *">
                  <Select value={modal.data.secteurId} onChange={(e) => set('secteurId', e.target.value)}>
                    <option value="">— Choisir —</option>
                    {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Catégorie *">
                  <Input
                    list="categorie-suggestions"
                    value={modal.data.categorie}
                    onChange={(e) => set('categorie', e.target.value)}
                    placeholder="Saisir ou choisir une catégorie…"
                  />
                  <datalist id="categorie-suggestions">
                    {categorieSuggestions.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </FormGroup>
                <FormGroup label="Montant (FCFA) *">
                  <Input type="number" min="0" value={modal.data.montant} onChange={(e) => set('montant', e.target.value)} placeholder="ex: 50000" />
                </FormGroup>
                <FormGroup label="Date *">
                  <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
                </FormGroup>
              </div>
              <FormGroup label="Description" className="mt-1">
                <textarea
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="ex: Achat de fournitures de bureau"
                />
              </FormGroup>
            </div>

            {/* Classification comptable */}
            <div className="rounded-xl border border-amber-100 bg-white p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">📊 Classification</p>
              <FormGroup label="Nature du flux" hint="Sert au calcul du solde de trésorerie (voir l'onglet Flux de trésorerie).">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(NATURES_FLUX).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('natureFlux', k)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.natureFlux === k ? 'border-amber-400 bg-white text-amber-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                      title={v.desc}>
                      {modal.data.natureFlux === k ? '✓ ' : ''}{v.label}
                    </button>
                  ))}
                </div>
              </FormGroup>
              <FormGroup label="Source de financement" hint="Qui a payé : la trésorerie de l'entreprise ou l'apport personnel du PAU. (Traçabilité — n'affecte pas les calculs.)">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SOURCES_FINANCEMENT).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('sourceFinancement', k)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${(modal.data.sourceFinancement || sourceFinancementDefaut) === k ? 'border-amber-400 bg-white text-amber-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                      title={v.desc}>
                      {(modal.data.sourceFinancement || sourceFinancementDefaut) === k ? '✓ ' : ''}{v.label}
                    </button>
                  ))}
                </div>
              </FormGroup>
              {modal.isNew && (
                <FormGroup label="Type de dépense">
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="radio" name="type-depense" checked={!modal.data.imprevue} onChange={() => set('imprevue', false)} className="mt-0.5" />
                      <span><strong>Prévue</strong> — déjà budgétée, comptée immédiatement (pas d'autorisation nécessaire)</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="radio" name="type-depense" checked={!!modal.data.imprevue} onChange={() => set('imprevue', true)} className="mt-0.5" />
                      <span><strong>Imprévue</strong> — hors budget, passe par l'autorisation de décaissement</span>
                    </label>
                  </div>
                </FormGroup>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!modal.data.recurrente} onChange={(e) => set('recurrente', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-400/30" />
                🔁 Dépense récurrente (à reconduire chaque mois)
              </label>
            </div>

            {/* Bénéficiaire */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">👤 Bénéficiaire <span className="font-medium normal-case text-amber-500">(optionnel — qui reçoit l'argent)</span></p>
              <div className="mb-2 flex gap-2">
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'interne'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', '') }}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.beneficiaireType !== 'externe' ? 'border-amber-400 bg-white text-amber-800' : 'border-gray-200 bg-white text-gray-500'}`}>
                  Membre de l'entreprise
                </button>
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'externe'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', '') }}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.beneficiaireType === 'externe' ? 'border-amber-400 bg-white text-amber-800' : 'border-gray-200 bg-white text-gray-500'}`}>
                  Externe (fournisseur, prestataire…)
                </button>
              </div>

              {modal.data.beneficiaireType === 'externe' ? (
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Nom de la personne">
                    <Input value={modal.data.beneficiaireNom} onChange={(e) => set('beneficiaireNom', e.target.value)} placeholder="ex: Kofi Adjovi" />
                  </FormGroup>
                  <FormGroup label="Profession / fonction">
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Maçon" />
                  </FormGroup>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Nom du bénéficiaire">
                    <ChampBeneficiaire
                      value={modal.data.beneficiaireNom}
                      onChange={(v) => { set('beneficiaireNom', v); set('beneficiaireUid', '') }}
                      onSelectUser={(u) => { set('beneficiaireUid', u.uid); set('beneficiaireNom', u.nom || ''); set('beneficiaireFonction', u.poste || '') }}
                      users={users}
                    />
                  </FormGroup>
                  <FormGroup label="Fonction (optionnel)">
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Comptable" />
                  </FormGroup>
                </div>
              )}
              <p className="mt-1.5 text-xs text-gray-400">
                {modal.data.beneficiaireType === 'externe'
                  ? 'Bénéficiaire externe : pas de notification automatique (aucun compte sur la plateforme).'
                  : modal.data.beneficiaireUid
                    ? 'Membre de l\'entreprise : recevra une notification dans l\'application pour confirmer la réception.'
                    : 'Nom saisi librement, sans compte associé : pas de notification automatique.'}
              </p>
            </div>

            {/* Justificatif */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">📎 Justificatif <span className="font-medium normal-case text-amber-500">(photo ou PDF, optionnel)</span></p>
              {modal.data.piece ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-700"><Paperclip size={14} /> {modal.data.piece.nom} <span className="text-xs text-gray-400">({formatTaille(modal.data.piece.taille)})</span></span>
                  <button onClick={() => set('piece', null)} className="text-xs text-red-500 hover:underline">Retirer</button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-3 text-sm text-gray-500 hover:bg-amber-50">
                  <Paperclip size={16} /> {uploading ? 'Chargement…' : 'Ajouter un justificatif'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handlePieceChange} disabled={uploading} />
                </label>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette dépense ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer</Button></>}>
        {toDelete && (
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              Vous allez supprimer la dépense de <span className="font-bold text-gray-900">{Number(toDelete.montant).toLocaleString('fr-FR')} FCFA</span> du {formatDateShort(toDelete.date)}.
              Cette action est <span className="font-semibold text-red-600">irréversible</span>.
            </p>
            {toDelete.source === 'projet' && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠️ Cette dépense vient d'<strong>E-G.Pro</strong>{toDelete.projetNom ? ` (${toDelete.projetNom})` : ''}. La supprimer la retirera <strong>aussi d'E-G.Pro</strong> et réduira le total dépensé du projet.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Modal détail (lecture seule) — utile surtout pour les dépenses récupérées d'E-G.Pro */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} size="md" title="Détail de la dépense"
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {detail && (detail.source === 'projet' ? isAdmin : (isAdmin || detail.statut === 'en_attente' || !detail.statut)) ? (
              <Button variant="danger" onClick={() => { const d = detail; setDetailId(null); setToDelete(d) }}>
                <Trash2 size={14} /> Supprimer
              </Button>
            ) : <span />}
            <Button variant="outline" onClick={() => setDetailId(null)}>Fermer</Button>
          </div>
        }>
        {detail && (() => {
          const depuisProjet = detail.source === 'projet'
          const secteur = SECTEURS.find((s) => s.id === detail.secteurId)
          const statut = STATUTS_DECAISSEMENT[detail.statut] || STATUTS_DECAISSEMENT.decaissee
          const nature = NATURES_FLUX[detail.natureFlux || natureFluxDefaut]
          const src = SOURCES_FINANCEMENT[detail.sourceFinancement || sourceFinancementDefaut]
          const chips = [
            { label: 'Date', value: formatDateShort(detail.date) },
            { label: 'Secteur', value: secteur?.label || detail.secteurId },
            { label: 'Catégorie', value: detail.categorie || '—' },
            { label: 'Nature de flux', value: nature.label },
            ...(!depuisProjet ? [{ label: 'Financement', value: src.label }] : [])
          ]
          return (
            <div className="space-y-3 text-sm">
              {/* En-tête : montant + statut */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black leading-none text-gray-900">
                      {Number(detail.montant).toLocaleString('fr-FR')}
                      <span className="ml-1 text-sm font-bold text-gray-400">FCFA</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={nature.tone}>{nature.label}</Badge>
                      {(detail.sourceFinancement || sourceFinancementDefaut) === 'pau' && <Badge tone={src.tone}>💜 {src.label}</Badge>}
                    </div>
                  </div>
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                </div>
              </div>

              {/* Informations clés en tuiles */}
              <div className="grid grid-cols-2 gap-2">
                {chips.map((c) => (
                  <div key={c.label} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                    <p className="mt-0.5 font-bold text-gray-800">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Projet / tâche (dépenses récupérées d'E-G.Pro) */}
              {depuisProjet && (detail.projetNom || detail.tacheTitre) && (
                <div className="rounded-2xl border-l-4 border-teal-400 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">📋 Projet concerné</p>
                  <p className="mt-1 font-bold text-gray-800">{detail.projetNom || '—'}</p>
                  {detail.tacheTitre && <p className="mt-1 flex items-center gap-1 text-gray-600">🔧 <span className="font-medium">{detail.tacheTitre}</span></p>}
                  {detail.noteOrigine && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">« {detail.noteOrigine} »</p>}
                </div>
              )}

              {/* Description (dépenses saisies directement dans E-DÉPENSES) */}
              {!depuisProjet && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                  <p className="mt-1 font-medium text-gray-700">{detail.description || '—'}</p>
                </div>
              )}

              {/* Traçabilité : qui a payé → qui a reçu */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Traçabilité</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    ✍️ {detail.enregistrePar || '—'}
                  </span>
                  {detail.beneficiaireNom && (
                    <>
                      <span className="text-gray-300">→</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
                        👤 {detail.beneficiaireNom}{detail.beneficiaireFonction ? ` · ${detail.beneficiaireFonction}` : ''}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {detail.beneficiaireTelephone && <span>☎ {detail.beneficiaireTelephone}</span>}
                  {detail.typePaiement && <span>💳 {detail.typePaiement === 'avance' ? 'Tranche / avance' : 'Somme totale'}</span>}
                </div>
              </div>

              {detail.piece && (
                <button onClick={() => ouvrirPiece(detail.piece)} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary/5">
                  <Eye size={14} /> Voir le justificatif
                </button>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
