// Petit message de félicitation pour les AGENTS sur le tableau de bord de leur module : une fois à 50 % de l'objectif de recettes du mois,
// puis à 100 %. Le message se ferme avec la croix (par mois et par palier, mémorisé sur l'appareil) ; atteindre 100 % fait réapparaître un
// nouveau message même si celui de 50 % a été fermé. Sans objectif fixé dans les Paramètres du module, rien ne s'affiche.
import { useMemo, useState } from 'react'
import { PartyPopper, Trophy, Star, Sparkles, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { todayStr } from '../../utils/formatters'
import { icone3D } from '../../utils/color'
import { useQuotas, useRealiseMois, avancement } from './quotas'

const CONFETTIS = ['#f59e0b', '#ef4444', '#16a34a', '#3b82f6', '#a855f7', '#ec4899']
const cle = (poleId, mois, palier) => `felicitation_${poleId}_${mois}_${palier}`
const dejaFerme = (k) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const memoriser = (k) => { try { localStorage.setItem(k, '1') } catch { /* mémorisation facultative */ } }

export default function FelicitationObjectif(props) {
  const { role } = useAuth()
  // Le calcul des recettes (lecture de plusieurs collections) n'est lancé que pour les agents.
  return role === 'agent' ? <Message {...props} /> : null
}

function Message({ poleId, secteur, couleur = '#16a34a' }) {
  const { quotas } = useQuotas()
  const { realise } = useRealiseMois(poleId)
  const mois = todayStr().slice(0, 7)
  const pct = avancement(realise, quotas[poleId] || 0)
  const palier = pct == null ? 0 : pct >= 100 ? 100 : pct >= 50 ? 50 : 0
  const [, rafraichir] = useState(0)
  const confettis = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ gauche: `${(i * 6.3 + 3) % 100}%`, delai: `${(i % 8) * 0.38}s`, couleur: CONFETTIS[i % CONFETTIS.length], taille: 5 + (i % 3) * 2 })), [])

  if (!palier || dejaFerme(cle(poleId, mois, palier))) return null
  const complet = palier === 100
  const teinte = complet ? '#16a34a' : couleur
  const Icone = complet ? Trophy : PartyPopper
  const fermer = () => { memoriser(cle(poleId, mois, palier)); rafraichir((n) => n + 1) }

  return (
    <div role="status" className="fe-entree relative overflow-hidden rounded-3xl border border-white/80 p-3.5 pr-11 shadow-[0_16px_34px_-18px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl"
      style={{ background: `linear-gradient(135deg, ${teinte}2e 0%, rgba(255,255,255,0.8) 65%)` }}>
      {/* confettis */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {confettis.map((c, i) => (
          <span key={i} className="fe-confetti absolute top-0 rounded-sm" style={{ left: c.gauche, animationDelay: c.delai, width: c.taille, height: c.taille * 1.6, background: c.couleur }} />
        ))}
        <span className="fe-brille absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>
      <div className="relative flex items-center gap-3">
        <span className="fe-rebond relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={icone3D(teinte)}>
          <Icone size={24} />
          <Sparkles size={13} className="fe-etoile absolute -right-1.5 -top-1.5 text-amber-400" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-gray-800">
            {complet ? 'Objectif du mois atteint, bravo !' : 'Déjà la moitié de l\'objectif du mois !'}
            <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white" style={{ background: teinte }}>
              <Star size={11} fill="currentColor" /> {complet ? '100 %' : '50 %'}
            </span>
          </p>
          <p className="text-xs text-gray-600">
            {complet
              ? `Félicitations à toute l'équipe${secteur ? ` ${secteur}` : ''} : l'objectif de recettes du mois est atteint. Continuez comme ça !`
              : `Belle progression${secteur ? ` pour ${secteur}` : ''} : la moitié de l'objectif de recettes du mois est déjà réalisée. Courage, la suite est à portée de main !`}
          </p>
        </div>
      </div>
      <button type="button" onClick={fermer} aria-label="Fermer le message de félicitation" title="Fermer"
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700">
        <X size={15} />
      </button>
    </div>
  )
}
