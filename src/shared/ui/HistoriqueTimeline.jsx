// Timeline générique « Historique » — regroupe des événements d'audit par jour,
// avec pagination PAR JOUR (jamais par événement, pour ne pas couper une journée
// en deux) afin de rester léger même si l'activité s'accumule sur des mois.
//
// Complémentaire du Journal (recherche/période ciblée sur le récent) : ici on
// montre l'archive complète, organisée chronologiquement, filtrable par type
// d'événement seulement.
import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import Card from './Card'
import Select from '../forms/Select'

const JOURS_PAR_PAGE = 20

export default function HistoriqueTimeline({ evenements, evInfo }) {
  const [filtreAction, setFiltreAction] = useState('')
  const [joursAffiches, setJoursAffiches] = useState(JOURS_PAR_PAGE)

  const typesPresents = useMemo(
    () => [...new Set(evenements.map((e) => e.action).filter(Boolean))].sort(),
    [evenements]
  )

  const lignes = useMemo(() =>
    evenements
      .filter((e) => !filtreAction || e.action === filtreAction)
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0)),
  [evenements, filtreAction])

  // Réinitialise la pagination quand le filtre change, pour ne pas garder une
  // profondeur héritée d'une autre recherche.
  useEffect(() => { setJoursAffiches(JOURS_PAR_PAGE) }, [filtreAction])

  const parJourTout = useMemo(() => {
    const groupes = {}
    lignes.forEach((e) => {
      const d = new Date(e.timestamp || e.createdAt || 0)
      const cle = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      if (!groupes[cle]) groupes[cle] = []
      groupes[cle].push(e)
    })
    return Object.entries(groupes)
  }, [lignes])

  // lignes est trié du plus récent au plus ancien, donc les clés de jour
  // apparaissent déjà dans cet ordre à l'insertion — trancher les N premières
  // donne les N derniers jours.
  const parJour = parJourTout.slice(0, joursAffiches)
  const joursRestants = parJourTout.length - parJour.length

  const heureStr = (ts) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const estAujourdhui = (label) => {
    const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return label === auj
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
          <option value="">Tous les événements</option>
          {typesPresents.map((t) => {
            const info = evInfo(t)
            return <option key={t} value={t}>{info.emoji} {info.label}</option>
          })}
        </Select>
        {lignes.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{lignes.length} événement{lignes.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {!lignes.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <History size={32} className="opacity-30" />
            <p className="text-sm">Aucun historique pour le moment.</p>
            <p className="text-xs">Toute l'activité du module apparaîtra ici au fur et à mesure.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {parJour.map(([jour, evs]) => (
            <div key={jour}>
              {/* ── En-tête du jour ── */}
              <div className="mb-3 flex items-center gap-3">
                <div className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${estAujourdhui(jour) ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {estAujourdhui(jour) ? "Aujourd'hui" : jour}
                </div>
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[10px] text-gray-400">{evs.length} action{evs.length > 1 ? 's' : ''}</span>
              </div>

              {/* ── Timeline du jour ── */}
              <div className="ml-2 border-l-2 border-gray-100 pl-4 space-y-3">
                {evs.map((e, i) => {
                  const info = evInfo(e.action)
                  return (
                    <div key={e.id || i} className="relative flex items-start gap-3">
                      {/* point sur la ligne */}
                      <div className="absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />
                      <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{info.emoji} {info.label}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-gray-400">{heureStr(e.timestamp || e.createdAt)}</span>
                        </div>
                        {e.details && <p className="mt-1 text-sm font-medium text-gray-700">{e.details}</p>}
                        <p className="mt-0.5 text-[11px] text-gray-400">par <span className="font-semibold text-gray-500">{e.userNom || e.userId || 'Système'}</span></p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {joursRestants > 0 && (
            <button onClick={() => setJoursAffiches((n) => n + JOURS_PAR_PAGE)}
              className="mx-auto flex items-center gap-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50">
              Charger {Math.min(joursRestants, JOURS_PAR_PAGE)} jour{Math.min(joursRestants, JOURS_PAR_PAGE) > 1 ? 's' : ''} de plus ({joursRestants} restant{joursRestants > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
