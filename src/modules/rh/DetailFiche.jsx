// RH : fenêtre de détail d'une fiche (employé, contrat, congé, bulletin, ligne d'une liste…). S'ouvre au clic sur une ligne.
// Verre dépoli teinté du bleu du module : en-tête (initiale, titre, statut), tuiles d'informations, puis actions (Modifier, Supprimer…).
//   fiche : { titre, sous, couleur, badge: { label, tone }, tuiles: [{ icone, label, valeur, large } | { section: 'Catégorie' }], note }
//   Une entrée { section } est un intertitre qui regroupe les tuiles suivantes par catégorie (masqué si aucune tuile ne le suit).
//   actions : [{ label, icone, onClick, tone: 'primaire' | 'danger' | 'neutre' }]
import { Info } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { glassModalProps, avatarGradient } from '../../utils/color'

const COULEURS_ACTION = { primaire: '#0284c7', danger: '#dc2626', succes: '#16a34a' }

export default function DetailFiche({ fiche, actions = [], onClose }) {
  if (!fiche) return null
  const { titre, sous, couleur = '#0284c7', badge, tuiles = [], note, enfants } = fiche
  // Les tuiles vides disparaissent ; un intertitre sans tuile derrière lui disparaît aussi.
  const visibles = tuiles.filter((t, i) => {
    if (t.section) { const suiv = tuiles.slice(i + 1).find((x) => x.section || (x.valeur !== undefined && x.valeur !== null && x.valeur !== '')); return !!suiv && !suiv.section }
    return t.valeur !== undefined && t.valeur !== null && t.valeur !== ''
  })
  return (
    <Modal open onClose={onClose} size="lg" title="Détails" {...glassModalProps(couleur)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        {actions.map((a) => (
          <Button key={a.label} variant={a.tone === 'neutre' ? 'outline' : undefined} onClick={a.onClick} style={a.tone === 'neutre' ? undefined : { backgroundColor: COULEURS_ACTION[a.tone] || couleur }}>
            {a.icone && <a.icone size={15} />} {a.label}
          </Button>
        ))}
      </>}>
      <div className="space-y-3">
        <div className="ed-entree relative flex items-center gap-3.5 overflow-hidden rounded-3xl border border-white/40 p-3.5 text-white shadow-[0_16px_30px_-14px_rgba(2,132,199,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${couleur} 92%, transparent) 0%, color-mix(in srgb, ${couleur} 45%, #0c1a2e) 100%)` }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/70 text-2xl font-black text-white shadow-[inset_0_2px_2px_rgba(255,255,255,0.5),0_10px_20px_-8px_rgba(0,0,0,0.5)]" style={{ background: avatarGradient(titre || '?') }} aria-hidden="true">
            {(titre || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold leading-tight">{titre}</p>
            {sous && <p className="truncate text-sm text-white/85">{sous}</p>}
          </div>
          {badge && <span className="relative shrink-0"><Badge tone={badge.tone || 'neutral'}>{badge.label}</Badge></span>}
        </div>

        {enfants}

        {visibles.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibles.map((t, i) => t.section ? (
              <p key={`section-${i}`} className="ed-entree mt-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500 sm:col-span-2" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <span className="h-px flex-1 bg-gray-300/60" aria-hidden="true" /><span style={{ color: t.couleur || couleur }}>{t.section}</span><span className="h-px flex-1 bg-gray-300/60" aria-hidden="true" />
              </p>
            ) : (
              <div key={t.label} className={`ed-entree flex items-start gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md ${t.large ? 'sm:col-span-2' : ''}`}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                {t.icone && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${t.couleur || couleur} 70%, white), ${t.couleur || couleur})` }}><t.icone size={15} aria-hidden="true" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t.label}</span>
                  <span className="block break-words text-sm font-semibold text-gray-800">{t.valeur}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {note && <p className="flex items-start gap-1.5 text-[11px] text-gray-500"><Info size={12} className="mt-0.5 shrink-0" style={{ color: couleur }} aria-hidden="true" />{note}</p>}
      </div>
    </Modal>
  )
}
