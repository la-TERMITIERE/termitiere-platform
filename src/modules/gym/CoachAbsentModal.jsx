// MAXI-GYM : fenêtre « Marquer absent » : le motif est obligatoire.
import { useEffect, useState } from 'react'
import { UserX } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { toast } from '../../core/notifications'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'

const MOTIFS_RAPIDES = ['Maladie', 'Congé', 'Raison familiale', 'Problème de transport', 'Sans nouvelles']

// `coach` : coach concerné (null = fermé). `onConfirm(motif)` : async, fournie par l'appelant.
export default function CoachAbsentModal({ coach, creneau, onClose, onConfirm }) {
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (coach) setMotif('') }, [coach])

  async function valider() {
    if (!motif.trim()) return toast.error('Indiquez le motif de l\'absence')
    setSaving(true)
    try { await onConfirm(motif.trim()); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal open={!!coach} onClose={onClose} title="Marquer absent" {...glassModalProps(COULEUR_MODULE.gym)}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
        <Button variant="danger" onClick={valider} loading={saving}><UserX size={15} /> Confirmer l'absence</Button>
      </>}>
      {coach && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-md"><UserX size={20} /></span>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-gray-800">{coach.nom}</p>
              <p className="text-xs text-red-700">{creneau ? `Prévu à ${creneau.heure}, pas encore pointé` : 'Pas encore pointé'}</p>
            </div>
          </div>
          <FormGroup label="📝 Motif de l'absence" required>
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex : malade, congé…" autoFocus />
          </FormGroup>
          <div className="flex flex-wrap gap-1.5">
            {MOTIFS_RAPIDES.map((m) => (
              <button key={m} type="button" onClick={() => setMotif(m)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${motif === m ? 'border-red-400 bg-red-100 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
