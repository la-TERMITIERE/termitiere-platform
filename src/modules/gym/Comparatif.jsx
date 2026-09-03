// MAXI-GYM — Comparatif Lomé / Kara : les deux salles côte à côte sur la même
// période, réservé à l'administration et à l'info (cf. gym/index.jsx). Hors du
// contexte d'une salle — lit les données des DEUX sites en même temps, comme le
// fait déjà GymSiteChooser pour ses 3 petits chiffres.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Scale, Ticket, CreditCard, Wallet, Users, Target, Trophy, UserCog } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { useGymParams } from './useGymParams'
import { matchSite, SITES } from './site/useSite'
import { formatMoney, formatNumber } from '../../utils/formatters'
import { titreSection, CARD_ACCENT_CLASS, cardAccentStyle } from './uiHelpers'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

export default function Comparatif() {
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')

  const paramsLome = useGymParams('lome')
  const paramsKara = useGymParams('kara')
  const paramsParSite = { lome: paramsLome, kara: paramsKara }

  const { start, end, preset, node: periodNode } = usePeriodSelect('mois')
  const dansPeriode = (d) => (d || '') >= start && (d || '') <= end

  const stats = useMemo(() => {
    const out = {}
    for (const s of SITES) {
      const seances = allSeances.filter((x) => matchSite(x, s.id) && dansPeriode(x.date))
      const abonnements = allAbonnements.filter((x) => matchSite(x, s.id) && dansPeriode(x.date))
      const totalEncaisse = [...seances, ...abonnements].reduce((sum, x) => sum + (Number(x.montant) || 0), 0)
      const nouveauxClients = allClients.filter((c) => matchSite(c, s.id) && c.createdAt && dansPeriode(new Date(c.createdAt).toISOString().slice(0, 10))).length
      const objectif = paramsParSite[s.id]?.objectifMensuel
      const pctObjectif = objectif > 0 ? Math.round((totalEncaisse / objectif) * 100) : null
      out[s.id] = { seances: seances.length, abonnements: abonnements.length, totalEncaisse, nouveauxClients, objectif, pctObjectif }
    }
    return out
  }, [allSeances, allAbonnements, allClients, start, end, paramsLome, paramsKara])

  // Métriques comparées — { clé, label, icon, valeur(site) => number, format(v) => texte }.
  const METRIQUES = [
    { cle: 'seances', label: 'Séances', icon: Ticket, valeur: (s) => stats[s].seances, format: formatNumber },
    { cle: 'abonnements', label: 'Abonnements', icon: CreditCard, valeur: (s) => stats[s].abonnements, format: formatNumber },
    { cle: 'totalEncaisse', label: 'Total encaissé', icon: Wallet, valeur: (s) => stats[s].totalEncaisse, format: formatMoney },
    { cle: 'nouveauxClients', label: 'Nouveaux clients', icon: Users, valeur: (s) => stats[s].nouveauxClients, format: formatNumber }
  ]

  // Classement de TOUS les coachs, Lomé et Kara mélangés — même principe que la
  // « Performance » du volet Coachs (fréquentation les jours de présence pointée)
  // mais à cheval sur les deux salles, sur la période choisie ci-dessus, pour
  // répondre à « en présence de quel coach il y a plus de monde, à Lomé comme à
  // Kara ? ». Le comptage des séances reste cloisonné par salle (chaque coach
  // n'est comparé qu'à sa propre fréquentation, pas à celle de l'autre site).
  const classementCoachs = useMemo(() => {
    const joursParCoach = new Map()
    allPointagesCoach.filter((p) => dansPeriode(p.date)).forEach((p) => {
      if (!joursParCoach.has(p.coachId)) joursParCoach.set(p.coachId, { nom: p.coachNom, site: p.site, jours: new Set() })
      joursParCoach.get(p.coachId).jours.add(p.date)
    })
    const seancesParJourSite = new Map()
    allSeances.forEach((s) => {
      const cle = `${s.site}|${s.date}`
      seancesParJourSite.set(cle, (seancesParJourSite.get(cle) || 0) + 1)
    })
    return [...joursParCoach.entries()].map(([coachId, { nom, site, jours }]) => {
      const totalClients = [...jours].reduce((sum, d) => sum + (seancesParJourSite.get(`${site}|${d}`) || 0), 0)
      const nbJours = jours.size
      return { coachId, nom, site, nbJours, totalClients, moyenne: nbJours ? Math.round((totalClients / nbJours) * 10) / 10 : 0 }
    }).sort((a, b) => b.moyenne - a.moyenne)
  }, [allPointagesCoach, allSeances, start, end])
  const maxMoyenneCoach = Math.max(1, ...classementCoachs.map((c) => c.moyenne))

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Scale size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <Link to="/gym" className="mb-0.5 inline-flex items-center gap-1 text-xs text-white/80 hover:text-white"><ArrowLeft size={13} /> Choix de la salle</Link>
          <h2 className="text-lg font-extrabold">Comparatif Lomé / Kara</h2>
          <p className="text-sm text-white/80">Les deux salles, côte à côte, sur la même période</p>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:font-semibold [&_.input-base]:text-white [&_label]:font-bold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      <Card title={titreSection(Scale, 'Vue d\'ensemble')} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 font-semibold">Indicateur</th>
                {SITES.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-right font-bold" style={{ color: s.accent }}>{s.emoji} {s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {METRIQUES.map((m) => {
                const valeurs = SITES.map((s) => m.valeur(s.id))
                const max = Math.max(...valeurs)
                return (
                  <tr key={m.cle}>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5 font-semibold text-gray-600"><m.icon size={14} className="text-gray-400" /> {m.label}</span>
                    </td>
                    {SITES.map((s, i) => {
                      const v = valeurs[i]
                      const gagnant = v === max && v > 0 && valeurs.filter((x) => x === max).length === 1
                      return (
                        <td key={s.id} className="px-3 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-1 font-extrabold ${gagnant ? 'text-green-600' : 'text-gray-800'}`}>
                            {gagnant && <Trophy size={12} />}{m.format(v)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={titreSection(Trophy, 'Classement des coachs — Lomé & Kara')} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <p className="mb-3 text-xs text-gray-500">
          Fréquentation moyenne (nombre de séances par jour de présence pointée), tous coachs des deux salles mélangés, sur la période choisie.
        </p>
        <div className="space-y-2.5">
          {classementCoachs.map((c, i) => {
            const s = SITES.find((x) => x.id === c.site)
            return (
              <div key={c.coachId} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-500' : i === 2 ? 'bg-orange-50 text-orange-500' : 'text-gray-300'
                }`}>{i < 3 ? <Trophy size={12} /> : i + 1}</span>
                <span className="w-28 shrink-0 truncate text-sm font-semibold text-gray-700">{c.nom}</span>
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: (s?.accent || '#999') + '1a', color: s?.accent }}>
                  {s?.emoji} {s?.label}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.moyenne / maxMoyenneCoach) * 100}%`, background: `linear-gradient(90deg, ${COULEUR}, ${COULEUR2})` }} />
                </div>
                <span className="w-40 shrink-0 text-right text-xs text-gray-500">
                  <strong className="text-gray-800">{c.moyenne}</strong> client(s)/jour · {c.nbJours} jour(s) · {c.totalClients} au total
                </span>
              </div>
            )
          })}
          {!classementCoachs.length && <p className="py-6 text-center text-sm text-gray-400">Aucun pointage coach enregistré sur cette période.</p>}
        </div>
      </Card>

      {/* Objectif du mois — n'a de sens que sur « Mois en cours » (cf. Dashboard). */}
      {preset === 'mois' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {SITES.map((s) => {
            const d = stats[s.id]
            return (
              <Card key={s.id} title={titreSection(Target, `Objectif — ${s.label}`)} className={CARD_ACCENT_CLASS} style={cardAccentStyle(s.accent)}>
                {d.objectif > 0 ? (
                  <>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-gray-500">{formatMoney(d.totalEncaisse)} <span className="text-gray-400">/ {formatMoney(d.objectif)}</span></span>
                      <strong style={{ color: d.pctObjectif >= 100 ? '#16a34a' : s.accent }}>{d.pctObjectif}%</strong>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, d.pctObjectif)}%`, background: d.pctObjectif >= 100 ? '#16a34a' : s.accent }} />
                    </div>
                  </>
                ) : (
                  <p className="text-center text-sm text-gray-400">Pas d'objectif défini pour {s.label} — à paramétrer dans Paramètres.</p>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-[11px] text-gray-400">
          L'objectif du mois ne s'affiche qu'en sélectionnant « Mois en cours » ci-dessus.
        </p>
      )}
    </div>
  )
}
