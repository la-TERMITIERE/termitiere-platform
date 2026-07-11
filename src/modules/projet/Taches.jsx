import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, Play, Eye, CheckCircle2, CalendarClock, Wallet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, addItem, updateItem, removeItem } from '../../core/db'
import { STATUTS_TACHE, PRIORITES, tachesSuggestions, etapesDefaut, libelleEtape } from './data'
import { ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'
import { METIERS_PRESTATAIRE, TYPES_PAIEMENT_PRESTA, ChampMetier, nomsPrestatairesConnus, coordonneesPrestataires } from './prestataire'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'

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
import { formatDateShort, formatMoney, todayStr } from '../../utils/formatters'
import { audit } from '../../core/audit'

const VIDE_TACHE = {
  titre: '', projetId: '', phase: '', assignee: '', priorite: 'normale', statut: 'a_faire', dateDebut: '', echeance: '', montantPrevu: '', note: '',
  prestataireNom: '', prestataireMetier: '', prestataireTelephone: '',
  versementActif: false, versementMontant: '', versementType: 'total', versementDate: todayStr()
}

// ─── Onglet Tâches ────────────────────────────────────────────────────────────

function OngletTaches({ taches, projets, users, depenses }) {
  const { user, role }        = useAuthStore()
  // La secrétaire et l'agent (mêmes droits) peuvent démarrer une tâche, mais ne soumettent ni ne valident (décision terrain).
  const peutSoumettreValider  = !['secretaire', 'agent'].includes(role)
  const peutSaisirMontant     = true
  // Le superviseur crée/modifie/suit les tâches, mais ne les supprime pas.
  const peutSupprimer         = !['secretaire', 'agent', 'superviseur'].includes(role)

  const prestatairesConnus = useMemo(() => nomsPrestatairesConnus(depenses, taches), [depenses, taches])
  const coordPrestataires  = useMemo(() => coordonneesPrestataires(depenses, taches), [depenses, taches])

  // Somme des dépenses rattachées à chaque tâche (par tacheId)
  const verseParTache = useMemo(() => {
    const map = {}
    depenses.forEach((d) => {
      if (d.tacheId) map[d.tacheId] = (map[d.tacheId] || 0) + (Number(d.montant) || 0)
    })
    return map
  }, [depenses])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE_TACHE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtrePhase, setFiltrePhase]   = useState('')
  const [mesTaches, setMesTaches]       = useState(false)
  const [detail, setDetail]             = useState(null)

  const nomConnecte = user?.nom || user?.login || ''

  const phasesDisponibles = useMemo(() =>
    [...new Set(taches.map((t) => t.phase).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  [taches])

  const liste = useMemo(() => taches
    .filter((t) => !filtreProjet || t.projetId === filtreProjet)
    .filter((t) => !filtreStatut || t.statut === filtreStatut)
    .filter((t) => !filtrePhase || t.phase === filtrePhase)
    .filter((t) => !mesTaches || !nomConnecte || t.assignee === nomConnecte)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [taches, filtreProjet, filtreStatut, filtrePhase, mesTaches, nomConnecte])

  const openCreate = () => { setForm({ ...VIDE_TACHE, versementDate: todayStr() }); setEditing(null); setModal(true) }
  const openEdit   = (t) => {
    setForm({
      titre: t.titre||'', projetId: t.projetId||'', phase: t.phase||'', assignee: t.assignee||'',
      priorite: t.priorite||'normale', statut: t.statut||'a_faire',
      dateDebut: t.dateDebut ? new Date(t.dateDebut).toISOString().slice(0,10) : '',
      echeance: t.echeance ? new Date(t.echeance).toISOString().slice(0,10) : '',
      montantPrevu: t.montantPrevu ?? '', note: t.note||'',
      prestataireNom: t.prestataireNom||'', prestataireMetier: t.prestataireMetier||'', prestataireTelephone: t.prestataireTelephone||'',
      versementActif: false, versementMontant: '', versementType: 'total', versementDate: todayStr()
    })
    setEditing(t); setModal(true)
  }

  const montantValide = !peutSaisirMontant || (form.montantPrevu !== '' && Number(form.montantPrevu) > 0)
  const noteValide    = form.note.trim() !== ''
  const formValide    = form.titre.trim() !== '' && montantValide && noteValide

  const handleSave = async () => {
    if (!formValide) return
    setSaving(true)
    try {
      const now = Date.now()
      const { versementActif, versementMontant, versementType, versementDate, ...tacheForm } = form
      const payload = {
        ...tacheForm,
        dateDebut: form.dateDebut ? new Date(form.dateDebut).getTime() : null,
        echeance: form.echeance ? new Date(form.echeance).getTime() : null,
        montantPrevu: form.montantPrevu !== '' ? Number(form.montantPrevu) : null,
        updatedAt: now
      }
      if (editing) {
        await setItem('projet_taches', editing.id, { ...editing, ...payload })
        await audit('projet', 'tache_modifiee', form.titre)
      } else {
        const id = `tache_${now}`
        await setItem('projet_taches', id, { id, ...payload, createdAt: now, createdBy: null })
        await audit('projet', 'tache_creee', form.titre)

        // Versement initial optionnel — enregistre directement la dépense liée,
        // pour éviter de ressaisir la même chose dans le volet Dépenses.
        const montantVerse = Number(versementMontant) || 0
        if (montantVerse > 0) {
          await addItem('projet_depenses', {
            projetId: form.projetId, tacheId: id,
            date: versementDate ? new Date(versementDate).getTime() : now,
            montant: montantVerse,
            categorie: 'sous_traitance',
            description: `Versement — ${form.titre}`,
            fournisseur: form.prestataireNom || '',
            prestataireMetier: form.prestataireMetier || '',
            prestataireTelephone: form.prestataireTelephone || '',
            typePaiement: versementType,
            statut: 'en_attente',
            ajoutePar: user?.nom || user?.login || null
          })
          if (form.projetId) {
            const totalProjet = depenses
              .filter((d) => d.projetId === form.projetId)
              .reduce((s, d) => s + (Number(d.montant) || 0), 0) + montantVerse
            await updateItem('projets', form.projetId, { depenses: totalProjet, updatedAt: now })
          }
          await audit('projet', 'depense_ajoutee', `${montantVerse.toLocaleString('fr-FR')} FCFA — ${form.titre}`)
        }
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (t) => {
    if (!peutSupprimer) return
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

  // Révision du montant arrêté — garde une trace (ancien/nouveau/motif) au lieu
  // d'écraser silencieusement la valeur, utile en cas de litige ou de contrôle budgétaire.
  const [revision, setRevision]   = useState(null)
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revSaving, setRevSaving]   = useState(false)

  const ouvrirRevision = (t) => { setRevision(t); setRevMontant(String(t.montantPrevu ?? '')); setRevMotif('') }

  const confirmerRevision = async () => {
    if (!revision) return
    const nouveau = Number(revMontant)
    if (!nouveau || nouveau <= 0 || !revMotif.trim()) return
    setRevSaving(true)
    try {
      const ancien = Number(revision.montantPrevu) || 0
      const revisions = [
        ...(revision.revisionsMontant || []),
        { id: `rev_${Date.now()}`, ancien, nouveau, motif: revMotif.trim(), date: Date.now(), auteur: user?.nom || user?.login || null }
      ]
      await setItem('projet_taches', revision.id, { ...revision, montantPrevu: nouveau, revisionsMontant: revisions, updatedAt: Date.now() })
      await audit('projet', 'tache_montant_revise', `${revision.titre} — ${formatMoney(ancien)} → ${formatMoney(nouveau)} (${revMotif.trim()})`)
      setRevision(null)
      setDetail((d) => (d && d.id === revision.id ? { ...d, montantPrevu: nouveau, revisionsMontant: revisions } : d))
    } finally { setRevSaving(false) }
  }

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
        {phasesDisponibles.length > 0 && (
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
            value={filtrePhase} onChange={(e) => setFiltrePhase(e.target.value)}>
            <option value="">Toutes les phases</option>
            {phasesDisponibles.map((ph) => <option key={ph} value={ph}>{ph}</option>)}
          </select>
        )}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((t) => {
            const projet = projets.find((p) => p.id === t.projetId)
            const enRetard = t.echeance && t.statut !== 'terminee' && t.statut !== 'annulee' && t.echeance < Date.now()
            const prevu = Number(t.montantPrevu) || 0
            const verse = verseParTache[t.id] || 0
            const reste = prevu - verse
            const pctPaye = prevu > 0 ? Math.min(100, Math.round((verse / prevu) * 100)) : 0
            const aSuivi = prevu > 0 || verse > 0
            return (
              <Card key={t.id} className="card-hover flex h-full flex-col" onClick={() => setDetail(t)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUTS_TACHE[t.statut]?.tone}>{STATUTS_TACHE[t.statut]?.label}</Badge>
                    <Badge tone={PRIORITES[t.priorite]?.tone}>{PRIORITES[t.priorite]?.label}</Badge>
                    {enRetard && <Badge tone="danger">En retard</Badge>}
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(t)} className="rounded-lg border border-teal-200 bg-teal-50 p-1 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={15} /></button>
                    {peutSupprimer && (
                      <button onClick={() => handleDelete(t)} className="rounded-lg border border-red-200 bg-red-50 p-1 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="mt-1 font-semibold text-gray-800">{t.titre}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {projet && <p className="text-xs text-teal-600">{projet.nom}</p>}
                    {t.phase && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t.phase}</span>}
                  </div>
                  <div className="mt-1 flex flex-col gap-1 text-xs text-gray-500">
                    {t.assignee && <span>Assigné à : {t.assignee}</span>}
                    {t.dateDebut && <span>Début : {formatDateShort(t.dateDebut)}</span>}
                    {t.echeance && <span className={enRetard ? 'text-red-500 font-semibold' : ''}>Échéance : {formatDateShort(t.echeance)}</span>}
                    {t.prestataireNom && (
                      <span>
                        Prestataire : {t.prestataireNom}
                        {t.prestataireMetier && ` (${METIERS_PRESTATAIRE.find((m) => m.id === t.prestataireMetier)?.label || t.prestataireMetier})`}
                        {t.prestataireTelephone && ` · ${t.prestataireTelephone}`}
                      </span>
                    )}
                  </div>
                  {t.note && <p className="mt-1 text-xs text-gray-500">{t.note}</p>}

                  {/* Suivi financier prestataire */}
                  {aSuivi && (
                    <div className="mt-2 rounded-2xl border border-teal-100/60 bg-teal-50/60 px-3 py-2.5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-gray-600">Arrêté : <span className="font-semibold text-gray-800">{formatMoney(prevu)}</span></span>
                        <span className="text-gray-600">Versé : <span className="font-semibold text-teal-700">{formatMoney(verse)}</span></span>
                        <span className="text-gray-600">Reste : <span className={`font-semibold ${reste > 0 ? 'text-amber-600' : 'text-green-600'}`}>{formatMoney(reste > 0 ? reste : 0)}</span></span>
                      </div>
                      {prevu > 0 && (
                        <>
                          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                            <div className={`h-1.5 rounded-full transition-all ${reste <= 0 ? 'bg-green-500' : 'bg-teal-500'}`} style={{ width: `${pctPaye}%` }} />
                          </div>
                          <div className="mt-1">
                            {reste <= 0
                              ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Soldé</span>
                              : verse > 0
                                ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Tranche versée</span>
                                : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Non payé</span>
                            }
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Reporter */}
                  {reportId === t.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {PROGRESSION[t.statut] && (peutSoumettreValider || t.statut === 'a_faire') && (
                    <button onClick={() => avancer(t)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white transition-colors ${COLOR_BTN[t.statut]}`}>
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
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la tâche' : 'Nouvelle tâche'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Titre *</label>
            <input list="taches-suggestions" autoComplete="off"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="Choisir une suggestion ou saisir…"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
            <datalist id="taches-suggestions">
              {tachesSuggestions(projets.find((p) => p.id === form.projetId)?.type).map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Projet</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
                <option value="">— Sélectionner un projet —</option>
                {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </div>
            {(() => {
              const typeProjet = projets.find((p) => p.id === form.projetId)?.type
              // Les étapes déjà utilisées sur CE projet passent en premier dans les suggestions —
              // évite de retaper une variante/typo (ex: "demarage" vs "demarrage") pour la même étape.
              const phasesDuProjet = [...new Set(taches.filter((t) => t.projetId === form.projetId).map((t) => t.phase).filter(Boolean))]
              const suggestions = [...new Set([...phasesDuProjet, ...etapesDefaut(typeProjet)])]
              return (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{libelleEtape(typeProjet)}</label>
                  <input list="phases-suggestions" autoComplete="off"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder={suggestions[0] ? `ex : ${suggestions[0]}` : 'Regroupement libre'}
                    value={form.phase} onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))} />
                  <datalist id="phases-suggestions">
                    {suggestions.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              )
            })()}
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
              <label className="mb-1 block text-xs font-medium text-gray-600">Date de début</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Échéance</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.echeance} onChange={(e) => setForm((f) => ({ ...f, echeance: e.target.value }))} />
            </div>
            {peutSaisirMontant && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Montant arrêté (FCFA) *</label>
                <input type="number" min="0"
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${form.montantPrevu !== '' && !montantValide ? 'border-red-300' : 'border-gray-200'}`}
                  placeholder="Montant total convenu avec le prestataire"
                  value={form.montantPrevu} onChange={(e) => setForm((f) => ({ ...f, montantPrevu: e.target.value }))} />
                {form.montantPrevu !== '' && !montantValide && (
                  <p className="mt-1 text-[11px] text-red-500">Le montant doit être supérieur à 0.</p>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Note (détails) *</label>
            <textarea rows={3}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${!noteValide && form.note !== '' ? 'border-red-300' : 'border-gray-200'}`}
              placeholder="Décris les détails de la tâche : nature exacte des travaux, conditions, matériaux, remarques…"
              value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            <p className="mt-1 text-[11px] text-gray-400">Champ obligatoire — précise ici tout ce qui doit être retenu sur cette tâche.</p>
          </div>

          <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 space-y-3">
            <p className="text-xs font-bold uppercase text-teal-700">Coordonnées du prestataire</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nom du prestataire</label>
                <input list="prestataires-connus-taches" autoComplete="off"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex: Kofi Adjovi"
                  value={form.prestataireNom}
                  onChange={(e) => {
                    const val = e.target.value
                    const coord = coordPrestataires.get(val.trim().toLowerCase())
                    setForm((f) => ({
                      ...f, prestataireNom: val,
                      prestataireTelephone: f.prestataireTelephone || coord?.telephone || f.prestataireTelephone,
                      prestataireMetier:    f.prestataireMetier    || coord?.metier    || f.prestataireMetier
                    }))
                  }} />
                <datalist id="prestataires-connus-taches">
                  {prestatairesConnus.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex: 90 00 00 00"
                  value={form.prestataireTelephone} onChange={(e) => setForm((f) => ({ ...f, prestataireTelephone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Métier / Spécialité</label>
                <ChampMetier
                  value={form.prestataireMetier}
                  onChange={(v) => setForm((f) => ({ ...f, prestataireMetier: v }))}
                />
              </div>
            </div>
          </div>

          {!editing && peutSaisirMontant && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Wallet size={14} className="text-teal-600" /> Versement initial
                <span className="text-xs font-normal text-gray-400">(optionnel)</span>
              </div>
              <p className="text-[11px] text-gray-500 -mt-1">
                Renseigne un montant pour enregistrer tout de suite un premier versement — il s'ajoutera automatiquement au volet Dépenses, lié à cette tâche. Laisse à 0 (ou vide) s'il n'y a pas encore de paiement.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Montant versé (FCFA)</label>
                  <input type="number" min="0" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="0"
                    value={form.versementMontant} onChange={(e) => setForm((f) => ({ ...f, versementMontant: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Type de paiement</label>
                  <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                    value={form.versementType} onChange={(e) => setForm((f) => ({ ...f, versementType: e.target.value }))}>
                    {Object.entries(TYPES_PAIEMENT_PRESTA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Date du versement</label>
                  <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                    value={form.versementDate} onChange={(e) => setForm((f) => ({ ...f, versementDate: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !formValide}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Fiche détail d'une tâche ── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail de la tâche"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (() => {
          const projet = projets.find((p) => p.id === detail.projetId)
          const enRetard = detail.echeance && detail.statut !== 'terminee' && detail.statut !== 'annulee' && detail.echeance < Date.now()
          const prevu = Number(detail.montantPrevu) || 0
          const verse = verseParTache[detail.id] || 0
          const reste = prevu - verse
          const pctPaye = prevu > 0 ? Math.min(100, Math.round((verse / prevu) * 100)) : 0
          const versements = depenses
            .filter((d) => d.tacheId === detail.id)
            .sort((a, b) => (b.date || 0) - (a.date || 0))
          return (
            <div className="space-y-4">
              {/* En-tête glassmorphism — nom de la tâche bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.92) 0%, rgba(15,84,80,0.88) 100%)' }}>
                <p className="text-lg font-extrabold leading-snug">{detail.titre}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {STATUTS_TACHE[detail.statut]?.label}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {PRIORITES[detail.priorite]?.label}
                  </span>
                  {enRetard && (
                    <span className="rounded-full border border-red-200/50 bg-red-500/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                      En retard
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {projet && <div><span className="text-gray-500">Projet : </span><span className="font-semibold text-teal-700">{projet.nom}</span></div>}
                {detail.phase && <div><span className="text-gray-500">{libelleEtape(projet?.type)} : </span><span className="font-semibold">{detail.phase}</span></div>}
                <div><span className="text-gray-500">Assigné à : </span><span className="font-semibold">{detail.assignee || '—'}</span></div>
                <div><span className="text-gray-500">Date de début : </span><span className="font-semibold">{detail.dateDebut ? formatDateShort(detail.dateDebut) : '—'}</span></div>
                <div><span className="text-gray-500">Échéance : </span><span className={`font-semibold ${enRetard ? 'text-red-500' : ''}`}>{detail.echeance ? formatDateShort(detail.echeance) : '—'}</span></div>
                <div><span className="text-gray-500">Créée le : </span><span className="font-semibold">{detail.createdAt ? formatDateShort(detail.createdAt) : '—'}</span></div>
              </div>

              {detail.note && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.note}</p>
                </div>
              )}

              {(detail.prestataireNom || detail.prestataireMetier || detail.prestataireTelephone) && (
                <div className="rounded-2xl border border-teal-100/70 bg-teal-50/60 p-3 shadow-sm backdrop-blur-sm">
                  <p className="mb-1 text-xs font-bold uppercase text-teal-700">Prestataire</p>
                  <p className="text-sm text-gray-700">
                    {detail.prestataireNom || '—'}
                    {detail.prestataireMetier && ` — ${METIERS_PRESTATAIRE.find((m) => m.id === detail.prestataireMetier)?.label || detail.prestataireMetier}`}
                  </p>
                  {detail.prestataireTelephone && <p className="text-sm text-gray-500">{detail.prestataireTelephone}</p>}
                </div>
              )}

              {(prevu > 0 || verse > 0) && (
                <div className="rounded-2xl border border-teal-100/70 bg-teal-50/60 p-3 shadow-sm backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase text-teal-700">Suivi financier</p>
                    {peutSaisirMontant && (
                      <button onClick={() => ouvrirRevision(detail)}
                        className="rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-700 shadow-sm transition-all duration-200 hover:bg-teal-50 hover:shadow-[0_0_14px_2px_rgba(13,148,136,0.55)]">
                        Réviser le montant
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-600">Arrêté : <span className="font-semibold text-gray-800">{formatMoney(prevu)}</span></span>
                    <span className="text-gray-600">Versé : <span className="font-semibold text-teal-700">{formatMoney(verse)}</span></span>
                    <span className="text-gray-600">Reste : <span className={`font-semibold ${reste > 0 ? 'text-amber-600' : 'text-green-600'}`}>{formatMoney(reste > 0 ? reste : 0)}</span></span>
                  </div>
                  {prevu > 0 && (
                    <>
                      <div className="mt-2 h-1.5 rounded-full bg-gray-100">
                        <div className={`h-1.5 rounded-full transition-all ${reste <= 0 ? 'bg-green-500' : 'bg-teal-500'}`} style={{ width: `${pctPaye}%` }} />
                      </div>
                      <div className="mt-1">
                        {reste <= 0
                          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Soldé</span>
                          : verse > 0
                            ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Tranche versée</span>
                            : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Non payé</span>
                        }
                      </div>
                    </>
                  )}

                  {versements.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500">Versements</p>
                      {versements.map((d) => (
                        <div key={d.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                          <span className="text-gray-500">{d.date ? formatDateShort(d.date) : '—'}</span>
                          <span className="text-gray-600">{TYPES_PAIEMENT_PRESTA[d.typePaiement || 'total']?.label || 'Somme totale'}</span>
                          <span className="font-mono font-bold text-gray-700">{formatMoney(d.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(detail.revisionsMontant || []).length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-teal-100 pt-2">
                      <p className="text-xs font-semibold text-gray-500">Historique des révisions du montant arrêté</p>
                      {[...detail.revisionsMontant].sort((a, b) => (b.date || 0) - (a.date || 0)).map((r) => (
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

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
                <Button onClick={() => { openEdit(detail); setDetail(null) }}>Modifier</Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Révision du montant arrêté */}
      <Modal open={!!revision} onClose={() => setRevision(null)} title={revision ? `Réviser le montant — ${revision.titre}` : 'Réviser le montant'}>
        {revision && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Montant actuel : <b className="text-gray-700">{formatMoney(revision.montantPrevu)}</b>
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nouveau montant arrêté (FCFA) *</label>
              <input type="number" min="0" autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={revMontant} onChange={(e) => setRevMontant(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Motif de la révision *</label>
              <textarea rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : Ajout de main d'œuvre suite à la visite du 15/07 (détails supplémentaires constatés sur site)"
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

// ─── Page principale ──────────────────────────────────────────────────────────
// (L'historique des tâches vit désormais dans le volet Journal, qui couvre toute
// l'activité du module — pas seulement les tâches.)

export default function Taches() {
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: projetsTous }  = useCollection('projets')
  const { data: users }        = useCollection('users')
  const { data: depensesTous } = useCollection('projet_depenses')
  const { user, role } = useAuthStore()
  useEffect(() => { marquerVoletVu(user?.uid, 'projetTaches') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que ses projets et leurs tâches/dépenses.
  const projets  = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const taches   = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])
  const depenses = useMemo(() => scopeParProjets(depensesTous, projets), [depensesTous, projets])

  return <OngletTaches taches={taches} projets={projets} users={users} depenses={depenses} />
}
