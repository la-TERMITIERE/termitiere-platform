// MAXI-GYM — Pilotage & Analyses : tendances, répartition et aide à la décision.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, Minus, Lightbulb, CreditCard, Wallet, Coins, Ticket, Flame, User } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, todayStr } from '../../utils/formatters'
import { CATEGORIES_GYM, categorieLabel, categorieTone, derniersMoisGym, croissanceGym } from './data'
import ClientDetailModal from './ClientDetailModal'
import { avatarGradient } from '../../utils/color'
import { useSite, matchSite } from './site/useSite'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'
const COULEUR_BARRE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }

// Podium — médaille + fond dégradé pour les 3 premiers d'un classement ; au-delà,
// simple numéro gris (même recette que Dashboard.jsx).
const RANG_PODIUM = [
  { medaille: '🥇', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', bg: 'bg-gradient-to-r from-slate-100 to-gray-50',  ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

export default function Pilotage() {
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
  const [clientDetail, setClientDetail] = useState(null)

  const toutes = useMemo(() => [...seances, ...abonnements], [seances, abonnements])
  const totalCumule = useMemo(() => toutes.reduce((s, x) => s + (Number(x.montant) || 0), 0), [toutes])

  // Mois de référence — les 6 mois affichés se terminent ici (par défaut : le mois en cours).
  const [moisRef, setMoisRef] = useState(todayStr().slice(0, 7))
  const ancre = useMemo(() => {
    const [a, m] = moisRef.split('-').map(Number)
    return new Date(a, m - 1, 1)
  }, [moisRef])
  const mois6 = useMemo(() => derniersMoisGym(6, ancre), [ancre])
  const parMois = useMemo(() => mois6.map((m) => {
    const s = seances.filter((x) => (x.date || '').startsWith(m.prefixe))
    const a = abonnements.filter((x) => (x.date || '').startsWith(m.prefixe))
    return {
      ...m,
      revenuSeances: s.reduce((sum, x) => sum + (Number(x.montant) || 0), 0),
      revenuAbonnements: a.reduce((sum, x) => sum + (Number(x.montant) || 0), 0),
      nbSeances: s.length, nbAbonnements: a.length
    }
  }), [mois6, seances, abonnements])

  const moisActuel = parMois[parMois.length - 1]
  const moisPrecedent = parMois[parMois.length - 2]
  const caMoisActuel = (moisActuel?.revenuSeances || 0) + (moisActuel?.revenuAbonnements || 0)
  const caMoisPrecedent = (moisPrecedent?.revenuSeances || 0) + (moisPrecedent?.revenuAbonnements || 0)
  const croissance = croissanceGym(caMoisActuel, caMoisPrecedent)

  // Répartition par catégorie sur les 6 derniers mois (séances + abonnements).
  const parCategorie = useMemo(() => {
    const recentes = toutes.filter((x) => mois6.some((m) => (x.date || '').startsWith(m.prefixe)))
    const totalPeriode = recentes.reduce((s, x) => s + (Number(x.montant) || 0), 0)
    return CATEGORIES_GYM.map((c) => {
      const lignes = recentes.filter((x) => x.categorie === c.id)
      const montant = lignes.reduce((s, x) => s + (Number(x.montant) || 0), 0)
      return { ...c, nb: lignes.length, montant, pct: totalPeriode > 0 ? Math.round((montant / totalPeriode) * 100) : 0 }
    }).sort((a, b) => b.montant - a.montant)
  }, [toutes, mois6])

  const chartData = {
    labels: parMois.map((m) => m.label),
    datasets: [
      { label: 'Séances', data: parMois.map((m) => m.revenuSeances), backgroundColor: `${COULEUR}cc`, borderColor: COULEUR, borderWidth: 1, borderRadius: 6 },
      { label: 'Abonnements', data: parMois.map((m) => m.revenuAbonnements), backgroundColor: `${COULEUR2}cc`, borderColor: COULEUR2, borderWidth: 1, borderRadius: 6 }
    ]
  }

  // Séances par jour du mois de référence — pour repérer les jours les plus/moins fréquentés.
  const seancesParJour = useMemo(() => {
    const [a, m] = moisRef.split('-').map(Number)
    const nbJours = new Date(a, m, 0).getDate()
    const compte = new Array(nbJours).fill(0)
    for (const s of seances) {
      if (!(s.date || '').startsWith(moisRef)) continue
      const jour = Number(s.date.slice(8, 10))
      if (jour >= 1 && jour <= nbJours) compte[jour - 1] += 1
    }
    return compte
  }, [seances, moisRef])
  const chartJournalier = {
    labels: seancesParJour.map((_, i) => String(i + 1)),
    datasets: [{ label: 'Séances', data: seancesParJour, backgroundColor: `${COULEUR}cc`, borderColor: COULEUR, borderWidth: 1, borderRadius: 4 }]
  }

  // Top clients — séances et abonnements comptés séparément (nombre d'entrées, pas montant).
  function topClients(liste, n = 5) {
    const m = new Map()
    for (const x of liste) {
      const nom = (x.clientNom || '').trim()
      if (!nom) continue
      m.set(nom, (m.get(nom) || 0) + 1)
    }
    return [...m.entries()].map(([nom, nb]) => ({ nom, nb })).sort((a, b) => b.nb - a.nb).slice(0, n)
  }
  const topSeances = useMemo(() => topClients(seances), [seances])
  const topAbonnements = useMemo(() => topClients(abonnements), [abonnements])

  // Aide à la décision — quelques constats calculés automatiquement.
  const categoriePrincipale = parCategorie[0]
  const revenuAbonnementsTotal = abonnements.reduce((s, x) => s + (Number(x.montant) || 0), 0)
  const pctAbonnements = totalCumule > 0 ? Math.round((revenuAbonnementsTotal / totalCumule) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <TrendingUp size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Pilotage & Analyses</h2>
          <p className="text-sm text-white/80">Tendances et aide à la décision — MAXI-GYM</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">Mois de référence (les 6 derniers mois affichés se terminent ici)</label>
        <input type="month" value={moisRef} onChange={(e) => setMoisRef(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Chiffre d'affaires cumulé" value={formatMoney(totalCumule)} icon={Wallet} accent={COULEUR} />
        <StatCard title="CA du mois sélectionné" value={formatMoney(caMoisActuel)} icon={Coins} accent={COULEUR2} />
        <StatCard
          title="Évolution vs mois dernier"
          value={croissance === null ? '—' : `${croissance >= 0 ? '+' : ''}${croissance}%`}
          icon={croissance === null ? Minus : croissance >= 0 ? TrendingUp : TrendingDown}
          accent={croissance === null ? '#94a3b8' : croissance >= 0 ? '#16a34a' : '#dc2626'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard title="Séances (total)" value={seances.length} icon={Ticket} accent={COULEUR} />
        <StatCard title="Abonnements (total)" value={abonnements.length} icon={CreditCard} accent={COULEUR2} />
      </div>

      <Card title="Revenu des 6 derniers mois — séances vs abonnements">
        <div style={{ height: 260 }}>
          <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
        </div>
      </Card>

      <Card title={`Séances par jour — ${moisRef}`}>
        {seancesParJour.every((n) => n === 0) ? (
          <p className="py-4 text-center text-sm text-gray-400">Aucune séance ce mois-ci.</p>
        ) : (
          <div style={{ height: 220 }}>
            <Bar data={chartJournalier} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🏆 Top séances (par client)">
          {topSeances.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Aucune séance pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {topSeances.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="relative shrink-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm" style={{ background: avatarGradient(c.nom) }}>
                        <User size={15} />
                      </span>
                      {podium ? (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs leading-none shadow ring-1 ring-gray-200">{podium.medaille}</span>
                      ) : (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-extrabold text-white shadow ring-1 ring-white">{i + 1}</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate font-bold text-gray-800">{c.nom}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: COULEUR }}>
                      <Flame size={13} /> {c.nb}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="🏆 Top abonnements (par client)">
          {topAbonnements.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Aucun abonnement pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {topAbonnements.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="relative shrink-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm" style={{ background: avatarGradient(c.nom) }}>
                        <User size={15} />
                      </span>
                      {podium ? (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs leading-none shadow ring-1 ring-gray-200">{podium.medaille}</span>
                      ) : (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-extrabold text-white shadow ring-1 ring-white">{i + 1}</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate font-bold text-gray-800">{c.nom}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: COULEUR2 }}>
                      <Flame size={13} /> {c.nb}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Répartition par catégorie (6 derniers mois)">
        {parCategorie.every((c) => c.montant === 0) ? (
          <p className="py-4 text-center text-sm text-gray-400">Pas encore assez de données.</p>
        ) : (
          <div className="space-y-2.5">
            {parCategorie.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border-l-4 bg-gray-50 p-3 transition-colors hover:bg-gray-100/70" style={{ borderColor: COULEUR_BARRE[c.id] }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.tone}>{c.label}</Badge>
                    <span className="text-xs text-gray-500">{c.nb} entrée{c.nb > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-base font-extrabold text-gray-800">{formatMoney(c.montant)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-200/70">
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${c.pct}%`, background: COULEUR_BARRE[c.id] }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs font-bold text-gray-500">{c.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="💡 Aide à la décision">
        <div className="space-y-2.5 text-sm text-gray-700">
          {totalCumule === 0 ? (
            <p className="flex items-start gap-2 text-gray-400"><Lightbulb size={16} className="mt-0.5 shrink-0" /> Pas encore assez de données pour dégager une tendance — revenez après quelques séances/abonnements enregistrés.</p>
          ) : (
            <>
              {categoriePrincipale && categoriePrincipale.montant > 0 && (
                <p className="flex items-start gap-2">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  La catégorie <strong>{categorieLabel(categoriePrincipale.id)}</strong> génère le plus de revenu ({categoriePrincipale.pct}% du chiffre d'affaires des 6 derniers mois) — c'est votre offre la plus demandée.
                </p>
              )}
              <p className="flex items-start gap-2">
                <CreditCard size={16} className="mt-0.5 shrink-0 text-amber-500" />
                Les abonnements représentent <strong>{pctAbonnements}%</strong> du chiffre d'affaires cumulé, contre <strong>{100 - pctAbonnements}%</strong> pour les séances ponctuelles — {pctAbonnements >= 50 ? 'un bon signe de fidélisation' : 'il y a peut-être une marge pour convertir plus de clients occasionnels en abonnés'}.
              </p>
              {croissance !== null && (
                <p className="flex items-start gap-2">
                  {croissance >= 0 ? <TrendingUp size={16} className="mt-0.5 shrink-0 text-green-600" /> : <TrendingDown size={16} className="mt-0.5 shrink-0 text-red-600" />}
                  Le chiffre d'affaires est {croissance >= 0 ? 'en hausse' : 'en baisse'} de <strong>{Math.abs(croissance)}%</strong> par rapport au mois précédent.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
    </div>
  )
}
