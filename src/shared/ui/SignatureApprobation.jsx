// « Approuvée par… » : pastille de verre avec une icône 3D. Approbation automatique : un robot qui
// flotte, avec un halo qui pulse. Approbation par une personne : un bouclier vert validé.
// Animations `.sig-*` : index.css.
import { Bot, ShieldCheck } from 'lucide-react'
import { icone3D } from '../../utils/color'

export default function SignatureApprobation({ par, le, auto = false }) {
  // « Système (auto · 10 min) » : le nom d'un côté, le détail entre parenthèses de l'autre.
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(par || '')
  const nom = (m ? m[1] : par) || ''
  const detail = m ? m[2] : ''
  const couleur = auto ? '#7C3AED' : '#16A34A'
  const Icone = auto ? Bot : ShieldCheck
  return (
    <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/80 bg-white/65 py-0.5 pl-0.5 pr-2 shadow-[0_4px_10px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
      <span className="relative shrink-0">
        {auto && <span aria-hidden="true" className="sig-halo absolute inset-0 rounded-full" style={{ background: couleur }} />}
        <span className={`relative flex h-5 w-5 items-center justify-center rounded-full ${auto ? 'sig-flotte' : ''}`} style={icone3D(couleur)}>
          <Icone size={11} />
        </span>
      </span>
      <span className="min-w-0 text-[10px] leading-tight text-gray-500">
        <strong className="font-bold text-gray-700">{nom}</strong>
        {[detail, le].filter(Boolean).length > 0 && <span className="text-[9px]"> · {[detail, le].filter(Boolean).join(' · ')}</span>}
      </span>
    </span>
  )
}
