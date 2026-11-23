// RH : détail d'un ordre de mission, avec son circuit (Demande → Approbation → Mission → Remboursement) et les décisions possibles.
// Utilisé par la page Missions & frais et par la page d'accueil du portail (alerte de la GE).
import { useState } from 'react'
import { Check, X, MapPin, CalendarDays, Clock, Banknote, Pencil, Trash2, Send, Wallet, Ban } from 'lucide-react'
import DetailFiche from './DetailFiche'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps, avatarGradient } from '../../utils/color'
import { STATUTS_MISSION } from './store/rhStore'
import { ETAPES_MISSION, etatsMission, dureeMission, resumeMission, peutApprouverMission, approuverMission, refuserMission } from './missionsCircuit'
import { peutDecaisser, aDecaisser, decaisserDepuisCaisse, nePasDecaisser, montantDecaissement } from '../depense/decaissementsLogique'

const meler = (c, p) => `color-mix(in srgb, ${c} ${p}%, white)`
const jourCourt = (iso) => (iso ? formatDateShort(String(iso).slice(0, 10)) : '')

// Noms sous chaque étape : celui qui a agi, sinon la fonction attendue.
function nomsMission(m) {
  return [m.creePar || 'La RH', m.approuvePar || m.refusePar || 'GE']
}

// Pastille de décaissement, posée devant la mission ou l'avance : décaissée de la Caisse courante, non décaissée, ou encore à décaisser.
export function PastilleDecaissement({ doc, type = 'mission', petite = false }) {
  const etat = doc.decaissement === 'fait' ? 'fait' : doc.decaissement === 'non' ? 'non' : (doc.statut === 'approuvee' && montantDecaissement(type, doc) > 0 ? 'attente' : null)
  if (!etat) return null
  const style = { fait: { c: '#15803d', f: '#dcfce7', t: 'Décaissée', I: Wallet }, non: { c: '#64748b', f: '#e2e8f0', t: 'Non décaissée', I: Ban }, attente: { c: '#b45309', f: '#fef3c7', t: 'À décaisser', I: Wallet } }[etat]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md ${petite ? 'px-2 py-px text-[10px]' : 'px-2.5 py-0.5 text-[11px]'}`}
      style={{ background: style.f, color: style.c, borderColor: `${style.c}44` }}
      title={etat === 'fait' ? `Décaissée de la Caisse courante${doc.decaissePar ? ` par ${doc.decaissePar}` : ''}` : etat === 'non' ? 'La finance a décidé de ne pas décaisser' : 'En attente de la décision de la finance (E-DÉPENSES)'}>
      <style.I size={petite ? 10 : 11} aria-hidden="true" />{style.t}
    </span>
  )
}

// Le circuit en chapelet : quatre cercles reliés par un fil qui se remplit à mesure que les étapes se cochent.
export function ChapeletMission({ mission, etapes = ETAPES_MISSION, etats: etatsProp, noms: nomsProp }) {
  const etats = etatsProp || etatsMission(mission)
  const dernierFait = etats.reduce((m, s, i) => (s === 'faite' ? i : m), 0)
  const noms = nomsProp || nomsMission(mission)
  return (
    <div className="relative" role="list" aria-label="Circuit">
      <span aria-hidden="true" className="absolute top-[22px] h-1.5 -translate-y-1/2 rounded-full bg-slate-200/90 shadow-[inset_0_1px_2px_rgba(15,23,42,0.18)]" style={{ left: `${50 / etapes.length}%`, right: `${50 / etapes.length}%` }} />
      <span aria-hidden="true" className="absolute top-[22px] h-1.5 -translate-y-1/2 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.35)] transition-[width] duration-700"
        style={{ left: `${50 / etapes.length}%`, width: `${(dernierFait / (etapes.length - 1)) * (100 - 100 / etapes.length)}%`, background: `linear-gradient(90deg, ${etapes[0].coul}, ${etapes[Math.max(dernierFait, 1)].coul})` }} />
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${etapes.length}, minmax(0, 1fr))` }}>
        {etapes.map((e, i) => {
          const etat = etats[i]
          const Icone = etat === 'faite' ? Check : etat === 'refusee' ? X : null
          const rond = etat === 'faite'
            ? { background: `linear-gradient(145deg, ${meler(e.coul, 72)}, ${e.coul})`, color: '#fff', border: '2px solid rgba(255,255,255,0.85)', boxShadow: `0 8px 16px -6px ${e.coul}, inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -3px 5px rgba(0,0,0,0.2)` }
            : etat === 'refusee'
              ? { background: 'linear-gradient(145deg, #f87171, #dc2626)', color: '#fff', border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 8px 16px -6px #dc2626, inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -3px 5px rgba(0,0,0,0.2)' }
              : etat === 'cours'
                ? { background: '#fff', color: e.coul, border: `3px solid ${e.coul}`, boxShadow: `0 0 0 5px ${e.fond}, 0 8px 16px -8px ${e.coul}` }
                : { background: 'rgba(241,245,249,0.9)', color: '#94a3b8', border: '2px dashed #cbd5e1' }
          const texte = etat === 'attente' ? '#94a3b8' : etat === 'refusee' ? '#b91c1c' : e.coul
          const nom = noms[i]
          return (
            <div key={e.cle} role="listitem" className="flex min-w-0 flex-col items-center px-0.5 text-center">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full text-base font-black tabular-nums" style={rond}>
                {etat === 'cours' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" style={{ background: e.coul }} />}
                <span className="relative">{Icone ? <Icone size={20} strokeWidth={3.2} aria-hidden="true" /> : i + 1}</span>
              </span>
              <span className="mt-1.5 text-[12px] font-extrabold leading-tight" style={{ color: texte }}>{e.label}</span>
              <span className="mt-0.5 rounded-full px-2 py-px text-[10px] font-extrabold" style={{ background: e.fond, color: e.coul, opacity: etat === 'attente' ? 0.55 : 1 }}>{e.sigle}</span>
              <span title={nom} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-2xl border py-0.5 pl-0.5 pr-2 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md"
                style={{ background: 'rgba(255,255,255,0.8)', borderColor: etat === 'attente' ? 'rgba(203,213,225,0.9)' : `${e.coul}55`, opacity: etat === 'attente' ? 0.85 : 1 }}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: avatarGradient(nom) }} aria-hidden="true">{nom.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 break-words text-left text-[11px] font-semibold leading-tight text-gray-700">{nom}</span>
              </span>
              {etat === 'cours' && <span className="mt-0.5 text-[10px] font-bold" style={{ color: e.coul }}>En cours</span>}
              {etat === 'refusee' && <span className="mt-0.5 text-[10px] font-bold text-red-600">Refusée</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Le circuit en miniature, pour la bande d'une mission dans la liste.
export function MiniatureMission({ mission, etapes = ETAPES_MISSION, etats: etatsProp, sigles = ['RH', 'GE'] }) {
  const etats = etatsProp || etatsMission(mission)
  const faites = etats.filter((x) => x === 'faite').length
  const resume = mission.statut === 'refusee' ? 'Refusée' : faites === etapes.length ? 'Approuvée par la GE' : `${faites} étape(s) sur ${etapes.length}`
  return (
    <div className="flex items-start" role="img" aria-label={`Circuit : ${resume}`} title={resume}>
      {etapes.map((e, i) => {
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
            {i > 0 && <span aria-hidden="true" className="mt-[9px] h-[3px] w-3 rounded-full" style={{ background: etats[i - 1] === 'faite' && etat !== 'attente' ? `linear-gradient(90deg, ${etapes[i - 1].coul}, ${e.coul})` : '#e2e8f0' }} />}
            <div className="flex w-[26px] flex-col items-center">
              <span className="relative flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black tabular-nums" style={rond}>
                {etat === 'cours' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-25 motion-reduce:hidden" style={{ background: e.coul }} />}
                <span className="relative">{Icone ? <Icone size={11} strokeWidth={3.4} aria-hidden="true" /> : i + 1}</span>
              </span>
              <span className="mt-0.5 text-[8px] font-extrabold leading-none" style={{ color: etat === 'attente' ? '#94a3b8' : etat === 'refusee' ? '#b91c1c' : e.coul }}>{sigles[i]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Informations de la mission, et traces du circuit (qui, quand).
export function tuilesMission(m) {
  const d = dureeMission(m)
  return [
    { icone: MapPin, label: 'Destination', valeur: m.destination },
    { icone: CalendarDays, label: 'Période', valeur: m.dateDebut ? `${formatDateShort(m.dateDebut)}${m.dateFin ? ` → ${formatDateShort(m.dateFin)}` : ''}` : '' },
    { icone: Clock, label: 'Durée', valeur: d ? `${d} jour${d > 1 ? 's' : ''}` : '' },
    { icone: Banknote, label: 'Frais remboursables', valeur: Number(m.montantFrais) > 0 ? formatMoney(m.montantFrais) : '', couleur: '#16a34a' },
    { icone: Banknote, label: 'Détail des frais (barème)', large: true, couleur: '#0284c7',
      valeur: (m.fraisLignes || []).length ? [...m.fraisLignes.map((l) => `${l.typeNom} : ${formatMoney(l.remboursable)}${l.depassement > 0 ? ` (réel ${formatMoney(l.montant)}, plafond ${formatMoney(l.plafond)})` : ''}`), ...(Number(m.fraisAutres) > 0 ? [`Autres frais : ${formatMoney(m.fraisAutres)}`] : [])].join(' · ') : '' },
    { icone: Send, label: 'Demande', valeur: m.creePar ? `Saisie par ${m.creePar}${m.creeLe ? ` le ${jourCourt(m.creeLe)}` : ''}` : '', large: true },
    { icone: Check, label: 'Approbation', valeur: m.approuvePar ? `Approuvée par ${m.approuvePar} le ${jourCourt(m.approuveLe)}` : '', large: true, couleur: '#7e22ce' },
    { icone: X, label: `Refusée par ${m.refusePar || '?'}${m.refuseLe ? ` le ${jourCourt(m.refuseLe)}` : ''}`, valeur: m.statut === 'refusee' ? (m.motifRefus || 'Aucun motif') : '', large: true, couleur: '#dc2626' },
    { icone: Wallet, label: 'Décaissement', large: true, couleur: m.decaissement === 'fait' ? '#15803d' : m.decaissement === 'non' ? '#64748b' : '#b45309',
      valeur: m.decaissement === 'fait' ? `Décaissée de la Caisse courante par ${m.decaissePar || 'la finance'} le ${jourCourt(m.decaisseLe)}` : m.decaissement === 'non' ? `Non décaissée : décision de ${m.decaissePar || 'la finance'} le ${jourCourt(m.decaisseLe)}` : (m.statut === 'approuvee' && Number(m.montantFrais) > 0 ? 'À décaisser par la finance (alerte dans E-DÉPENSES)' : '') }
  ]
}

// Refus : le motif est obligatoire, renvoyé à la RH et à l'employé.
export function RefusMissionModal({ mission, employes, onClose, onFait, refuser = refuserMission, resume = resumeMission, titre = "Refuser l'ordre de mission" }) {
  const user = useAuth((s) => s.user)
  const [motif, setMotif] = useState('')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  if (!mission) return null
  async function envoyer() {
    setTente(true)
    if (!motif.trim()) return
    setEnvoi(true)
    try { await refuser(mission, motif.trim(), user, employes); toast.success(`Refus envoyé à ${mission.creePar || 'la RH'}`); onFait?.(); onClose() } finally { setEnvoi(false) }
  }
  return (
    <Modal open onClose={onClose} size="sm" title={titre} {...glassModalProps('#dc2626')}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={envoyer} loading={envoi} style={{ backgroundColor: '#dc2626' }}><Send size={16} /> Envoyer le refus</Button></>}>
      <div className="space-y-2.5">
        <p className="rounded-2xl border border-white/80 bg-white/60 px-3 py-2 text-sm font-semibold text-gray-700 backdrop-blur-md">{resume(mission)}</p>
        <div className="fg-tuile">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Motif du refus <span className="text-red-500">*</span></label>
          <textarea autoFocus rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} className="input-base" placeholder="Expliquez pourquoi : la RH et l'employé recevront ce motif" />
          {tente && !motif.trim() && <p className="mt-1 text-xs font-medium text-red-600" role="alert">Le motif est obligatoire pour refuser.</p>}
        </div>
      </div>
    </Modal>
  )
}

// Détail d'une mission : circuit, informations et décisions. `onModifier` / `onSupprimer` : fournis par la page Missions (pas par l'accueil).
export default function DetailMission({ mission, employes = [], onClose, onModifier, onSupprimer }) {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const [refus, setRefus] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  if (!mission) return null
  const m = mission
  const st = STATUTS_MISSION[m.statut || 'demandee']
  const complet = isFullAccessRole(role)

  const faire = async (fn, message) => { setEnvoi(true); try { await fn(); toast.success(message); onClose() } finally { setEnvoi(false) } }
  const actions = []
  if (onSupprimer && complet && ['demandee', 'refusee'].includes(m.statut || 'demandee')) actions.push({ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => onSupprimer(m) })
  if (onModifier && complet && ['demandee', 'refusee'].includes(m.statut || 'demandee')) actions.push({ label: m.statut === 'refusee' ? 'Corriger et renvoyer' : 'Modifier', icone: Pencil, tone: 'neutre', onClick: () => onModifier(m) })
  if (peutApprouverMission(m, role)) {
    actions.push({ label: 'Refuser', icone: X, tone: 'danger', onClick: () => setRefus(true) })
    actions.push({ label: 'Approuver', icone: Check, tone: 'succes', onClick: () => faire(() => approuverMission(m, user, employes), 'Mission approuvée ✓') })
  }
  // Mission approuvée : la finance la décaisse de la Caisse courante, ou non (même choix que l'alerte d'E-DÉPENSES).
  if (peutDecaisser(role) && aDecaisser('mission', m)) {
    actions.push({ label: 'Ne pas décaisser', icone: Ban, tone: 'neutre', onClick: () => faire(() => nePasDecaisser('mission', m, user), 'Non décaissé : la RH est prévenue') })
    actions.push({ label: 'Décaisser de la caisse', icone: Wallet, tone: 'succes', onClick: () => faire(() => decaisserDepuisCaisse('mission', m, user, employes), 'Décaissé de la Caisse courante ✓') })
  }

  return (
    <>
      <DetailFiche onClose={onClose} actions={envoi ? [] : actions}
        fiche={{
          titre: m.employeNom || 'Employé', sous: m.objet, couleur: '#0284c7', badge: { label: st?.label, tone: st?.tone },
          enfants: (
            <div className="rounded-2xl border border-white/80 bg-white/70 px-3 py-3 backdrop-blur-md">
              <span className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Circuit de la mission</span>
              <ChapeletMission mission={m} />
            </div>
          ),
          tuiles: tuilesMission(m)
        }} />
      {refus && <RefusMissionModal mission={m} employes={employes} onClose={() => setRefus(false)} onFait={onClose} />}
    </>
  )
}

