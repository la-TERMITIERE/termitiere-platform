// MAXI-GYM — Clients : répertoire, avec total séances/abonnements par client.
// Cliquer une ligne ouvre la fiche complète (historique + modification/suppression),
// cf. ClientDetailModal.jsx — partagé avec Dashboard et Pilotage.
import { useMemo, useState } from 'react'
import { Users, Eye, EyeOff } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Table from '../../shared/ui/Table'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { joursDepuis } from './data'
import ClientDetailModal from './ClientDetailModal'
import { useSite, matchSite, siteLabel } from './site/useSite'

const COULEUR = '#E8850F'
const SEUIL_INACTIVITE_JOURS = 60 // deux mois — au-delà, le client sort de la liste par défaut

export default function Clients() {
  const site = useSite()
  const { data: allClients } = useCollection('gym_clients')
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allPresences } = useCollection('gym_presences')
  // Chaque salle a sa propre clientèle : un client de Lomé n'apparaît pas ici
  // quand on consulte Kara, et inversement.
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const [clientDetail, setClientDetail] = useState(null)
  const [afficherInactifs, setAfficherInactifs] = useState(false)

  // Cumul + dernière visite par nom de client (les séances/abonnements/présences ne
  // portent qu'un nom libre, pas encore d'identifiant de fiche client — rapprochement
  // par nom, insensible à la casse). La « dernière visite » retient la date la plus
  // récente parmi : arrivée pointée, séance, ou souscription d'abonnement.
  const { cumulParNom, derniereVisiteParNom } = useMemo(() => {
    const cumul = new Map()
    const derniere = new Map()
    const maj = (nom, montant, date) => {
      const cle = (nom || '').trim().toLowerCase()
      if (!cle) return
      cumul.set(cle, (cumul.get(cle) || 0) + (Number(montant) || 0))
      if (date && (!derniere.has(cle) || date > derniere.get(cle))) derniere.set(cle, date)
    }
    for (const s of seances) maj(s.clientNom, s.montant, s.date)
    for (const a of abonnements) maj(a.clientNom, a.montant, a.date)
    for (const p of presences) {
      const cle = (p.clientNom || '').trim().toLowerCase()
      if (cle && p.date && (!derniere.has(cle) || p.date > derniere.get(cle))) derniere.set(cle, p.date)
    }
    return { cumulParNom: cumul, derniereVisiteParNom: derniere }
  }, [seances, abonnements, presences])

  const clientsAffiches = useMemo(() => {
    return clients.filter((c) => {
      if (afficherInactifs) return true
      const derniere = derniereVisiteParNom.get((c.nom || '').trim().toLowerCase())
      const jours = joursDepuis(derniere)
      return jours == null || jours < SEUIL_INACTIVITE_JOURS
    })
  }, [clients, derniereVisiteParNom, afficherInactifs])
  const nbInactifs = clients.length - clientsAffiches.length

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Clients — {siteLabel(site)}</h2>
          <p className="text-sm text-white/80">Répertoire des clients de la salle {siteLabel(site)} — cliquer une ligne pour voir la fiche</p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Les clients apparaissent automatiquement ici dès qu'une séance ou un abonnement est enregistré à leur nom — pas d'ajout manuel, pour que ce répertoire reflète uniquement les clients réellement reçus. Chaque salle a sa <strong>propre clientèle</strong> : seuls les clients de <strong>{siteLabel(site)}</strong> sont listés ci-dessous. Un client sans passage depuis {SEUIL_INACTIVITE_JOURS} jours (deux mois) sort de la liste par défaut.
      </div>

      {nbInactifs > 0 && (
        <button onClick={() => setAfficherInactifs((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          {afficherInactifs ? <EyeOff size={14} /> : <Eye size={14} />}
          {afficherInactifs ? 'Masquer les clients inactifs (+2 mois)' : `Afficher aussi ${nbInactifs} client(s) inactif(s) depuis 2 mois ou plus`}
        </button>
      )}

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'telephone', label: 'Téléphone', render: (r) => r.telephone || '—' },
            { key: 'derniereVisite', label: 'Dernière visite', render: (r) => {
              const derniere = derniereVisiteParNom.get((r.nom || '').trim().toLowerCase())
              const jours = joursDepuis(derniere)
              if (jours == null) return <span className="text-gray-400">—</span>
              return (
                <Badge tone={jours >= SEUIL_INACTIVITE_JOURS ? 'danger' : jours >= 7 ? 'warning' : 'success'}>
                  {formatDateShort(derniere)} ({jours === 0 ? "aujourd'hui" : `il y a ${jours} j`})
                </Badge>
              )
            } },
            { key: 'total', label: 'Total dépensé', align: 'right', render: (r) => <strong>{formatMoney(cumulParNom.get((r.nom || '').trim().toLowerCase()) || 0)}</strong> },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' }
          ]}
          rows={clientsAffiches}
          empty="Aucun client."
          onRowClick={(r) => setClientDetail(r.nom)}
        />
      </Card>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
    </div>
  )
}
