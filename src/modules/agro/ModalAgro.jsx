// MAXI-AGRO : fenêtre en verre vert. Présentation avec icône 3D qui flotte, champs qui arrivent l'un après l'autre,
// tuiles « bento » (cf. .agro-boutons .modal-glass .fg-tuile dans index.css) et icônes automatiques sur les champs.
// `icone` / `intro` / `titreHero` règlent la présentation ; `hero={false}` pour une simple fenêtre de consultation.
import {
  Receipt, Send, Syringe, Package, Scale, Leaf, Settings, Wheat, TrendingUp, Skull, Egg, HeartPulse, Wallet,
  AlertTriangle, RotateCcw, FileSpreadsheet, PawPrint, Eye, ClipboardList
} from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import { IconesAutoContext } from '../../shared/forms/iconesChamps'
import { glassModalProps } from '../../utils/color'
import { COULEUR_AGRO } from './BandeAgro'

const ICONES_TITRE = [
  [/correctif/i, RotateCcw],
  [/[ée]cart/i, AlertTriangle],
  [/facture|brouillon/i, Receipt],
  [/sortie|demande/i, Send],
  [/intervention|sanit|vaccin/i, Syringe],
  [/effectif|r[ée]ajust/i, Scale],
  [/produit|stock/i, Package],
  [/exporter|excel|rapport/i, FileSpreadsheet],
  [/d[ée]c[èe]s|mortalit|l[ée]talit/i, Skull],
  [/naissance|croissance/i, Egg],
  [/morbidit/i, HeartPulse],
  [/chiffre|ventes|recettes/i, Wallet],
  [/tendance|[ée]volution/i, TrendingUp],
  [/aliment|divers/i, Wheat],
  [/esp[èe]ce|animal/i, PawPrint],
  [/param|ajouter|modifier/i, Settings],
  [/saisie|mouvement/i, ClipboardList],
  [/consult|d[ée]tail/i, Eye]
]
const iconeDuTitre = (t) => (ICONES_TITRE.find(([re]) => re.test(typeof t === 'string' ? t : '')) || [null, Leaf])[1]

export default function ModalAgro({ open, onClose, title, titreHero, icone, intro, hero = true, children, ...rest }) {
  const Icone = icone || iconeDuTitre(title)
  return (
    <Modal open={open} onClose={onClose} title={title} {...glassModalProps(COULEUR_AGRO)} {...rest}>
      <IconesAutoContext.Provider value={true}>
        <div style={{ '--fg-icone': COULEUR_AGRO }}>
          {hero && (
            <div className="ed-entree relative mb-3 flex items-center gap-4 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(22,101,52,0.7),inset_0_1px_0_rgba(255,255,255,0.45)]"
              style={{ background: `linear-gradient(135deg, ${COULEUR_AGRO}f2 0%, #14532dee 100%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="rh-reflet pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" />
              <Icone aria-hidden="true" size={96} strokeWidth={1.2} className="pointer-events-none absolute -bottom-5 -right-4 rotate-[-12deg] text-white opacity-[0.14]" />
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                <Icone size={26} className="rh-flotte" />
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{titreHero || title}</p>
                {intro && <p className="text-sm text-white/90">{intro}</p>}
              </div>
            </div>
          )}
          <div className="rh-champs">{children}</div>
        </div>
      </IconesAutoContext.Provider>
    </Modal>
  )
}
