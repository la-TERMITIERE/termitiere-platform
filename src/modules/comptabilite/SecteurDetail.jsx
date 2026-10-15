// Détail d'un secteur sur la période (volet Recettes) : chiffre d'affaires, recettes par source, dépenses par
// catégorie, puis la liste des mouvements. Ouvert en touchant la carte d'un secteur.
import { useMemo } from 'react'
import { Building2, HardHat, TrendingUp, ShoppingBag, BadgeDollarSign, Receipt, Handshake, PenLine, HandCoins } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Compteur from '../../shared/ui/Compteur'
import { getModule } from '../../shared/modules'
import { glassModalProps, icone3D } from '../../utils/color'
import { formatDateShort } from '../../utils/formatters'
import { vocabulaire } from './journalCalculs'

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
const signe = (n) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`
const SOURCES = {
  facture: { label: 'Factures et ventes', icone: Receipt, couleur: '#ea580c' },
  client: { label: 'Versements de clients', icone: Handshake, couleur: '#0284c7' },
  manuel: { label: 'Saisies manuelles', icone: PenLine, couleur: '#7c3aed' }
}

// Icône du domaine : celle de son module (Agro, Logistique…), le bâtiment pour le siège, le casque pour MAXI BAT.
export const iconeDomaine = (secteurId) => (secteurId === 'divers' ? Building2 : secteurId === 'bat' ? HardHat : (getModule(secteurId)?.icon || Building2))

function Tuile({ icone: Icone, couleur, titre, valeur, sous }) {
  return (
    <div className="tuile-verre flex items-center gap-3 !p-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={16} /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{titre}</p>
        <p className="truncate text-sm font-extrabold text-gray-800">{valeur}</p>
        {sous && <p className="truncate text-[10px] text-gray-400">{sous}</p>}
      </div>
    </div>
  )
}

export default function SecteurDetail({ secteur, lignes, periode, onClose }) {
  const x = secteur
  const mes = useMemo(() => (!x ? [] : x.cle === '*' ? lignes : lignes.filter((l) => `${l.secteurId}|${l.site || ''}` === x.cle)), [x, lignes])
  const parSource = useMemo(() => {
    const m = {}
    mes.filter((l) => l.entree > 0).forEach((l) => { m[l.type] = (m[l.type] || 0) + l.entree })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [mes])
  const ventes = mes.filter((l) => l.type === 'facture').length
  const vocab = vocabulaire(!x || x.cle === '*' ? null : x.secteurId)
  const Icone = x ? (x.icone || iconeDomaine(x.secteurId)) : Building2
  const totalRecettes = x?.recettes || 0

  return (
    <Modal open={!!x} onClose={onClose} size="lg" {...glassModalProps(x?.couleur || '#ea580c')}
      title={x ? `Détail : ${x.domaine}` : ''} footer={<>{x?.actionPied}<Button variant="ghost" onClick={onClose}>Fermer</Button></>}>
      {x && (
        <div className="space-y-3">
          <div className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${x.couleur} 60%, #ffffff) 0%, ${x.couleur} 50%, color-mix(in srgb, ${x.couleur} 50%, #000000) 130%)` }}>
            <style>{'@keyframes sd-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }'}</style>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
              <Icone size={28} style={{ animation: 'sd-flotte 2.6s ease-in-out infinite' }} />
            </span>
            <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Chiffre d'affaires {periode}</p>
            <p className="relative text-3xl font-black leading-tight"><Compteur valeur={x.chiffreAffaires} format={fmt} /> <span className="text-base font-bold text-white/80">FCFA</span></p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Tuile icone={BadgeDollarSign} couleur="#ea580c" titre="Chiffre d'affaires" valeur={fmt(x.chiffreAffaires)} />
            <Tuile icone={TrendingUp} couleur="#16a34a" titre="Recettes" valeur={`+${fmt(x.recettes)}`} />
            <Tuile icone={ShoppingBag} couleur="#7c3aed" titre={vocab.pluriel} valeur={fmt(ventes)} />
            <Tuile icone={Receipt} couleur="#0284c7" titre={vocab.moyenne} valeur={ventes ? fmt(x.chiffreAffaires / ventes) : ':'} />
          </div>

          <div className="tuile-verre">
            <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#16a34a')}><HandCoins size={14} /></span>Recettes par source
            </p>
            {parSource.length === 0 && <p className="text-sm text-gray-400">Aucune recette.</p>}
            {parSource.map(([type, total]) => {
              const src = SOURCES[type] || SOURCES.manuel
              const SI = src.icone
              return (
                <div key={type} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-gray-700"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(src.couleur)}><SI size={12} /></span>{type === 'facture' ? vocab.facture : src.label}</span>
                    <span className="font-extrabold text-gray-900">{fmt(total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200/80"><div className="h-full rounded-full" style={{ width: `${totalRecettes ? Math.round((total / totalRecettes) * 100) : 0}%`, background: src.couleur }} /></div>
                </div>
              )
            })}
          </div>

          <div className="tuile-verre">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">Recettes ({mes.length})</p>
            <div className="max-h-[36vh] space-y-1.5 overflow-y-auto pr-1">
              {mes.map((l) => (
                <div key={l.id} className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/65 px-2.5 py-1.5">
                  <span className="whitespace-nowrap text-[11px] font-bold text-gray-500">{formatDateShort(l.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase text-gray-800">{l.designation}</span>
                  <span className="whitespace-nowrap text-sm font-extrabold text-green-700">+{fmt(l.entree)}</span>
                </div>
              ))}
              {mes.length === 0 && <p className="py-4 text-center text-sm text-gray-400">Aucune recette.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
