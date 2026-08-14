import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { Users, Baby, CreditCard, TrendingUp, UserCheck, AlertTriangle, CalendarCheck, Star, Wallet, BarChart2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useGarderieStore } from './store/garderieStore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { GROUPES_AGE, MOIS } from './data'
import { journaliersActifsSurDate, aImpayes, enfantsSansRenouvellement } from './logic'

const now     = new Date()
const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function StatTile({ icon: Icon, label, value, sub, color = '#E8390E', onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick}
      className={`card flex items-center gap-4 p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: color + '1a', color }}>
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Comp>
  )
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-xs text-gray-600 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-xs font-bold text-gray-700">{value}</span>
    </div>
  )
}

export default function Analyses() {
  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: presences }   = useCollection('garderie_presences')
  const { data: paiements }   = useCollection('garderie_paiements')
  const { data: personnel }   = useCollection('garderie_personnel')
  const { data: incidents }   = useCollection('garderie_incidents')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const params  = useGarderieStore((s) => s.params)
  const deleted = useGarderieStore((s) => s.deletedEnfantIds)

  const [moisSel, setMoisSel] = useState(now.getMonth())
  const [anneeSel, setAnneeSel] = useState(now.getFullYear())

  // ── Enfants actifs ──
  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif' && !deleted.has(e.id)),
    [enfants, deleted]
  )

  // ── KPIs principaux ──
  const kpis = useMemo(() => {
    const mensuel     = enfantsActifs.filter((e) => e.typeAbonnement !== 'annuel' && e.typeAbonnement !== 'court_sejour').length
    const annuel      = enfantsActifs.filter((e) => e.typeAbonnement === 'annuel').length
    const courtSejour = enfantsActifs.filter((e) => e.typeAbonnement === 'court_sejour').length
    const capacite = params.capaciteMax || 40
    const tauxOccupation = Math.round((enfantsActifs.length / capacite) * 100)

    // Paiements du mois sélectionné (inscrits)
    const paiementsMois = paiements.filter(
      (p) => Number(p.mois) === moisSel + 1 && Number(p.annee) === anneeSel && p.type !== 'journalier'
    )
    const totalPaye = paiementsMois.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)
    const totalDu   = paiementsMois.reduce((s, p) => s + (Number(p.montantDu) || 0), 0)

    // Impayés = paiements statut 'impaye' + présents sans renouvellement (même logique que le dashboard)
    const avecImpaye      = enfantsActifs.filter((e) => aImpayes(paiements, e.id))
    const sansRenouvellement = enfantsSansRenouvellement(enfantsActifs, paiements, presences)
    const idsImpaye = new Set(avecImpaye.map((e) => e.id))
    const nonRenouveles = sansRenouvellement.filter((e) => !idsImpaye.has(e.id))
    const nImpayes = avecImpaye.length + nonRenouveles.length

    // Journaliers du mois
    const prefix = `${anneeSel}-${String(moisSel + 1).padStart(2,'0')}`
    const joMois  = journaliers.filter((j) => (j.date || '').startsWith(prefix))
    const paiementsJo = paiements.filter((p) => p.type === 'journalier' && (p.date || '').startsWith(prefix))
    const revJo   = paiementsJo.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)

    return { mensuel, annuel, courtSejour, capacite, tauxOccupation, totalPaye, totalDu, nImpayes, joMois: joMois.length, revJo }
  }, [enfantsActifs, paiements, presences, journaliers, moisSel, anneeSel, params])

  // ── Présences du mois ──
  const presencesMois = useMemo(() => {
    const prefix = `${anneeSel}-${String(moisSel + 1).padStart(2, '0')}`
    const pres = presences.filter((p) => (p.date || '').startsWith(prefix) && p.enfantId && !p.personnelId)
    const parJour = {}
    pres.forEach((p) => {
      if (!parJour[p.date]) parJour[p.date] = { presents: 0, absents: 0, excuses: 0 }
      if (p.statut === 'present') parJour[p.date].presents++
      else if (p.statut === 'absent') parJour[p.date].absents++
      else if (p.statut === 'excuse') parJour[p.date].excuses++
    })
    const jours = Object.keys(parJour).sort()
    return {
      labels: jours.map((d) => {
        const dt = new Date(d)
        return `${dt.getDate()}/${dt.getMonth() + 1}`
      }),
      presents: jours.map((d) => parJour[d].presents),
      absents: jours.map((d) => parJour[d].absents),
      moyennePresents: jours.length > 0 ? Math.round(jours.reduce((s, d) => s + parJour[d].presents, 0) / jours.length) : 0
    }
  }, [presences, moisSel, anneeSel])

  // ── Revenus sur 6 mois ──
  const revenus6Mois = useMemo(() => {
    const labels = []
    const inscrits = []
    const journaliersList = []
    const nbInscrits = []      // nb d'enfants inscrits ayant payé ce mois
    const nbJournaliers = []   // nb de journaliers ayant payé ce mois
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anneeSel, moisSel - i, 1)
      const m = d.getMonth() + 1
      const a = d.getFullYear()
      const prefix = `${a}-${String(m).padStart(2,'0')}`
      labels.push(MOIS_COURT[d.getMonth()])
      const paiInscrits = paiements.filter((p) => Number(p.mois) === m && Number(p.annee) === a && p.type !== 'journalier')
      const paiJo       = paiements.filter((p) => p.type === 'journalier' && (p.date || '').startsWith(prefix))
      inscrits.push(paiInscrits.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0))
      journaliersList.push(paiJo.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0))
      nbInscrits.push([...new Set(paiInscrits.map((p) => p.enfantId).filter(Boolean))].length)
      nbJournaliers.push([...new Set(paiJo.map((p) => p.journalierId || p.enfantNom).filter(Boolean))].length)
    }
    return { labels, inscrits, journaliers: journaliersList, nbInscrits, nbJournaliers }
  }, [paiements, moisSel, anneeSel])

  // ── Répartition par groupe d'âge ──
  const parGroupe = useMemo(() =>
    GROUPES_AGE.map((g) => ({
      ...g,
      count: enfantsActifs.filter((e) => e.groupe === g.id).length
    })).filter((g) => g.count > 0),
    [enfantsActifs]
  )

  // ── Taux de présence par enfant (mois sélectionné) ──
  const tauxParEnfant = useMemo(() => {
    const prefix = `${anneeSel}-${String(moisSel + 1).padStart(2, '0')}`
    const joursUniques = [...new Set(
      presences.filter((p) => (p.date || '').startsWith(prefix) && p.enfantId).map((p) => p.date)
    )].length
    if (joursUniques === 0) return []
    return enfantsActifs.map((e) => {
      const nbPres = presences.filter((p) => p.enfantId === e.id && (p.date || '').startsWith(prefix) && p.statut === 'present').length
      return { ...e, nbPres, taux: Math.round((nbPres / joursUniques) * 100) }
    }).sort((a, b) => b.taux - a.taux).slice(0, 8)
  }, [enfantsActifs, presences, moisSel, anneeSel])

  // ── Pointage personnel (mois sélectionné) ──
  const statsPersonnel = useMemo(() => {
    const prefix = `${anneeSel}-${String(moisSel + 1).padStart(2, '0')}`
    // Jours où au moins un pointage a été enregistré ce mois
    const joursOuvres = [...new Set(
      presences.filter((p) => (p.date || '').startsWith(prefix)).map((p) => p.date)
    )].length

    return personnel.filter((p) => p.statut === 'actif').map((p) => {
      const presP = presences.filter(
        (pr) => pr.personnelId === p.id && (pr.date || '').startsWith(prefix)
      )
      const joursPresents  = presP.filter((pr) => !!pr.heureArrivee && pr.statut !== 'absent').length
      const joursAbsents   = presP.filter((pr) => pr.statut === 'absent').length
      const joursNonPointe = Math.max(0, joursOuvres - joursPresents - joursAbsents)
      const tauxPresence   = joursOuvres > 0 ? Math.round((joursPresents / joursOuvres) * 100) : 0
      return { ...p, joursPresents, joursAbsents, joursNonPointe, tauxPresence, joursOuvres }
    }).sort((a, b) => b.joursPresents - a.joursPresents)
  }, [personnel, presences, moisSel, anneeSel])

  // ── Incidents par type ──
  const incidentsStats = useMemo(() => {
    const ouverts  = incidents.filter((i) => !i.resolu).length
    const resolus  = incidents.filter((i) => i.resolu).length
    const graves   = incidents.filter((i) => i.gravite === 'grave').length
    return { ouverts, resolus, graves, total: incidents.length }
  }, [incidents])

  // ── Données annuelles ──
  const annuel = useMemo(() => {
    const labels = MOIS_COURT
    const revenusInscrits = []
    const revenusJo       = []
    const tauxPresences   = []
    const tauxRecouvrement = []
    let totalRevAnnuel = 0
    let totalJoAnnuel  = 0
    let totalImpayes   = 0

    for (let m = 1; m <= 12; m++) {
      const prefix = `${anneeSel}-${String(m).padStart(2,'0')}`

      // Revenus inscrits
      const paiM = paiements.filter((p) => Number(p.mois) === m && Number(p.annee) === anneeSel && p.type !== 'journalier')
      const revM = paiM.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)
      const duM  = paiM.reduce((s, p) => s + (Number(p.montantDu) || 0), 0)
      revenusInscrits.push(revM)
      totalRevAnnuel += revM
      if (duM > 0) tauxRecouvrement.push(Math.round((revM / duM) * 100))
      else tauxRecouvrement.push(0)

      // Revenus journaliers
      const revJoM = paiements.filter((p) => p.type === 'journalier' && (p.date || '').startsWith(prefix))
        .reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)
      revenusJo.push(revJoM)
      totalJoAnnuel += revJoM

      // Taux de présence moyen du mois
      const presM = presences.filter((p) => (p.date || '').startsWith(prefix) && p.enfantId && !p.personnelId)
      const joursM = [...new Set(presM.map((p) => p.date))].length
      if (joursM > 0) {
        const moy = Math.round(presM.filter((p) => p.statut === 'present').length / joursM)
        tauxPresences.push(moy)
      } else {
        tauxPresences.push(0)
      }

      // Impayés cumulés
      totalImpayes += paiM.filter((p) => p.statut === 'impaye').length
    }

    // Performance annuelle tatas
    const perfPersonnel = personnel.filter((p) => p.statut === 'actif').map((p) => {
      const totalPres = presences.filter(
        (pr) => pr.personnelId === p.id && (pr.date || '').slice(0,4) === String(anneeSel) && pr.heureArrivee && pr.statut !== 'absent'
      ).length
      const totalAbs = presences.filter(
        (pr) => pr.personnelId === p.id && (pr.date || '').slice(0,4) === String(anneeSel) && pr.statut === 'absent'
      ).length
      const joursOuvresAn = [...new Set(
        presences.filter((pr) => (pr.date || '').slice(0,4) === String(anneeSel)).map((pr) => pr.date)
      )].length
      const taux = joursOuvresAn > 0 ? Math.round((totalPres / joursOuvresAn) * 100) : 0
      return { ...p, totalPres, totalAbs, taux }
    }).sort((a, b) => b.taux - a.taux)

    const tauxRecovMoyen = tauxRecouvrement.filter((t) => t > 0).length > 0
      ? Math.round(tauxRecouvrement.filter((t) => t > 0).reduce((s, t) => s + t, 0) / tauxRecouvrement.filter((t) => t > 0).length)
      : 0

    return { labels, revenusInscrits, revenusJo, tauxPresences, totalRevAnnuel, totalJoAnnuel, totalImpayes, perfPersonnel, tauxRecovMoyen }
  }, [paiements, presences, personnel, journaliers, anneeSel])

  const ORANGE = '#E8390E'
  const BLUE   = '#3b82f6'
  const GREEN  = '#16a34a'
  const PURPLE = '#7c3aed'
  const AMBER  = '#f59e0b'

  const [vue, setVue] = useState('mensuel')

  return (
    <div className="space-y-5">

      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <BarChart2 size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Analyse & Pilotage</h2>
          <p className="text-sm text-white/80">Vue consolidée de la garderie</p>
        </div>
      </div>

      {/* ── Onglets + sélecteur ── */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-3">
          {/* Onglets */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
            <button onClick={() => setVue('mensuel')}
              className={`px-4 py-2 transition-colors ${vue === 'mensuel' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              📅 Mensuel
            </button>
            <button onClick={() => setVue('annuel')}
              className={`px-4 py-2 transition-colors ${vue === 'annuel' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              📆 Annuel
            </button>
          </div>
          {/* Sélecteur mois (mensuel seulement) */}
          {vue === 'mensuel' && (
          <select
            value={moisSel}
            onChange={(e) => setMoisSel(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
            {MOIS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          )}
          <input
            type="number" value={anneeSel}
            onChange={(e) => setAnneeSel(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
        </div>
      </div>

      {/* ══ VUE ANNUELLE ══ */}
      {vue === 'annuel' && (
        <div className="space-y-6">
          {/* KPIs annuels */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-gray-400 tracking-wider">💰 Bilan annuel {anneeSel}</p>
            <p className="mb-3 text-[10px] text-gray-400 italic">Ces 4 chiffres résument toute l'activité financière de la garderie sur l'année {anneeSel}.</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="card p-4 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
                <p className="text-xs font-medium uppercase text-orange-600">Total revenus</p>
                <p className="text-2xl font-extrabold text-orange-800">{formatMoney(annuel.totalRevAnnuel + annuel.totalJoAnnuel)}</p>
                <p className="text-xs text-orange-500 mt-0.5">Tout ce qui a été encaissé</p>
              </div>
              <div className="card p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
                <p className="text-xs font-medium uppercase text-green-600">Revenus inscrits</p>
                <p className="text-2xl font-extrabold text-green-800">{formatMoney(annuel.totalRevAnnuel)}</p>
                <p className="text-xs text-green-500 mt-0.5">Mensualités payées sur l'année</p>
              </div>
              <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
                <p className="text-xs font-medium uppercase text-purple-600">Revenus journaliers</p>
                <p className="text-2xl font-extrabold text-purple-800">{formatMoney(annuel.totalJoAnnuel)}</p>
                <p className="text-xs text-purple-500 mt-0.5">Enfants à la journée sur l'année</p>
              </div>
              <div className="card p-4 bg-gradient-to-br from-red-50 to-red-100 border border-red-200">
                <p className="text-xs font-medium uppercase text-red-600">Taux recouvrement</p>
                <p className="text-2xl font-extrabold text-red-800">{annuel.tauxRecovMoyen}%</p>
                <p className="text-xs text-red-500 mt-0.5">Encaissé ÷ Attendu — moy. annuelle</p>
              </div>
            </div>
          </div>

          {/* Revenus 12 mois */}
          <Card title={`📈 Revenus mensuels — ${anneeSel}`}>
            <p className="text-[10px] text-gray-400 italic mb-1">📆 Annuel · Montants encaissés mois par mois</p>
            <p className="text-[10px] text-gray-400 mb-3">Chaque barre représente ce que la garderie a encaissé ce mois-là. <strong>Orange</strong> = mensualités des inscrits · <strong>Violet</strong> = journaliers. Survolez une barre pour voir le détail.</p>
            <Bar
              data={{
                labels: annuel.labels,
                datasets: [
                  { label: 'Inscrits', data: annuel.revenusInscrits, backgroundColor: ORANGE + 'cc', borderRadius: 5, borderSkipped: false },
                  { label: 'Journaliers', data: annuel.revenusJo, backgroundColor: PURPLE + 'cc', borderRadius: 5, borderSkipped: false }
                ]
              }}
              options={{
                responsive: true,
                plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label} : ${Number(ctx.raw).toLocaleString('fr-FR')} FCFA`
                }}},
                scales: {
                  x: { grid: { display: false } },
                  y: { ticks: { callback: (v) => `${(v/1000).toFixed(0)}k` } }
                }
              }}
            />
          </Card>

          {/* Présences 12 mois */}
          <Card title={`📅 Présences moyennes par jour — ${anneeSel}`}>
            <p className="text-[10px] text-gray-400 italic mb-1">📆 Annuel · Nombre moyen d'enfants présents par jour</p>
            <p className="text-[10px] text-gray-400 mb-3">La courbe montre combien d'enfants venaient en moyenne chaque jour, mois par mois. Un pic = mois chargé. Un creux = mois calme (vacances, maladie…).</p>
            <Line
              data={{
                labels: annuel.labels,
                datasets: [{
                  label: 'Moy. présents/jour',
                  data: annuel.tauxPresences,
                  borderColor: GREEN,
                  backgroundColor: GREEN + '22',
                  fill: true, tension: 0.4, pointRadius: 4,
                }]
              }}
              options={{
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                  x: { grid: { display: false } },
                  y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
              }}
            />
          </Card>

          {/* Performance personnel annuelle */}
          <Card title={`👩 Performance du personnel — ${anneeSel}`}>
            <p className="text-[10px] text-gray-400 italic mb-1">📆 Annuel · <span className="font-mono">Taux = Jours présents ÷ Jours ouvrés × 100</span></p>
            <p className="text-[10px] text-gray-400 mb-3">Classement des tatas selon leur assiduité sur toute l'année. 🥇🥈🥉 pour les 3 meilleures. Plus le pourcentage est élevé, plus la tata a été présente régulièrement.</p>
            {annuel.perfPersonnel.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Aucun personnel actif.</p>
            ) : (
              <div className="space-y-2">
                {annuel.perfPersonnel.map((p, idx) => {
                  const couleur = p.taux >= 80 ? GREEN : p.taux >= 50 ? '#f59e0b' : '#dc2626'
                  const medaille = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="text-base shrink-0 w-6 text-center">{medaille}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold truncate">{p.prenom} {p.nom}</span>
                          <span className="text-xs font-extrabold ml-2 shrink-0" style={{ color: couleur }}>{p.taux}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${p.taux}%`, background: couleur }} />
                        </div>
                        <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                          <span className="text-green-600 font-semibold">{p.totalPres}j ✓</span>
                          {p.totalAbs > 0 && <span className="text-red-500 font-semibold">{p.totalAbs}j ✗</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Légende */}
                <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" /> ≥ 80% Excellent</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> 50–79% Moyen</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &lt; 50% Insuffisant</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══ VUE MENSUELLE ══ */}
      {vue === 'mensuel' && <div className="space-y-6">

      {/* ── KPIs Rangée 1 : Effectifs ── */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase text-gray-400 tracking-wider">👥 Effectifs</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile icon={Baby} label="Enfants inscrits" value={enfantsActifs.length}
            sub={<>🔴 Temps réel · <span className="italic">{kpis.tauxOccupation}% des {kpis.capacite} places</span></>}
            color={ORANGE} />
          <StatTile icon={Users} label="Journaliers ce mois" value={kpis.joMois}
            sub="📅 Mensuel · enfants à la journée"
            color={PURPLE} />
          <StatTile icon={TrendingUp} label="Taux d'occupation" value={`${kpis.tauxOccupation}%`}
            sub={<>🔴 Temps réel · {enfantsActifs.length} / {kpis.capacite} places</>}
            color={kpis.tauxOccupation >= 80 ? GREEN : kpis.tauxOccupation >= 50 ? '#f59e0b' : '#dc2626'} />
        </div>
      </div>

      {/* ── KPIs Rangée 2 : Finances ── */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase text-gray-400 tracking-wider">💰 Finances — {MOIS[moisSel]} {anneeSel}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={CreditCard} label="Revenus inscrits" value={formatMoney(kpis.totalPaye)}
            sub="📅 Mensuel · mensualités encaissées"
            color={GREEN} />
          <StatTile icon={Star} label="Revenus journaliers" value={formatMoney(kpis.revJo)}
            sub="📅 Mensuel · paiements à la journée"
            color={PURPLE} />
          <div className="card flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
              <CreditCard size={22} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-green-600">Total revenus</p>
              <p className="text-2xl font-extrabold text-green-800">{formatMoney(kpis.totalPaye + kpis.revJo)}</p>
              <p className="text-xs text-green-500 mt-0.5">📅 Mensuel · inscrits + journaliers</p>
            </div>
          </div>
          <StatTile icon={AlertTriangle} label="Impayés ce mois" value={kpis.nImpayes}
            sub="📅 Mensuel · impayés + non renouvelés"
            color="#dc2626" />
        </div>
      </div>

      {/* ── Ligne 2 : Revenus 6 mois + Répartition abonnements ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="📈 Revenus sur 6 mois" className="lg:col-span-2">
          <p className="text-[10px] text-gray-400 italic mb-2">📅 Mensuel · Somme des montants payés par mois</p>
          <Bar
            data={{
              labels: revenus6Mois.labels,
              datasets: [
                {
                  label: 'Inscrits',
                  data: revenus6Mois.inscrits,
                  backgroundColor: ORANGE + 'cc',
                  borderRadius: 6,
                  borderSkipped: false,
                },
                {
                  label: 'Journaliers',
                  data: revenus6Mois.journaliers,
                  backgroundColor: PURPLE + 'cc',
                  borderRadius: 6,
                  borderSkipped: false,
                }
              ]
            }}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'top' },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const idx = ctx.dataIndex
                      const isJo = ctx.datasetIndex === 1
                      const nb = isJo ? revenus6Mois.nbJournaliers[idx] : revenus6Mois.nbInscrits[idx]
                      const montant = Number(ctx.raw).toLocaleString('fr-FR')
                      const label = isJo ? 'Journaliers' : 'Inscrits'
                      const enfantLabel = isJo ? 'journalier(s)' : 'enfant(s)'
                      return [
                        ` ${label} : ${montant} FCFA`,
                        ` ${nb} ${enfantLabel} concerné(s)`
                      ]
                    }
                  }
                }
              },
              scales: {
                x: { stacked: false, grid: { display: false } },
                y: { stacked: false, ticks: { callback: (v) => `${(v/1000).toFixed(0)}k` } }
              }
            }}
          />
        </Card>

        <Card title="🍼 Répartition abonnements">
          <p className="text-[10px] text-gray-400 italic mb-2">🔴 Temps réel · Inscrits actifs du moment</p>
          <div className="flex flex-col gap-4">
            <Doughnut
              data={{
                labels: ['Mensuel', 'Annuel', 'Court séjour'],
                datasets: [{ data: [kpis.mensuel, kpis.annuel, kpis.courtSejour], backgroundColor: [BLUE, PURPLE, AMBER], borderWidth: 0, hoverOffset: 4 }]
              }}
              options={{ cutout: '70%', plugins: { legend: { position: 'bottom' } } }}
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-2xl font-extrabold text-blue-700">{kpis.mensuel}</p>
                <p className="text-xs text-blue-500">Mensuel</p>
              </div>
              <div className="rounded-xl bg-purple-50 p-3">
                <p className="text-2xl font-extrabold text-purple-700">{kpis.annuel}</p>
                <p className="text-xs text-purple-500">Annuel</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-2xl font-extrabold text-amber-700">{kpis.courtSejour}</p>
                <p className="text-xs text-amber-500">Court séjour</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Ligne 3 : Présences du mois + Groupes d'âge ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={`📅 Présences — ${MOIS[moisSel]} ${anneeSel}`} className="lg:col-span-2">
          {presencesMois.labels.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune présence enregistrée ce mois.</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-green-600 text-sm">Moy. {presencesMois.moyennePresents} présent(s)/jour</span>
                <span className="text-[10px] text-gray-400 italic">📆 Par jour · <span className="font-mono">Moy = Total présences ÷ Nb jours pointés</span></span>
              </div>
              <Line
                data={{
                  labels: presencesMois.labels,
                  datasets: [
                    {
                      label: 'Présents',
                      data: presencesMois.presents,
                      borderColor: GREEN,
                      backgroundColor: GREEN + '22',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 3,
                    },
                    {
                      label: 'Absents',
                      data: presencesMois.absents,
                      borderColor: '#dc2626',
                      backgroundColor: '#dc262622',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 3,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'top' } },
                  scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                  }
                }}
              />
            </>
          )}
        </Card>

        <Card title="👶 Groupes d'âge">
          <p className="text-[10px] text-gray-400 italic mb-2">🔴 Temps réel · Répartition des inscrits actifs</p>
          {parGroupe.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun enfant inscrit.</p>
          ) : (
            <div className="space-y-3 pt-2">
              {parGroupe.map((g, i) => (
                <MiniBar
                  key={g.id}
                  label={g.label}
                  value={g.count}
                  max={enfantsActifs.length}
                  color={[ORANGE, BLUE, GREEN, PURPLE, '#f59e0b'][i % 5]}
                />
              ))}
              <Doughnut
                className="mt-4 max-h-40"
                data={{
                  labels: parGroupe.map((g) => g.label),
                  datasets: [{ data: parGroupe.map((g) => g.count), backgroundColor: [ORANGE, BLUE, GREEN, PURPLE, '#f59e0b'], borderWidth: 0 }]
                }}
                options={{ cutout: '60%', plugins: { legend: { display: false } } }}
              />
            </div>
          )}
        </Card>
      </div>

      {/* ── Ligne 4 : Taux présence par enfant + Personnel ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`🏆 Taux de présence par enfant — ${MOIS[moisSel]}`}>
          <p className="text-[10px] text-gray-400 italic mb-2">
            📆 Par jour · <span className="font-mono">Taux = Jours présents ÷ Jours d'école × 100</span>
          </p>
          {tauxParEnfant.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune donnée de présence ce mois.</p>
          ) : (
            <div className="space-y-2 pt-1">
              {tauxParEnfant.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="w-32 text-xs font-semibold truncate text-gray-700">{e.prenom} {e.nom}</span>
                  <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${e.taux}%`,
                        background: e.taux >= 80 ? GREEN : e.taux >= 50 ? '#f59e0b' : '#dc2626'
                      }}
                    />
                  </div>
                  <span className={`w-12 text-right text-xs font-bold ${e.taux >= 80 ? 'text-green-600' : e.taux >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {e.taux}%
                  </span>
                </div>
              ))}
              {/* Légende enfants */}
              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Légende</p>
                <div className="flex flex-col gap-1 text-[10px] text-gray-600">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-green-600" /> <strong>Vert ≥ 80%</strong> — Excellent · L'enfant vient régulièrement</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-yellow-500" /> <strong>Jaune 50–79%</strong> — Moyen · Quelques absences à surveiller</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-red-500" /> <strong>Rouge &lt; 50%</strong> — Faible · Contacter les parents</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title={`👩 Pointage personnel — ${MOIS[moisSel]}`}>
          <p className="text-[10px] text-gray-400 italic mb-3">
            📆 Par jour · <span className="font-mono">Taux = Jours présents ÷ Jours ouvrés × 100</span>
            {statsPersonnel[0]?.joursOuvres > 0 && <span className="ml-2 text-gray-500">({statsPersonnel[0]?.joursOuvres} jours ouvrés ce mois)</span>}
          </p>
          {statsPersonnel.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun personnel actif.</p>
          ) : (
            <div className="space-y-3 pt-1">
              {statsPersonnel.map((p) => {
                const couleur = p.tauxPresence >= 80 ? '#16a34a' : p.tauxPresence >= 50 ? '#f59e0b' : '#dc2626'
                const niveau  = p.tauxPresence >= 80 ? 'Excellent' : p.tauxPresence >= 50 ? 'Moyen' : 'Faible'
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    {/* Pastille de ponctualité */}
                    <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleur }} title={niveau} />
                    {/* Nom */}
                    <span className="font-semibold truncate flex-1">{p.prenom} {p.nom}</span>
                    {/* Stats compactes */}
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="text-green-600 font-bold">{p.joursPresents}j ✓</span>
                      {p.joursAbsents > 0 && <span className="text-red-500 font-bold">{p.joursAbsents}j ✗</span>}
                      {p.joursNonPointe > 0 && <span className="text-gray-400">{p.joursNonPointe}j ?</span>}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: couleur + '22', color: couleur }}>{p.tauxPresence}%</span>
                    </div>
                  </div>
                )
              })}
              {/* Légende personnel */}
              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Légende</p>
                <div className="flex flex-col gap-1 text-[10px] text-gray-600">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-green-600" /> <strong>Vert ≥ 80%</strong> — Excellente ponctualité</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-yellow-500" /> <strong>Jaune 50–79%</strong> — Ponctualité moyenne</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0 bg-red-500" /> <strong>Rouge &lt; 50%</strong> — Ponctualité insuffisante</span>
                  <span className="flex items-center gap-2 mt-0.5 text-gray-400"><strong>✓</strong> présent · <strong>✗</strong> absent · <strong>?</strong> non pointé</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Ligne 5 : Recouvrement paiements + Incidents ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`💰 Recouvrement — ${MOIS[moisSel]} ${anneeSel}`}>
          <div className="space-y-4">
            <p className="text-[10px] text-gray-400 italic">📅 Mensuel · <span className="font-mono">Taux = Encaissé ÷ Attendu × 100</span></p>
            {/* Barre de recouvrement */}
            {kpis.totalDu > 0 ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Taux de recouvrement</span>
                    <span className="font-bold text-green-700">{Math.round((kpis.totalPaye / kpis.totalDu) * 100)}%</span>
                  </div>
                  <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-4 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, Math.round((kpis.totalPaye / kpis.totalDu) * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs text-gray-400">Attendu</p>
                    <p className="text-sm font-extrabold text-gray-700">{formatMoney(kpis.totalDu)}</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-3">
                    <p className="text-xs text-gray-400">Encaissé</p>
                    <p className="text-sm font-extrabold text-green-700">{formatMoney(kpis.totalPaye)}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-xs text-gray-400">Reste</p>
                    <p className="text-sm font-extrabold text-red-600">{formatMoney(Math.max(0, kpis.totalDu - kpis.totalPaye))}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">Aucun paiement enregistré ce mois.</p>
            )}
          </div>
        </Card>

        <Card title="⚠️ Incidents — Vue globale">
          <p className="text-[10px] text-gray-400 italic mb-2">🔴 Temps réel · Tous les incidents depuis le début</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total incidents', val: incidentsStats.total, color: 'text-gray-700', bg: 'bg-gray-50' },
                { label: 'Non résolus',     val: incidentsStats.ouverts,  color: 'text-red-600',  bg: 'bg-red-50' },
                { label: 'Résolus',         val: incidentsStats.resolus,  color: 'text-green-600',bg: 'bg-green-50' },
                { label: 'Graves',          val: incidentsStats.graves,   color: 'text-orange-600',bg:'bg-orange-50' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl ${s.bg} p-3 text-center`}>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {incidentsStats.ouverts > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-semibold">
                🔴 {incidentsStats.ouverts} incident{incidentsStats.ouverts > 1 ? 's' : ''} en attente de résolution
              </div>
            )}
          </div>
        </Card>
      </div>

      </div>} {/* fin vue mensuelle */}

    </div>
  )
}
