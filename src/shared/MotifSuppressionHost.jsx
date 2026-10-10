// Fenêtre « Motif de la suppression » : s'ouvre à chaque suppression (cf. core/motifSuppression.js).
// Motif obligatoire (3 caractères minimum) ; Annuler ou Échap abandonne la suppression.
import { useEffect, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { brancherDemandeurMotif } from '../core/motifSuppression'
import { icone3D } from '../utils/color'

const MOTIFS_RAPIDES = ['Doublon', 'Erreur de saisie', 'Annulation du client', 'Donnée de test']

export default function MotifSuppressionHost() {
  const [demande, setDemande] = useState(null) // { info, resolve }
  const [motif, setMotif] = useState('')

  useEffect(() => {
    brancherDemandeurMotif((info, resolve) => { setMotif(''); setDemande({ info, resolve }) })
    return () => brancherDemandeurMotif(null)
  }, [])

  function fermer(valeur) {
    demande?.resolve(valeur)
    setDemande(null)
  }
  const valide = motif.trim().length >= 3

  return (
    <Modal open={!!demande} onClose={() => fermer(null)} size="sm" title="Motif de la suppression"
      footer={<>
        <Button variant="ghost" onClick={() => fermer(null)}>Annuler</Button>
        <Button variant="danger" disabled={!valide} onClick={() => fermer(motif.trim())}><Trash2 size={15} /> Supprimer</Button>
      </>}>
      <style>{`
        @keyframes motif-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-12deg); } 84% { transform: rotate(10deg); } 92% { transform: rotate(-6deg); } }
        @keyframes motif-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
      `}</style>
      {demande && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="relative">
              <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-red-500 blur-md" style={{ animation: 'motif-halo 2.6s ease-in-out infinite' }} />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D('#DC2626')}>
                <Trash2 size={26} style={{ animation: 'motif-secoue 3s ease-in-out infinite' }} />
              </span>
            </div>
            {demande.info?.libelle && <p className="text-sm text-gray-600">Vous allez supprimer : <strong className="text-gray-900">{demande.info.libelle}</strong></p>}
          </div>

          <div className="tuile-verre">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Motif (obligatoire)</label>
            <textarea autoFocus rows={3} value={motif} onChange={(e) => setMotif(e.target.value)}
              placeholder="Pourquoi supprimez-vous cet élément ?" className="input-base resize-none" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MOTIFS_RAPIDES.map((m) => (
                <button key={m} type="button" onClick={() => setMotif(m)}
                  className="rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 hover:bg-white">{m}</button>
              ))}
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
            Le motif est enregistré dans le Journal avec votre nom et l'élément supprimé.
          </p>
        </div>
      )}
    </Modal>
  )
}
