// Fenêtre « Motif de la suppression » : s'ouvre à chaque suppression (cf. core/motifSuppression.js).
// Motif obligatoire (3 caractères minimum) ; Annuler ou Échap abandonne la suppression.
// Elle prend la couleur du module où l'on se trouve (bleu dans Ressources humaines, orange dans Gym, etc.), en verre dépoli.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Trash2, Info, Check } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { brancherDemandeurMotif } from '../core/motifSuppression'
import { icone3D, glassModalProps, COULEUR_MODULE } from '../utils/color'

const MOTIFS_RAPIDES = ['Doublon', 'Erreur de saisie', 'Annulation du client', 'Donnée de test']
const MIN = 3

export default function MotifSuppressionHost() {
  const [demande, setDemande] = useState(null) // { info, resolve }
  const [motif, setMotif] = useState('')
  const accent = COULEUR_MODULE[useLocation().pathname.split('/')[1]] || '#0284c7'

  useEffect(() => {
    brancherDemandeurMotif((info, resolve) => { setMotif(''); setDemande({ info, resolve }) })
    return () => brancherDemandeurMotif(null)
  }, [])

  function fermer(valeur) {
    demande?.resolve(valeur)
    setDemande(null)
  }
  const saisi = motif.trim().length
  const valide = saisi >= MIN

  return (
    <Modal open={!!demande} onClose={() => fermer(null)} size="sm" title="Motif de la suppression" {...glassModalProps(accent)}
      footer={<>
        <Button variant="ghost" onClick={() => fermer(null)}>Annuler</Button>
        <Button disabled={!valide} onClick={() => fermer(motif.trim())} style={{ backgroundColor: accent }}><Trash2 size={15} /> Supprimer</Button>
      </>}>
      <style>{`
        @keyframes motif-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-12deg); } 84% { transform: rotate(10deg); } 92% { transform: rotate(-6deg); } }
        @keyframes motif-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
        @media (prefers-reduced-motion: reduce) { .motif-anim { animation: none !important; } }
      `}</style>
      {demande && (
        <div className="params-verre space-y-3" style={{ '--p-accent': accent }}>
          <div className="flex flex-col items-center gap-2.5 text-center">
            <div className="relative">
              <span aria-hidden="true" className="motif-anim absolute inset-0 rounded-2xl blur-md" style={{ background: accent, animation: 'motif-halo 2.6s ease-in-out infinite' }} />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D(accent)}>
                <Trash2 size={26} className="motif-anim" style={{ animation: 'motif-secoue 3s ease-in-out infinite' }} />
              </span>
            </div>
            <p className="text-sm text-gray-600">Vous allez supprimer</p>
            {demande.info?.libelle && (
              <p className="-mt-1.5 max-w-full truncate rounded-full border border-white/80 bg-white/70 px-3.5 py-1 text-sm font-extrabold text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">{demande.info.libelle}</p>
            )}
          </div>

          <div className="fg-tuile">
            <label htmlFor="motif-suppression" className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <span>Motif (obligatoire)</span>
              <span className={`inline-flex items-center gap-1 normal-case tracking-normal tabular-nums ${valide ? 'text-green-600' : 'text-gray-400'}`}>
                {valide ? <><Check size={12} aria-hidden="true" /> Prêt</> : `${saisi}/${MIN} caractères`}
              </span>
            </label>
            <textarea id="motif-suppression" autoFocus rows={3} value={motif} onChange={(e) => setMotif(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && valide) fermer(motif.trim()) }}
              placeholder="Pourquoi supprimez-vous cet élément ?" className="input-base resize-none" />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {MOTIFS_RAPIDES.map((m) => {
                const actif = motif === m
                return (
                  <button key={m} type="button" onClick={() => setMotif(m)} aria-pressed={actif}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 ${actif ? 'border-transparent text-white' : 'border-white/80 bg-white/70 text-gray-600 hover:bg-white'}`}
                    style={actif ? { background: accent } : undefined}>{m}</button>
                )
              })}
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
            <Info size={12} className="mt-0.5 shrink-0" style={{ color: accent }} aria-hidden="true" />
            Le motif est enregistré dans le Journal avec votre nom et l'élément supprimé.
          </p>
        </div>
      )}
    </Modal>
  )
}
