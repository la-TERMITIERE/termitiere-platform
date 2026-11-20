// RH : détail d'une avance ou d'un prêt, avec son circuit (Demande → Approbation → Versement → Remboursement par la paie), l'échéancier des retenues
// et les décisions possibles. Utilisé par la page Avances et prêts et par la page d'accueil du portail (alerte de la GE).
import { useState } from 'react'
import { Check, X, Pencil, Trash2, Banknote, Send, CalendarDays, Wallet, Layers, AlignLeft, ReceiptText, Ban } from 'lucide-react'
import DetailFiche from './DetailFiche'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps } from '../../utils/color'
import { STATUTS_AVANCE, MOIS_LABELS } from './store/rhStore'
import { ChapeletMission, RefusMissionModal } from './DetailMission'
import { ETAPES_AVANCE, etatsAvance, nomsAvance, libelleType, resumeAvance, mensualiteAvance, resteDu, totalRembourse, peutApprouverAvance, approuverAvance, refuserAvance, enregistrerRemboursement } from './avancesCircuit'
import { peutDecaisser, aDecaisser, decaisserDepuisCaisse, nePasDecaisser } from '../depense/decaissementsLogique'

const jourCourt = (iso) => (iso ? formatDateShort(String(iso).slice(0, 10)) : '')
export const moisEnClair = (m) => { const [a, n] = String(m || '').split('-'); return n ? `${MOIS_LABELS[Number(n) - 1]} ${a}` : '' }

// Barre d'avancement du remboursement.
export function BarreRemboursement({ avance }) {
  const total = Number(avance.montant) || 0
  const pct = total > 0 ? Math.min(100, (totalRembourse(avance) / total) * 100) : 0
  return (
    <div title={`${Math.round(pct)} % remboursé`}>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200/80"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-600 transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-[11px] font-semibold text-gray-500">Remboursé : {formatMoney(totalRembourse(avance))} sur {formatMoney(total)} · reste {formatMoney(resteDu(avance))}</p>
    </div>
  )
}

export function tuilesAvance(a) {
  const n = Number(a.nbMensualites) || 1
  return [
    { icone: Layers, label: 'Type', valeur: libelleType(a.type) },
    { icone: Banknote, label: 'Montant', valeur: formatMoney(a.montant), couleur: '#16a34a' },
    { icone: CalendarDays, label: 'Remboursement', valeur: `${n} mensualité${n > 1 ? 's' : ''} de ${formatMoney(mensualiteAvance(a))}` },
    { icone: CalendarDays, label: 'Première retenue', valeur: moisEnClair(a.moisDebut) },
    { icone: Wallet, label: 'Reste dû', valeur: ['versee', 'remboursee'].includes(a.statut) ? formatMoney(resteDu(a)) : '', couleur: '#f59e0b' },
    { icone: ReceiptText, label: 'Retenues effectuées', large: true, couleur: '#15803d',
      valeur: (a.remboursements || []).map((r) => `${r.mois === 'manuel' ? `Remboursement du ${jourCourt(r.le)}` : moisEnClair(r.mois)} : ${formatMoney(r.montant)}`).join(' · ') },
    { icone: AlignLeft, label: 'Motif', valeur: a.motif, large: true },
    { icone: Send, label: 'Demande', valeur: a.creePar ? `Saisie par ${a.creePar}${a.creeLe ? ` le ${jourCourt(a.creeLe)}` : ''}` : '', large: true },
    { icone: Check, label: 'Approbation', valeur: a.approuvePar ? `Approuvé(e) par ${a.approuvePar} le ${jourCourt(a.approuveLe)}` : '', large: true, couleur: '#7e22ce' },
    { icone: X, label: `Refusé(e) par ${a.refusePar || '?'}${a.refuseLe ? ` le ${jourCourt(a.refuseLe)}` : ''}`, valeur: a.statut === 'refusee' ? (a.motifRefus || 'Aucun motif') : '', large: true, couleur: '#dc2626' },
    { icone: Wallet, label: 'Décaissement', large: true, couleur: a.decaissement === 'fait' ? '#15803d' : a.decaissement === 'non' ? '#64748b' : '#b45309',
      valeur: a.decaissement === 'fait' ? `Décaissé(e) de la Caisse courante par ${a.decaissePar || 'la finance'} le ${jourCourt(a.decaisseLe)}` : a.decaissement === 'non' ? `Non décaissé(e) : décision de ${a.decaissePar || 'la finance'} le ${jourCourt(a.decaisseLe)}` : (a.statut === 'approuvee' ? 'À décaisser par la finance (alerte dans E-DÉPENSES)' : '') }
  ]
}

// Remboursement saisi à la main : montant, plafonné au reste dû.
function RemboursementModal({ avance, onClose }) {
  const user = useAuth((s) => s.user)
  const [montant, setMontant] = useState(String(resteDu(avance)))
  const [envoi, setEnvoi] = useState(false)
  const valide = Number(montant) > 0
  async function valider() {
    if (!valide) return
    setEnvoi(true)
    try { await enregistrerRemboursement(avance, montant, user); toast.success('Remboursement enregistré ✓'); onClose() } finally { setEnvoi(false) }
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Enregistrer un remboursement" {...glassModalProps('#16a34a')}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={valider} loading={envoi} disabled={!valide} style={{ backgroundColor: '#16a34a' }}><Check size={16} /> Enregistrer</Button></>}>
      <div className="space-y-2.5">
        <p className="rounded-2xl border border-white/80 bg-white/60 px-3 py-2 text-sm font-semibold text-gray-700 backdrop-blur-md">{resumeAvance(avance)} : reste dû {formatMoney(resteDu(avance))}.</p>
        <div className="fg-tuile">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Montant rendu (XOF)</label>
          <input type="number" min="1" max={resteDu(avance)} autoFocus value={montant} onChange={(e) => setMontant(e.target.value)} className="input-base" placeholder="Ex. 25000" />
        </div>
      </div>
    </Modal>
  )
}

export default function DetailAvance({ avance, employes = [], onClose, onModifier, onSupprimer }) {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: users } = useCollection('users')
  const [refus, setRefus] = useState(false)
  const [rembourse, setRembourse] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  if (!avance) return null
  const a = avance
  const st = STATUTS_AVANCE[a.statut || 'demandee']
  const complet = isFullAccessRole(role)
  const ge = users.filter((u) => u.role === 'ge').map((u) => u.nom || u.login).join(', ')

  const faire = async (fn, message) => { setEnvoi(true); try { await fn(); toast.success(message); onClose() } finally { setEnvoi(false) } }
  const actions = []
  if (onSupprimer && complet && ['demandee', 'refusee'].includes(a.statut || 'demandee')) actions.push({ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => onSupprimer(a) })
  if (onModifier && complet && ['demandee', 'refusee'].includes(a.statut || 'demandee')) actions.push({ label: a.statut === 'refusee' ? 'Corriger et renvoyer' : 'Modifier', icone: Pencil, tone: 'neutre', onClick: () => onModifier(a) })
  if (peutApprouverAvance(a, role)) {
    actions.push({ label: 'Refuser', icone: X, tone: 'danger', onClick: () => setRefus(true) })
    actions.push({ label: 'Approuver', icone: Check, tone: 'succes', onClick: () => faire(() => approuverAvance(a, user, employes), 'Demande approuvée ✓') })
  }
  if (peutDecaisser(role) && aDecaisser('avance', a)) {
    actions.push({ label: 'Ne pas décaisser', icone: Ban, tone: 'neutre', onClick: () => faire(() => nePasDecaisser('avance', a, user), 'Non décaissé : la RH est prévenue') })
    actions.push({ label: 'Décaisser de la caisse', icone: Wallet, tone: 'succes', onClick: () => faire(() => decaisserDepuisCaisse('avance', a, user, employes), 'Décaissé de la Caisse courante ✓ : retenue sur la paie') })
  }
  if (a.statut === 'versee' && complet) actions.push({ label: 'Enregistrer un remboursement', icone: Banknote, tone: 'primaire', onClick: () => setRembourse(true) })

  return (
    <>
      <DetailFiche onClose={onClose} actions={envoi ? [] : actions}
        fiche={{
          titre: a.employeNom || 'Employé', sous: `${libelleType(a.type)} de ${formatMoney(a.montant)}`, couleur: '#0d9488', badge: { label: st?.label, tone: st?.tone },
          enfants: (
            <div className="space-y-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-3 backdrop-blur-md">
              <div>
                <span className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Circuit de la demande</span>
                <ChapeletMission mission={a} etapes={ETAPES_AVANCE} etats={etatsAvance(a)} noms={nomsAvance(a, ge)} />
              </div>
              {['versee', 'remboursee'].includes(a.statut) && <BarreRemboursement avance={a} />}
            </div>
          ),
          tuiles: tuilesAvance(a)
        }} />
      {refus && <RefusMissionModal mission={a} employes={employes} onClose={() => setRefus(false)} onFait={onClose} refuser={refuserAvance} resume={resumeAvance} titre="Refuser la demande" />}
      {rembourse && <RemboursementModal avance={a} onClose={() => { setRembourse(false); onClose() }} />}
    </>
  )
}
