// MAXI-GYM — modale détail client réutilisable (Dashboard, Pilotage, Clients, Abonnements) :
// fiche complète du client, abonnement en cours avec jours restants, calendrier des arrivées et historique.
// Design « verre » : tuiles en verre dépoli (bento), icônes 3D, animations légères (entrée en cascade, icônes qui
// flottent, barre de durée qui se remplit) et boutons en verre.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pencil, ScanLine, CreditCard, Phone, Wallet, Ticket, CalendarCheck, Clock, X, Save, MapPin, StickyNote, Handshake, MapPinned, History } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { peutEcrireGym, peutAdministrerGym, peutModifierAbonnementGym, peutSupprimerAbonnementGym } from '../../core/roles'
import { supprimerAbonnementGym } from './abonnementActions'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { categorieLabel, categorieTone, sexeInfo, statutAbonnement, peutRenouveler, joursRestantsAbonnement, niveauRestant, QR_CARNET_ACTIF } from './data'
import JoursRestants, { BoutonRenouveler } from './JoursRestants'
import { BoutonGym } from './uiHelpers'
import { siteLabel } from './site/useSite'
import { SexeBoutons } from './SexeUI'
import { glassModalProps, COULEUR_MODULE, avatarGradient, icone3D } from '../../utils/color'
import CalendrierPresences from './CalendrierPresences'
import QrCarnetModal from './QrCarnetModal'

const heureCourte = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const COULEUR = '#A6342A'
const COULEUR2 = '#E8850F'
const COULEUR_NIVEAU = { vert: '#16a34a', orange: '#f97316', rouge: '#dc2626', expire: '#9ca3af' }
const initiales = (nom) => (nom || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

// Tuile de verre : fond dépoli, liseré clair, entrée en cascade (`i` = rang).
function Tuile({ i = 0, className = '', children }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-3 shadow-[0_10px_24px_-16px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl ${className}`}
      style={{ animation: `cd-entree 0.4s ease-out ${i * 0.06}s both` }}>
      {children}
    </div>
  )
}

// Titre d'une tuile : petite icône 3D puis le libellé.
function Titre({ icone: Icone, couleur, children, droite }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={14} /></span>
        {children}
      </p>
      {droite}
    </div>
  )
}

// Petit indicateur chiffré (tuile de verre + icône 3D).
function Chiffre({ i, icone: Icone, couleur, titre, valeur, sous }) {
  return (
    <Tuile i={i} className="!p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={16} /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{titre}</p>
          <p className="truncate text-sm font-extrabold text-gray-800">{valeur}</p>
          {sous && <p className="truncate text-[10px] text-gray-400">{sous}</p>}
        </div>
      </div>
    </Tuile>
  )
}

// `clientNom` (string|null) pilote l'ouverture — null/absent = fermé. `presences`
// optionnel (les appelants qui ne l'ont pas encore chargé passent [] par défaut).
export default function ClientDetailModal({ clientNom, onClose, clients, seances, abonnements, presences = [], onRenouveler, onModifier }) {
  const { role } = useAuth()
  const navigate = useNavigate()
  const lectureSeule = !peutEcrireGym(role)
  const peutSupprimer = peutAdministrerGym(role)
  // Corriger une erreur d'abonnement depuis l'historique : modifier (agents, Info, administration), supprimer (Info, administration : PAU, GE, DF…).
  const peutModifierAbo = peutModifierAbonnementGym(role)
  const peutSupprimerAbo = peutSupprimerAbonnementGym(role)
  const { data: factures } = useCollection('gym_factures')
  const cle = (clientNom || '').trim().toLowerCase()
  const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === cle)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [qrOuvert, setQrOuvert] = useState(false)
  const moisEnCours = new Date().toISOString().slice(0, 7)

  const historique = useMemo(() => {
    if (!cle) return []
    const s = seances.filter((x) => (x.clientNom || '').trim().toLowerCase() === cle).map((x) => ({ ...x, type: 'seance' }))
    const a = abonnements.filter((x) => (x.clientNom || '').trim().toLowerCase() === cle).map((x) => ({ ...x, type: 'abonnement' }))
    return [...s, ...a].sort((x, y) => (x.date < y.date ? 1 : -1))
  }, [seances, abonnements, cle])
  const total = historique.reduce((s, x) => s + (Number(x.montant) || 0), 0)
  // Abonnement en cours (ou le dernier) du client : la fin la plus lointaine.
  const mesAbonnements = useMemo(() => abonnements.filter((x) => (x.clientNom || '').trim().toLowerCase() === cle), [abonnements, cle])
  const abonnementCourant = useMemo(() => [...mesAbonnements].sort((x, y) => ((y.dateFin || '') < (x.dateFin || '') ? -1 : 1))[0] || null, [mesAbonnements])

  const pointages = useMemo(() => {
    if (!cle) return []
    return presences.filter((p) => (p.clientNom || '').trim().toLowerCase() === cle)
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
  }, [presences, cle])
  const pointagesDuMois = useMemo(() => pointages.filter((p) => (p.date || '').startsWith(moisEnCours)), [pointages, moisEnCours])

  // Renouvellement sans réinscription : la page Abonnements ouvre le formulaire pré-rempli.
  function renouveler(a) {
    if (onRenouveler) return onRenouveler(a)
    fermer()
    navigate(`/gym/${a.site || 'lome'}/abonnements`, { state: { renouveler: a.id } })
  }

  // Modifier un abonnement : le formulaire de la page Abonnements s'ouvre pré-rempli (directement si l'appelant sait le faire).
  function modifierAbonnement(a) {
    if (onModifier) return onModifier(a)
    fermer()
    navigate(`/gym/${a.site || 'lome'}/abonnements`, { state: { modifier: a.id } })
  }

  // Supprimer un abonnement : sa facture part avec lui, un motif est demandé (cf. abonnementActions).
  async function supprimerAbonnement(a) {
    await supprimerAbonnementGym(a, factures)
  }

  function fermer() {
    setEdit(null)
    setQrOuvert(false)
    onClose()
  }

  async function enregistrer() {
    if (!client) return
    if (!edit.nom.trim()) return toast.error('Nom requis')
    if (edit.partenaire && !edit.partenaireStructure.trim()) return toast.error('Indiquez la structure du partenaire (ex. CIMTOGO)')
    setSaving(true)
    try {
      await updateItem('gym_clients', client.id, {
        nom: edit.nom.trim(), telephone: edit.telephone.trim(), notes: edit.notes.trim(), sexe: edit.sexe || '',
        partenaire: !!edit.partenaire,
        partenaireStructure: edit.partenaire ? edit.partenaireStructure.trim() : ''
      })
      await audit('gym', 'CLIENT_MODIFIE', `${edit.nom.trim()}${edit.partenaire ? ` : partenaire ${edit.partenaireStructure.trim()}` : ''}`)
      toast.success('Client mis à jour ✓')
      setEdit(null)
    } finally { setSaving(false) }
  }

  async function supprimer() {
    if (!client) return
    if (!confirm(`Supprimer la fiche de ${client.nom} ? (l'historique des séances/abonnements reste conservé)`)) return
    await removeItem('gym_clients', client.id)
    await audit('gym', 'CLIENT_SUPPRIME', client.nom)
    toast.success('Client supprimé')
    fermer()
  }

  const sexe = client ? sexeInfo(client.sexe) : null
  const clientDepuis = client?.createdAt ? formatDateShort(new Date(client.createdAt).toISOString().slice(0, 10)) : null

  return (
    <>
    <Modal open={!!clientNom} onClose={fermer} title={client?.nom || clientNom || 'Client'}
      {...glassModalProps(COULEUR_MODULE.gym)}
      footer={<>
        <BoutonGym variante="secondaire" icone={X} onClick={fermer}>Fermer</BoutonGym>
        {QR_CARNET_ACTIF && client && !edit && <BoutonGym variante="secondaire" icone={ScanLine} onClick={() => setQrOuvert(true)}>QR carnet</BoutonGym>}
        {!lectureSeule && client && !edit && (
          <BoutonGym variante="secondaire" icone={Pencil} onClick={() => setEdit({ nom: client.nom, sexe: client.sexe || '', telephone: client.telephone || '', notes: client.notes || '', partenaire: !!client.partenaire, partenaireStructure: client.partenaireStructure || '' })}>Modifier</BoutonGym>
        )}
        {peutSupprimer && client && !edit && <BoutonGym variante="danger" icone={Trash2} onClick={supprimer}>Supprimer</BoutonGym>}
        {edit && <BoutonGym icone={Save} onClick={enregistrer} loading={saving}>Enregistrer</BoutonGym>}
      </>}>
      <style>{`
        @keyframes cd-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes cd-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes cd-barre { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes cd-reflet { 0% { transform: translateX(-120%) skewX(-12deg); } 100% { transform: translateX(520%) skewX(-12deg); } }
      `}</style>
      {!client ? (
        <p className="py-4 text-center text-sm text-gray-400">Fiche client introuvable.</p>
      ) : edit ? (
        <div className="space-y-3">
          <FormGroup label="Nom" required><Input value={edit.nom} onChange={(e) => setEdit((f) => ({ ...f, nom: e.target.value }))} /></FormGroup>
          <FormGroup label="⚥ Sexe" hint="Sert à suivre la proportion de femmes et d'hommes dans la salle"><SexeBoutons value={edit.sexe} onChange={(v) => setEdit((f) => ({ ...f, sexe: v }))} /></FormGroup>
          <FormGroup label="Téléphone" hint="Optionnel"><Input value={edit.telephone} onChange={(e) => setEdit((f) => ({ ...f, telephone: e.target.value }))} placeholder="ex : 22890000000" /></FormGroup>
          <FormGroup label="Notes" hint="Optionnel"><Input value={edit.notes} onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))} /></FormGroup>

          {/* Client partenaire : ne paie pas à chaque séance — c'est sa structure
              (CIMTOGO…) qui règle le lot en fin de mois. Ses séances sont alors
              enregistrées « portées au compte du partenaire » (cf. Séances.jsx) et
              suivies dans le volet « Clients partenaires ». */}
          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 p-3 backdrop-blur-md">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={!!edit.partenaire}
                onChange={(e) => setEdit((f) => ({ ...f, partenaire: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600" />
              <span className="text-sm">
                <span className="font-semibold text-sky-900">Client partenaire</span>
                <span className="mt-0.5 block text-xs text-sky-700">Ne paie pas sur place : sa structure règle en fin de mois. Ses séances seront « portées au compte du partenaire ».</span>
              </span>
            </label>
            {edit.partenaire && (
              <FormGroup label="Structure" required className="mt-2.5">
                <Input value={edit.partenaireStructure} onChange={(e) => setEdit((f) => ({ ...f, partenaireStructure: e.target.value }))} placeholder="ex : CIMTOGO" />
              </FormGroup>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Héro en verre : avatar en relief qui flotte, nom, téléphone, sexe, salle. */}
          <div className="relative overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(166,52,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
            style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)`, animation: 'cd-entree 0.35s ease-out both' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" style={{ animation: 'cd-reflet 5s ease-in-out 1s infinite' }} />
            <div className="relative flex items-center gap-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 text-lg font-black shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)]"
                style={{ background: avatarGradient(client.nom), animation: 'cd-flotte 3s ease-in-out infinite' }}>
                {initiales(client.nom)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold leading-tight">{client.nom}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/90">
                  <span className="inline-flex items-center gap-1"><Phone size={13} /> {client.telephone || 'Non renseigné'}</span>
                  {sexe && <span className="inline-flex items-center gap-1 font-bold">{sexe.symbole} {sexe.label}</span>}
                  <span className="inline-flex items-center gap-1"><MapPin size={13} /> {siteLabel(client.site || 'lome')}</span>
                </p>
                {clientDepuis && <p className="text-xs text-white/75">Client depuis le {clientDepuis}</p>}
              </div>
            </div>
            {client.partenaire && (
              <p className="relative mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/40 bg-white/20 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                <Handshake size={14} /> Partenaire : {client.partenaireStructure || 'structure non renseignée'}
                <span className="font-normal text-white/80">· séances réglées par la structure en fin de mois</span>
              </p>
            )}
          </div>

          {/* Bento : quatre indicateurs. */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Chiffre i={1} icone={Wallet} couleur="#16a34a" titre="Total dépensé" valeur={formatMoney(total)} />
            <Chiffre i={2} icone={Ticket} couleur="#7c3aed" titre="Passages" valeur={historique.length} sous="séances et abonnements" />
            <Chiffre i={3} icone={CalendarCheck} couleur="#0ea5e9" titre="Arrivées" valeur={pointages.length} sous={pointages[0] ? `dernière : ${formatDateShort(pointages[0].date)}` : 'jamais pointé(e)'} />
            <Chiffre i={4} icone={Clock} couleur="#f59e0b" titre="Ce mois-ci" valeur={`${pointagesDuMois.length} jour${pointagesDuMois.length > 1 ? 's' : ''}`} sous="de présence" />
          </div>

          {client.notes && (
            <Tuile i={5} className="!p-2.5">
              <p className="flex items-start gap-2 text-sm text-gray-700">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D('#64748b')}><StickyNote size={14} /></span>
                <span className="pt-0.5">{client.notes}</span>
              </p>
            </Tuile>
          )}

          {/* Abonnement en cours : jours restants en grand, barre de durée qui se remplit, bouton Renouveler en verre. */}
          {abonnementCourant && (() => {
            const a = abonnementCourant
            const st = statutAbonnement(a.dateDebut, a.dateFin)
            const jours = joursRestantsAbonnement(a.dateFin)
            const niveau = niveauRestant(jours)
            const coul = COULEUR_NIVEAU[niveau?.cle] || '#9ca3af'
            const debut = a.dateDebut || a.date
            const duree = Math.max(1, Math.round((new Date(a.dateFin) - new Date(debut)) / 86400000))
            const ecoule = Math.max(0, Math.min(duree, duree - (jours ?? 0)))
            const pct = Math.round((ecoule / duree) * 100)
            return (
              <Tuile i={6} className="!border-orange-200/80 !bg-orange-50/60">
                <Titre icone={CreditCard} couleur={COULEUR2}
                  droite={<JoursRestants dateFin={a.dateFin} dateDebut={a.dateDebut} grand />}>
                  Abonnement
                </Titre>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={categorieTone(a.categorie)}>{categorieLabel(a.categorie)}</Badge>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {mesAbonnements.length > 1 && <Badge tone="purple">{mesAbonnements.length - 1} renouvellement{mesAbonnements.length > 2 ? 's' : ''}</Badge>}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/80 shadow-inner">
                  <div className="h-full origin-left rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${coul}, ${coul}aa)`, animation: 'cd-barre 0.9s ease-out' }} />
                </div>
                <p className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-xs text-gray-600">
                  <span>Du {formatDateShort(debut)} au {a.dateFin ? formatDateShort(a.dateFin) : '—'}</span>
                  <span className="font-bold text-gray-800">{formatMoney(a.montant)}</span>
                </p>
                {!lectureSeule && peutRenouveler(a.dateFin) && <div className="mt-2.5"><BoutonRenouveler onClick={() => renouveler(a)} /></div>}
              </Tuile>
            )
          })()}

          {/* Calendrier du mois — exactement la même vue que le carnet public du
              client (cf. CalendrierPresences.jsx), pour que la réceptionniste voie
              d'un coup d'œil les jours cochés sans quitter l'application. Heure
              d'arrivée affichée directement sur chaque jour coché. */}
          <Tuile i={7}>
            <Titre icone={CalendarCheck} couleur="#0ea5e9">Présences du mois</Titre>
            <CalendrierPresences mois={moisEnCours}
              joursPresents={pointagesDuMois.map((p) => p.date)}
              details={Object.fromEntries(pointagesDuMois.filter((p) => p.createdAt).map((p) => [p.date, heureCourte(p.createdAt)]))} />
          </Tuile>

          {pointages.length > 0 && (
            <Tuile i={8}>
              <Titre icone={MapPinned} couleur="#16a34a">Détail des heures ({pointages.length})</Titre>
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {pointages.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/80 bg-white/65 px-3 py-1.5 text-sm transition-all hover:-translate-y-0.5 hover:bg-white/90">
                    <span className="text-gray-700">{formatDateShort(p.date)}</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">{p.createdAt ? heureCourte(p.createdAt) : '—'}</span>
                  </div>
                ))}
              </div>
            </Tuile>
          )}

          <Tuile i={9}>
            <Titre icone={History} couleur="#7c3aed">Historique ({historique.length})</Titre>
            {historique.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">Aucun historique pour l'instant.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {historique.map((h) => {
                  const abo = h.type === 'abonnement'
                  return (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-2.5 py-2 text-sm transition-all hover:-translate-y-0.5 hover:bg-white/90">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={icone3D(abo ? '#7c3aed' : '#0ea5e9')}>
                          {abo ? <CreditCard size={13} /> : <Ticket size={13} />}
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <Badge tone={categorieTone(h.categorie)}>{categorieLabel(h.categorie)}</Badge>
                          <span className="text-xs text-gray-500">{abo ? 'Abonnement' : 'Séance'} · {formatDateShort(h.date)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <strong>{formatMoney(h.montant)}</strong>
                        {abo && peutModifierAbo && (
                          <button type="button" onClick={() => modifierAbonnement(h)} title="Modifier cet abonnement (erreur de saisie)" aria-label="Modifier cet abonnement"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-all hover:-translate-y-0.5 hover:bg-white active:scale-95"><Pencil size={14} /></button>
                        )}
                        {abo && peutSupprimerAbo && (
                          <button type="button" onClick={() => supprimerAbonnement(h)} title="Supprimer cet abonnement et sa facture" aria-label="Supprimer cet abonnement"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition-all hover:-translate-y-0.5 hover:bg-red-50 active:scale-95"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Tuile>
        </div>
      )}
    </Modal>
    <QrCarnetModal client={qrOuvert ? client : null} onClose={() => setQrOuvert(false)} />
    </>
  )
}
