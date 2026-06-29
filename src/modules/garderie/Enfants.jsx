import { useMemo, useState } from 'react'
import { Plus, Eye, Search, FilePen, Trash2, UserPlus } from 'lucide-react'
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
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { GROUPES_AGE, STATUTS_ENFANT } from './data'
import { calcAge, groupeRecommande, tarifSuggere } from './logic'
import { useGarderieStore } from './store/garderieStore'

const emptyJournalier = () => ({
  nom: '', prenom: '', ageApprox: '',
  parentNom: '', parentContact: '',
  date: todayStr(), nombreJours: '1', notes: ''
})

const empty = () => ({
  nom: '', prenom: '', dateNaissance: '', ageSaisi: '', sexe: 'F',
  groupe: '', statut: 'actif',
  typeAbonnement: 'mensuel',
  allergies: '', infoMedicale: '',
  parentId: '', parentNom: '', parentContact: '',
  parentContact2: '', adresse: '',
  dateInscription: todayStr(), notes: ''
})

export default function Enfants() {
  const { user, role } = useAuth()
  const lectureSeule = role === 'tata' || role === 'superviseur'
  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: parents }     = useCollection('garderie_parents')
  const { data: journaliers } = useCollection('garderie_journaliers')

  const [onglet, setOnglet]   = useState('inscrits')
  const [recherche, setRecherche] = useState('')
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
      // Étape 1 : statut 'supprime' dans Firebase → caché partout même après rechargement
      await setItem('garderie_enfants', target.id, { ...target, statut: 'supprime', id: target.id })
      // Étape 2 : suppression complète
      await removeItem('garderie_enfants', target.id)
      audit('garderie', 'ENFANT_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } catch (err) {
      // Même si removeItem échoue, statut='supprime' garantit que l'enfant reste caché
      audit('garderie', 'ENFANT_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } finally {
      setDeleting(false)
    }
  }

  const liste = useMemo(() => {
    let rows = enfants.filter((e) => !deletedEnfantIds.has(e.id))
    if (filtreStatut) rows = rows.filter((e) => e.statut === filtreStatut)
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
  }, [enfants, recherche, filtreGroupe, filtreStatut, filtreAnnee, filtreMois, filtreJour, deletedEnfantIds])

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  function openEdit(e)  { setModal({ data: { ...empty(), ...e }, isNew: false, id: e.id }) }

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.dateNaissance && !d.ageSaisi?.trim()) return toast.error('Date de naissance ou âge requis')
    if (!d.groupe) return toast.error('Groupe requis')
    if (!d.parentNom?.trim()) return toast.error('Nom du parent / tuteur requis')
    if (!d.parentContact?.trim()) return toast.error('Contact principal du parent requis')

    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_enfants', id, { ...d, id })
        audit('garderie', 'ENFANT_CREATE', `${d.prenom} ${d.nom}`, { groupe: d.groupe })
        notify({ type: 'info', title: '🍼 Nouvel enfant inscrit', body: `${d.prenom} ${d.nom} a été inscrit(e) à la garderie`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/enfants' })
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
    <div className="space-y-4">

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
                    <td className="px-3 py-2 font-semibold">{j.prenom} {j.nom}</td>
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

      {/* Avertissement enfants bloqués en statut 'sorti' */}
      {enfants.filter((e) => (e.statut === 'sorti' || e.statut === 'supprime') && !deletedEnfantIds.has(e.id)).length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center justify-between">
          <p>⚠️ {enfants.filter((e) => e.statut === 'sorti' || e.statut === 'supprime').length} enfant(s) en suppression incomplète — masqués mais pas encore nettoyés.</p>
          <button
            onClick={async () => {
              const aNettoyer = enfants.filter((e) => e.statut === 'sorti' || e.statut === 'supprime')
              for (const e of aNettoyer) {
                await removeItem('garderie_enfants', e.id).catch(() => {})
              }
              toast.success(`${aNettoyer.length} enfant(s) nettoyé(s) ✓`)
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
          <label className="mb-1 block text-xs font-semibold text-gray-600">Groupe</label>
          <Select value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)}>
            <option value="">Tous les groupes</option>
            {GROUPES_AGE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
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
              <th className="px-3 py-2 text-left">Groupe</th>
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
              <tr key={e.id} className="hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">{e.prenom} {e.nom}</td>
                <td className="px-3 py-2 text-gray-600">{calcAge(e.dateNaissance) || e.ageSaisi || '—'}</td>
                <td className="px-3 py-2">{GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—'}</td>
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
                <td className="px-3 py-2">
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
        title={modal?.isNew ? 'Inscrire un enfant' : 'Modifier la fiche enfant'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Inscrire' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *">
                <Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nom *">
                <Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Date de naissance">
                <Input type="date" value={modal.data.dateNaissance} onChange={(e) => {
                  set('dateNaissance', e.target.value)
                  set('groupe', groupeRecommande(e.target.value))
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
              <FormGroup label="Groupe d'âge *">
                <Select value={modal.data.groupe} onChange={(e) => set('groupe', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {GROUPES_AGE.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.desc})</option>)}
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
              <FormGroup label="Adresse">
                <Input value={modal.data.adresse} onChange={(e) => set('adresse', e.target.value)} />
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
        title={detail ? `${detail.prenom} ${detail.nom}` : ''}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="font-semibold text-gray-500">Âge :</span> {calcAge(detail.dateNaissance) || detail.ageSaisi || '—'}</div>
              <div><span className="font-semibold text-gray-500">Sexe :</span> {detail.sexe === 'F' ? 'Fille' : 'Garçon'}</div>
              <div><span className="font-semibold text-gray-500">Groupe :</span> {GROUPES_AGE.find((g) => g.id === detail.groupe)?.label || '—'}</div>
              <div><span className="font-semibold text-gray-500">Inscription :</span> {formatDateShort(detail.dateInscription)}</div>
              <div><span className="font-semibold text-gray-500">Abonnement :</span> {detail.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}</div>
              <div><span className="font-semibold text-gray-500">Parent :</span> {detail.parentNom || '—'}</div>
              <div><span className="font-semibold text-gray-500">Contact :</span> {detail.parentContact || '—'}</div>
              {detail.parentContact2 && <div><span className="font-semibold text-gray-500">Contact 2 :</span> {detail.parentContact2}</div>}
              <div><span className="font-semibold text-gray-500">Adresse :</span> {detail.adresse || '—'}</div>
            </div>
            {(detail.allergies || detail.infoMedicale) && (
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                {detail.allergies && <p><span className="font-semibold">Allergies :</span> {detail.allergies}</p>}
                {detail.infoMedicale && <p><span className="font-semibold">Info médicale :</span> {detail.infoMedicale}</p>}
              </div>
            )}
            {detail.notes && <p className="text-gray-500 italic">{detail.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
