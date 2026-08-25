// MAXI-GYM — Clients : répertoire, avec total séances/abonnements par client.
// Cliquer une ligne ouvre la fiche complète (historique + modification/suppression),
// cf. ClientDetailModal.jsx — partagé avec Dashboard et Pilotage.
//
// Volet VOLONTAIREMENT NON cloisonné par salle (à la différence de tout le reste
// du module) : un abonné de Lomé peut se présenter à Kara pendant un séjour (et
// inversement) pour y faire une séance ponctuelle si son abonnement est encore
// valide. La réceptionniste doit alors pouvoir le retrouver ici, voir sa salle
// d'origine, la catégorie et le statut de son abonnement, pour confirmer qu'il
// est bien abonné avant de le laisser entrer. Les KPI (Dashboard/Pilotage), eux,
// restent strictement par salle — ce cloisonnement n'est levé qu'ici.
import { useMemo, useState } from 'react'
import { Users, Eye, EyeOff, Search } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Table from '../../shared/ui/Table'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { joursDepuis, categorieLabel, categorieTone, abonnementActif } from './data'
import ClientDetailModal from './ClientDetailModal'
import { SITES, siteLabel } from './site/useSite'

const COULEUR = '#E8850F'
const SEUIL_INACTIVITE_JOURS = 60 // deux mois — au-delà, le client sort de la liste par défaut

export default function Clients() {
  const { data: clients } = useCollection('gym_clients')
  const { data: seances } = useCollection('gym_seances')
  const { data: abonnements } = useCollection('gym_abonnements')
  const { data: presences } = useCollection('gym_presences')
  const [clientDetail, setClientDetail] = useState(null)
  const [afficherInactifs, setAfficherInactifs] = useState(false)
  const [filtreSite, setFiltreSite] = useState('') // '' = toutes les salles
  const [recherche, setRecherche] = useState('')

  // Cumul + dernière visite par nom de client (les séances/abonnements/présences ne
  // portent qu'un nom libre, pas encore d'identifiant de fiche client — rapprochement
  // par nom, insensible à la casse). Tout confondu, les deux salles — un client peut
  // avoir une activité à l'une comme à l'autre. La « dernière visite » retient la
  // date la plus récente parmi : arrivée pointée, séance, ou souscription d'abonnement.
  const { cumulParNom, derniereVisiteParNom, abonnementParNom } = useMemo(() => {
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
    // Abonnement le plus pertinent par client : celui en cours s'il y en a un,
    // sinon le plus récent (pour afficher au moins la dernière catégorie connue).
    const parNom = new Map()
    for (const a of [...abonnements].sort((x, y) => (x.date < y.date ? 1 : -1))) {
      const cle = (a.clientNom || '').trim().toLowerCase()
      if (!cle) continue
      const actif = abonnementActif(a.dateFin)
      const courant = parNom.get(cle)
      if (!courant || (actif && !courant.actif)) parNom.set(cle, { categorie: a.categorie, actif, dateFin: a.dateFin, site: a.site })
    }
    return { cumulParNom: cumul, derniereVisiteParNom: derniere, abonnementParNom: parNom }
  }, [seances, abonnements, presences])

  const clientsAffiches = useMemo(() => {
    return clients.filter((c) => {
      if (filtreSite && (c.site || 'lome') !== filtreSite) return false
      if (recherche.trim() && !(c.nom || '').toLowerCase().includes(recherche.trim().toLowerCase())) return false
      if (afficherInactifs) return true
      const derniere = derniereVisiteParNom.get((c.nom || '').trim().toLowerCase())
      const jours = joursDepuis(derniere)
      return jours == null || jours < SEUIL_INACTIVITE_JOURS
    })
  }, [clients, derniereVisiteParNom, afficherInactifs, filtreSite, recherche])
  const nbInactifs = clients.length - clients.filter((c) => {
    const derniere = derniereVisiteParNom.get((c.nom || '').trim().toLowerCase())
    const jours = joursDepuis(derniere)
    return jours == null || jours < SEUIL_INACTIVITE_JOURS
  }).length

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
          <h2 className="text-lg font-extrabold">Clients</h2>
          <p className="text-sm text-white/80">Répertoire des deux salles — cliquer une ligne pour voir la fiche</p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Les clients apparaissent automatiquement ici dès qu'une séance ou un abonnement est enregistré à leur nom — pas d'ajout manuel. Ce répertoire regroupe <strong>les deux salles</strong> (contrairement au reste du module) : un abonné de Lomé peut se présenter à Kara pendant un séjour, et inversement — utilisez le filtre par salle et la recherche par nom pour vérifier sa salle d'origine et si son abonnement est bien valide. Un client sans passage depuis {SEUIL_INACTIVITE_JOURS} jours (deux mois) sort de la liste par défaut.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un nom…" className="w-56 pl-8" />
        </div>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          <button onClick={() => setFiltreSite('')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${!filtreSite ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Toutes les salles
          </button>
          {SITES.map((s) => (
            <button key={s.id} onClick={() => setFiltreSite(s.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${filtreSite === s.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              style={filtreSite === s.id ? { background: s.accent } : undefined}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        {nbInactifs > 0 && (
          <button onClick={() => setAfficherInactifs((v) => !v)}
            className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            {afficherInactifs ? <EyeOff size={14} /> : <Eye size={14} />}
            {afficherInactifs ? 'Masquer les clients inactifs (+2 mois)' : `Afficher aussi ${nbInactifs} client(s) inactif(s) depuis 2 mois ou plus`}
          </button>
        )}
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'site', label: 'Salle', render: (r) => {
              const s = SITES.find((x) => x.id === (r.site || 'lome'))
              return (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: `${s?.accent}1a`, color: s?.accent }}>
                  {s?.emoji} {siteLabel(r.site || 'lome')}
                </span>
              )
            } },
            { key: 'categorie', label: 'Catégorie abo.', render: (r) => {
              const abo = abonnementParNom.get((r.nom || '').trim().toLowerCase())
              return abo ? <Badge tone={categorieTone(abo.categorie)}>{categorieLabel(abo.categorie)}</Badge> : <span className="text-gray-400">—</span>
            } },
            { key: 'statutAbo', label: 'Statut abo.', render: (r) => {
              const abo = abonnementParNom.get((r.nom || '').trim().toLowerCase())
              if (!abo) return <span className="text-gray-400">Aucun</span>
              return <Badge tone={abo.actif ? 'success' : 'neutral'}>{abo.actif ? `Actif jusqu'au ${formatDateShort(abo.dateFin)}` : 'Expiré'}</Badge>
            } },
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
