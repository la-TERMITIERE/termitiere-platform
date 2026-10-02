// MAXI-GYM — Pilotage & Analyses : tendances, répartition et aide à la décision.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, Minus, Lightbulb, CreditCard, Wallet, Coins, Ticket, Flame, User, Calendar, PieChart, Users } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, todayStr } from '../../utils/formatters'
import { CATEGORIES_GYM, categorieLabel, categorieTone, derniersMoisGym, croissanceGym, SEXES, indexSexeClients, statsSexe } from './data'
import { SexeDonut } from './SexeUI'
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

  // Mois de référence — les 6 mois affichés se terminent ici (par défaut : le mois en
  // cours). Même sélecteur Jour/Mois/Année/Plage que le reste de MAXI-GYM : quel que
  // soit le mode choisi, on en déduit le mois d'ancrage (le jour → son mois, l'année →
  // décembre ou le mois en cours si c'est l'année en cours, la plage → le mois de sa fin).
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const moisRef = useMemo(() => {
    const auj = todayStr()
    if (modePeriode === 'jour') return (filtreJour || auj).slice(0, 7)
    if (modePeriode === 'annee') {
      const an = filtreAnnee || auj.slice(0, 4)
      return an === auj.slice(0, 4) ? auj.slice(0, 7) : `${an}-12`
    }
    if (modePeriode === 'plage') return (filtreFin || auj).slice(0, 7)
    return filtreMois || auj.slice(0, 7)
  }, [modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
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

  // Proportion femmes / hommes sur les 6 mois affichés — personnes distinctes (une
  // cliente venue 10 fois compte pour 1), avec le détail séances / abonnements / CA.
  const idxSexe = useMemo(() => indexSexeClients(clients), [clients])
  const sexeStats = useMemo(() => {
    const dansFenetre = (x) => mois6.some((m) => (x.date || '').startsWith(m.prefixe))
    const s6 = seances.filter(dansFenetre)
    const a6 = abonnements.filter(dansFenetre)
    return { tout: statsSexe([s6, a6], idxSexe), seances: statsSexe([s6], idxSexe), abonnements: statsSexe([a6], idxSexe) }
  }, [seances, abonnements, mois6, idxSexe])

  // Dégradé vertical (clair → couleur pleine) par barre — même recette que le
  // Dashboard, plus esthétique qu'un aplat uni. `chartArea` n'existe qu'une fois le
  // premier rendu fait ; on retombe sur la couleur pleine avant ça (évite un crash).
  const degradeVertical = (ctx, couleur) => {
    const { chartArea, ctx: c } = ctx.chart
    if (!chartArea) return couleur
    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
    gradient.addColorStop(0, couleur)
    gradient.addColorStop(1, couleur + '99')
    return gradient
  }
  const optionsGraphe = (money = true, afficherLegende = true) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: afficherLegende, position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true, font: { weight: 'bold' } } },
      tooltip: {
        backgroundColor: 'rgba(30,30,30,0.9)', padding: 10, cornerRadius: 10, displayColors: afficherLegende,
        titleFont: { weight: 'bold' },
        callbacks: { label: (ctx) => ` ${afficherLegende ? ctx.dataset.label + ': ' : ''}${money ? formatMoney(ctx.parsed.y) : ctx.parsed.y}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { weight: 'bold' } } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: money ? undefined : 1, callback: (v) => money ? formatMoney(v) : v } }
    }
  })
  const chartData = {
    labels: parMois.map((m) => m.label),
    datasets: [
      { label: 'Séances', data: parMois.map((m) => m.revenuSeances), backgroundColor: (ctx) => degradeVertical(ctx, COULEUR), hoverBackgroundColor: COULEUR, borderRadius: 8, borderSkipped: false, maxBarThickness: 40 },
      { label: 'Abonnements', data: parMois.map((m) => m.revenuAbonnements), backgroundColor: (ctx) => degradeVertical(ctx, COULEUR2), hoverBackgroundColor: COULEUR2, borderRadius: 8, borderSkipped: false, maxBarThickness: 40 }
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
    datasets: [{ label: 'Séances', data: seancesParJour, backgroundColor: (ctx) => degradeVertical(ctx, COULEUR), hoverBackgroundColor: COULEUR, borderRadius: 6, borderSkipped: false, maxBarThickness: 22 }]
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

  // Ombre « 3D » des avatars/badges — liseré clair en haut, ombre interne sombre en
  // bas, ombre portée : même recette que le Dashboard, pour un rendu bombé/glossy.
  const OMBRE_3D = '0 6px 14px -4px rgba(0,0,0,0.35), inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.25)'

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          {/* Anneau tournant — même recette que le Dashboard : le badge reste net,
              seul le halo dégradé balaye son contour en continu. */}
          <style>{`
            @keyframes gym-pilotage-ring-spin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #ffffff00, #ffffffe6 35%, #ffffff00 70%)',
            animation: 'gym-pilotage-ring-spin 2.2s linear infinite'
          }} />
          <div style={{
            position: 'relative', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <TrendingUp size={28} color="white" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Pilotage & Analyses</h2>
          <p className="text-sm text-white/80">Tendances et aide à la décision : MAXI-GYM</p>
        </div>
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>
      <p className="-mt-2 text-xs text-gray-400">Les 6 derniers mois affichés se terminent au mois d'ancrage choisi ci-dessus.</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard glass title="Chiffre d'affaires cumulé" value={formatMoney(totalCumule)} icon={Wallet} accent={COULEUR} />
        <StatCard glass title="CA du mois sélectionné" value={formatMoney(caMoisActuel)} icon={Coins} accent={COULEUR2} />
        <StatCard glass
          title="Évolution vs mois dernier"
          value={croissance === null ? '—' : `${croissance >= 0 ? '+' : ''}${croissance}%`}
          icon={croissance === null ? Minus : croissance >= 0 ? TrendingUp : TrendingDown}
          accent={croissance === null ? '#94a3b8' : croissance >= 0 ? '#16a34a' : '#dc2626'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard glass title="Séances (total)" value={seances.length} icon={Ticket} accent={COULEUR} />
        <StatCard glass title="Abonnements (total)" value={abonnements.length} icon={CreditCard} accent={COULEUR2} />
      </div>

      <Card title="Revenu des 6 derniers mois : séances vs abonnements"
        className="overflow-hidden border-orange-100/60 bg-gradient-to-br from-orange-50/50 via-white to-white">
        <div style={{ height: 260 }}>
          <Bar data={chartData} options={optionsGraphe(true, true)} />
        </div>
      </Card>

      <Card title={`Séances par jour : ${moisRef}`}
        className="overflow-hidden border-orange-100/60 bg-gradient-to-br from-orange-50/50 via-white to-white">
        {seancesParJour.every((n) => n === 0) ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100/70 text-orange-300">
              <Calendar size={22} />
            </span>
            <p className="text-sm text-gray-400">Aucune séance ce mois-ci.</p>
          </div>
        ) : (
          <div style={{ height: 220 }}>
            <Bar data={chartJournalier} options={optionsGraphe(false, false)} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🏆 Top séances (par client)"
          className="overflow-hidden border-orange-100/60 bg-gradient-to-br from-orange-50/50 via-white to-white">
          {topSeances.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100/70 text-orange-300">
                <Flame size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucune séance pour l'instant.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topSeances.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="relative shrink-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: avatarGradient(c.nom), boxShadow: OMBRE_3D }}>
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

        <Card title="🏆 Top abonnements (par client)"
          className="overflow-hidden border-red-100/60 bg-gradient-to-br from-red-50/50 via-white to-white">
          {topAbonnements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100/70 text-red-300">
                <Flame size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucun abonnement pour l'instant.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topAbonnements.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="relative shrink-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: avatarGradient(c.nom), boxShadow: OMBRE_3D }}>
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

      <Card title="Répartition par catégorie (6 derniers mois)"
        className="overflow-hidden border-amber-100/60 bg-gradient-to-br from-amber-50/50 via-white to-white">
        {parCategorie.every((c) => c.montant === 0) ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100/70 text-amber-300">
              <PieChart size={22} />
            </span>
            <p className="text-sm text-gray-400">Pas encore assez de données.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {parCategorie.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border-l-4 bg-white/70 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md" style={{ borderColor: COULEUR_BARRE[c.id] }}>
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

      <Card title="⚥ Proportion femmes / hommes (6 derniers mois)"
        className="overflow-hidden border-pink-100/60 bg-gradient-to-br from-pink-50/40 via-white to-sky-50/40">
        {sexeStats.tout.connus === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100/70 text-pink-300">
              <Users size={22} />
            </span>
            <p className="text-sm text-gray-400">Le sexe n'est pas encore renseigné : il se saisit à l'enregistrement d'une séance ou d'un abonnement, ou sur la fiche client.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-6">
            <SexeDonut stats={sexeStats.tout} />
            <div className="min-w-[240px] flex-1 space-y-2.5">
              {SEXES.map((sx) => {
                const pct = sx.id === 'F' ? sexeStats.tout.pctF : sexeStats.tout.pctH
                return (
                  <div key={sx.id} className="overflow-hidden rounded-xl border-l-4 bg-white/70 p-3 shadow-sm backdrop-blur-sm" style={{ borderColor: sx.couleur }}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-bold text-gray-800">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-white" style={{ background: sx.couleur }}>{sx.symbole}</span>
                        {sx.court}
                      </span>
                      <span className="text-xl font-extrabold" style={{ color: sx.couleur }}>{pct}%</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      <strong className="text-gray-700">{sexeStats.tout[sx.id].personnes}</strong> personne{sexeStats.tout[sx.id].personnes > 1 ? 's' : ''} ·{' '}
                      {sexeStats.seances[sx.id].nb} séance{sexeStats.seances[sx.id].nb > 1 ? 's' : ''} ·{' '}
                      {sexeStats.abonnements[sx.id].nb} abonnement{sexeStats.abonnements[sx.id].nb > 1 ? 's' : ''} ·{' '}
                      <strong className="text-gray-700">{formatMoney(sexeStats.tout[sx.id].montant)}</strong>
                    </p>
                  </div>
                )
              })}
              {sexeStats.tout.inconnu.personnes > 0 && (
                <p className="text-[11px] text-gray-400">
                  {sexeStats.tout.inconnu.personnes} personne{sexeStats.tout.inconnu.personnes > 1 ? 's' : ''} sans sexe renseigné ne figure{sexeStats.tout.inconnu.personnes > 1 ? 'nt' : ''} pas dans le graphique (à compléter sur la fiche client).
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="💡 Aide à la décision"
        className="overflow-hidden border-orange-100/50 bg-gradient-to-br from-orange-50/30 via-red-50/10 to-white">
        <div className="space-y-2.5 text-sm text-gray-700">
          {totalCumule === 0 ? (
            <p className="flex items-start gap-2 text-gray-400"><Lightbulb size={16} className="mt-0.5 shrink-0" /> Pas encore assez de données pour dégager une tendance : revenez après quelques séances/abonnements enregistrés.</p>
          ) : (
            <>
              {categoriePrincipale && categoriePrincipale.montant > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-white/60 p-2.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  La catégorie <strong>{categorieLabel(categoriePrincipale.id)}</strong> génère le plus de revenu ({categoriePrincipale.pct}% du chiffre d'affaires des 6 derniers mois) : c'est votre offre la plus demandée.
                </p>
              )}
              <p className="flex items-start gap-2 rounded-xl bg-white/60 p-2.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CreditCard size={16} className="mt-0.5 shrink-0 text-amber-500" />
                Les abonnements représentent <strong>{pctAbonnements}%</strong> du chiffre d'affaires cumulé, contre <strong>{100 - pctAbonnements}%</strong> pour les séances ponctuelles : {pctAbonnements >= 50 ? 'un bon signe de fidélisation' : 'il y a peut-être une marge pour convertir plus de clients occasionnels en abonnés'}.
              </p>
              {croissance !== null && (
                <p className="flex items-start gap-2 rounded-xl bg-white/60 p-2.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
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
