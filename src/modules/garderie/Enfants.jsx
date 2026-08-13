import { useMemo, useState, useRef } from 'react'
import { Plus, Eye, Search, FilePen, Trash2, UserPlus, Camera, X, Loader2, UserCheck, UserX, CreditCard, ShieldAlert } from 'lucide-react'
import { compresserPhotoProfil } from '../../utils/fichiers'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { GROUPES_AGE, STATUTS_ENFANT, PROGRAMMES_ENFANT, GROUPES_PAR_PROGRAMME, programmeDuGroupe } from './data'
import { calcAge, groupeRecommande, tarifSuggere, aImpayes } from './logic'
import { useGarderieStore } from './store/garderieStore'

const emptyJournalier = () => ({
  nom: '', prenom: '', ageApprox: '',
  parentNom: '', parentContact: '',
  date: todayStr(), nombreJours: '1', notes: '',
  apporteRepas: false
})

const empty = () => ({
  nom: '', prenom: '', photo: '', dateNaissance: '', ageSaisi: '', sexe: 'F',
  programme: '', groupe: '', statut: 'actif',
  typeAbonnement: 'mensuel',
  allergies: '', infoMedicale: '',
  parentId: '', parentNom: '', parentContact: '',
  parentContact2: '', parentProfession: '', adresse: '',
  dateInscription: todayStr(), notes: ''
})

export default function Enfants() {
  const { user, role } = useAuth()
  const lectureSeule = role === 'tata' || role === 'superviseur' || role === 'partenaire'
  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: parents }     = useCollection('garderie_parents')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const { data: presences }   = useCollection('garderie_presences')
  const { data: incidents }   = useCollection('garderie_incidents')
  const { data: paiements }   = useCollection('garderie_paiements')

  const [onglet, setOnglet]   = useState('inscrits')
  const [recherche, setRecherche] = useState('')
  const [filtreProgramme, setFiltreProgramme] = useState('')
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('actif')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [modal, setModal]       = useState(null)
  const [detail, setDetail]     = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletedEnfantIds    = useGarderieStore((s) => s.deletedEnfantIds)
  const markEnfantDeleted   = useGarderieStore((s) => s.markEnfantDeleted)
  const unmarkEnfantDeleted = useGarderieStore((s) => s.unmarkEnfantDeleted)
  const GRILLE_TARIFAIRE    = useGarderieStore((s) => s.grilleTarifaire)

  async function handleDelete() {
    if (!toDelete || deleting) return
    const target = toDelete
    setDeleting(true)
    markEnfantDeleted(target.id)
    setToDelete(null)
    try {
      // Suppression RÉELLE et définitive : l'enregistrement quitte la base.
      //
      // L'ancienne logique écrivait d'abord un statut 'supprime' (pierre tombale)
      // et ne tentait la vraie suppression qu'en « best-effort », avec un
      // `.catch()` silencieux. Résultat : au moindre échec, l'enfant restait en
      // base indéfiniment — masqué dans l'écran, mais bien présent dans les
      // données. C'est précisément ce comportement qui est corrigé ici : plus de
      // pierre tombale, et un échec est signalé au lieu d'être avalé.
      await removeItem('garderie_enfants', target.id)
      audit('garderie', 'ENFANT_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } catch (err) {
      // Échec réel : on démasque et on prévient, au lieu de prétendre que la
      // suppression a marché alors que l'enfant est toujours en base.
      unmarkEnfantDeleted(target.id)
      toast.error(`Échec de la suppression de ${target.prenom} ${target.nom} — réessayez.`)
    } finally {
      setDeleting(false)
    }
  }

  const liste = useMemo(() => {
    // `deletedEnfantIds` est un masquage local temporaire (perdu au rechargement) —
    // on exclut AUSSI sur le statut persisté en base, seule source fiable après reload.
    let rows = enfants.filter((e) => !deletedEnfantIds.has(e.id) && e.statut !== 'supprime')
    if (filtreStatut) rows = rows.filter((e) => e.statut === filtreStatut)
    if (filtreProgramme) rows = rows.filter((e) => (e.programme || programmeDuGroupe(e.groupe)) === filtreProgramme)
    if (filtreGroupe) rows = rows.filter((e) => e.groupe === filtreGroupe)
    if (filtreAnnee)  rows = rows.filter((e) => (e.dateInscription || '').startsWith(filtreAnnee))
    if (filtreMois)   rows = rows.filter((e) => {
      const d = e.dateInscription || ''
      return d.slice(5, 7) === String(filtreMois).padStart(2, '0')
    })
    if (filtreJour)   rows = rows.filter((e) => {
      const d = e.dateInscription || ''
      return d.slice(8, 10) === String(filtreJour).padStart(2, '0')
    })
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((e) => `${e.prenom} ${e.nom} ${e.parentNom}`.toLowerCase().includes(q))
    }
    return rows.sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [enfants, recherche, filtreProgramme, filtreGroupe, filtreStatut, filtreAnnee, filtreMois, filtreJour, deletedEnfantIds])

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  // Fiches créées avant l'ajout du champ `programme` : déduit du groupe pour que le
  // sélecteur s'ouvre déjà cohérent, plutôt que vide.
  function openEdit(e)  { setModal({ data: { ...empty(), ...e, programme: e.programme || programmeDuGroupe(e.groupe) }, isNew: false, id: e.id }) }

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.dateNaissance && !d.ageSaisi?.trim()) return toast.error('Date de naissance ou âge requis')
    if (!d.programme) return toast.error('Programme requis (garderie ou maternelle)')
    if (!d.groupe) return toast.error('Groupe requis')
    if (!d.parentNom?.trim()) return toast.error('Nom du parent / tuteur requis')
    if (!d.parentContact?.trim()) return toast.error('Contact principal du parent requis')
    if (!d.adresse?.trim()) return toast.error('Adresse requise')

    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_enfants', id, { ...d, id })
        audit('garderie', 'ENFANT_CREATE', `${d.prenom} ${d.nom}`, { groupe: d.groupe })
        notify({ type: 'info', title: '🍼 Nouvel enfant inscrit', body: `${d.prenom} ${d.nom} a été inscrit(e) à la garderie`, module: 'garderie', forRoles: [...FULL_ACCESS_ROLES,'gerant'], excludeUid: user.uid, link: '/garderie/enfants' })
        toast.success(`${d.prenom} ${d.nom} inscrit(e) ✓`)
      } else {
        await setItem('garderie_enfants', modal.id, { ...d, id: modal.id })
        audit('garderie', 'ENFANT_EDIT', `${d.prenom} ${d.nom}`)
        toast.success('Fiche mise à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  // ── Photo de profil ──
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef(null)

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choisissez une image')
    setPhotoUploading(true)
    try {
      const dataURL = await compresserPhotoProfil(file)
      set('photo', dataURL)
    } catch (err) {
      toast.error(err.message || 'Erreur lors du traitement de la photo')
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Photo de profil depuis la fiche détail (modification directe) ──
  const [detailPhotoUploading, setDetailPhotoUploading] = useState(false)
  const detailPhotoInputRef = useRef(null)

  async function handleDetailPhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !detail) return
    if (!file.type.startsWith('image/')) return toast.error('Choisissez une image')
    setDetailPhotoUploading(true)
    try {
      const dataURL = await compresserPhotoProfil(file)
      await updateItem('garderie_enfants', detail.id, { photo: dataURL })
      setDetail((d) => ({ ...d, photo: dataURL }))
      toast.success('Photo mise à jour ✓')
    } catch (err) {
      toast.error(err.message || 'Erreur lors du traitement de la photo')
    } finally {
      setDetailPhotoUploading(false)
    }
  }

  // ── Statistiques de l'enfant affiché dans la fiche détail ──
  const detailStats = useMemo(() => {
    if (!detail) return null
    const presEnfant = presences.filter((p) => p.enfantId === detail.id)
    const joursPresents = presEnfant.filter((p) => p.statut === 'present').length
    const joursAbsents  = presEnfant.filter((p) => p.statut === 'absent').length
    const joursExcuses   = presEnfant.filter((p) => p.statut === 'excuse').length
    const incidentsEnfant = incidents.filter((i) => i.enfantId === detail.id)
    const incidentsOuverts = incidentsEnfant.filter((i) => !i.resolu).length
    return {
      joursPresents, joursAbsents, joursExcuses,
      incidentsTotal: incidentsEnfant.length,
      incidentsOuverts,
      impaye: aImpayes(paiements, detail.id)
    }
  }, [detail, presences, incidents, paiements])

  // ── Journaliers ──
  const [joModal, setJoModal]   = useState(null)
  const [joSaving, setJoSaving] = useState(false)
  const [joDelete, setJoDelete] = useState(null)
  const [joDeleting, setJoDeleting] = useState(false)
  const [filtreDateJo, setFiltreDateJo] = useState(todayStr())

  const journaliersFiltre = useMemo(
    () => journaliers.filter((j) => !filtreDateJo || j.date === filtreDateJo)
      .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1),
    [journaliers, filtreDateJo]
  )

  async function handleSaveJournalier() {
    if (joSaving) return
    const d = joModal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.date) return toast.error('Date requise')
    if (!d.nombreJours || Number(d.nombreJours) < 1) return toast.error('Nombre de jours requis')
    if (!d.parentNom?.trim()) return toast.error('Nom du parent requis')
    if (!d.parentContact?.trim()) return toast.error('Contact du parent requis')
    setJoSaving(true)
    try {
      if (joModal.isNew) {
        const id = genId()
        await setItem('garderie_journaliers', id, { ...d, id })
        audit('garderie', 'JOURNALIER_ADD', `${d.prenom} ${d.nom}`, { date: d.date })
        toast.success(`${d.prenom} ${d.nom} enregistré(e) ✓`)
      } else {
        await setItem('garderie_journaliers', joModal.id, { ...d, id: joModal.id })
        audit('garderie', 'JOURNALIER_EDIT', `${d.prenom} ${d.nom}`)
        toast.success('Fiche mise à jour ✓')
      }
      setJoModal(null)
    } finally {
      setJoSaving(false)
    }
  }

  async function handleDeleteJournalier() {
    if (!joDelete || joDeleting) return
    const target = joDelete
    setJoDeleting(true)
    setJoDelete(null)
    try {
      await removeItem('garderie_journaliers', target.id)
      audit('garderie', 'JOURNALIER_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setJoDeleting(false)
    }
  }

  const setJo = (k, v) => setJoModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  return (
    <div className="space-y-5">

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'inscrits',    label: '🍼 Enfants inscrits' },
          { id: 'journaliers', label: '🚪 Enfants journaliers' }
        ].map((t) => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              onglet === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ ONGLET JOURNALIERS ══ */}
      {onglet === 'journaliers' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-0.5">💡 Enfants journaliers</p>
            <p>Enfants non inscrits officiellement, déposés pour <strong>une seule journée</strong>. Le paiement de la journée (cantine incluse) est enregistré ici. Ils apparaissent automatiquement dans la <strong>Cantine</strong> du jour concerné.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Filtrer par date</label>
              <Input type="date" value={filtreDateJo} onChange={(e) => setFiltreDateJo(e.target.value)} />
            </div>
            {filtreDateJo && (
              <button onClick={() => setFiltreDateJo('')}
                className="mt-4 text-xs text-gray-400 hover:text-orange-500 underline">Voir tous</button>
            )}
            <div className="ml-auto">
              <Button onClick={() => setJoModal({ data: emptyJournalier(), isNew: true })}>
                <UserPlus size={16} /> Ajouter un journalier
              </Button>
            </div>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Enfant</th>
                  <th className="px-3 py-2 text-left">Âge</th>
                  <th className="px-3 py-2 text-left">Parent / Contact</th>
                  <th className="px-3 py-2 text-center">Nb jours</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {journaliersFiltre.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant journalier{filtreDateJo ? ' ce jour' : ''}.</td></tr>
                )}
                {journaliersFiltre.map((j) => (
                  <tr key={j.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(j.date)}</td>
                    <td className="px-3 py-2 font-semibold">
                      {j.prenom} {j.nom}
                      {j.apporteRepas && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">🍱 repas apporté</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{j.ageApprox ? `~${j.ageApprox}` : '—'}</td>
                    <td className="px-3 py-2">
                      <p>{j.parentNom || '—'}</p>
                      <p className="text-xs text-gray-400">{j.parentContact}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                        {j.nombreJours || 1} jour{Number(j.nombreJours) > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{j.notes || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => setJoModal({ data: { ...emptyJournalier(), ...j }, isNew: false, id: j.id })}
                          className="rounded p-1 text-orange-600 hover:bg-orange-50"><FilePen size={14} /></button>
                        <button onClick={() => setJoDelete(j)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══ ONGLET INSCRITS ══ */}
      {onglet === 'inscrits' && <>

      {/* Reliquats d'anciennes suppressions incomplètes (statut 'supprime' laissé
          en base par l'ancienne logique). « Sorti » est EXCLU : c'est un statut
          métier normal — un enfant qui a quitté la garderie — et non une
          suppression ratée. L'inclure ici faisait effacer définitivement, d'un
          simple clic sur « Nettoyer », des enfants parfaitement légitimes avec
          tout leur historique (présences, paiements). */}
      {enfants.filter((e) => e.statut === 'supprime' && !deletedEnfantIds.has(e.id)).length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center justify-between">
          <p>⚠️ {enfants.filter((e) => e.statut === 'supprime').length} enfant(s) en suppression incomplète — masqués mais encore présents en base.</p>
          <button
            onClick={async () => {
              const aNettoyer = enfants.filter((e) => e.statut === 'supprime')
              let echecs = 0
              for (const e of aNettoyer) {
                try { await removeItem('garderie_enfants', e.id) } catch { echecs++ }
              }
              if (echecs) toast.error(`${aNettoyer.length - echecs} nettoyé(s), ${echecs} échec(s) — réessayez.`)
              else toast.success(`${aNettoyer.length} enfant(s) nettoyé(s) ✓`)
            }}
            className="ml-3 rounded-lg bg-orange-500 px-3 py-1 text-xs font-bold text-white hover:bg-orange-600 shrink-0">
            Nettoyer
          </button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
          <input
            className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="Rechercher un enfant…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Programme</label>
          <Select value={filtreProgramme} onChange={(e) => setFiltreProgramme(e.target.value)}>
            <option value="">Garderie + Maternelle</option>
            {PROGRAMMES_ENFANT.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Groupe</label>
          <Select value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)}>
            <option value="">Tous les groupes</option>
            {(filtreProgramme ? GROUPES_AGE.filter((g) => GROUPES_PAR_PROGRAMME[filtreProgramme].includes(g.id)) : GROUPES_AGE)
              .map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>

        {/* Filtres par date d'inscription */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Année inscription</label>
          <input type="number" value={filtreAnnee} onChange={(e) => setFiltreAnnee(e.target.value)}
            placeholder="ex: 2026" min="2020" max="2099"
            className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Mois inscription</label>
          <Select value={filtreMois} onChange={(e) => setFiltreMois(e.target.value)}>
            <option value="">Tous</option>
            {['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'].map((m, i) => (
              <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Jour inscription</label>
          <input type="number" value={filtreJour} onChange={(e) => setFiltreJour(e.target.value)}
            placeholder="01-31" min="1" max="31"
            className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
        </div>
        {(filtreAnnee || filtreMois || filtreJour) && (
          <button onClick={() => { setFiltreAnnee(''); setFiltreMois(''); setFiltreJour('') }}
            className="self-end mb-0.5 text-xs text-orange-500 hover:underline">
            Effacer dates
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{liste.length} enfant(s)</span>
          {!lectureSeule && (
            <Button onClick={openCreate}><Plus size={16} /> Inscrire un enfant</Button>
          )}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Prénom Nom</th>
              <th className="px-3 py-2 text-left">Âge</th>
              <th className="px-3 py-2 text-left">Programme / Groupe</th>
              <th className="px-3 py-2 text-left">Parent / Contact</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Inscription</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant trouvé.</td></tr>
            )}
            {liste.map((e) => (
              <tr key={e.id} onClick={() => setDetail(e)} className="cursor-pointer hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">
                  <div className="flex items-center gap-2">
                    {e.photo ? (
                      <img src={e.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                        {(e.prenom?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    {e.prenom} {e.nom}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-600">{calcAge(e.dateNaissance) || e.ageSaisi || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${(e.programme || programmeDuGroupe(e.groupe)) === 'maternelle' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {PROGRAMMES_ENFANT.find((p) => p.id === (e.programme || programmeDuGroupe(e.groupe)))?.label}
                  </span>
                  {GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—'}
                </td>
                <td className="px-3 py-2">
                  <p>{e.parentNom || '—'}</p>
                  <p className="text-xs text-gray-400">{e.parentContact}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUTS_ENFANT[e.statut]?.tone}>{STATUTS_ENFANT[e.statut]?.label}</Badge>
                  {e.allergies && <span className="ml-1 text-xs text-orange-500">⚠ allergie</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  <p>{formatDateShort(e.dateInscription)}</p>
                  {e.typeAbonnement && (
                    <span className={`font-semibold ${e.typeAbonnement === 'annuel' ? 'text-purple-600' : 'text-blue-600'}`}>
                      {e.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-1">
                    <button onClick={() => setDetail(e)} title="Voir la fiche" className="rounded p-1 hover:bg-gray-100"><Eye size={14} /></button>
                    {!lectureSeule && (
                      <>
                        <button onClick={() => openEdit(e)} title="Modifier la fiche" className="rounded p-1 text-orange-600 hover:bg-orange-50"><FilePen size={14} /></button>
                        <button onClick={() => setToDelete(e)} title="Supprimer" className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      </> }

      {/* Modal journalier création / édition */}
      <Modal open={!!joModal} onClose={() => setJoModal(null)} size="md"
        title={joModal?.isNew ? '🚪 Ajouter un enfant journalier' : 'Modifier le journalier'}
        footer={
          <>
            <Button variant="outline" onClick={() => setJoModal(null)} disabled={joSaving}>Annuler</Button>
            <Button onClick={handleSaveJournalier} loading={joSaving}>
              {joModal?.isNew ? 'Enregistrer' : 'Mettre à jour'}
            </Button>
          </>
        }>
        {joModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *">
                <Input value={joModal.data.prenom} onChange={(e) => setJo('prenom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nom *">
                <Input value={joModal.data.nom} onChange={(e) => setJo('nom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Âge approximatif">
                <Input value={joModal.data.ageApprox} onChange={(e) => setJo('ageApprox', e.target.value)} placeholder="ex: 3 ans" />
              </FormGroup>
              <FormGroup label="Date de début *">
                <Input type="date" value={joModal.data.date} onChange={(e) => setJo('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nombre de jours *">
                <Input type="number" min="1" value={joModal.data.nombreJours}
                  onChange={(e) => setJo('nombreJours', e.target.value)} placeholder="ex: 3" />
              </FormGroup>
            </div>

            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-orange-700">Parent / Tuteur</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Nom du parent *">
                  <Input value={joModal.data.parentNom} onChange={(e) => setJo('parentNom', e.target.value)} placeholder="Nom complet du parent" />
                </FormGroup>
                <FormGroup label="Contact *">
                  <Input value={joModal.data.parentContact} onChange={(e) => setJo('parentContact', e.target.value)} placeholder="ex: +226 70 00 00 00" />
                </FormGroup>
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800 cursor-pointer">
              <input type="checkbox" checked={!!joModal.data.apporteRepas}
                onChange={(e) => setJo('apporteRepas', e.target.checked)}
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400" />
              🍱 Apporte son propre repas (pas de frais de cuisine)
            </label>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              💡 Le paiement se fait dans le volet <strong>Paiements → Journaliers</strong>
            </div>

            <FormGroup label="Notes">
              <Input value={joModal.data.notes} onChange={(e) => setJo('notes', e.target.value)} placeholder="Informations complémentaires…" />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression journalier */}
      <Modal open={!!joDelete} onClose={() => setJoDelete(null)} size="sm"
        title="Supprimer ce journalier ?"
        footer={
          <>
            <Button variant="outline" onClick={() => setJoDelete(null)}>Annuler</Button>
            <Button variant="danger" onClick={handleDeleteJournalier} loading={joDeleting}>Supprimer</Button>
          </>
        }>
        {joDelete && (
          <p className="text-sm text-gray-600">
            Vous allez supprimer <span className="font-bold">{joDelete.prenom} {joDelete.nom}</span> du {formatDateShort(joDelete.date)}.
            Cette action est <span className="font-semibold text-red-600">irréversible</span>.
          </p>
        )}
      </Modal>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        panelClassName="bg-white/90 backdrop-blur-xl backdrop-saturate-150"
        title={modal?.isNew ? 'Inscrire un enfant' : 'Modifier la fiche enfant'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Inscrire' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            {/* Photo de profil */}
            <div className="flex items-center gap-4 rounded-2xl border border-orange-100/70 bg-orange-50/60 p-3.5 shadow-sm backdrop-blur-sm">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-orange-100 shadow">
                {modal.data.photo ? (
                  <img src={modal.data.photo} alt="Photo de profil" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={24} className="text-orange-300" />
                )}
                {modal.data.photo && (
                  <button
                    type="button"
                    onClick={() => set('photo', '')}
                    title="Retirer la photo"
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                <Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()} loading={photoUploading}>
                  <Camera size={16} /> {modal.data.photo ? 'Changer la photo' : 'Ajouter une photo'}
                </Button>
                <p className="mt-1 text-[11px] text-gray-400">JPG ou PNG, recadrée automatiquement en carré</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *">
                <Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nom *">
                <Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Date de naissance">
                <Input type="date" value={modal.data.dateNaissance} onChange={(e) => {
                  const g = groupeRecommande(e.target.value)
                  set('dateNaissance', e.target.value)
                  set('groupe', g)
                  set('programme', g ? programmeDuGroupe(g) : '')
                  set('ageSaisi', '')
                }} />
                {modal.data.dateNaissance && (() => {
                  const t = tarifSuggere(modal.data.dateNaissance, GRILLE_TARIFAIRE)
                  return t ? (
                    <p className="mt-1 rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700 font-semibold">
                      💰 Tarif suggéré ({t.label}) : <span className="text-green-800">{t.tarif.toLocaleString('fr-FR')} FCFA / mois</span>
                    </p>
                  ) : null
                })()}
              </FormGroup>
              <FormGroup label="Âge (si date inconnue)">
                <Input
                  value={modal.data.ageSaisi}
                  onChange={(e) => {
                    set('ageSaisi', e.target.value)
                    if (e.target.value) set('dateNaissance', '')
                  }}
                  placeholder="ex: 2 ans, 18 mois…"
                  disabled={!!modal.data.dateNaissance}
                />
                {!modal.data.dateNaissance && !modal.data.ageSaisi && (
                  <p className="mt-1 text-[10px] text-gray-400">Renseignez la date de naissance OU l'âge</p>
                )}
              </FormGroup>
              <FormGroup label="Sexe">
                <Select value={modal.data.sexe} onChange={(e) => set('sexe', e.target.value)}>
                  <option value="F">Fille</option>
                  <option value="M">Garçon</option>
                </Select>
              </FormGroup>
              <FormGroup label="Programme *" hint="Garderie (0-2 ans) ou maternelle (3-6 ans)">
                <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
                  {PROGRAMMES_ENFANT.map((p) => (
                    <button key={p.id} type="button" onClick={() => {
                      set('programme', p.id)
                      // Le groupe choisi doit rester cohérent avec le programme — on ne
                      // le vide que s'il appartient à l'autre programme.
                      if (!GROUPES_PAR_PROGRAMME[p.id].includes(modal.data.groupe)) set('groupe', '')
                    }}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                        modal.data.programme === p.id ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-white'
                      }`}>
                      {p.label} <span className="font-normal opacity-80">({p.desc})</span>
                    </button>
                  ))}
                </div>
              </FormGroup>
              <FormGroup label="Groupe d'âge *">
                <Select value={modal.data.groupe} onChange={(e) => set('groupe', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {GROUPES_AGE
                    .filter((g) => !modal.data.programme || GROUPES_PAR_PROGRAMME[modal.data.programme].includes(g.id))
                    .map((g) => <option key={g.id} value={g.id}>{g.label} ({g.desc})</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Statut">
                <Select value={modal.data.statut} onChange={(e) => set('statut', e.target.value)}>
                  {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Type d'abonnement">
                <Select value={modal.data.typeAbonnement || 'mensuel'} onChange={(e) => set('typeAbonnement', e.target.value)}>
                  <option value="mensuel">Mensuel</option>
                  <option value="annuel">Annuel</option>
                </Select>
              </FormGroup>
              <FormGroup label="Date d'inscription">
                <Input type="date" value={modal.data.dateInscription} onChange={(e) => set('dateInscription', e.target.value)} />
              </FormGroup>
              <FormGroup label="Adresse *">
                <Input value={modal.data.adresse} onChange={(e) => set('adresse', e.target.value)} placeholder="Quartier, ville…" />
              </FormGroup>
            </div>

            <div className="rounded-lg border border-pink-100 bg-orange-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-orange-700">Informations parents / tuteurs</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Nom du parent / tuteur *">
                  <Input value={modal.data.parentNom} onChange={(e) => set('parentNom', e.target.value)} placeholder="Nom complet du parent" />
                </FormGroup>
                <FormGroup label="Contact principal *">
                  <Input value={modal.data.parentContact} onChange={(e) => set('parentContact', e.target.value)} placeholder="ex: +226 70 00 00 00" />
                </FormGroup>
                <FormGroup label="Contact secondaire">
                  <Input value={modal.data.parentContact2} onChange={(e) => set('parentContact2', e.target.value)} />
                </FormGroup>
                <FormGroup label="Profession du parent / tuteur">
                  <Input value={modal.data.parentProfession} onChange={(e) => set('parentProfession', e.target.value)} placeholder="ex: Commerçant, Enseignant…" />
                </FormGroup>
              </div>
            </div>

            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-orange-700">Santé & allergies</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Allergies connues">
                  <Input value={modal.data.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="ex: arachides, lait…" />
                </FormGroup>
                <FormGroup label="Info médicale importante">
                  <Input value={modal.data.infoMedicale} onChange={(e) => set('infoMedicale', e.target.value)} placeholder="ex: asthme, épilepsie…" />
                </FormGroup>
              </div>
            </div>

            <FormGroup label="Notes">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)}
              />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cet enfant ?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer définitivement</Button>
          </>
        }
      >
        {toDelete && (
          <p className="text-sm text-gray-600">
            Vous allez supprimer <span className="font-bold text-gray-900">{toDelete.prenom} {toDelete.nom}</span> de la base de données.
            Cette action est <span className="font-semibold text-red-600">irréversible</span>.
          </p>
        )}
      </Modal>

      {/* Modal détail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
        title={detail ? `${detail.prenom} ${detail.nom}` : ''}>
        {detail && (
          <div className="space-y-4 text-sm">
            {/* En-tête glassmorphism : photo (modifiable) + identité bien visible */}
            <div className="relative flex flex-col items-center overflow-hidden rounded-2xl p-5 text-center text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(234,88,12,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(234,88,12,0.92) 0%, rgba(154,52,18,0.88) 100%)' }}>
              <div className="relative h-32 w-32 shrink-0">
                {detail.photo ? (
                  <img src={detail.photo} alt={`${detail.prenom} ${detail.nom}`} className="h-32 w-32 rounded-full border-4 border-white/80 object-cover shadow-lg" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-4xl font-bold text-white shadow-lg backdrop-blur-sm">
                    {(detail.prenom?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <input ref={detailPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleDetailPhotoChange} />
                <button
                  type="button"
                  onClick={() => detailPhotoInputRef.current?.click()}
                  disabled={detailPhotoUploading}
                  title="Changer la photo"
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-white shadow hover:bg-orange-700 disabled:opacity-60"
                >
                  {detailPhotoUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </button>
              </div>
              <h3 className="mt-3 text-xl font-extrabold leading-snug">{detail.prenom} {detail.nom}</h3>
              <p className="mt-0.5 text-sm text-white/80">
                {calcAge(detail.dateNaissance) || detail.ageSaisi || '—'} · {PROGRAMMES_ENFANT.find((p) => p.id === (detail.programme || programmeDuGroupe(detail.groupe)))?.label} · {GROUPES_AGE.find((g) => g.id === detail.groupe)?.label || '—'}
              </p>
              <span className="mt-2 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {STATUTS_ENFANT[detail.statut]?.label}
              </span>
            </div>

            {/* Statistiques */}
            {detailStats && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserCheck size={16} className="mx-auto text-green-600" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursPresents}</p>
                  <p className="text-[11px] text-gray-500">Jours présents</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserX size={16} className="mx-auto text-red-500" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursAbsents}</p>
                  <p className="text-[11px] text-gray-500">Absences{detailStats.joursExcuses > 0 ? ` (${detailStats.joursExcuses} exc.)` : ''}</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <CreditCard size={16} className={`mx-auto ${detailStats.impaye ? 'text-red-500' : 'text-green-600'}`} />
                  <p className={`mt-1 text-lg font-extrabold ${detailStats.impaye ? 'text-red-600' : 'text-gray-900'}`}>
                    {detailStats.impaye ? 'Impayé' : 'À jour'}
                  </p>
                  <p className="text-[11px] text-gray-500">Paiement ce mois</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <ShieldAlert size={16} className={`mx-auto ${detailStats.incidentsOuverts > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.incidentsTotal}</p>
                  <p className="text-[11px] text-gray-500">Incident(s){detailStats.incidentsOuverts > 0 ? ` (${detailStats.incidentsOuverts} ouvert)` : ''}</p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Card title="📋 Informations">
                <div className="space-y-1.5">
                  <div><span className="font-semibold text-gray-500">Sexe :</span> {detail.sexe === 'F' ? 'Fille' : 'Garçon'}</div>
                  <div><span className="font-semibold text-gray-500">Inscription :</span> {formatDateShort(detail.dateInscription)}</div>
                  <div><span className="font-semibold text-gray-500">Abonnement :</span> {detail.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}</div>
                  <div><span className="font-semibold text-gray-500">Adresse :</span> {detail.adresse || '—'}</div>
                </div>
              </Card>
              <Card title="👪 Parent / Tuteur">
                <div className="space-y-1.5">
                  <div><span className="font-semibold text-gray-500">Nom :</span> {detail.parentNom || '—'}</div>
                  <div><span className="font-semibold text-gray-500">Contact :</span> {detail.parentContact || '—'}</div>
                  {detail.parentContact2 && <div><span className="font-semibold text-gray-500">Contact 2 :</span> {detail.parentContact2}</div>}
                  <div><span className="font-semibold text-gray-500">Profession :</span> {detail.parentProfession || '—'}</div>
                </div>
              </Card>
            </div>

            {(detail.allergies || detail.infoMedicale) && (
              <Card title="🏥 Santé & allergies" className="border-orange-200">
                <div className="space-y-1">
                  {detail.allergies && <p><span className="font-semibold">Allergies :</span> {detail.allergies}</p>}
                  {detail.infoMedicale && <p><span className="font-semibold">Info médicale :</span> {detail.infoMedicale}</p>}
                </div>
              </Card>
            )}

            {detail.notes && (
              <Card title="📝 Notes">
                <p className="italic text-gray-500">{detail.notes}</p>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
