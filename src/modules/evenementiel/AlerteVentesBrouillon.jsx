// Alerte persistante du Dashboard Briqueterie pour l'agent : ses ventes enregistrées dont l'autorisation
// de sortie n'a pas été demandée. Complète la notification, qui disparaît.
import { Send } from 'lucide-react'
import AlerteDashboard, { useTick } from '../../shared/ui/AlerteDashboard'
import { formatMoney } from '../../utils/formatters'

const DELAI_MS = 10 * 60 * 1000

export default function AlerteVentesBrouillon({ ventes, uid }) {
  useTick()
  const items = ventes
    .filter((v) => v.agentId === uid && v.statut === 'brouillon' && (typeof v.createdAt !== 'number' || Date.now() - v.createdAt >= DELAI_MS))
    .map((v) => ({ id: v.id, texte: v.clientNom || v.num, detail: formatMoney(v.total || 0) }))
  return <AlerteDashboard cle={`alerte-vente-brouillon:${uid}`} tone="slate" icone={Send}
    titre={`${items.length} vente${items.length > 1 ? 's' : ''} sans autorisation de sortie`}
    items={items} to="/evenementiel/ventes" lienLabel="Cliquer sur l'avion dans Ventes" />
}
