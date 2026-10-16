// MAXI-GYM : confirmation de la suppression TOTALE d'un client dont l'abonnement est terminé (cf. purgeClient.js).
import { useState } from 'react'
import { Eraser, AlertTriangle } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../core/notifications'
import { glassModalProps } from '../../utils/color'
import { purgerDossier, resumeDossier } from './purgeClient'

// `dossier` : résultat de dossierClient() ; null = fermé.
export default function PurgeClientModal({ dossier, onClose }) {
  const role = useAuth((s) => s.role)
  const [busy, setBusy] = useState(false)
  const r = dossier ? resumeDossier(dossier) : null

  async function confirmer() {
    if (!dossier || busy) return
    setBusy(true)
    try {
      await purgerDossier(dossier, role)
      toast.success(`${dossier.nom} supprimé totalement de la base ✓`)
      onClose()
    } catch (e) {
      toast.error(e?.message || 'La suppression a échoué')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!dossier} onClose={onClose} size="sm" title="Supprimer totalement ce client ?" {...glassModalProps('#dc2626')}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button variant="danger" onClick={confirmer} loading={busy}><Eraser size={15} /> Supprimer totalement</Button>
      </>}>
      {dossier && r && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              L'abonnement de <strong>{dossier.nom}</strong> est terminé. Tout son dossier sera <strong>effacé définitivement</strong> de la base, pour la libérer.
            </span>
          </div>
          <ul className="space-y-1 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <li className="flex justify-between"><span>Fiche client</span><strong>{r.fiches}</strong></li>
            <li className="flex justify-between"><span>Abonnements</span><strong>{r.abonnements}</strong></li>
            <li className="flex justify-between"><span>Séances</span><strong>{r.seances}</strong></li>
            <li className="flex justify-between"><span>Arrivées pointées</span><strong>{r.presences}</strong></li>
          </ul>
          <p className="text-xs text-gray-500">Les factures sont conservées : elles gardent le chiffre d'affaires et la comptabilité. S'il revient, il sera simplement réinscrit.</p>
        </div>
      )}
    </Modal>
  )
}
