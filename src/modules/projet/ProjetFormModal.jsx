// Formulaire création/édition d'un projet — composant partagé pour pouvoir modifier
// un projet SANS quitter l'écran où on se trouve (ex. ProjetsExplorer.jsx, où le
// bouton ✏️ ouvrait auparavant la liste complète des projets juste pour éditer).
// Piloté entièrement par les props : `editingProjet` (null = création) et `open`.
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, X } from 'lucide-react'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { setItem } from '../../core/db'
import { STATUTS_PROJET, TYPES_PROJET, PRIORITES, UNITES_SUPERFICIE } from './data'
import { genererNumProjet, SECTEURS_PROJET } from './logic'
import { genId, todayStr } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { ROLES, FULL_ACCESS_ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'

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

const VIDE = { nom: '', lieu: '', type: 'autre', secteurId: '', statut: 'planification', priorite: 'normale', responsable: '', responsableUid: '', collaborateurs: [], dateDebut: '', dateFin: '', dureeIndeterminee: false, budget: '', description: '', superficie: '', superficieUnite: 'ha', pourClient: true, clientNom: '', clientTelephone: '', montantContrat: '', usageInterne: '', versementMontant: '', versementDate: '' }

// Style des boutons de choix (priorité…) selon le ton associé — cohérent avec Badge.
const TONE_BOUTON = {
  neutral: 'border-gray-400 bg-gray-50 text-gray-800',
  info:    'border-sky-400 bg-sky-50 text-sky-800',
  warning: 'border-amber-400 bg-amber-50 text-amber-800',
  danger:  'border-red-400 bg-red-50 text-red-800'
}

// `editingProjet` : null = création, sinon le projet à modifier. `secteurIdDefaut` :
// pré-remplit le secteur à la création (ex. depuis ProjetsExplorer, déjà dans un secteur).
// `projets` : liste utilisée pour numéroter un nouveau projet (genererNumProjet) — passer
// la liste COMPLÈTE si ce composant sert aussi à la création, une liste partielle suffit
// pour l'édition seule. `onSaved(projetId)` : appelé après enregistrement réussi.
export default function ProjetFormModal({ open, onClose, editingProjet = null, secteurIdDefaut = '', projets = [], users = [], onSaved }) {
  const { user } = useAuthStore()
  const [form, setForm] = useState(VIDE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingProjet) {
      const p = editingProjet
      setForm({
        nom: p.nom || '', lieu: p.lieu || '', type: p.type || 'autre', secteurId: p.secteurId || '', statut: p.statut || 'planification',
        priorite: p.priorite || 'normale', responsable: p.responsable || '', responsableUid: p.responsableUid || '',
        collaborateurs: p.collaborateurs || [],
        dateDebut: p.dateDebut ? new Date(p.dateDebut).toISOString().slice(0, 10) : '',
        dateFin:   p.dateFin   ? new Date(p.dateFin).toISOString().slice(0, 10)   : '',
        dureeIndeterminee: !!p.dureeIndeterminee,
        budget: p.budget ?? '', description: p.description || '',
        superficie: p.superficie ?? '', superficieUnite: p.superficieUnite || 'ha',
        pourClient: p.pourClient !== false, clientNom: p.clientNom || '', clientTelephone: p.clientTelephone || '',
        montantContrat: (p.montantContrat ?? (p.pourClient !== false ? p.budget : null)) ?? '',
        usageInterne: p.usageInterne || '',
        versementMontant: '', versementDate: todayStr()
      })
    } else {
      setForm({ ...VIDE, secteurId: secteurIdDefaut || '', versementDate: todayStr() })
    }
  }, [open, editingProjet, secteurIdDefaut])

  // Le budget/montant du contrat est optionnel — un projet peut être créé avant qu'il soit
  // établi. S'il est saisi, il doit être positif. Pour un projet client, un seul montant est
  // saisi (« Montant du contrat ») et sert à la fois de budget de dépense et de somme due par
  // le client — c'est le même argent.
  const budgetValide  = form.pourClient  || form.budget === ''         || Number(form.budget) > 0
  const contratValide = !form.pourClient || form.montantContrat === '' || Number(form.montantContrat) > 0

  const handleSave = async () => {
    if (!form.nom.trim() || !budgetValide || !contratValide) return
    setSaving(true)
    try {
      const now = Date.now()
      const { versementMontant, versementDate, ...projetForm } = form
      const montant = form.pourClient
        ? (form.montantContrat !== '' ? Number(form.montantContrat) : null)
        : (form.budget !== '' ? Number(form.budget) : null)
      let projetId = editingProjet?.id
      if (editingProjet) {
        await setItem('projets', editingProjet.id, {
          ...editingProjet,
          ...projetForm,
          dateDebut: form.dateDebut ? new Date(form.dateDebut).getTime() : null,
          dateFin:   (!form.dureeIndeterminee && form.dateFin) ? new Date(form.dateFin).getTime() : null,
          budget: montant,
          montantContrat: form.pourClient ? montant : null,
          superficie: (form.type === 'agricole' && form.superficie !== '') ? Number(form.superficie) : null,
          updatedAt: now
        })
        await audit('projet', 'projet_modifie', `${form.nom} (${editingProjet.id})`)
      } else {
        const num = genererNumProjet(projets.length + 1)
        projetId = `prj_${now}`
        await setItem('projets', projetId, {
          id: projetId, num, ...projetForm,
          dateDebut: form.dateDebut ? new Date(form.dateDebut).getTime() : null,
          dateFin:   (!form.dureeIndeterminee && form.dateFin) ? new Date(form.dateFin).getTime() : null,
          budget: montant,
          montantContrat: form.pourClient ? montant : null,
          superficie: (form.type === 'agricole' && form.superficie !== '') ? Number(form.superficie) : null,
          createdAt: now, updatedAt: now,
          createdBy: user?.uid || null
        })
        await audit('projet', 'projet_cree', `${form.nom} (${num})`)
        const destinatairesProjet = [...new Set([
          form.responsableUid,
          ...(form.collaborateurs || []).map((c) => c.uid)
        ].filter(Boolean))]
        await notify({
          type: 'info',
          title: `📁 Nouveau projet — ${form.nom}`,
          body: `${form.nom} (${num})${form.responsable ? ` — responsable : ${form.responsable}` : ''}.`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers: destinatairesProjet, excludeUid: user?.uid,
          link: '/projet/projets/liste', state: { openProjetId: projetId }
        }).catch(() => {})
      }

      // Versement optionnel du client — saisi en même temps que le montant du contrat.
      const montantVerse = form.pourClient ? Number(versementMontant) || 0 : 0
      if (montantVerse > 0) {
        const versId = genId()
        await setItem('projet_versements_client', versId, {
          id: versId, projetId,
          montant: montantVerse,
          date: versementDate ? new Date(versementDate).getTime() : now,
          note: '',
          enregistrePar: user?.nom || user?.login || null, enregistreParUid: user?.uid || null,
          createdAt: now
        })
        await audit('projet', 'projet_versement_client', `${montantVerse.toLocaleString('fr-FR')} FCFA reçus — ${form.nom}`)
      }
      onSaved?.(projetId)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingProjet ? 'Modifier le projet' : 'Nouveau projet'}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Lieu / chantier</label>
            <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="ex : Kara, Agbalépédogan, route Tsévié…"
              value={form.lieu} onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))} />
            <p className="mt-1 text-[11px] text-gray-400">Affiché à côté du nom du projet partout où ses tâches apparaissent, pour situer l'activité.</p>
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
                {SECTEURS_PROJET.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
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
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRIORITES).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, priorite: k }))}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      form.priorite === k ? TONE_BOUTON[v.tone] : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}>
                    {form.priorite === k ? '✓ ' : ''}{v.label}
                  </button>
                ))}
              </div>
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
                <button type="button"
                  onClick={() => setForm((f) => ({ ...f, dureeIndeterminee: !f.dureeIndeterminee, dateFin: !f.dureeIndeterminee ? '' : f.dateFin }))}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    form.dureeIndeterminee ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}>
                  {form.dureeIndeterminee ? '✓ ' : ''}♾️ Durée indéterminée
                </button>
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
                <ChampAutocomplete
                  value={form.superficieUnite}
                  onChange={(v) => setForm((f) => ({ ...f, superficieUnite: v }))}
                  suggestions={Object.values(UNITES_SUPERFICIE)}
                  getLabel={(v) => v.label}
                  onSelect={(v) => setForm((f) => ({ ...f, superficieUnite: v.court }))}
                  placeholder="ex : ha, a, m²…"
                  accent="green"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <p className="mt-1 text-[11px] text-gray-400">Choisis une suggestion ou tape une unité libre (ex : acre, planche…).</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Budget & description ── */}
        <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">💰 Budget & description</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Ce projet est…</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: true,  label: '🧑‍💼 Pour un client' },
                { id: false, label: '🏢 Pour l\'entreprise' }
              ].map((opt) => (
                <button key={String(opt.id)} type="button"
                  onClick={() => setForm((f) => ({
                    ...f, pourClient: opt.id,
                    clientNom: opt.id ? f.clientNom : '',
                    clientTelephone: opt.id ? f.clientTelephone : '',
                    montantContrat: opt.id ? f.montantContrat : '',
                    usageInterne: opt.id ? '' : f.usageInterne
                  }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.pourClient === opt.id
                      ? (opt.id ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-teal-400 bg-teal-50 text-teal-800')
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}>
                  {form.pourClient === opt.id ? '✓ ' : ''}{opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {form.pourClient
                ? 'Les dépenses de ce projet seront classées en Exploitation dans E-DÉPENSES (charge courante, en face du revenu du client).'
                : 'Projet pour l\'entreprise elle-même — les dépenses seront classées en Investissement dans E-DÉPENSES.'}
            </p>
            {form.pourClient && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="Nom du client"
                  value={form.clientNom} onChange={(e) => setForm((f) => ({ ...f, clientNom: e.target.value }))} />
                <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="Contact client (téléphone)"
                  value={form.clientTelephone} onChange={(e) => setForm((f) => ({ ...f, clientTelephone: e.target.value }))} />
              </div>
            )}
            {!form.pourClient && (
              <input className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Usage interne (ex : Entrepôt Lomé, Véhicule flotte…)"
                value={form.usageInterne} onChange={(e) => setForm((f) => ({ ...f, usageInterne: e.target.value }))} />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {form.pourClient ? 'Montant du contrat (FCFA)' : 'Budget prévu (FCFA)'}
            </label>
            {form.pourClient ? (
              <>
                <input type="number" min="0"
                  placeholder="Somme convenue avec le client — laisser vide si pas encore chiffrée"
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${form.montantContrat !== '' && !contratValide ? 'border-red-300' : 'border-gray-200'}`}
                  value={form.montantContrat} onChange={(e) => setForm((f) => ({ ...f, montantContrat: e.target.value }))} />
                {form.montantContrat !== '' && !contratValide
                  ? <p className="mt-1 text-[11px] text-red-500">Le montant du contrat doit être supérieur à 0.</p>
                  : <p className="mt-1 text-[11px] text-gray-400">C'est à la fois ce que le client doit payer et le budget de dépense du chantier.</p>}

                <label className="mb-1 mt-3 block text-xs font-medium text-gray-600">
                  {editingProjet ? 'Nouveau versement reçu (FCFA)' : 'Montant déjà déposé par le client (FCFA)'}
                  <span className="ml-1 font-normal text-gray-400">(optionnel)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min="0"
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    value={form.versementMontant} onChange={(e) => setForm((f) => ({ ...f, versementMontant: e.target.value }))} />
                  <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    value={form.versementDate} onChange={(e) => setForm((f) => ({ ...f, versementDate: e.target.value }))} />
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  {editingProjet
                    ? "Renseigne un montant pour enregistrer un nouveau versement reçu du client, en plus de ceux déjà reçus. Laisse à 0 (ou vide) si rien de nouveau."
                    : "Le client peut déposer une partie ou la totalité de la somme dès la création du projet — laisse à 0 (ou vide) s'il n'a encore rien versé."}
                </p>
              </>
            ) : (
              <>
                <input type="number" min="0"
                  placeholder="Laisser vide si le budget n'est pas encore établi"
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${form.budget !== '' && !budgetValide ? 'border-red-300' : 'border-gray-200'}`}
                  value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
                {form.budget !== '' && !budgetValide
                  ? <p className="mt-1 text-[11px] text-red-500">Le budget doit être supérieur à 0.</p>
                  : <p className="mt-1 text-[11px] text-gray-400">Optionnel — peut être établi plus tard. Les dépenses réelles se calculent automatiquement à partir des décaissements saisis dans l'onglet Dépenses.</p>}
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea rows={3} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !form.nom.trim() || !budgetValide || !contratValide}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </div>
    </Modal>
  )
}
