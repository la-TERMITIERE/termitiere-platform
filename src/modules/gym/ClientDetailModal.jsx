// MAXI-GYM — modale détail client réutilisable (Dashboard, Pilotage, Clients) :
// historique complet des séances/abonnements + modification/suppression de la fiche.
import { useMemo, useState } from 'react'
import { Trash2, Pencil, ScanLine } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useAuth } from '../../hooks/useAuth'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { categorieLabel, categorieTone, QR_CARNET_ACTIF } from './data'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import CalendrierPresences from './CalendrierPresences'
import QrCarnetModal from './QrCarnetModal'

const heureCourte = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// `clientNom` (string|null) pilote l'ouverture — null/absent = fermé. `presences`
// optionnel (les appelants qui ne l'ont pas encore chargé passent [] par défaut).
export default function ClientDetailModal({ clientNom, onClose, clients, seances, abonnements, presences = [] }) {
  const { role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const peutSupprimer = isFullAccessRole(role)
  const cle = (clientNom || '').trim().toLowerCase()
  const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === cle)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [qrOuvert, setQrOuvert] = useState(false)
  const moisEnCours = new Date().toISOString().slice(0, 7)

  const historique = useMemo(() => {
    if (!cle) return []
    const s = seances.filter((x) => (x.clientNom || '').trim().toLowerCase() === cle).map((x) => ({ ...x, type: 'seance' }))
    const a = abonnements.filter((x) => (x.clientNom || '').trim().toLowerCase() === cle).map((x) => ({ ...x, type: 'abonnement' }))
    return [...s, ...a].sort((x, y) => (x.date < y.date ? 1 : -1))
  }, [seances, abonnements, cle])
  const total = historique.reduce((s, x) => s + (Number(x.montant) || 0), 0)

  const pointages = useMemo(() => {
    if (!cle) return []
    return presences.filter((p) => (p.clientNom || '').trim().toLowerCase() === cle)
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
  }, [presences, cle])

  function fermer() {
    setEdit(null)
    setQrOuvert(false)
    onClose()
  }

  async function enregistrer() {
    if (!client) return
    if (!edit.nom.trim()) return toast.error('Nom requis')
    setSaving(true)
    try {
      await updateItem('gym_clients', client.id, { nom: edit.nom.trim(), telephone: edit.telephone.trim(), notes: edit.notes.trim() })
      await audit('gym', 'CLIENT_MODIFIE', edit.nom.trim())
      toast.success('Client mis à jour ✓')
      setEdit(null)
    } finally { setSaving(false) }
  }

  async function supprimer() {
    if (!client) return
    if (!confirm(`Supprimer la fiche de ${client.nom} ? (l'historique des séances/abonnements reste conservé)`)) return
    await removeItem('gym_clients', client.id)
    await audit('gym', 'CLIENT_SUPPRIME', client.nom)
    toast.success('Client supprimé')
    fermer()
  }

  return (
    <>
    <Modal open={!!clientNom} onClose={fermer} title={client?.nom || clientNom || 'Client'}
      {...glassModalProps(COULEUR_MODULE.gym)}
      footer={<>
        <Button variant="outline" onClick={fermer}>Fermer</Button>
        {QR_CARNET_ACTIF && client && !edit && (
          <Button variant="outline" onClick={() => setQrOuvert(true)}>
            <ScanLine size={14} /> QR carnet
          </Button>
        )}
        {!lectureSeule && client && !edit && (
          <Button variant="outline" onClick={() => setEdit({ nom: client.nom, telephone: client.telephone || '', notes: client.notes || '' })}>
            <Pencil size={14} /> Modifier
          </Button>
        )}
        {peutSupprimer && client && !edit && <Button variant="danger" onClick={supprimer}><Trash2 size={14} /> Supprimer</Button>}
        {edit && <Button onClick={enregistrer} loading={saving}>Enregistrer</Button>}
      </>}>
      {!client ? (
        <p className="py-4 text-center text-sm text-gray-400">Fiche client introuvable.</p>
      ) : edit ? (
        <div className="space-y-3">
          <FormGroup label="Nom" required><Input value={edit.nom} onChange={(e) => setEdit((f) => ({ ...f, nom: e.target.value }))} /></FormGroup>
          <FormGroup label="Téléphone" hint="Optionnel"><Input value={edit.telephone} onChange={(e) => setEdit((f) => ({ ...f, telephone: e.target.value }))} placeholder="ex : 22890000000" /></FormGroup>
          <FormGroup label="Notes" hint="Optionnel"><Input value={edit.notes} onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))} /></FormGroup>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-sm text-gray-600">📞 {client.telephone || 'Non renseigné'}</p>
            {client.notes && <p className="mt-1 text-xs text-gray-500">📝 {client.notes}</p>}
            <p className="mt-2 text-sm font-bold text-gray-800">{formatMoney(total)} au total — {historique.length} passage{historique.length > 1 ? 's' : ''}</p>
          </div>

          {/* Calendrier du mois — exactement la même vue que le carnet public du
              client (cf. CalendrierPresences.jsx), pour que la réceptionniste voie
              d'un coup d'œil les jours cochés sans quitter l'application. */}
          <div className="rounded-xl bg-gray-50 p-3">
            <CalendrierPresences mois={moisEnCours} joursPresents={pointages.filter((p) => (p.date || '').startsWith(moisEnCours)).map((p) => p.date)} />
          </div>

          {pointages.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">📍 Détail des heures ({pointages.length})</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {pointages.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-1.5 text-sm">
                    <span className="text-gray-700">{formatDateShort(p.date)}</span>
                    <span className="font-semibold text-green-700">{p.createdAt ? heureCourte(p.createdAt) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {historique.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Aucun historique pour l'instant.</p>
            ) : historique.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-gray-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={h.type === 'abonnement' ? 'purple' : 'info'}>{h.type === 'abonnement' ? 'Abonnement' : 'Séance'}</Badge>
                  <Badge tone={categorieTone(h.categorie)}>{categorieLabel(h.categorie)}</Badge>
                  <span className="text-gray-500">{formatDateShort(h.date)}</span>
                </div>
                <strong className="shrink-0">{formatMoney(h.montant)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
    <QrCarnetModal client={qrOuvert ? client : null} onClose={() => setQrOuvert(false)} />
    </>
  )
}
