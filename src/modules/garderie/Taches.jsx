import { useMemo, useState } from 'react'
import { Plus, ListChecks, CheckCircle2, Circle, FilePen, Trash2, Lock, ChevronDown, ChevronRight } from 'lucide-react'
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
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'

// Rôles habilités à programmer / modifier / supprimer des tâches (la direction + la gérante garderie).
const ROLES_CREATION = [...FULL_ACCESS_ROLES, 'gerant', 'gerante_garderie']

// Une tâche est désormais assignée NOMINATIVEMENT à une tata (assigneUid /
// assigneNom). Les tâches créées avant ce changement portaient un simple groupe
// de rôles (`assigneRole`) — on continue de savoir les afficher et les filtrer
// pour ne pas les rendre invisibles à leurs destinataires.
const ASSIGNATIONS_HERITEES = {
  tous:             'Tatas + Gérante garderie',
  tata:             'Tatas uniquement',
  gerante_garderie: 'Gérante garderie'
}
const libelleAssignation = (t) =>
  t.assigneNom || ASSIGNATIONS_HERITEES[t.assigneRole] || '—'

const empty = () => ({
  titre: '', description: '',
  assigneUid: '', assigneNom: '', dateEcheance: '',
  fait: false, faitPar: '', faitLe: ''
})

function TacheRow({ t, canGerer, toggleFait, setModal, setToDelete }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${t.fait ? 'bg-green-50/40' : 'hover:bg-orange-50'}`}>
      <button onClick={() => toggleFait(t)} className="mt-0.5 shrink-0" title={t.fait ? 'Remettre à faire' : 'Marquer comme effectuée'}>
        {t.fait
          ? <CheckCircle2 size={22} className="text-green-500" />
          : <Circle size={22} className="text-gray-300 hover:text-orange-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${t.fait ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.titre}</p>
        {t.description && <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">👤 {libelleAssignation(t)}</Badge>
          {t.dateEcheance && <span className="text-gray-400">Échéance : {formatDateShort(t.dateEcheance)}</span>}
          {t.fait && t.faitPar && (
            <span className="text-green-600 font-semibold">✓ Effectuée par {t.faitPar}{t.faitLe ? ` le ${formatDateShort(new Date(t.faitLe).toISOString().slice(0,10))}` : ''}</span>
          )}
        </div>
      </div>
      {canGerer ? (
        <div className="flex shrink-0 gap-1">
          <button onClick={() => setModal({ data: { ...empty(), ...t }, isNew: false, id: t.id })}
            className="rounded p-1.5 text-orange-600 hover:bg-orange-100"><FilePen size={15} /></button>
          <button onClick={() => setToDelete(t)}
            className="rounded p-1.5 text-red-500 hover:bg-red-100"><Trash2 size={15} /></button>
        </div>
      ) : (
        <span className="shrink-0 text-gray-300" title="Lecture seule"><Lock size={14} /></span>
      )}
    </div>
  )
}

function OngletTaches() {
  const { user, role } = useAuth()
  const { data: taches } = useCollection('garderie_taches')
  const { data: users } = useCollection('users')

  const canGerer = ROLES_CREATION.includes(role)

  // Seules les TATAS peuvent recevoir une tâche : la liste d'assignation est donc
  // construite depuis les comptes réels de rôle `tata` (comptes désactivés exclus,
  // pour ne pas assigner une tâche à quelqu'un qui ne peut plus se connecter).
  const tatas = useMemo(
    () => users
      .filter((u) => u.role === 'tata' && u.actif !== false)
      .map((u) => ({ uid: u.uid || u.id, nom: u.nom || u.login }))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
    [users]
  )

  const [modal, setModal]           = useState(null)
  const [toDelete, setToDelete]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [filtreAssigne, setFiltreAssigne] = useState('')
  const [showFaites, setShowFaites] = useState(false)

  // Une tata ne voit que SES tâches : celles qui lui sont nominativement
  // assignées, plus les anciennes tâches de groupe (assigneRole) qui la visaient.
  const tachesVisibles = useMemo(() => {
    if (role !== 'tata') return taches
    return taches.filter((t) => (t.assigneUid
      ? t.assigneUid === user.uid
      : t.assigneRole === 'tous' || t.assigneRole === 'tata'))
  }, [taches, role, user.uid])

  const tachesFiltrees = useMemo(() => {
    if (!filtreAssigne) return tachesVisibles
    return tachesVisibles.filter((t) => t.assigneUid === filtreAssigne)
  }, [tachesVisibles, filtreAssigne])

  // Une tâche cochée quitte immédiatement la liste "à faire" pour rejoindre l'historique.
  const listeAFaire = useMemo(
    () => tachesFiltrees.filter((t) => !t.fait)
      .sort((a, b) => (a.dateEcheance || '9999') > (b.dateEcheance || '9999') ? 1 : -1),
    [tachesFiltrees]
  )
  const listeFaites = useMemo(
    () => tachesFiltrees.filter((t) => t.fait).sort((a, b) => (b.faitLe || 0) - (a.faitLe || 0)),
    [tachesFiltrees]
  )

  const restantes = useMemo(() => tachesVisibles.filter((t) => !t.fait).length, [tachesVisibles])

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.titre.trim()) return toast.error('Titre de la tâche requis')
    if (!d.assigneUid) return toast.error('Choisissez la tata à qui assigner la tâche')
    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_taches', id, { ...d, id, createdBy: user.nom, createdAt: Date.now() })
        audit('garderie', 'TACHE_CREATE', d.titre, { assigne: d.assigneNom })
        notify({
          type: 'info',
          title: '📋 Nouvelle tâche à faire',
          body: d.titre,
          module: 'garderie',
          // Notification adressée à la seule tata concernée (et non plus à tout un rôle).
          forUsers: [d.assigneUid],
          excludeUid: user.uid,
          link: '/garderie/taches'
        })
        toast.success('Tâche programmée ✓')
      } else {
        await setItem('garderie_taches', modal.id, { ...d, id: modal.id })
        audit('garderie', 'TACHE_EDIT', d.titre)
        toast.success('Tâche mise à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    const target = toDelete
    setDeleting(true)
    setToDelete(null)
    try {
      await removeItem('garderie_taches', target.id)
      audit('garderie', 'TACHE_DELETE', target.titre)
      toast.success('Tâche supprimée ✓')
    } finally {
      setDeleting(false)
    }
  }

  // Coche / décoche une tâche — autorisé pour tout le monde ayant accès au module
  // (c'est la seule action permise aux profils en lecture seule : tata, gérante garderie).
  async function toggleFait(t) {
    const fait = !t.fait
    await setItem('garderie_taches', t.id, {
      ...t,
      fait,
      faitPar: fait ? (user.nom || '') : '',
      faitLe: fait ? Date.now() : ''
    })
    audit('garderie', 'TACHE_TOGGLE', t.titre, { fait })
    if (fait) {
      notify({
        type: 'info',
        title: `✅ Tâche effectuée — ${t.titre}`,
        body: `Cochée par ${user.nom}`,
        module: 'garderie',
        forRoles: [...FULL_ACCESS_ROLES,'gerant'],
        excludeUid: user.uid,
        link: '/garderie/taches'
      })
      toast.success('Tâche marquée comme effectuée ✓')
    } else {
      toast.success('Tâche remise à faire')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">📋 Tâches — Checklist de la direction</p>
        <p>
          {canGerer
            ? 'Programmez des tâches pour les tatas et/ou la gérante de la garderie. Ils pourront cocher chaque tâche une fois effectuée.'
            : 'Cochez une tâche une fois qu\'elle est effectuée. Seule la direction peut créer, modifier ou supprimer une tâche.'}
        </p>
      </div>

      {restantes > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-bold text-amber-700 flex items-center gap-2">
            <ListChecks size={18} /> {restantes} tâche(s) à faire
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {canGerer && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Assignées à</label>
            <Select value={filtreAssigne} onChange={(e) => setFiltreAssigne(e.target.value)}>
              <option value="">Toutes les tatas</option>
              {tatas.map((t) => <option key={t.uid} value={t.uid}>{t.nom}</option>)}
            </Select>
          </div>
        )}
        {canGerer && (
          <div className="ml-auto">
            <Button onClick={() => setModal({ data: empty(), isNew: true })}>
              <Plus size={16} /> Programmer une tâche
            </Button>
          </div>
        )}
      </div>

      <Card className="p-0 divide-y divide-gray-100">
        {listeAFaire.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">✅ Aucune tâche à faire — tout est à jour !</p>
        )}
        {listeAFaire.map((t) => (
          <TacheRow key={t.id} t={t} canGerer={canGerer} toggleFait={toggleFait} setModal={setModal} setToDelete={setToDelete} />
        ))}
      </Card>

      {/* Historique des tâches effectuées — repliable, séparé de la liste active */}
      <div>
        <button onClick={() => setShowFaites((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700">
          {showFaites ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          ✓ Tâches effectuées ({listeFaites.length})
        </button>
        {showFaites && (
          <Card className="mt-2 p-0 divide-y divide-gray-100">
            {listeFaites.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">Aucune tâche effectuée pour le moment.</p>
            )}
            {listeFaites.map((t) => (
              <TacheRow key={t.id} t={t} canGerer={canGerer} toggleFait={toggleFait} setModal={setModal} setToDelete={setToDelete} />
            ))}
          </Card>
        )}
      </div>

      {/* Modal création / édition — direction uniquement. Même habillage
          glassmorphism teinté GARDERIE que les autres fenêtres du module. */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        title={modal?.isNew ? '📋 Programmer une tâche' : 'Modifier la tâche'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button>
          <Button style={{ backgroundColor: COULEUR_MODULE.garderie }} onClick={handleSave} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Titre de la tâche" required>
              <Input value={modal.data.titre} onChange={(e) => set('titre', e.target.value)} placeholder="ex: Désinfecter les jouets de la petite section" />
            </FormGroup>
            <FormGroup label="Description">
              <textarea className="w-full rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': COULEUR_MODULE.garderie + '66' }}
                rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                placeholder="Détails, consignes particulières…" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Assignée à" required
                hint={tatas.length ? 'Seules les tatas peuvent recevoir une tâche' : undefined}>
                <Select value={modal.data.assigneUid}
                  onChange={(e) => {
                    const t = tatas.find((x) => x.uid === e.target.value)
                    setModal((m) => ({ ...m, data: { ...m.data, assigneUid: e.target.value, assigneNom: t?.nom || '' } }))
                  }}>
                  <option value="">— Choisir une tata —</option>
                  {tatas.map((t) => <option key={t.uid} value={t.uid}>{t.nom}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Échéance (optionnel)">
                <Input type="date" value={modal.data.dateEcheance} onChange={(e) => set('dateEcheance', e.target.value)} min={todayStr()} />
              </FormGroup>
            </div>
            {/* Sans compte de rôle « tata », l'assignation est impossible : on le dit
                explicitement plutôt que de laisser une liste vide inexpliquée. */}
            {!tatas.length && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Aucune tata enregistrée. Créez d'abord un compte avec le rôle « Tata »
                (Accueil → Gestion des utilisateurs) pour pouvoir lui assigner une tâche.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette tâche ?"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Voulez-vous vraiment supprimer la tâche « {toDelete.titre} » ?</p>}
      </Modal>
    </div>
  )
}

// ─── Onglet Statistiques ──────────────────────────────────────────────────────
// Vue d'ensemble de l'activité d'assignation : qui distribue le plus de tâches,
// et comment chaque tata s'en acquitte. Volontairement ouvert à TOUT LE MONDE,
// tatas comprises — c'est un tableau collectif, pas un outil de contrôle réservé
// à la direction : chacune se situe par rapport à l'ensemble.
function OngletStatistiques() {
  const { data: taches } = useCollection('garderie_taches')

  const global = useMemo(() => {
    const total = taches.length
    const faites = taches.filter((t) => t.fait).length
    return { total, faites, restantes: total - faites, taux: total ? Math.round((faites / total) * 100) : 0 }
  }, [taches])

  // Classement des ASSIGNEURS : qui programme le plus de tâches pour les autres.
  // On exclut les tâches qu'une personne s'est assignées à elle-même, sinon le
  // classement récompenserait quelqu'un qui ne distribue rien mais s'auto-assigne.
  const assigneurs = useMemo(() => {
    const map = new Map()
    taches.forEach((t) => {
      const nom = t.createdBy || 'Auteur inconnu'
      if (t.assigneNom && t.assigneNom === nom) return // auto-assignation : hors classement
      const e = map.get(nom) || { nom, total: 0, faites: 0 }
      e.total += 1
      if (t.fait) e.faites += 1
      map.set(nom, e)
    })
    return [...map.values()].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom))
  }, [taches])

  // Charge de travail par destinataire (les tatas), avec taux d'exécution.
  const destinataires = useMemo(() => {
    const map = new Map()
    taches.forEach((t) => {
      const nom = libelleAssignation(t)
      const e = map.get(nom) || { nom, total: 0, faites: 0 }
      e.total += 1
      if (t.fait) e.faites += 1
      map.set(nom, e)
    })
    return [...map.values()]
      .map((e) => ({ ...e, restantes: e.total - e.faites, taux: e.total ? Math.round((e.faites / e.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom))
  }, [taches])

  const maxAssigne = assigneurs[0]?.total || 0
  const COULEUR = COULEUR_MODULE.garderie

  if (!taches.length) {
    return (
      <Card className="py-12 text-center text-sm text-gray-400">
        Aucune tâche enregistrée — les statistiques apparaîtront dès la première tâche programmée.
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Tâches au total"  value={global.total}                icon={ListChecks}   accent={COULEUR} />
        <StatCard title="Effectuées"       value={global.faites}               icon={CheckCircle2} accent="#16a34a" />
        <StatCard title="En attente"       value={global.restantes}            icon={Circle}       accent="#d97706" />
        <StatCard title="Taux de réalisation" value={`${global.taux}%`} sub={`${global.faites}/${global.total}`}
          icon={TrendingUp} accent={global.taux >= 70 ? '#16a34a' : global.taux >= 40 ? '#d97706' : '#dc2626'} />
      </div>

      {/* Qui assigne le plus de tâches aux autres */}
      <Card title={<span className="flex items-center gap-2"><Award size={17} style={{ color: COULEUR }} /> Qui assigne le plus de tâches</span>}>
        {assigneurs.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune tâche assignée à quelqu'un d'autre pour l'instant.</p>
        ) : (
          <div className="space-y-2.5">
            {assigneurs.map((a, i) => (
              <div key={a.nom} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                  i === 0 ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                  style={i === 0 ? { background: COULEUR } : undefined}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800">{a.nom}</p>
                    <span className="shrink-0 text-xs text-gray-500">
                      <b className="text-gray-800">{a.total}</b> tâche{a.total > 1 ? 's' : ''}
                      <span className="ml-1 text-green-600">· {a.faites} faite{a.faites > 1 ? 's' : ''}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-2 rounded-full transition-all"
                      style={{ width: `${maxAssigne ? (a.total / maxAssigne) * 100 : 0}%`, background: i === 0 ? COULEUR : COULEUR + '66' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Charge et exécution par tata */}
      <Card title={<span className="flex items-center gap-2"><Users size={17} style={{ color: COULEUR }} /> Charge de travail par tata</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Tata</th>
                <th className="px-3 py-2 text-center font-semibold">Reçues</th>
                <th className="px-3 py-2 text-center font-semibold">Effectuées</th>
                <th className="px-3 py-2 text-center font-semibold">En attente</th>
                <th className="px-3 py-2 text-left font-semibold">Taux d'exécution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {destinataires.map((d) => (
                <tr key={d.nom}>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{d.nom}</td>
                  <td className="px-3 py-2.5 text-center font-medium text-gray-700">{d.total}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-green-600">{d.faites}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-amber-600">{d.restantes}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-2 rounded-full transition-all ${
                          d.taux >= 70 ? 'bg-green-500' : d.taux >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${d.taux}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-bold text-gray-600">{d.taux}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
// Les tâches routinières (checklist quotidienne par catégorie) ont désormais
// leur propre volet dédié — cf. TachesRoutinieres.jsx (/garderie/routine).

export default function Taches() {
  const [onglet, setOnglet] = useState('taches')
  const COULEUR = COULEUR_MODULE.garderie

  return (
    <div className="space-y-4">
      {/* Les deux onglets sont accessibles à TOUS les rôles du module, tatas
          comprises : chacune consulte ses tâches et se situe dans les stats. */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'taches', label: '📋 Tâches' },
          { id: 'stats',  label: '📊 Statistiques' }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              onglet === o.id ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            style={onglet === o.id ? { color: COULEUR } : undefined}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'taches' ? <OngletTaches /> : <OngletStatistiques />}
    </div>
  )
}
