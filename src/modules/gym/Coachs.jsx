// MAXI-GYM — Coachs : pointage de l'arrivée (vs planning programmé en Paramètres)
// + performance comparée (fréquentation clients les jours où chaque coach est présent).
import { useMemo, useState } from 'react'
import { UserCog, CheckCircle2, Clock3, Bed, Pencil, Plus, CalendarDays, BarChart3, History } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
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

export default function Coachs() {
  const { user, role } = useAuth()
  const peutSaisir = !isReadOnlyRole(role)
  const site = useSite()
  const { data: allCoachs } = useCollection('gym_coachs')
  const { data: allPointages } = useCollection('gym_pointages_coach')
  const { data: allSeances } = useCollection('gym_seances')
  const coachs = useMemo(() => allCoachs.filter((c) => matchSite(c, site)), [allCoachs, site])
  const pointages = useMemo(() => allPointages.filter((p) => matchSite(p, site)), [allPointages, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])

  const [pointing, setPointing] = useState(null) // id du coach en cours de pointage
  // Ajout/modification du planning — ouvert à tous ici (agents inclus). La
  // SUPPRESSION reste réservée à l'administration, depuis Paramètres (les agents
  // n'y ont pas accès) : pas de bouton retirer sur ce volet.
  const [coachModal, setCoachModal] = useState(null)
  const nbJoursProgrammes = (c) => Object.values(c.horaires || {}).filter((h) => h?.actif).length

  const aujourdhui = todayStr()
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

  // Performance : jours (uniques) où chaque coach a été réellement pointé présent,
  // et nombre de séances enregistrées ces jours-là — un proxy de la fréquentation
  // client en sa présence. Un même jour n'est compté qu'une fois par coach, même
  // si (cas rare) plusieurs pointages existeraient pour ce jour.
  const performance = useMemo(() => {
    const joursParCoach = new Map()
    pointages.forEach((p) => {
      if (!joursParCoach.has(p.coachId)) joursParCoach.set(p.coachId, { nom: p.coachNom, jours: new Set() })
      joursParCoach.get(p.coachId).jours.add(p.date)
    })
    const seancesParJour = new Map()
    seances.forEach((s) => seancesParJour.set(s.date, (seancesParJour.get(s.date) || 0) + 1))
    return [...joursParCoach.entries()].map(([coachId, { nom, jours }]) => {
      const totalClients = [...jours].reduce((s, d) => s + (seancesParJour.get(d) || 0), 0)
      const nbJours = jours.size
      return { coachId, nom, nbJours, totalClients, moyenne: nbJours ? Math.round((totalClients / nbJours) * 10) / 10 : 0 }
    }).sort((a, b) => b.moyenne - a.moyenne)
  }, [pointages, seances])
  const maxMoyenne = Math.max(1, ...performance.map((p) => p.moyenne))

  // Historique — période filtrable, plus récent en premier.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const toutes = useMemo(() => [...pointages].sort((a, b) => (a.date < b.date ? 1 : -1)), [pointages])
  const historique = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((p) => (p.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((p) => (p.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((p) => p.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee])

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <UserCog size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Coachs</h2>
          <p className="text-sm text-white/80">Planning, pointage d'arrivée et performance — MAXI-GYM {siteLabel(site)}</p>
        </div>
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

      <Card title={titreSection(BarChart3, 'Performance — fréquentation en présence de chaque coach')} className={CARD_ACCENT_CLASS} style={cardAccentStyle(COULEUR)}>
        <p className="mb-3 text-xs text-gray-500">Nombre de séances enregistrées les jours où le coach a été pointé présent — une moyenne par jour de présence, pour comparer.</p>
        <div className="space-y-2.5">
          {performance.map((p) => (
            <div key={p.coachId} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-sm font-semibold text-gray-700">{p.nom}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(p.moyenne / maxMoyenne) * 100}%`, background: `linear-gradient(90deg, ${COULEUR}, ${COULEUR2})` }} />
              </div>
              <span className="w-40 shrink-0 text-right text-xs text-gray-500">
                <strong className="text-gray-800">{p.moyenne}</strong> client(s)/jour · {p.nbJours} jour(s) · {p.totalClients} au total
              </span>
            </div>
          ))}
          {!performance.length && <p className="py-6 text-center text-sm text-gray-400">Aucun pointage encore enregistré.</p>}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: COULEUR + '18', color: COULEUR }}><History size={14} /></span>
          Historique des pointages
        </h3>
        <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee} />
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
