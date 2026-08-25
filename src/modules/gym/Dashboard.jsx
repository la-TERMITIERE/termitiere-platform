// MAXI-GYM — Dashboard : KPI du mois — cliquer sur un KPI affiche le détail classé
// par catégorie (Simple/Classique/VIP), sans quitter la page.
import '../../utils/chartSetup'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Ticket, CreditCard, Wallet, Users, User, Flame, AlertTriangle, BellRing } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { updateItem } from '../../core/db'
import { sendWhatsApp } from '../../core/whatsapp'
import { notify } from '../../core/notify'
import { ROLES } from '../../core/roles'
import { todayStr, formatMoney, formatDateShort, addDays } from '../../utils/formatters'
import { CATEGORIES_GYM, categorieLabel, categorieTone, abonnementActif, joursDepuis, SEUIL_RELANCE_JOURS } from './data'
import ClientDetailModal from './ClientDetailModal'
import { glassModalProps, COULEUR_MODULE, avatarGradient } from '../../utils/color'
import { useSite, matchSite, siteLabel } from './site/useSite'

const COULEUR_BARRE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

// Podium — médaille + fond dégradé pour les 3 premiers d'un classement (clients les
// plus fréquents, top séances/abonnements) ; au-delà, simple numéro gris.
const RANG_PODIUM = [
  { medaille: '🥇', label: '1er', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', label: '2e',  bg: 'bg-gradient-to-r from-slate-100 to-gray-50',  ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', label: '3e',  bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

// Regroupe une liste de séances/abonnements par catégorie (Simple/Classique/VIP),
// avec le sous-total de chaque groupe — sert au détail affiché en cliquant un KPI.
function groupesParCategorie(liste) {
  return CATEGORIES_GYM.map((c) => {
    const lignes = liste.filter((x) => x.categorie === c.id).sort((a, b) => (a.date < b.date ? 1 : -1))
    // Sous-groupes séances/abonnements — un abonnement porte un `dateFin`, pas une
    // séance : sert à ne jamais mélanger les deux types dans la vue « Total ».
    const seancesLignes = lignes.filter((x) => !x.dateFin)
    const abonnementsLignes = lignes.filter((x) => x.dateFin)
    return { ...c, lignes, seancesLignes, abonnementsLignes, total: lignes.reduce((s, x) => s + (Number(x.montant) || 0), 0) }
  })
}

const DETAIL_INFO = {
  seances:     { titre: 'Séances ce mois', icon: Ticket },
  abonnements: { titre: 'Abonnements ce mois', icon: CreditCard },
  total:       { titre: 'Total encaissé ce mois', icon: Wallet },
  clients:     { titre: 'Clients', icon: Users }
}

// Salutation selon l'heure du moment — relit l'horloge à chaque montage du
// Dashboard (pas besoin de la tenir à jour en temps réel pour ce simple message).
function salutation() {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Horloge en direct affichée dans le bandeau — mise à jour chaque minute (pas
  // besoin de la seconde près pour ce simple repère visuel).
  const [heureActuelle, setHeureActuelle] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setHeureActuelle(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const site = useSite()
  const { data: allSeances }     = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients }     = useCollection('gym_clients')
  const { data: allPresences }   = useCollection('gym_presences')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const seances     = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const clients     = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const presences   = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const [detailModal, setDetailModal] = useState(null) // null | 'seances' | 'abonnements' | 'total' | 'clients'
  const [clientDetail, setClientDetail] = useState(null) // nom du client dont on affiche la fiche complète

  // Sélecteur de période partagé (mêmes presets et même emplacement — dans le
  // bandeau héro — que les autres Dashboards de l'app, ex. Briqueterie).
  const { start, end, preset, node: periodNode } = usePeriodSelect('mois')
  const dansPeriode = (d) => (d || '') >= start && (d || '') <= end
  const comparable = preset !== 'all'
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const dansPeriodePrecedente = (d) => comparable && (d || '') >= prevStart && (d || '') <= prevEnd

  const seancesMois     = useMemo(() => seances.filter((s) => dansPeriode(s.date)), [seances, start, end])
  const abonnementsMois = useMemo(() => abonnements.filter((a) => dansPeriode(a.date)), [abonnements, start, end])
  const totalEncaisseMois = useMemo(
    () => [...seancesMois, ...abonnementsMois].reduce((s, x) => s + (Number(x.montant) || 0), 0),
    [seancesMois, abonnementsMois]
  )

  const seancesMoisPrecedent     = useMemo(() => seances.filter((s) => dansPeriodePrecedente(s.date)), [seances, prevStart, prevEnd, comparable])
  const abonnementsMoisPrecedent = useMemo(() => abonnements.filter((a) => dansPeriodePrecedente(a.date)), [abonnements, prevStart, prevEnd, comparable])
  const totalEncaisseMoisPrecedent = useMemo(
    () => [...seancesMoisPrecedent, ...abonnementsMoisPrecedent].reduce((s, x) => s + (Number(x.montant) || 0), 0),
    [seancesMoisPrecedent, abonnementsMoisPrecedent]
  )
  const nouveauxClientsMois = useMemo(
    () => clients.filter((c) => c.createdAt && dansPeriode(new Date(c.createdAt).toISOString().slice(0, 10))).length,
    [clients, start, end]
  )

  // Répartition séances/abonnements CLASSÉE SÉPARÉMENT (deux diagrammes en bande
  // distincts, jamais mélangés) — chaque catégorie garde sa couleur (COULEUR_BARRE).
  const parCategorieFn = (liste, total) => CATEGORIES_GYM.map((c) => {
    const lignes = liste.filter((x) => x.categorie === c.id)
    const montant = lignes.reduce((s, x) => s + (Number(x.montant) || 0), 0)
    return { ...c, nb: lignes.length, montant, pct: total > 0 ? Math.round((montant / total) * 100) : 0 }
  })
  const totalSeancesMois = useMemo(() => seancesMois.reduce((s, x) => s + (Number(x.montant) || 0), 0), [seancesMois])
  const totalAbonnementsMois = useMemo(() => abonnementsMois.reduce((s, x) => s + (Number(x.montant) || 0), 0), [abonnementsMois])
  const seancesParCategorie = useMemo(() => parCategorieFn(seancesMois, totalSeancesMois), [seancesMois, totalSeancesMois])
  const abonnementsParCategorie = useMemo(() => parCategorieFn(abonnementsMois, totalAbonnementsMois), [abonnementsMois, totalAbonnementsMois])

  // Activité récente (séances + abonnements confondus) — les derniers enregistrements,
  // toujours utile même avec peu de données (contrairement à un graphique sur 7 jours,
  // vide et peu parlant tant qu'il n'y a pas assez d'historique).
  const activiteRecente = useMemo(() => {
    const s = seances.map((x) => ({ ...x, type: 'seance' }))
    const a = abonnements.map((x) => ({ ...x, type: 'abonnement' }))
    return [...s, ...a].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, 8)
  }, [seances, abonnements])

  const barData = (groupes) => ({
    labels: groupes.map((g) => g.label),
    datasets: [{
      data: groupes.map((g) => g.montant),
      backgroundColor: groupes.map((g) => COULEUR_BARRE[g.id]),
      borderRadius: 8, maxBarThickness: 64
    }]
  })
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${formatMoney(ctx.parsed.y)}` } }
    },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatMoney(v) } } }
  }

  // Clients les plus fréquents (toutes périodes confondues) — classés par nombre
  // de passages (séances + abonnements), pas par montant dépensé.
  const clientsFideles = useMemo(() => {
    const parClient = new Map()
    for (const x of [...seances, ...abonnements]) {
      const nom = (x.clientNom || '').trim()
      if (!nom) continue
      const c = parClient.get(nom) || { nom, nb: 0, montant: 0 }
      c.nb += 1
      c.montant += Number(x.montant) || 0
      parClient.set(nom, c)
    }
    return [...parClient.values()].sort((a, b) => b.nb - a.nb).slice(0, 5)
  }, [seances, abonnements])

  // Abonnements arrivant à échéance dans les 7 prochains jours — pour relancer les
  // clients avant l'expiration plutôt que de les perdre silencieusement.
  const abonnementsExpirentBientot = useMemo(() => {
    const aujourdhui = todayStr()
    const limite = new Date()
    limite.setDate(limite.getDate() + 7)
    const limiteStr = limite.toISOString().slice(0, 10)
    return abonnements
      .filter((a) => a.dateFin && a.dateFin >= aujourdhui && a.dateFin <= limiteStr)
      .sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1))
      .map((a) => ({ ...a, joursRestants: Math.ceil((new Date(a.dateFin) - new Date(aujourdhui)) / 86400000) }))
  }, [abonnements])

  // Abonnés actifs qui ne sont pas venus depuis SEUIL_RELANCE_JOURS (7 j) — dernière
  // arrivée pointée dans gym_presences (Abonnements.jsx), ou date de souscription si
  // jamais pointée. Un seul abonné par nom, même s'il a plusieurs abonnements actifs.
  const abonnesInactifs = useMemo(() => {
    const dernierePresenceParClient = new Map()
    for (const p of presences) {
      const cle = (p.clientNom || '').trim().toLowerCase()
      if (!cle) continue
      if (!dernierePresenceParClient.has(cle) || p.date > dernierePresenceParClient.get(cle)) dernierePresenceParClient.set(cle, p.date)
    }
    const vus = new Set()
    const resultats = []
    for (const a of abonnements) {
      if (!abonnementActif(a.dateFin)) continue
      const cle = (a.clientNom || '').trim().toLowerCase()
      if (!cle || vus.has(cle)) continue
      vus.add(cle)
      const derniere = dernierePresenceParClient.get(cle) || a.date
      const jours = joursDepuis(derniere)
      if (jours != null && jours >= SEUIL_RELANCE_JOURS) {
        resultats.push({ clientNom: a.clientNom, jours, derniere })
      }
    }
    return resultats.sort((x, y) => y.jours - x.jours)
  }, [abonnements, presences])

  // Alarme abonné inactif — best-effort : se déclenche quand cet écran est ouvert et
  // détecte un abonné fraîchement passé sous le seuil d'inactivité (une seule fois
  // par période d'inactivité, via `derniereRelanceLe` sur la fiche client).
  //  1. Alerte l'ÉQUIPE (cloche + push, tous les comptes ayant accès à MAXI-GYM) —
  //     fonctionne dès maintenant, sans configuration supplémentaire.
  //  2. Relance le CLIENT par WhatsApp si son numéro est connu — n'aura vraiment
  //     d'effet qu'une fois WHATSAPP_TOKEN/WHATSAPP_PHONE_ID configurés (cf.
  //     NOTIFICATIONS_WHATSAPP.md) ; ignoré silencieusement en attendant.
  useEffect(() => {
    for (const ab of abonnesInactifs) {
      const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === ab.clientNom.trim().toLowerCase())
      if (!client) continue
      const dejaAlerte = client.derniereRelanceLe && client.derniereRelanceLe > new Date(ab.derniere).getTime()
      if (dejaAlerte) continue
      notify({
        type: 'alerte',
        title: `🔔 Abonné à relancer — MAXI-GYM ${siteLabel(site)}`,
        body: `${ab.clientNom} n'est pas venu depuis ${ab.jours} jours alors que son abonnement est toujours actif.`,
        module: 'gym', forRoles: ROLES.map((r) => r.value), link: `/gym/${site}`
      }).catch(() => {})
      if (client.telephone) {
        sendWhatsApp([client.telephone], {
          title: '👋 MAXI-GYM',
          body: `Bonjour ${ab.clientNom}, ça fait ${ab.jours} jours qu'on ne vous a pas vu à MAXI-GYM ! Votre abonnement est toujours actif — on vous attend pour votre prochaine séance. 💪`
        })
      }
      updateItem('gym_clients', client.id, { derniereRelanceLe: Date.now() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abonnesInactifs, clients])

  const groupesModal = useMemo(() => {
    if (detailModal === 'seances')     return groupesParCategorie(seancesMois)
    if (detailModal === 'abonnements') return groupesParCategorie(abonnementsMois)
    if (detailModal === 'total')       return groupesParCategorie([...seancesMois, ...abonnementsMois])
    return []
  }, [detailModal, seancesMois, abonnementsMois])

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          {/* Anneau tournant — le logo reste fixe et net, seul le halo dégradé tourne
              autour, comme un contour lumineux qui balaye le badge en continu. */}
          <style>{`
            @keyframes gym-ring-spin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #ffffff00, #ffffffe6 35%, #ffffff00 70%)',
            animation: 'gym-ring-spin 2.2s linear infinite'
          }} />
          <img src="/Maxi_Gym.png" alt="MAXI-GYM"
            style={{
              position: 'relative', width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
              background: 'white', padding: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold sm:text-xl">{salutation()}, {user?.nom || user?.login || ''} 👋</h2>
          <p className="whitespace-nowrap text-sm text-white/80">
            MAXI-GYM {siteLabel(site)} · {heureActuelle.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:font-semibold [&_.input-base]:text-white [&_label]:font-bold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Séances" value={seancesMois.length} icon={Ticket} accent={COULEUR} onClick={() => setDetailModal('seances')}
          variation={comparable ? seancesMois.length - seancesMoisPrecedent.length : undefined} variationLabel="période préc. · cliquer" />
        <StatCard title="Abonnements" value={abonnementsMois.length} icon={CreditCard} accent={COULEUR2} onClick={() => setDetailModal('abonnements')}
          variation={comparable ? abonnementsMois.length - abonnementsMoisPrecedent.length : undefined} variationLabel="période préc. · cliquer" />
        <StatCard title="Total encaissé" value={formatMoney(totalEncaisseMois)} icon={Wallet} accent={COULEUR} onClick={() => setDetailModal('total')}
          variation={comparable ? totalEncaisseMois - totalEncaisseMoisPrecedent : undefined}
          variationLabel={comparable ? `${formatMoney(totalEncaisseMoisPrecedent)} · période préc.` : undefined} />
        <StatCard title="Clients" value={clients.length} icon={Users} accent={COULEUR2} onClick={() => setDetailModal('clients')}
          sub={nouveauxClientsMois > 0 ? `+${nouveauxClientsMois} nouveau${nouveauxClientsMois > 1 ? 'x' : ''} sur la période` : undefined} />
      </div>

      {abonnementsExpirentBientot.length > 0 && (
        <Card title="⏰ Abonnements à renouveler bientôt">
          <div className="space-y-2">
            {abonnementsExpirentBientot.map((a) => (
              <button key={a.id} onClick={() => setClientDetail(a.clientNom)}
                className="flex w-full items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-left transition-colors hover:bg-amber-100">
                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-800">{a.clientNom}</p>
                  <p className="text-xs text-gray-500">
                    <Badge tone={categorieTone(a.categorie)}>{categorieLabel(a.categorie)}</Badge>
                    {' '}expire le {formatDateShort(a.dateFin)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-amber-700">
                  {a.joursRestants <= 0 ? "Aujourd'hui" : a.joursRestants === 1 ? 'Demain' : `Dans ${a.joursRestants} jours`}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {abonnesInactifs.length > 0 && (
        <Card title="🔔 Abonnés à relancer — inactifs depuis 7 jours ou plus">
          <div className="space-y-2">
            {abonnesInactifs.map((a) => (
              <button key={a.clientNom} onClick={() => setClientDetail(a.clientNom)}
                className="flex w-full items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-left transition-colors hover:bg-red-100">
                <BellRing size={16} className="shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-800">{a.clientNom}</p>
                  <p className="text-xs text-gray-500">Dernière arrivée : {formatDateShort(a.derniere)}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-red-700">Il y a {a.jours} jours</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🕒 Activité récente">
          {activiteRecente.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune activité pour l'instant.</p>
          ) : (
            <div className="space-y-1.5">
              {activiteRecente.map((x) => (
                <button key={x.id} onClick={() => setClientDetail(x.clientNom)}
                  className="flex w-full items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: avatarGradient(x.clientNom) }}>
                    <User size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-800">{x.clientNom}</p>
                    <p className="text-[11px] text-gray-400">
                      <Badge tone={x.type === 'abonnement' ? 'purple' : 'info'}>{x.type === 'abonnement' ? 'Abonnement' : 'Séance'}</Badge>
                      {' '}{categorieLabel(x.categorie)} · {formatDateShort(x.date)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-gray-700">{formatMoney(x.montant)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Clients les plus fréquents">
          {clientsFideles.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Aucun client pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {clientsFideles.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="relative shrink-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm" style={{ background: avatarGradient(c.nom) }}>
                        <User size={16} />
                      </span>
                      {podium ? (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs leading-none shadow ring-1 ring-gray-200" title={podium.label}>
                          {podium.medaille}
                        </span>
                      ) : (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-extrabold text-white shadow ring-1 ring-white">
                          {i + 1}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-gray-800">{c.nom}</p>
                      <p className="text-xs text-gray-500">{formatMoney(c.montant)} au total</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: COULEUR }}>
                      <Flame size={14} /> {c.nb} passage{c.nb > 1 ? 's' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Bento : deux diagrammes EN BANDE classés (séances / abonnements), jamais
          mélangés — chaque catégorie garde sa couleur (cf. COULEUR_BARRE) dans les deux. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="🎫 Séances par catégorie">
          {totalSeancesMois === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune séance sur cette période.</p>
          ) : (
            <div style={{ height: 220 }}>
              <Bar data={barData(seancesParCategorie)} options={barOptions} />
            </div>
          )}
        </Card>

        <Card title="💳 Abonnements par catégorie">
          {totalAbonnementsMois === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun abonnement sur cette période.</p>
          ) : (
            <div style={{ height: 220 }}>
              <Bar data={barData(abonnementsParCategorie)} options={barOptions} />
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={detailModal ? DETAIL_INFO[detailModal].titre : ''}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <Button variant="ghost" onClick={() => setDetailModal(null)}>Fermer</Button>
          {detailModal === 'clients' && <Button onClick={() => navigate(`/gym/${site}/clients`)}>Gérer les clients</Button>}
        </>}>
        {detailModal && (() => {
          const Icon = DETAIL_INFO[detailModal].icon
          return (
            <div className="space-y-4">
              {/* Bandeau héro — même dégradé/badge lumineux que l'en-tête du volet. */}
              <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,133,15,0.35),0_8px_20px_-8px_rgba(232,133,15,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
                  <Icon size={22} color="white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{DETAIL_INFO[detailModal].titre}</p>
                  <p className="text-sm text-white/80">Cliquer un client pour voir sa fiche complète</p>
                </div>
              </div>

              {detailModal === 'clients' ? (
                <div className="space-y-2">
                  {clients.length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-400">Aucun client enregistré pour l'instant.</p>
                  )}
                  {[...clients].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((c) => (
                    <button key={c.id} onClick={() => { setDetailModal(null); setClientDetail(c.nom) }}
                      className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
                      <p className="font-semibold text-gray-800">{c.nom}</p>
                      <p className="text-sm text-gray-600">📞 {c.telephone || '—'}</p>
                      {c.notes && <p className="mt-1 text-xs text-gray-500">📝 {c.notes}</p>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {groupesModal.every((g) => g.lignes.length === 0) && (
                    <p className="py-4 text-center text-sm text-gray-400">Rien à afficher pour l'instant.</p>
                  )}
                  {groupesModal.filter((g) => g.lignes.length > 0).map((g) => {
                    const ligneBtn = (l) => (
                      <button key={l.id} onClick={() => { setDetailModal(null); setClientDetail(l.clientNom) }}
                        className="flex w-full items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-orange-50">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-800">{l.clientNom}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatDateShort(l.date)}
                            {l.dateFin && <> · jusqu'au {formatDateShort(l.dateFin)}</>}
                          </p>
                        </div>
                        <span className="shrink-0 font-bold text-gray-700">{formatMoney(l.montant)}</span>
                      </button>
                    )
                    return (
                      <div key={g.id} className="overflow-hidden rounded-2xl border-l-4 bg-gray-50 p-3" style={{ borderColor: COULEUR_BARRE[g.id] }}>
                        <div className="mb-2 flex items-center justify-between">
                          <Badge tone={g.tone}>{g.label}</Badge>
                          <span className="text-sm font-bold text-gray-700">{formatMoney(g.total)}</span>
                        </div>
                        {/* Vue « Total » : séances et abonnements classés séparément, jamais mélangés. */}
                        {detailModal === 'total' ? (
                          <div className="space-y-2.5">
                            {g.seancesLignes.length > 0 && (
                              <div>
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">🎫 Séances</p>
                                <div className="space-y-1">{g.seancesLignes.map(ligneBtn)}</div>
                              </div>
                            )}
                            {g.abonnementsLignes.length > 0 && (
                              <div>
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">💳 Abonnements</p>
                                <div className="space-y-1">{g.abonnementsLignes.map(ligneBtn)}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">{g.lignes.map(ligneBtn)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
    </div>
  )
}
