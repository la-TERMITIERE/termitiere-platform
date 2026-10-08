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
import ChampRecherche from '../../shared/ui/ChampRecherche'
import { useMemo, useState } from 'react'
import { Users, Eye, EyeOff, Search, Trash2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Table from '../../shared/ui/Table'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { glassModalProps } from '../../utils/color'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { joursDepuis, categorieLabel, categorieTone, abonnementActif } from './data'
import ClientDetailModal from './ClientDetailModal'
import { SITES, siteLabel } from './site/useSite'

const COULEUR = '#E8850F'
const SEUIL_INACTIVITE_JOURS = 60 // deux mois — au-delà, le client sort de la liste par défaut

// Clé d'agrégation par SALLE + nom : une fiche de Kara ne cumule que l'activité de
// Kara, une fiche de Lomé que celle de Lomé — même si le même nom existe des deux
// côtés (chaque salle a sa propre clientèle, cf. site/useSite.jsx).
const cleClientSite = (site, nom) => `${site || 'lome'}::${(nom || '').trim().toLowerCase()}`

export default function Clients() {
  const { role } = useAuth()
  const peutSupprimer = isFullAccessRole(role) // administration + Info
  const { data: clients } = useCollection('gym_clients')
  const { data: seances } = useCollection('gym_seances')
  const { data: abonnements } = useCollection('gym_abonnements')
  const { data: presences } = useCollection('gym_presences')
  const [clientDetail, setClientDetail] = useState(null)
  const [afficherInactifs, setAfficherInactifs] = useState(false)
  const [filtreSite, setFiltreSite] = useState('') // '' = toutes les salles
  const [recherche, setRecherche] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [suppression, setSuppression] = useState(false)

  async function confirmerSuppression() {
    if (!toDelete || suppression) return
    setSuppression(true)
    try {
      await removeItem('gym_clients', toDelete.id)
      await audit('gym', 'CLIENT_SUPPRIME', `${toDelete.nom} : ${siteLabel(toDelete.site || 'lome')}`)
      toast.success('Fiche client supprimée ✓')
      setToDelete(null)
    } catch (e) {
      toast.error(e?.message || 'La suppression a échoué')
    } finally {
      setSuppression(false)
    }
  }

  // Cumul + dernière visite, agrégés PAR SALLE + nom (cf. cleClientSite) : l'activité
  // de Lomé ne compte jamais dans la fiche d'un client de Kara, et inversement. Le
  // rapprochement reste par nom libre (les séances/abonnements/présences ne portent
  // pas encore d'identifiant de fiche client), mais borné à la salle de la ligne.
  // La « dernière visite » retient la date la plus récente parmi : arrivée pointée,
  // séance, ou souscription d'abonnement.
  const { cumulParNom, derniereVisiteParNom, abonnementParNom } = useMemo(() => {
    const cumul = new Map()
    const derniere = new Map()
    const maj = (site, nom, montant, date) => {
      if (!(nom || '').trim()) return
      const cle = cleClientSite(site, nom)
      cumul.set(cle, (cumul.get(cle) || 0) + (Number(montant) || 0))
      if (date && (!derniere.has(cle) || date > derniere.get(cle))) derniere.set(cle, date)
    }
    for (const s of seances) maj(s.site, s.clientNom, s.montant, s.date)
    for (const a of abonnements) maj(a.site, a.clientNom, a.montant, a.date)
    for (const p of presences) {
      if (!(p.clientNom || '').trim()) continue
      const cle = cleClientSite(p.site, p.clientNom)
      if (p.date && (!derniere.has(cle) || p.date > derniere.get(cle))) derniere.set(cle, p.date)
    }
    // Abonnement le plus pertinent par client : celui en cours s'il y en a un,
    // sinon le plus récent (pour afficher au moins la dernière catégorie connue).
    const parNom = new Map()
    for (const a of [...abonnements].sort((x, y) => (x.date < y.date ? 1 : -1))) {
      if (!(a.clientNom || '').trim()) continue
      const cle = cleClientSite(a.site, a.clientNom)
      const actif = abonnementActif(a.dateFin, a.dateDebut)
      const aVenir = !!a.dateDebut && a.dateDebut > todayStr()
      const courant = parNom.get(cle)
      if (!courant || ((actif || aVenir) && !courant.actif && !courant.aVenir)) parNom.set(cle, { categorie: a.categorie, actif, aVenir, dateFin: a.dateFin, dateDebut: a.dateDebut, site: a.site })
    }
    return { cumulParNom: cumul, derniereVisiteParNom: derniere, abonnementParNom: parNom }
  }, [seances, abonnements, presences])

  const clientsAffiches = useMemo(() => {
    return clients
      .filter((c) => {
        if (filtreSite && (c.site || 'lome') !== filtreSite) return false
        if (recherche.trim() && !(c.nom || '').toLowerCase().includes(recherche.trim().toLowerCase())) return false
        if (afficherInactifs) return true
        const derniere = derniereVisiteParNom.get(cleClientSite(c.site, c.nom))
        const jours = joursDepuis(derniere)
        return jours == null || jours < SEUIL_INACTIVITE_JOURS
      })
      // Du plus récent au plus ancien : dernière visite en premier critère (celle
      // affichée dans la colonne « Dernière visite ») ; à égalité (ou aucune
      // activité recensée), on retombe sur la date d'apparition du client (`createdAt`).
      .sort((a, b) => {
        const da = derniereVisiteParNom.get(cleClientSite(a.site, a.nom)) || ''
        const db = derniereVisiteParNom.get(cleClientSite(b.site, b.nom)) || ''
        if (da !== db) return da < db ? 1 : -1
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
  }, [clients, derniereVisiteParNom, afficherInactifs, filtreSite, recherche])
  const nbInactifs = clients.length - clients.filter((c) => {
    const derniere = derniereVisiteParNom.get(cleClientSite(c.site, c.nom))
    const jours = joursDepuis(derniere)
    return jours == null || jours < SEUIL_INACTIVITE_JOURS
  }).length

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Clients</h2>
          <p className="text-sm text-white/80">Répertoire des deux salles : cliquer une ligne pour voir la fiche</p>
        </div>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
        <div className="flex gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
          <button onClick={() => setFiltreSite('')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${!filtreSite ? 'bg-white text-orange-700' : 'text-white/80 hover:bg-white/20'}`}>
            Toutes les salles
          </button>
          {SITES.map((s) => (
            <button key={s.id} onClick={() => setFiltreSite(s.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${filtreSite === s.id ? 'bg-white text-orange-700' : 'text-white/80 hover:bg-white/20'}`}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        {nbInactifs > 0 && (
          <button onClick={() => setAfficherInactifs((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            {afficherInactifs ? <EyeOff size={14} /> : <Eye size={14} />}
            {afficherInactifs ? 'Masquer les inactifs (+2 mois)' : `+ ${nbInactifs} inactif(s) depuis 2 mois`}
          </button>
        )}
      </div>

      <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Un client apparaît dès sa première séance ou son premier abonnement (pas d'ajout manuel). Répertoire des <strong>deux salles</strong> : filtrez par salle, les totaux et statuts sont comptés salle par salle. Sans passage depuis 60 jours, il est masqué par défaut.
      </p>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom', render: (r) => (
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{r.nom}</span>
                {r.partenaire && (
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">🤝 {r.partenaireStructure || 'partenaire'}</span>
                )}
              </div>
            ) },
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
              const abo = abonnementParNom.get(cleClientSite(r.site, r.nom))
              return abo ? <Badge tone={categorieTone(abo.categorie)}>{categorieLabel(abo.categorie)}</Badge> : <span className="text-gray-400">—</span>
            } },
            { key: 'statutAbo', label: 'Statut abo.', render: (r) => {
              const abo = abonnementParNom.get(cleClientSite(r.site, r.nom))
              if (!abo) return <span className="text-gray-400">Aucun</span>
              if (abo.aVenir) return <Badge tone="info">Débute le {formatDateShort(abo.dateDebut)}</Badge>
              return <Badge tone={abo.actif ? 'success' : 'neutral'}>{abo.actif ? `Actif jusqu'au ${formatDateShort(abo.dateFin)}` : 'Expiré'}</Badge>
            } },
            { key: 'telephone', label: 'Téléphone', render: (r) => r.telephone || '—' },
            { key: 'derniereVisite', label: 'Dernière visite', render: (r) => {
              const derniere = derniereVisiteParNom.get(cleClientSite(r.site, r.nom))
              const jours = joursDepuis(derniere)
              if (jours == null) return <span className="text-gray-400">—</span>
              return (
                <Badge tone={jours >= SEUIL_INACTIVITE_JOURS ? 'danger' : jours >= 7 ? 'warning' : 'success'}>
                  {formatDateShort(derniere)} ({jours === 0 ? "aujourd'hui" : `il y a ${jours} j`})
                </Badge>
              )
            } },
            { key: 'total', label: 'Total dépensé', align: 'right', render: (r) => <strong>{formatMoney(cumulParNom.get(cleClientSite(r.site, r.nom)) || 0)}</strong> },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            ...(peutSupprimer ? [{
              key: 'actions', label: '', align: 'right', render: (r) => (
                <button
                  onClick={(e) => { e.stopPropagation(); setToDelete(r) }}
                  title="Supprimer la fiche client"
                  className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100">
                  <Trash2 size={15} />
                </button>
              )
            }] : [])
          ]}
          rows={clientsAffiches}
          empty="Aucun client."
          onRowClick={(r) => setClientDetail(r.nom)}
        />
      </Card>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />

      {/* Confirmation de suppression d'une fiche client — réservée à l'administration.
          L'historique des séances / abonnements / présences n'est PAS effacé : seule
          la fiche du répertoire disparaît. */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette fiche client ?"
        {...glassModalProps('#dc2626')}
        footer={<>
          <Button variant="outline" onClick={() => setToDelete(null)} disabled={suppression}>Annuler</Button>
          <Button variant="danger" onClick={confirmerSuppression} loading={suppression}>
            <Trash2 size={15} /> Supprimer la fiche
          </Button>
        </>}>
        {toDelete && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                La fiche de <strong>{toDelete.nom}</strong> ({siteLabel(toDelete.site || 'lome')}) sera retirée du répertoire.
                L'historique des séances, abonnements et arrivées reste conservé.
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Si ce client refait une séance ou un abonnement, une nouvelle fiche réapparaîtra automatiquement à son nom.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
