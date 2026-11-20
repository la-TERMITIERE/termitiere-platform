// RH : circuit et détail d'une demande d'autorisation de salaire.
// Circuit : 1 Demande (RH) → 2 Validation (DF) → 3 Approbation (GE) → 4 Autorisation (PAU). À chaque étape, la personne du rôle concerné
// valide : l'étape se coche et la suivante est avertie (cloche, push, alerte à l'accueil). Un refus, à n'importe quelle étape, demande un motif
// obligatoire, renvoyé à la personne de la RH qui a fait la demande. L'Info (rôle universel) peut traiter n'importe quelle étape.
// Utilisé par la page RH « Autorisation de salaire » et par la page d'accueil du portail.
import { useState } from 'react'
import { Check, X, UserRound, AlignLeft, Send, Clock3, Wallet } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { updateItem } from '../../core/db'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { ROLES } from '../../core/roles'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps, avatarGradient } from '../../utils/color'
import { MOIS_LABELS, STATUTS_BULLETIN, COL } from './store/rhStore'

// Les quatre étapes, dans l'ordre. `role` : qui traite l'étape ; `verbe` : ce que fait cette personne ; `fait` : ce que dit l'étape une fois cochée.
export const ETAPES = [
  { cle: 'demande', num: 1, label: 'Demande', role: null, coul: '#1d4ed8', fond: '#dbeafe' },
  { cle: 'validation', num: 2, label: 'Validation', role: 'df', sigle: 'DF', verbe: 'Valider', fait: 'Validée', coul: '#b45309', fond: '#fef3c7' },
  { cle: 'approbation', num: 3, label: 'Approbation', role: 'ge', sigle: 'GE', verbe: 'Approuver', fait: 'Approuvée', coul: '#7e22ce', fond: '#f3e8ff' },
  { cle: 'autorisation', num: 4, label: 'Autorisation', role: 'pau', sigle: 'PAU', verbe: 'Autoriser le paiement', fait: 'Autorisée', coul: '#15803d', fond: '#dcfce7' }
]
const ETAPES_A_TRAITER = ETAPES.filter((e) => e.role)
// Rôles qui reçoivent des demandes à traiter (le circuit, plus l'Info universelle).
export const ROLES_RECEPTEURS = [...ETAPES_A_TRAITER.map((e) => e.role), 'info', 'super_admin']

export const libelleRole = (r) => ROLES.find((x) => x.value === r)?.label || r
export const STATUTS_AUTORISATION = {
  en_attente: { label: 'En attente', tone: 'warning' },
  autorise: { label: 'Autorisé', tone: 'success' },
  refuse: { label: 'Refusé', tone: 'danger' }
}
export const moisLabel = (m) => { const [a, n] = (m || '').split('-'); return n ? `${MOIS_LABELS[Number(n) - 1]} ${a}` : m }

// Étape en cours : la première étape à traiter qui n'est pas encore cochée (null si tout est validé ou refusé).
export function etapeCourante(d) {
  if ((d.statut || 'en_attente') !== 'en_attente') return null
  return ETAPES_A_TRAITER.find((e) => !d.validations?.[e.cle]) || null
}
// État d'une étape : faite (cochée), cours (à traiter maintenant), refusee, ou attente (pas encore son tour).
export function etatEtape(d, etape) {
  if (etape.cle === 'demande') return 'faite'
  if (d.refus?.etape === etape.cle) return 'refusee'
  if (d.validations?.[etape.cle]) return 'faite'
  return etapeCourante(d)?.cle === etape.cle ? 'cours' : 'attente'
}
// Peut traiter l'étape en cours : le rôle de cette étape, ou l'Info (rôle universel).
export function peutDeciderAutorisation(d, user, role) {
  const e = etapeCourante(d)
  return !!e && (role === e.role || role === 'info' || role === 'super_admin')
}

// Le circuit en miniature, pour la bande de chaque demande : quatre petits cercles reliés, la fonction en dessous.
export function MiniatureCircuit({ d }) {
  const etats = ETAPES.map((e) => etatEtape(d, e))
  const faites = etats.filter((x) => x === 'faite').length
  const courante = etapeCourante(d)
  const resume = d.statut === 'refuse' ? 'Refusée' : d.statut === 'autorise' ? 'Circuit terminé : paiement autorisé' : `${faites} étape(s) sur ${ETAPES.length} : ${courante ? `${courante.label} (${courante.sigle}) à traiter` : ''}`
  return (
    <div className="flex items-start" role="img" aria-label={`Circuit : ${resume}`} title={resume}>
      {ETAPES.map((e, i) => {
        const etat = etats[i]
        const Icone = etat === 'faite' ? Check : etat === 'refusee' ? X : null
        const rond = etat === 'faite'
          ? { background: `linear-gradient(145deg, ${meler(e.coul, 70)}, ${e.coul})`, color: '#fff', border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: `0 4px 8px -3px ${e.coul}, inset 0 1px 1px rgba(255,255,255,0.6)` }
          : etat === 'refusee'
            ? { background: 'linear-gradient(145deg, #f87171, #dc2626)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 8px -3px #dc2626, inset 0 1px 1px rgba(255,255,255,0.6)' }
            : etat === 'cours'
              ? { background: '#fff', color: e.coul, border: `2px solid ${e.coul}`, boxShadow: `0 0 0 3px ${e.fond}` }
              : { background: 'rgba(241,245,249,0.9)', color: '#94a3b8', border: '1.5px dashed #cbd5e1' }
        return (
          <div key={e.cle} className="flex items-start">
            {i > 0 && <span aria-hidden="true" className="mt-[9px] h-[3px] w-3 rounded-full" style={{ background: etats[i - 1] === 'faite' && etat !== 'attente' ? `linear-gradient(90deg, ${ETAPES[i - 1].coul}, ${e.coul})` : '#e2e8f0' }} />}
            <div className="flex w-[22px] flex-col items-center">
              <span className="relative flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black tabular-nums" style={rond}>
                {etat === 'cours' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-25 motion-reduce:hidden" style={{ background: e.coul }} />}
                <span className="relative">{Icone ? <Icone size={11} strokeWidth={3.4} aria-hidden="true" /> : e.num}</span>
              </span>
              <span className="mt-0.5 text-[8.5px] font-extrabold leading-none" style={{ color: etat === 'attente' ? '#94a3b8' : etat === 'refusee' ? '#b91c1c' : e.coul }}>{e.sigle || 'RH'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Le circuit en chapelet : quatre cercles reliés par un fil qui se remplit à mesure que les étapes se cochent. Sous chaque cercle : le nom de
// l'étape, la fonction (DF, GE, PAU) et le nom du responsable (celui qui a validé, sinon le titulaire du poste).
const meler = (c, p) => `color-mix(in srgb, ${c} ${p}%, white)`
export function ChapeletAutorisation({ d, demandeur, users = [] }) {
  const etats = ETAPES.map((e) => etatEtape(d, e))
  const dernierFait = etats.reduce((m, s, i) => (s === 'faite' ? i : m), 0)
  const nomsDe = (e) => {
    if (e.cle === 'demande') return [demandeur || d.creePar || 'La RH']
    const fait = d.validations?.[e.cle]?.par
    if (fait) return [fait]
    if (d.refus?.etape === e.cle && d.refus.par) return [d.refus.par]
    const titulaires = users.filter((u) => u.role === e.role).map((u) => u.nom || u.login)
    return titulaires.length ? titulaires : [`Aucun compte ${e.sigle}`]
  }
  return (
    <div className="relative" role="list" aria-label="Circuit de la demande">
      {/* Le fil, derrière les cercles : gris, puis coloré jusqu'à la dernière étape cochée. */}
      <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[22px] h-1.5 -translate-y-1/2 rounded-full bg-slate-200/90 shadow-[inset_0_1px_2px_rgba(15,23,42,0.18)]" />
      <span aria-hidden="true" className="absolute left-[12.5%] top-[22px] h-1.5 -translate-y-1/2 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.35)] transition-[width] duration-700"
        style={{ width: `${(dernierFait / (ETAPES.length - 1)) * 75}%`, background: `linear-gradient(90deg, ${ETAPES[0].coul}, ${ETAPES[Math.max(dernierFait, 1)].coul})` }} />
      <div className="relative grid grid-cols-4">
        {ETAPES.map((e, i) => {
          const etat = etats[i]
          const Icone = etat === 'faite' ? Check : etat === 'refusee' ? X : null
          const rond = etat === 'faite'
            ? { background: `linear-gradient(145deg, ${meler(e.coul, 72)}, ${e.coul})`, color: '#fff', border: '2px solid rgba(255,255,255,0.85)', boxShadow: `0 8px 16px -6px ${e.coul}, inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -3px 5px rgba(0,0,0,0.2)` }
            : etat === 'refusee'
              ? { background: 'linear-gradient(145deg, #f87171, #dc2626)', color: '#fff', border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 8px 16px -6px #dc2626, inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -3px 5px rgba(0,0,0,0.2)' }
              : etat === 'cours'
                ? { background: '#fff', color: e.coul, border: `3px solid ${e.coul}`, boxShadow: `0 0 0 5px ${e.fond}, 0 8px 16px -8px ${e.coul}` }
                : { background: 'rgba(241,245,249,0.9)', color: '#94a3b8', border: '2px dashed #cbd5e1' }
          const couleurTexte = etat === 'attente' ? '#94a3b8' : etat === 'refusee' ? '#b91c1c' : e.coul
          return (
            <div key={e.cle} role="listitem" className="flex min-w-0 flex-col items-center px-0.5 text-center">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full text-base font-black tabular-nums" style={rond}>
                {etat === 'cours' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" style={{ background: e.coul }} />}
                <span className="relative">{Icone ? <Icone size={20} strokeWidth={3.2} aria-hidden="true" /> : e.num}</span>
              </span>
              <span className="mt-1.5 text-[12px] font-extrabold leading-tight" style={{ color: couleurTexte }}>{e.label}</span>
              <span className="mt-0.5 rounded-full px-2 py-px text-[10px] font-extrabold" style={{ background: e.fond, color: e.coul, opacity: etat === 'attente' ? 0.55 : 1 }}>{e.sigle || 'RH'}</span>
              <span className="mt-1.5 flex w-full flex-col items-center gap-1">
                {nomsDe(e).map((n) => (
                  <span key={n} title={n} className="inline-flex max-w-full items-center gap-1.5 rounded-2xl border py-0.5 pl-0.5 pr-2 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md"
                    style={{ background: 'rgba(255,255,255,0.8)', borderColor: etat === 'attente' ? 'rgba(203,213,225,0.9)' : `${e.coul}55`, opacity: etat === 'attente' ? 0.85 : 1 }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: avatarGradient(n) }} aria-hidden="true">{n.trim().charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 break-words text-left text-[11px] font-semibold leading-tight text-gray-700">{n}</span>
                  </span>
                ))}
              </span>
              {etat === 'cours' && <span className="mt-0.5 text-[10px] font-bold" style={{ color: e.coul }}>À traiter</span>}
              {etat === 'refusee' && <span className="mt-0.5 text-[10px] font-bold text-red-600">Refusée</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const BLEU = '#0284c7'

export default function DetailAutorisationSalaire({ demande, onClose }) {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const { data: bulletins } = useCollection(COL.bulletins)
  const { data: users } = useCollection('users')
  if (!demande) return null
  const d = demande
  // Bulletin du mois de cet employé : une fois le circuit terminé, il passe à « Payé ».
  const bulletin = bulletins.find((b) => b.employeId === d.employeId && b.mois === d.mois)
  const st = STATUTS_AUTORISATION[d.statut || 'en_attente']
  const etape = etapeCourante(d)
  const peut = peutDeciderAutorisation(d, user, role)
  const motifManquant = tente && !motif.trim()
  const resume = `${d.employeNom} : ${formatMoney(d.montant)} pour ${moisLabel(d.mois)}`

  // La RH qui a fait la demande suit le circuit. Sans auteur connu, on n'envoie rien : une notification sans destinataire serait vue par tout le monde.
  const prevenirRh = (champs) => (d.creeParUid ? notify({ module: 'rh', forUsers: [d.creeParUid], excludeUid: user?.uid, link: '/rh/autorisations-salaire', ...champs }).catch(() => {}) : Promise.resolve())

  async function valider() {
    setEnvoi(true)
    try {
      const suivante = ETAPES_A_TRAITER[ETAPES_A_TRAITER.indexOf(etape) + 1]
      const validations = { ...(d.validations || {}), [etape.cle]: { par: user?.nom || '', parUid: user?.uid || '', le: new Date().toISOString() } }
      const champs = { validations }
      if (!suivante) Object.assign(champs, { statut: 'autorise', decidePar: user?.nom || '', decideLe: new Date().toISOString() })
      await updateItem(COL.autorisationsSalaire, d.id, champs)
      // Tout le circuit est validé : le bulletin du mois passe à « Payé ».
      if (!suivante && bulletin && bulletin.statut !== 'paye') await updateItem(COL.bulletins, bulletin.id, { statut: 'paye', payeLe: new Date().toISOString(), payeAutorisation: d.id })
      if (suivante) {
        // L'étape suivante est avertie : cloche, push et alerte sur sa page d'accueil.
        await notify({ type: 'demande', title: '💰 Autorisation de salaire à traiter', body: `${resume}. ${etape.fait} par ${user?.nom || etape.sigle}, à vous de ${suivante.verbe.toLowerCase()}.`,
          module: 'rh', forRoles: [suivante.role], excludeUid: user?.uid, link: '/rh/autorisations-salaire' }).catch(() => {})
        await prevenirRh({ type: 'info', title: `Salaire ${etape.fait.toLowerCase()} (${etape.sigle})`, body: `${resume}. Transmise à l'étape ${suivante.label} (${suivante.sigle}).` })
        toast.success(`${etape.fait} ✓ : transmise à ${suivante.sigle}`)
      } else {
        await prevenirRh({ type: 'approuve', title: 'Salaire autorisé ✅', body: `${resume} : le circuit est terminé, le paiement est autorisé${bulletin ? ' et le bulletin est passé à Payé' : ''}.` })
        toast.success(bulletin ? 'Paiement autorisé : bulletin passé à Payé ✓' : 'Paiement autorisé ✓ (aucun bulletin de ce mois à marquer payé)')
      }
      onClose()
    } finally { setEnvoi(false) }
  }
  async function refuser() {
    setTente(true)
    const texte = motif.trim()
    if (!texte) return
    setEnvoi(true)
    try {
      await updateItem(COL.autorisationsSalaire, d.id, { statut: 'refuse', motifRefus: texte, refus: { etape: etape.cle, par: user?.nom || '', parUid: user?.uid || '', motif: texte, le: new Date().toISOString() }, decidePar: user?.nom || '', decideLe: new Date().toISOString() })
      await prevenirRh({ type: 'refus', title: 'Autorisation de salaire refusée ⛔', body: `${resume}. Refusée à l'étape ${etape.label} (${etape.sigle}) : ${texte}` })
      toast.success(`Refus envoyé à ${d.creePar || 'la RH'}`); onClose()
    } finally { setEnvoi(false) }
  }

  const ligne = (Icone, titre, valeur, ton = 'sky') => (
    <div className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${ton === 'red' ? 'bg-red-50 text-red-600' : ton === 'green' ? 'bg-green-50 text-green-600' : 'bg-sky-50 text-sky-600'}`}><Icone size={15} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titre}</span><span className="block break-words text-sm font-semibold text-gray-800">{valeur}</span></span>
    </div>
  )

  return (
    <Modal open onClose={onClose} title="Autorisation de salaire" {...glassModalProps(BLEU)}
      footer={peut ? (refus ? (<>
        <Button variant="ghost" onClick={() => { setRefus(false); setTente(false) }}>Retour</Button>
        <Button onClick={refuser} loading={envoi} style={{ backgroundColor: '#dc2626' }}><Send size={16} /> Envoyer le refus</Button>
      </>) : (<>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button onClick={() => setRefus(true)} style={{ backgroundColor: '#dc2626' }}><X size={16} /> Refuser</Button>
        <Button onClick={valider} loading={envoi} style={{ backgroundColor: '#16a34a' }}><Check size={16} /> {etape.verbe}</Button>
      </>)) : <Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: avatarGradient(d.employeNom || '?') }} aria-hidden="true">{(d.employeNom || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-gray-800">{d.employeNom}</p>
            <p className="text-xs text-gray-500">Salaire de {moisLabel(d.mois)}</p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <p className="rounded-3xl border border-white/40 py-3 text-center text-2xl font-black tabular-nums text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.7)]" style={{ background: `linear-gradient(135deg, ${BLEU}, #0c4a6e)` }}>{formatMoney(d.montant)}</p>
        <div className="rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 backdrop-blur-md">
          <span className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Circuit de la demande</span>
          <ChapeletAutorisation d={d} users={users} />
        </div>
        {ligne(UserRound, 'Demandé par', `${d.creePar || 'la RH'}${d.creeLe ? ` le ${formatDateShort(d.creeLe.slice(0, 10))}` : ''}`)}
        {ligne(Wallet, 'Bulletin du mois', bulletin ? `${STATUTS_BULLETIN[bulletin.statut]?.label || bulletin.statut}${bulletin.statut !== 'paye' && etape?.cle === 'autorisation' ? ' : passera à Payé à la fin du circuit' : ''}` : 'Aucun bulletin généré pour ce mois')}
        {d.message && ligne(AlignLeft, 'Message de la RH', d.message)}
        {ETAPES_A_TRAITER.filter((e) => d.validations?.[e.cle]).map((e) => ligne(Check, `${e.label} (${e.sigle})`, `${e.fait} par ${d.validations[e.cle].par || e.sigle}${d.validations[e.cle].le ? ` le ${formatDateShort(d.validations[e.cle].le.slice(0, 10))}` : ''}`, 'green'))}
        {d.statut === 'refuse' && ligne(X, `Refusé par ${d.refus?.par || d.decidePar || '—'}${d.refus?.etape ? ` (étape ${ETAPES.find((e) => e.cle === d.refus.etape)?.label})` : ''}`, d.motifRefus || 'Aucun motif', 'red')}
        {peut && refus && (
          <div className="ed-entree">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Motif du refus <span className="text-red-500">*</span></label>
            <textarea rows={3} autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} className="input-base" placeholder="Expliquez pourquoi : la RH recevra ce motif" />
            {motifManquant && <p className="mt-1 text-xs font-medium text-red-600" role="alert">Le motif est obligatoire pour refuser.</p>}
          </div>
        )}
        {peut && !refus && <p className="flex items-center gap-2 text-xs text-gray-500"><Clock3 size={14} aria-hidden="true" /> Étape en cours : {etape.label} ({etape.sigle}). Un refus est renvoyé à {d.creePar || 'la RH'} avec son motif.</p>}
      </div>
    </Modal>
  )
}
