// MAXI-GYM — Coachs : pointage de l'arrivée (vs planning programmé en Paramètres)
// + performance comparée (fréquentation clients les jours où chaque coach est présent).
import { useEffect, useMemo, useState } from 'react'
import { UserCog, CheckCircle2, Clock3, Bed, Pencil, Plus, CalendarDays, BarChart3, History, Ticket, CreditCard } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isReadOnlyRole } from '../../core/roles'
import { todayStr, formatDateShort, nowHM } from '../../utils/formatters'
import { creneauCoach, statutPointage, horairesVides, JOURS_SEMAINE } from './data'
import { useSite, matchSite, siteLabel } from './site/useSite'
import CoachFormModal from './CoachFormModal'
import { titreSection, CARD_ACCENT_CLASS, cardAccentStyle } from './uiHelpers'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

// Podium — même recette que Dashboard.jsx (clients les plus fréquents) : médaille +
// fond dégradé pour les 3 premiers du classement, simple numéro gris au-delà.
const RANG_PODIUM = [
  { medaille: '🥇', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', bg: 'bg-gradient-to-r from-slate-100 to-gray-50',  ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

export default function Coachs() {
  const { user, role } = useAuth()
  const peutSaisir = !isReadOnlyRole(role)
  const site = useSite()
  const { data: allCoachs } = useCollection('gym_coachs')
  const { data: allPointages } = useCollection('gym_pointages_coach')
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const coachs = useMemo(() => allCoachs.filter((c) => matchSite(c, site)), [allCoachs, site])
  const pointages = useMemo(() => allPointages.filter((p) => matchSite(p, site)), [allPointages, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])

  const [pointing, setPointing] = useState(null) // id du coach en cours de pointage
  // Ajout/modification du planning — ouvert à tous ici (agents inclus). La
  // SUPPRESSION reste réservée à l'administration, depuis Paramètres (les agents
  // n'y ont pas accès) : pas de bouton retirer sur ce volet.
  const [coachModal, setCoachModal] = useState(null)
  const nbJoursProgrammes = (c) => Object.values(c.horaires || {}).filter((h) => h?.actif).length

  // Jour courant réévalué toutes les minutes : un volet resté ouvert après minuit
  // doit basculer sur le planning et les pointages du nouveau jour (sinon l'équipe
  // et les arrivées de la veille restent affichées comme « aujourd'hui »).
  const [aujourdhui, setAujourdhui] = useState(todayStr())
  useEffect(() => {
    const id = setInterval(() => setAujourdhui(todayStr()), 60000)
    return () => clearInterval(id)
  }, [])
  const equipeDuJour = useMemo(
    () => coachs.map((c) => ({ ...c, creneau: creneauCoach(c, aujourdhui) })).sort((a, b) => (b.creneau ? 1 : 0) - (a.creneau ? 1 : 0)),
    [coachs, aujourdhui]
  )
  const pointageDuJour = (coachId) => pointages.find((p) => p.coachId === coachId && p.date === aujourdhui)

  async function pointerArrivee(c) {
    const creneau = c.creneau
    if (!creneau) return
    setPointing(c.id)
    try {
      const heureArrivee = nowHM()
      const statut = statutPointage(creneau.heure, heureArrivee)
      await addItem('gym_pointages_coach', {
        coachId: c.id, coachNom: c.nom, site, date: aujourdhui,
        heureProgrammee: creneau.heure, heureArrivee, statut,
        par: user?.nom || user?.login || '—'
      })
      await audit('gym', 'COACH_POINTAGE', `${c.nom} — arrivé à ${heureArrivee} (prévu ${creneau.heure}) — ${siteLabel(site)}`)
      toast.success(`${c.nom} pointé à ${heureArrivee} ✓`)
    } finally { setPointing(null) }
  }

  // Performance : jours (uniques) où chaque coach a été réellement pointé présent —
  // sert à calculer une moyenne par jour de présence. Séances ET abonnements sont
  // désormais RATTACHÉS pour de vrai à un coach précis (`coachId` posé à la création,
  // cf. Seances.jsx/Abonnements.jsx → coachDuJour), uniquement quand un seul coach
  // était présent ce jour-là — sinon ambigu, ni l'un ni l'autre n'est compté. Ce sont
  // donc des chiffres réels, plus une corrélation « toute la salle, ce jour-là ».
  const performance = useMemo(() => {
    const joursParCoach = new Map()
    pointages.forEach((p) => {
      if (!joursParCoach.has(p.coachId)) joursParCoach.set(p.coachId, { nom: p.coachNom, jours: new Set() })
      joursParCoach.get(p.coachId).jours.add(p.date)
    })
    const compterParCoach = (liste) => {
      const m = new Map()
      liste.forEach((x) => { if (x.coachId) m.set(x.coachId, (m.get(x.coachId) || 0) + 1) })
      return m
    }
    const seancesParCoach = compterParCoach(seances)
    const abonnementsParCoach = compterParCoach(abonnements)
    return [...joursParCoach.entries()].map(([coachId, { nom, jours }]) => {
      const totalClients = seancesParCoach.get(coachId) || 0
      const totalAbonnements = abonnementsParCoach.get(coachId) || 0
      const nbJours = jours.size
      return {
        coachId, nom, nbJours, totalClients, totalAbonnements,
        moyenne: nbJours ? Math.round((totalClients / nbJours) * 10) / 10 : 0,
        moyenneAbo: nbJours ? Math.round((totalAbonnements / nbJours) * 10) / 10 : 0
      }
    }).sort((a, b) => b.moyenne - a.moyenne)
  }, [pointages, seances, abonnements])

  // Historique — période filtrable, plus récent en premier.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const toutes = useMemo(() => [...pointages].sort((a, b) => (a.date < b.date ? 1 : -1)), [pointages])
  const historique = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((p) => (p.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((p) => (p.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((p) => (!filtreDebut || p.date >= filtreDebut) && (!filtreFin || p.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((p) => p.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <UserCog size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Coachs</h2>
          <p className="text-sm text-white/80">Planning, pointage d'arrivée et performance — MAXI-GYM {siteLabel(site)}</p>
        </div>
        {/* Filtre de période de l'historique des pointages, directement dans le
            bandeau (glassmorphism) — même recette que Séances/Abonnements. */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      <Card title={titreSection(CalendarDays, "Aujourd'hui")} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <div className="space-y-2">
          {equipeDuJour.map((c) => {
            const p = c.creneau ? pointageDuJour(c.id) : null
            return (
              <div key={c.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-l-4 px-3 py-2.5 ${c.creneau ? 'border-gray-200 bg-orange-50/40' : 'border-gray-100 bg-gray-50/60'}`}
                style={{ borderLeftColor: c.creneau ? COULEUR : '#d1d5db' }}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: c.creneau ? `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})` : '#9ca3af' }}>
                    <UserCog size={16} />
                  </span>
                  <div>
                    <p className="font-semibold text-gray-800">{c.nom}</p>
                    <p className="text-xs text-gray-400">
                      {c.creneau ? `Programmé à ${c.creneau.heure}` : 'Repos aujourd\'hui'}
                    </p>
                  </div>
                </div>
                {!c.creneau ? (
                  <Badge tone="neutral" className="border border-dashed border-gray-300 opacity-80"><Bed size={11} className="mr-1 inline" /> Repos</Badge>
                ) : p ? (
                  <Badge tone={p.statut === 'retard' ? 'warning' : 'success'}>
                    <CheckCircle2 size={11} className="mr-1 inline" /> Arrivé à {p.heureArrivee}{p.statut === 'retard' ? ' (retard)' : ''}
                  </Badge>
                ) : peutSaisir ? (
                  <Button size="sm" loading={pointing === c.id} onClick={() => pointerArrivee(c)}
                    className="rounded-full px-4 shadow-[0_6px_16px_-4px_rgba(232,133,15,0.55)] hover:shadow-[0_8px_20px_-4px_rgba(232,133,15,0.7)]"
                    style={{ background: `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})` }}>
                    <Clock3 size={14} /> Pointer l'arrivée
                  </Button>
                ) : (
                  <Badge tone="info"><Clock3 size={11} className="mr-1 inline" /> Pas encore pointé</Badge>
                )}
              </div>
            )
          })}
          {!equipeDuJour.length && <p className="py-6 text-center text-sm text-gray-400">Aucun coach enregistré — ajoutez-en ci-dessous.</p>}
        </div>
      </Card>

      <Card title={titreSection(UserCog, 'Mon équipe')} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <p className="mb-3 text-xs text-gray-500">
          Ajoute un coach et programme ses jours/heure d'arrivée. La suppression d'un coach se fait uniquement depuis Paramètres (administration).
        </p>
        <div className="space-y-2">
          {coachs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-l-4 border-gray-200 bg-orange-50/40 px-3 py-2.5" style={{ borderLeftColor: COULEUR }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})` }}>
                  <UserCog size={14} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">{c.nom}</p>
                  <p className="text-xs text-gray-500">
                    {nbJoursProgrammes(c) > 0
                      ? JOURS_SEMAINE.filter((j) => c.horaires?.[j.id]?.actif).map((j) => `${j.label.slice(0, 3)} ${c.horaires[j.id].heure}`).join(' · ')
                      : 'Aucun jour programmé'}
                  </p>
                </div>
              </div>
              {peutSaisir && (
                <button onClick={() => setCoachModal({ id: c.id, nom: c.nom, horaires: { ...horairesVides(), ...c.horaires } })}
                  className="shrink-0 rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50" title="Modifier"><Pencil size={15} /></button>
              )}
            </div>
          ))}
          {!coachs.length && <p className="py-4 text-center text-sm text-gray-400">Aucun coach enregistré pour {siteLabel(site)}.</p>}
        </div>
        {peutSaisir && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setCoachModal({ nom: '', horaires: horairesVides() })}>
            <Plus size={14} /> Ajouter un coach
          </Button>
        )}
      </Card>

      <Card title={titreSection(BarChart3, 'Performance des coachs')} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
          <span>Moyenne par jour de présence — séances et abonnements réellement rattachés à ce coach</span>
          <span className="inline-flex items-center gap-1" title="Comptées uniquement quand ce coach était le SEUL présent le jour de l'enregistrement — sinon ambigu, non comptées">ⓘ seul présent ce jour-là</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {performance.map((p, i) => {
            const podium = RANG_PODIUM[i]
            return (
              <div key={p.coachId} className={`rounded-2xl p-3 transition-all ${podium ? `${podium.bg} ${podium.ring} shadow-sm` : 'bg-gray-50'}`}>
                <div className="mb-2 flex items-center gap-2">
                  {podium ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm shadow ring-1 ring-gray-200">{podium.medaille}</span>
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-400 text-xs font-extrabold text-white shadow ring-1 ring-white">{i + 1}</span>
                  )}
                  <span className="truncate text-sm font-bold text-gray-800">{p.nom}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard title="🎫 Séances/j" value={p.moyenne} sub={`${p.nbJours} j · ${p.totalClients} au total`} icon={Ticket} accent={COULEUR} />
                  <StatCard title="💳 Abo./j" value={p.moyenneAbo} sub={`${p.totalAbonnements} au total`} icon={CreditCard} accent="#0ea5e9" />
                </div>
              </div>
            )
          })}
          {!performance.length && <p className="py-6 text-center text-sm text-gray-400 sm:col-span-2">Aucun pointage encore enregistré.</p>}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: COULEUR + '18', color: COULEUR }}><History size={14} /></span>
          Historique des pointages
        </h3>
        <span className="text-xs text-gray-400">filtré selon la période choisie dans le bandeau ci-dessus</span>
      </div>

      <Card className="overflow-hidden border-l-4 p-0 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]" style={cardAccentStyle(COULEUR)}>
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'coachNom', label: 'Coach' },
            { key: 'heureProgrammee', label: 'Programmé' },
            { key: 'heureArrivee', label: 'Arrivée réelle' },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={r.statut === 'retard' ? 'warning' : 'success'}>{r.statut === 'retard' ? 'En retard' : 'À l\'heure'}</Badge> },
            { key: 'par', label: 'Pointé par' }
          ]}
          rows={historique}
          empty="Aucun pointage enregistré."
        />
      </Card>

      <CoachFormModal coachModal={coachModal} setCoachModal={setCoachModal} site={site} />
    </div>
  )
}
