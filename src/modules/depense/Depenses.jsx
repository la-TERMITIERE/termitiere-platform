// Liste des dépenses — saisie, filtres, justificatif.
import { useMemo, useState, useRef, useEffect } from 'react'
import { Plus, Search, FilePen, Trash2, Paperclip, Eye, ChevronDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { SECTEURS, CATEGORIES_DEPENSE, STATUTS_DECAISSEMENT, NATURES_FLUX, natureFluxDefaut } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget } from './logic'
import { notifierBeneficiaire } from './notifications'
import { isFullAccessRole } from '../../core/roles'

const empty = () => ({
  secteurId: '', categorie: '', montant: '', date: todayStr(),
  description: '', piece: null, recurrente: false, imprevue: false,
  natureFlux: natureFluxDefaut,
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
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: users }   = useCollection('users')

  const [recherche, setRecherche] = useState('')
  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreNature, setFiltreNature] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const liste = useMemo(() => {
    let rows = [...depenses]
    if (filtreSecteur)   rows = rows.filter((d) => d.secteurId === filtreSecteur)
    if (filtreCategorie) rows = rows.filter((d) => d.categorie === filtreCategorie)
    if (filtreNature)    rows = rows.filter((d) => (d.natureFlux || natureFluxDefaut) === filtreNature)
    if (filtreMois)      rows = rows.filter((d) => (d.date || '').startsWith(filtreMois))
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => (d.description || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [depenses, filtreSecteur, filtreCategorie, filtreNature, filtreMois, recherche])

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
        // Prévue (déjà budgétée) → comptée immédiatement. Imprévue (hors budget) → passe par l'autorisation de décaissement.
        const statutInitial = d.imprevue ? 'en_attente' : 'decaissee'
        const depenseFinale = { ...d, id, statut: statutInitial, enregistrePar: user?.nom || '—', createdAt: Date.now() }
        await setItem('depense_depenses', id, depenseFinale)
        await audit('depense', 'DEPENSE_CREATE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, { secteurId: d.secteurId, categorie: d.categorie, montant: d.montant, imprevue: !!d.imprevue })
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
      module: 'depense', forRoles: ['super_admin', 'pau', 'ge'], excludeUid: user?.uid, link: '/depense'
    })
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    const target = toDelete
    setToDelete(null)
    try {
      await removeItem('depense_depenses', target.id)
      const secteur = SECTEURS.find((s) => s.id === target.secteurId)
      await audit('depense', 'DEPENSE_DELETE', `${secteur?.label || target.secteurId} — ${Number(target.montant).toLocaleString('fr-FR')} FCFA`)
      toast.success('Dépense supprimée ✓')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{liste.length} dépense(s) · {totalListe.toLocaleString('fr-FR')} FCFA</span>
          <Button onClick={openCreate}><Plus size={16} /> Ajouter une dépense</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Secteur</th>
              <th className="px-3 py-2 text-left">Catégorie</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-center">Justif.</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">Aucune dépense trouvée.</td></tr>
            )}
            {liste.map((d) => {
              const secteur = SECTEURS.find((s) => s.id === d.secteurId)
              const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
              const nature = NATURES_FLUX[d.natureFlux || natureFluxDefaut]
              const modifiable = isAdmin || d.statut === 'en_attente' || !d.statut
              return (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(d.date)}</td>
                  <td className="px-3 py-2">
                    <Badge tone="neutral">{secteur?.label || d.secteurId}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {d.categorie || '—'}
                    <span className="mt-0.5 block"><Badge tone={nature.tone}>{nature.label}</Badge></span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{d.description || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{Number(d.montant).toLocaleString('fr-FR')} FCFA</td>
                  <td className="px-3 py-2">
                    <Badge tone={statut.tone}>{statut.label}</Badge>
                    {d.beneficiaireNom && (
                      <p className="mt-1 text-[10px] text-gray-400">
                        {d.beneficiaireNom}{d.beneficiaireFonction ? ` (${d.beneficiaireFonction})` : ''}{' '}
                        {d.beneficiaireUid
                          ? (d.recuConfirme ? '· ✅ reçu confirmé' : d.statut === 'decaissee' ? '· en attente de confirmation' : '')
                          : '· externe'}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {d.piece && (
                      <button onClick={() => ouvrirPiece(d.piece)} title="Voir le justificatif" className="rounded p-1 text-primary hover:bg-primary/10">
                        <Eye size={14} />
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {modifiable && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} title="Modifier" className="rounded p-1 text-primary hover:bg-primary/10"><FilePen size={14} /></button>
                        <button onClick={() => setToDelete(d)} title="Supprimer" className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Ajouter une dépense' : 'Modifier la dépense'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Enregistrer' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-3">
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
            <FormGroup label="Nature du flux" hint="Sert au calcul du solde de trésorerie (voir l'onglet Flux de trésorerie).">
              <div className="flex flex-wrap gap-2">
                {Object.entries(NATURES_FLUX).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => set('natureFlux', k)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.natureFlux === k ? 'border-primary bg-primary/10 text-primary-dark' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    title={v.desc}>
                    {modal.data.natureFlux === k ? '✓ ' : ''}{v.label}
                  </button>
                ))}
              </div>
            </FormGroup>
            <FormGroup label="Description">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                placeholder="ex: Achat de fournitures de bureau"
              />
            </FormGroup>
            <FormGroup label="Bénéficiaire (optionnel)" hint="La personne qui reçoit l'argent.">
              <div className="mb-2 flex gap-2">
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'interne'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', '') }}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.beneficiaireType !== 'externe' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-gray-200 text-gray-500'}`}>
                  Membre de l'entreprise
                </button>
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'externe'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', '') }}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.beneficiaireType === 'externe' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-gray-200 text-gray-500'}`}>
                  Externe (fournisseur, prestataire…)
                </button>
              </div>

              {modal.data.beneficiaireType === 'externe' ? (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Nom de la personne</label>
                    <Input value={modal.data.beneficiaireNom} onChange={(e) => set('beneficiaireNom', e.target.value)} placeholder="ex: Kofi Adjovi" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Profession / fonction</label>
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Maçon" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Nom du bénéficiaire</label>
                    <ChampBeneficiaire
                      value={modal.data.beneficiaireNom}
                      onChange={(v) => { set('beneficiaireNom', v); set('beneficiaireUid', '') }}
                      onSelectUser={(u) => { set('beneficiaireUid', u.uid); set('beneficiaireNom', u.nom || ''); set('beneficiaireFonction', u.poste || '') }}
                      users={users}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Fonction (optionnel)</label>
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Comptable" />
                  </div>
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">
                {modal.data.beneficiaireType === 'externe'
                  ? 'Bénéficiaire externe : pas de notification automatique (aucun compte sur la plateforme).'
                  : modal.data.beneficiaireUid
                    ? 'Membre de l\'entreprise : recevra une notification dans l\'application pour confirmer la réception.'
                    : 'Nom saisi librement, sans compte associé : pas de notification automatique.'}
              </p>
            </FormGroup>
            {modal.isNew && (
              <FormGroup label="Type de dépense">
                <div className="space-y-2 rounded-lg border border-gray-200 p-3">
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
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
              🔁 Dépense récurrente (à reconduire chaque mois)
            </label>
            <FormGroup label="Justificatif (photo ou PDF)">
              {modal.data.piece ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-700"><Paperclip size={14} /> {modal.data.piece.nom} <span className="text-xs text-gray-400">({formatTaille(modal.data.piece.taille)})</span></span>
                  <button onClick={() => set('piece', null)} className="text-xs text-red-500 hover:underline">Retirer</button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:bg-gray-50">
                  <Paperclip size={16} /> {uploading ? 'Chargement…' : 'Ajouter un justificatif'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handlePieceChange} disabled={uploading} />
                </label>
              )}
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette dépense ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer</Button></>}>
        {toDelete && (
          <p className="text-sm text-gray-600">
            Vous allez supprimer la dépense de <span className="font-bold text-gray-900">{Number(toDelete.montant).toLocaleString('fr-FR')} FCFA</span> du {formatDateShort(toDelete.date)}.
            Cette action est <span className="font-semibold text-red-600">irréversible</span>.
          </p>
        )}
      </Modal>
    </div>
  )
}
