// COMPTABILITÉ — Mouvements bancaires : page d'entrée. On y voit les comptes bancaires de l'entreprise (SUNU, NSIA…) sous
// forme de grandes cartes de verre, avec le numéro de compte et un petit récapitulatif (solde, dépôts, retraits,
// nombre de mouvements). Toucher une carte ouvre les mouvements de CE compte ; « Tous les comptes » les ouvre ensemble.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, ChevronRight, ArrowDownCircle, ArrowUpCircle, ListOrdered, Copy, Check, Layers, AlertTriangle } from 'lucide-react'
import Compteur from '../../shared/ui/Compteur'
import BandeauCompta from './BandeauCompta'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { COL } from './data'
import { teinteBanque } from '../../shared/banque/comptes'
import { teinterHex, shadeHex, icone3D } from '../../utils/color'
import { formatMoney, formatDateShort } from '../../utils/formatters'

const montant = (m) => Number(m.montant) || 0
const somme = (rows, type) => rows.filter((m) => m.type === type).reduce((t, m) => t + montant(m), 0)
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')

// Récapitulatif de chaque compte : tous les mouvements de tous les secteurs rattachés à la banque.
function useRecapBanques() {
  const { data: banques } = useCollection(COL.banques)
  const { data: agro } = useCollection('agro_banque')
  const { data: logistique } = useCollection('logistique_banque')
  const { data: gym } = useCollection('gym_banque')
  const { data: garderie } = useCollection('garderie_banque')
  const { data: bat } = useCollection('bat_banque')
  const { data: evenementiel } = useCollection('evenementiel_banque')
  const { data: transport } = useCollection('transport_banque')
  const { data: autres } = useCollection('autres_banque')
  return useMemo(() => {
    const tous = [...agro, ...logistique, ...gym, ...garderie, ...bat, ...evenementiel, ...transport, ...autres].filter((m) => !m.ouverture)
    const comptes = banques.map((b) => {
      const rows = tous.filter((m) => m.banqueId === b.id)
      const initial = Number(b.soldeOuverture) || 0
      const depots = somme(rows, 'depot')
      const retraits = somme(rows, 'retrait')
      const dernier = rows.reduce((d, m) => (m.date && m.date > d ? m.date : d), '')
      return { ...b, rows, initial, depots, retraits, solde: initial + depots - retraits, nb: rows.length, dernier }
    })
    const connus = new Set(banques.map((b) => b.id))
    const sansCompte = tous.filter((m) => !connus.has(m.banqueId))
    return { comptes: comptes.sort((a, b) => (a.nom || '').localeCompare(b.nom || '')), sansCompte, total: comptes.reduce((t, c) => t + c.solde, 0) }
  }, [banques, agro, logistique, gym, garderie, bat, evenementiel, transport, autres])
}

function Mini({ icone: Icone, titre, valeur }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 px-2.5 py-2 backdrop-blur-sm">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/65"><Icone size={11} /> {titre}</p>
      <p className="mt-0.5 truncate text-sm font-extrabold">{valeur}</p>
    </div>
  )
}

function CarteCompte({ c, i }) {
  const [copie, setCopie] = useState(false)
  const couleur = teinteBanque(c.nom)
  const fonce = shadeHex(couleur, -35)
  const numero = (c.numero || '').trim()

  async function copier(e) {
    e.preventDefault(); e.stopPropagation()
    try { await navigator.clipboard.writeText(numero); setCopie(true); setTimeout(() => setCopie(false), 1500); toast.success('Numéro de compte copié ✓') } catch { toast.error('Copie impossible') }
  }

  return (
    <Link to={`/comptabilite/mouvements-bancaires/${c.id}`}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 text-white backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1"
      style={{ background: `linear-gradient(150deg, ${teinterHex(couleur, 0.94)} 0%, ${teinterHex(fonce, 0.96)} 100%)`, boxShadow: `0 14px 28px -14px ${couleur}88, inset 0 1px 0 0 rgba(255,255,255,0.25)`, animation: `cb-entree 0.45s ease-out ${i * 0.1}s both` }}>
      <Landmark size={128} strokeWidth={1} className="pointer-events-none absolute -right-6 -bottom-8 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:text-white/15" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_8px_16px_-8px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          <Landmark size={22} style={{ animation: 'cb-flotte 3s ease-in-out infinite' }} />
        </span>
        <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">Compte bancaire</span>
      </div>

      <div className="relative">
        <p className="text-2xl font-black leading-tight">{c.nom}</p>
        {numero ? (
          <button type="button" onClick={copier} title="Copier le numéro de compte"
            className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-2.5 py-1 font-mono text-sm font-bold tracking-wide backdrop-blur-sm transition-colors hover:bg-white/25">
            <span className="truncate">N° {numero}</span>
            {copie ? <Check size={14} className="shrink-0" /> : <Copy size={13} className="shrink-0 opacity-80" />}
          </button>
        ) : (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl border border-amber-200/60 bg-amber-300/25 px-2.5 py-1 text-xs font-bold text-amber-100">
            <AlertTriangle size={13} /> N° de compte à renseigner (Paramètres)
          </span>
        )}
      </div>

      {/* Récapitulatif */}
      <div className="relative space-y-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">Solde actuel</p>
          <p className="text-3xl font-black leading-none"><Compteur valeur={c.solde} format={fmt} /> <span className="text-sm font-bold text-white/70">FCFA</span></p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Mini icone={ArrowDownCircle} titre="Dépôts" valeur={`+${fmt(c.depots)}`} />
          <Mini icone={ArrowUpCircle} titre="Retraits" valeur={`-${fmt(c.retraits)}`} />
          <Mini icone={ListOrdered} titre="Mouvements" valeur={c.nb} />
        </div>
        <p className="text-xs text-white/65">{c.dernier ? `Dernier mouvement : ${formatDateShort(c.dernier)}` : 'Aucun mouvement pour le moment'}</p>
      </div>

      <div className="relative flex items-center gap-1.5 text-sm font-bold text-white/90 transition-transform duration-300 group-hover:translate-x-1">
        Entrer <ChevronRight size={17} />
      </div>
    </Link>
  )
}

export default function ComptesBancaires() {
  const { comptes, sansCompte, total } = useRecapBanques()
  return (
    <div className="space-y-5">
      <style>{`
        @keyframes cb-entree { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes cb-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      `}</style>
      <BandeauCompta icone={Landmark} titre="Mouvements bancaires"
        sous={`Choisissez un compte bancaire pour voir ses mouvements. Solde de tous les comptes : ${formatMoney(total)}.`} />

      {comptes.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucun compte bancaire enregistré : ajoutez-en dans Comptabilité, Paramètres.
        </div>
      )}

      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {comptes.map((c, i) => <CarteCompte key={c.id} c={c} i={i} />)}
      </div>

      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
        <Link to="/comptabilite/mouvements-bancaires/tous"
          className="group inline-flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2 text-sm font-extrabold text-gray-700 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={icone3D('#ea580c')}><Layers size={14} /></span>
          Tous les comptes ensemble
          <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
        {sansCompte.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle size={13} /> {sansCompte.length} mouvement(s) sans compte précisé : visibles dans « Tous les comptes ».
          </span>
        )}
      </div>
    </div>
  )
}
