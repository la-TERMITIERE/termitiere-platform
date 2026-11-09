// RH : fenêtre de détail d'un KPI (au clic sur une carte). Même langage visuel que les autres fenêtres de l'application : verre dépoli teinté
// à la couleur du module, tuiles de chiffres clés, puis lignes en verre avec l'initiale de la personne et un détail à droite.
//   fiche : { titre, sous, icone, couleur, tuiles: [{ icone, titre, valeur, sous, couleur }], lignes: [{ id, libelle, sous, detail, ton }], vide, lien: { to, label } }
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import { glassModalProps, icone3D, avatarGradient } from '../../utils/color'

// Pastille de détail : la couleur dit l'urgence, jamais seule (le texte porte aussi le sens).
const TONS = {
  vert: 'bg-green-50 text-green-700 ring-green-100',
  orange: 'bg-amber-50 text-amber-800 ring-amber-100',
  rouge: 'bg-red-50 text-red-700 ring-red-100',
  gris: 'bg-gray-100 text-gray-600 ring-gray-200'
}

// `pied` : boutons d'action supplémentaires (modifier, supprimer…) placés à gauche des boutons de fermeture.
export default function DetailKpiModal({ fiche, onClose, pied }) {
  const navigate = useNavigate()
  if (!fiche) return null
  const { icone: Icone, couleur = '#0284c7', titre, sous, tuiles = [], lignes = [], vide = 'Rien à afficher pour le moment.', lien } = fiche
  return (
    <Modal open onClose={onClose} size="lg" title={titre} {...glassModalProps(couleur)}
      footer={<>
        {pied && <div className="mr-auto flex gap-2">{pied}</div>}
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        {lien && <Button onClick={() => { onClose(); navigate(lien.to) }} style={{ backgroundColor: couleur }}>{lien.label} <ArrowRight size={16} /></Button>}
      </>}>
      <div className="space-y-3">
        {sous && (
          <p className="flex items-center gap-2.5 text-sm text-gray-600">
            {Icone && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={16} /></span>}
            {sous}
          </p>
        )}
        {tuiles.length > 0 && (
          <div className={`grid gap-2.5 ${tuiles.length === 1 ? 'grid-cols-1' : tuiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            {tuiles.map((t) => <TuileVerre key={t.titre} icone={t.icone} couleur={t.couleur || couleur} titre={t.titre} valeur={t.valeur} sous={t.sous} />)}
          </div>
        )}
        {lignes.length === 0 ? (
          <p className="rounded-2xl border border-white/80 bg-white/60 py-8 text-center text-sm text-gray-400">{vide}</p>
        ) : (
          <ul className="max-h-[44vh] space-y-1.5 overflow-y-auto pr-1">
            {lignes.map((l, i) => (
              <li key={l.id} className="ed-entree flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: avatarGradient(l.libelle) }} aria-hidden="true">
                  {(l.libelle || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800">{l.libelle}</span>
                  {l.sous && <span className="block truncate text-[11px] text-gray-500">{l.sous}</span>}
                </span>
                {l.detail && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ring-inset ${TONS[l.ton] || TONS.gris}`}>{l.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
