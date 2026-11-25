// Étude d'une demande d'accès (RH, et Info qui peut aussi décider sans être dans le circuit) : la fiche de la personne en tuiles de verre, puis
// « Valider » (le compte est créé : rôle Agent, E-TACHES, message de bienvenue) ou « Refuser » avec une justification obligatoire.
// Utilisée par le bandeau « À traiter » de l'accueil et par la page RH, Demandes d'accès.
import { useState } from 'react'
import { Check, X, Loader2, User, AtSign, Phone, Briefcase, StickyNote, CalendarClock, KeyRound } from 'lucide-react'
import Modal from '../shared/ui/Modal'
import Button from '../shared/ui/Button'
import { glassModalProps, icone3D } from '../utils/color'
import { toast } from '../core/notifications'
import { deciderDemandeAcces } from '../core/acces'

const ROUGE = '#BC3C31'
const quand = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

function Tuile({ icone: Icone, label, valeur, couleur = ROUGE, large = false }) {
  if (!valeur) return null
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-white/80 bg-white/65 px-3 py-2.5 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md ${large ? 'sm:col-span-2' : ''}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={15} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block break-words text-sm font-semibold text-gray-800">{valeur}</span>
      </span>
    </div>
  )
}

export default function EtudeDemandeAcces({ demande: d, onClose, onDecide }) {
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')
  const [occupe, setOccupe] = useState('')
  if (!d) return null

  async function decider(decision) {
    if (decision === 'refuser' && motif.trim().length < 3) return toast.error('Justifiez le refus : le motif est obligatoire.')
    setOccupe(decision)
    const res = await deciderDemandeAcces(d.id, decision, decision === 'refuser' ? motif.trim() : '')
    setOccupe('')
    if (!res?.ok) return toast.error(res?.error || "L'action a échoué : réessayez.")
    toast.success(decision === 'approuver' ? `Accès validé : le compte « ${d.login} » est créé ✓` : 'Demande refusée')
    onDecide?.(decision)
    onClose()
  }

  const prenom = d.prenom || ''
  const nom = d.nomFamille || (prenom ? '' : d.nom)
  return (
    <Modal open onClose={occupe ? () => {} : onClose} size="lg" title="Étudier la demande d'accès" {...glassModalProps(ROUGE)}
      footer={refus ? (<>
        <Button variant="ghost" onClick={() => setRefus(false)} disabled={!!occupe}>Retour</Button>
        <Button onClick={() => decider('refuser')} disabled={!!occupe || motif.trim().length < 3} style={{ backgroundColor: '#dc2626' }}>
          {occupe === 'refuser' ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />} Confirmer le refus
        </Button>
      </>) : (<>
        <Button variant="ghost" onClick={onClose} disabled={!!occupe}>Fermer</Button>
        <Button variant="outline" onClick={() => setRefus(true)} disabled={!!occupe} className="!border-red-300 !text-red-700"><X size={16} /> Refuser</Button>
        <Button onClick={() => decider('approuver')} disabled={!!occupe} style={{ backgroundColor: '#16a34a' }}>
          {occupe === 'approuver' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Valider l'accès
        </Button>
      </>)}>
      <div className="space-y-3">
        <div className="relative flex items-center gap-3.5 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(188,60,49,0.65),inset_0_1px_0_rgba(255,255,255,0.45)]"
          style={{ background: `linear-gradient(135deg, #d4574b 0%, ${ROUGE} 55%, #6b1a10 100%)` }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 text-2xl font-black backdrop-blur-md">{(prenom || d.nom || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="relative min-w-0">
            <p className="truncate text-lg font-extrabold leading-tight">{d.nom}</p>
            <p className="text-sm text-white/85">Demande un compte : rôle Agent, accès à E-TACHES</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Tuile icone={User} label="Nom" valeur={nom} />
          <Tuile icone={User} label="Prénom" valeur={prenom} />
          <Tuile icone={AtSign} label="Identifiant souhaité" valeur={d.login} couleur="#7c3aed" />
          <Tuile icone={Phone} label="Téléphone" valeur={d.telephone} couleur="#0284c7" />
          <Tuile icone={Briefcase} label="Poste" valeur={d.poste} couleur="#d97706" />
          <Tuile icone={CalendarClock} label="Demandée le" valeur={quand(d.creeLe)} couleur="#64748b" />
          <Tuile icone={StickyNote} label="Note" valeur={d.note} couleur="#0d9488" large />
        </div>

        {refus ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-3 backdrop-blur-md">
            <label htmlFor="ea-motif" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-red-700">Justification du refus <span aria-hidden="true">*</span></label>
            <textarea id="ea-motif" rows={3} autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300}
              className="input-base !rounded-2xl !border-red-200 !bg-white/90 resize-none" placeholder="Pourquoi cette demande est-elle refusée ?" />
            <p className="mt-1 text-[11px] text-red-600">Obligatoire. La RH en est informée.</p>
          </div>
        ) : (
          <p className="flex items-start gap-1.5 px-1 text-[11px] text-gray-500"><KeyRound size={12} className="mt-0.5 shrink-0 text-[#BC3C31]" aria-hidden="true" />En validant, le compte est créé avec le mot de passe choisi par la personne : elle pourra se connecter tout de suite et un message de bienvenue l'attend.</p>
        )}
      </div>
    </Modal>
  )
}
