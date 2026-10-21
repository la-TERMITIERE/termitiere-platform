// Fenêtre « Nouvelle dotation » de la Caisse : on choisit le domaine (SIÈGE ou un secteur), le montant, la date et
// un motif. La dotation s'ajoute au budget du mois dans E-DÉPENSES (cf. depense/dotationActions.js) et la Caisse
// la relit : elle impacte donc E-DÉPENSES et le montant de la caisse en même temps.
import { useEffect, useState } from 'react'
import { HandCoins, Layers, MapPin, Wallet, CalendarDays, MessageSquareText, ArrowRight, Info, Check, X } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import BoutonVerre from '../../shared/ui/BoutonVerre'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { glassModalProps, icone3D } from '../../utils/color'
import { todayStr } from '../../utils/formatters'
import { MOIS_LABELS } from '../depense/data'
import { LOGISTIQUE_SITES } from '../depense/data'
import { creerDotation, budgetDuMois, SECTEURS_AVEC_VALIDATION } from '../depense/dotationActions'
import { DOMAINES } from './journalCalculs'
import { COULEUR_DOTATION } from './iconesCaisse'

const VERT = COULEUR_DOTATION
// La caisse courante s'appelle ici « CAISSE COURANTE » (c'est celle dont on parle pour les dotations).
const nomDomaine = (d) => (d.id === 'divers' ? 'CAISSE COURANTE' : d.label)
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')

function Etiquette({ icone: Icone, couleur = VERT, children }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ ...icone3D(couleur), animation: 'dt-flotte 3.2s ease-in-out infinite' }}><Icone size={13} /></span>
      {children}
    </span>
  )
}

function Choix({ actif, onClick, point, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${actif ? 'text-white shadow-md' : 'border-gray-200 bg-white text-gray-600 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50'}`}
      style={actif ? { background: `linear-gradient(135deg, ${VERT}, ${VERT}cc)`, borderColor: VERT, animation: 'dt-pop 0.28s ease-out' } : undefined}>
      {point && <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ background: point }} />}
      {children}
      {actif && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

// `tousDomaines` : on peut choisir le secteur (E-DÉPENSES, Budget) ; sinon la dotation va à la caisse courante (SIÈGE), comme dans la Caisse.
export default function DotationModal({ open, onClose, budgets, user, tousDomaines = false, titre }) {
  const { data: users } = useCollection('users')
  const [secteurId, setSecteurId] = useState('divers')
  const [site, setSite] = useState('')
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState(todayStr())
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSecteurId('divers'); setSite(''); setMontant(''); setDate(todayStr()); setMotif('')
  }, [open])

  if (!open) return null
  const domaine = DOMAINES.find((d) => d.id === secteurId)
  const valeur = Number(montant) || 0
  const avant = budgetDuMois(budgets, secteurId, site, date)
  const [annee, mois] = date.split('-').map(Number)
  const propose = SECTEURS_AVEC_VALIDATION.includes(secteurId)
  const bloc = 'rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm'

  async function enregistrer() {
    if (saving) return
    setSaving(true)
    try {
      const r = await creerDotation({ secteurId, site: secteurId === 'logistique' ? site : null, montant, date, motif, user, budgets, users })
      toast.success(r.statut === 'proposee' ? `Dotation proposée à ${r.libelle} : en attente de sa confirmation ✓` : 'Dotation enregistrée ✓')
      onClose()
    } catch (e) {
      toast.error(e.message || 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="md" {...glassModalProps(VERT)} title={titre || 'Nouvelle dotation de caisse'}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}><X size={15} /> Annuler</Button><BoutonVerre variante="vert" icone={HandCoins} animation="pieces" onClick={enregistrer} loading={saving} disabled={!(valeur > 0) || !motif.trim()}>Enregistrer la dotation</BoutonVerre></>}>
      <style>{`
        @keyframes dt-entre { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes dt-pop { 0% { transform: scale(0.92); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes dt-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes dt-pieces { 0% { transform: translateY(-5px) rotate(-6deg); } 50% { transform: translateY(3px) rotate(4deg); } 100% { transform: translateY(-5px) rotate(-6deg); } }
        @keyframes dt-montant { 0% { transform: scale(0.97); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      <div className="space-y-3">
        {/* Bandeau : argent qui entre dans la caisse */}
        <div className="relative flex items-center gap-3 overflow-hidden rounded-3xl p-3.5 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]" style={{ background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)', animation: 'dt-entre 0.35s ease-out' }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
            <HandCoins size={26} style={{ animation: 'dt-pieces 2.6s ease-in-out infinite' }} />
          </span>
          <div className="relative min-w-0">
            <p className="text-sm font-extrabold leading-tight">Alimenter la caisse</p>
            <p className="text-xs text-white/85">La dotation s'ajoute au budget du mois dans E-DÉPENSES.</p>
          </div>
        </div>

        <div className={`${bloc} space-y-3`} style={{ animation: 'dt-entre 0.4s ease-out 0.05s both' }}>
          <div>
            <Etiquette icone={Layers}>Domaine <span className="text-red-500">*</span></Etiquette>
            <div className="flex flex-wrap gap-1.5">
              {DOMAINES.filter((d) => tousDomaines || d.id === 'divers').map((d) => <Choix key={d.id} actif={secteurId === d.id} point={d.color} onClick={() => { setSecteurId(d.id); setSite('') }}>{nomDomaine(d)}</Choix>)}
            </div>
          </div>
          {secteurId === 'logistique' && (
            <div style={{ animation: 'dt-entre 0.3s ease-out' }}>
              <Etiquette icone={MapPin} couleur="#E8850F">Site de MAXI LOGISTIQUE <span className="text-red-500">*</span></Etiquette>
              <div className="flex flex-wrap gap-1.5">
                {LOGISTIQUE_SITES.map((st) => <Choix key={st.id} actif={site === st.id} onClick={() => setSite(site === st.id ? '' : st.id)}>{st.label}</Choix>)}
              </div>
            </div>
          )}
        </div>

        <div className={`${bloc} space-y-3`} style={{ animation: 'dt-entre 0.4s ease-out 0.12s both' }}>
          <div>
            <Etiquette icone={Wallet} couleur="#0d9488">Montant de la dotation <span className="text-red-500">*</span></Etiquette>
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-200">
              <input type="number" min="0" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0" aria-label="Montant de la dotation"
                className="min-w-0 flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none placeholder:text-gray-300" />
              <span className="text-sm font-bold text-gray-400">FCFA</span>
            </div>
            {valeur > 0 && <p key={valeur} className="mt-1 text-sm font-extrabold text-green-700" style={{ animation: 'dt-montant 0.25s ease-out' }}>+{fmt(valeur)} FCFA</p>}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Etiquette icone={MessageSquareText} couleur="#475569">Motif <span className="text-red-500">*</span></Etiquette>
              <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex : dotation de la caisse courante, apport du PAU…" aria-label="Motif de la dotation" className="input-base w-full" />
            </div>
            <div>
              <Etiquette icone={CalendarDays} couleur="#7c3aed">Date</Etiquette>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-base" />
            </div>
          </div>
        </div>

        {/* Effet sur E-DÉPENSES, avant d'enregistrer */}
        <div className="rounded-2xl border border-green-200/80 bg-green-50/80 p-3" style={{ animation: 'dt-entre 0.4s ease-out 0.2s both' }}>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-green-800"><Info size={13} /> Impact sur E-DÉPENSES</p>
          <p className="text-sm font-semibold text-gray-700">
            Budget de {domaine ? nomDomaine(domaine) : ''}{secteurId === 'logistique' && site ? ` ${LOGISTIQUE_SITES.find((x) => x.id === site)?.label}` : ''} pour {mois ? `${MOIS_LABELS[mois - 1]} ${annee}` : ':'} :
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-base font-black text-gray-900">
            {fmt(avant)} <ArrowRight size={16} className="text-green-600" /> <span className="text-green-700">{fmt(avant + valeur)}</span> <span className="text-xs font-semibold text-gray-400">FCFA</span>
          </p>
          {propose && <p className="mt-1.5 text-xs text-gray-600">Ce secteur doit confirmer la réception : la dotation n'apparaîtra dans la Caisse qu'après sa confirmation, comme pour un budget alloué.</p>}
        </div>
      </div>
    </Modal>
  )
}
