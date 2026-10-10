// Alertes persistantes du Dashboard Logistique pour l'agent : ses prestations enregistrées mais pas
// facturées, et ses factures en brouillon sans demande de sortie. Elles complètent les notifications
// (qui disparaissent) : le bandeau reste jusqu'à ce que l'agent ait fait le nécessaire.
import { Send, Receipt } from 'lucide-react'
import AlerteDashboard, { useTick } from '../../shared/ui/AlerteDashboard'
import { formatMoney } from '../../utils/formatters'

const DELAI_MS = 10 * 60 * 1000
const assezAncien = (x) => typeof x.createdAt !== 'number' || Date.now() - x.createdAt >= DELAI_MS

export function PrestationsAFacturerAlerte({ prestations, site, uid, voitMontants }) {
  useTick()
  const items = prestations
    .filter((p) => p.agentId === uid && p.statut === 'brouillon' && !p.factureId && assezAncien(p))
    .map((p) => ({ id: p.id, texte: p.clientNom || p.num, detail: voitMontants ? formatMoney(p.totalTTC ?? p.total ?? 0) : p.num }))
  return <AlerteDashboard cle={`alerte-prest-brouillon:${site}:${uid}`} tone="amber" icone={Send}
    titre={`${items.length} prestation${items.length > 1 ? 's' : ''} à facturer`}
    items={items} to={`/logistique/${site}/prestations`} lienLabel="Cliquer sur l'avion rouge dans Prestations" />
}

export function FacturesBrouillonAlerte({ factures, demandes, site, uid }) {
  useTick()
  const avecDemande = new Set(demandes.map((d) => d.factureId).filter(Boolean))
  const items = factures
    .filter((f) => f.agentId === uid && f.statut === 'brouillon' && !avecDemande.has(f.id) && assezAncien(f))
    .map((f) => ({ id: f.id, texte: f.clientNom || f.num, detail: f.num }))
  return <AlerteDashboard cle={`alerte-fact-brouillon:${site}:${uid}`} tone="amber" icone={Receipt}
    titre={`${items.length} facture${items.length > 1 ? 's' : ''} en brouillon : sortie non demandée`}
    items={items} to={`/logistique/${site}/factures`} lienLabel="Voir les factures" />
}
