import { useState, useMemo } from 'react'
import { CalendarDays, BarChart3 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { STATUTS_PROJET } from './data'
import { formatDateShort } from '../../utils/formatters'
import {
  endOfMonth, eachMonthOfInterval,
  format, differenceInDays, startOfDay, addDays
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuthStore } from '../../core/auth'
import { projetsVisibles, scopeParProjets } from './logic'

const TABS = [
  { id: 'gantt',     label: 'Diagramme de Gantt', icon: BarChart3 },
  { id: 'echeances', label: 'Échéances',           icon: CalendarDays }
]

const BARRE_COULEUR = {
  planification: '#94a3b8',
  en_cours:      '#0d9488',
  en_pause:      '#f59e0b',
  termine:       '#16a34a',
  annule:        '#ef4444'
}

export default function Planning() {
  const { data: projetsTous } = useCollection('projets')
  const { data: tachesTous }  = useCollection('projet_taches')
  const { user, role } = useAuthStore()
  // Cloisonnement : un chef de projet ne voit que le planning de ses projets.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const taches  = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])
  const [tab, setTab] = useState('gantt')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all
                ${tab === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {tab === 'gantt'     && <GanttView     projets={projets} taches={taches} />}
      {tab === 'echeances' && <EcheancesView projets={projets} taches={taches} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GANTT
// ═══════════════════════════════════════════════════════════════════════════

function GanttView({ projets, taches }) {
  const today = startOfDay(new Date())
  const COL   = 220 // largeur colonne noms (px)

  const { debut, fin, mois } = useMemo(() => {
    const avecDates = projets.filter((p) => p.dateDebut || p.dateFin)
    if (!avecDates.length) return { debut: today, fin: addDays(today, 90), mois: [] }
    const ds    = avecDates.map((p) => p.dateDebut || p.dateFin)
    const fs    = avecDates.map((p) => p.dateFin   || p.dateDebut)
    const start = startOfDay(addDays(new Date(Math.min(...ds)), -15))
    const end   = endOfMonth(addDays(new Date(Math.max(...fs)), 15))
    return { debut: start, fin: end, mois: eachMonthOfInterval({ start, end }) }
  }, [projets])

  const totalDays = differenceInDays(fin, debut) + 1

  const pct   = (ts) => (Math.max(0, Math.min(differenceInDays(startOfDay(new Date(ts)), debut), totalDays - 1)) / totalDays) * 100
  const wPct  = (t1, t2) => Math.max(0.8, ((Math.min(totalDays - 1, differenceInDays(startOfDay(new Date(t2)), debut)) - Math.max(0, differenceInDays(startOfDay(new Date(t1)), debut)) + 1) / totalDays) * 100)

  const todayPct           = pct(today.getTime())
  const projetsAvecDates   = projets.filter((p) => p.dateDebut || p.dateFin)

  if (!projetsAvecDates.length) {
    return <Card><p className="py-10 text-center text-sm text-gray-400">Aucun projet avec des dates — ajoutez des dates début/fin dans l'onglet Projets.</p></Card>
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/70 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07)] backdrop-blur-xl backdrop-saturate-150">
      <div className="overflow-x-auto">
        <div style={{ minWidth: COL + Math.max(600, totalDays * 4) }}>

          {/* ── En-tête ────────────────────────────────────────────────────── */}
          <div className="flex bg-gray-50 border-b-2 border-gray-200">
            <div style={{ width: COL, minWidth: COL }} className="shrink-0 border-r-2 border-gray-200 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
              Projet / Tâche
            </div>
            <div className="relative flex-1">
              {/* Colonnes mois */}
              <div className="flex h-full">
                {mois.map((m) => {
                  const days = differenceInDays(endOfMonth(m), startOfDay(m)) + 1
                  const w    = (days / totalDays) * 100
                  return (
                    <div key={m.toISOString()} style={{ width: `${w}%` }}
                      className="border-r border-gray-200 py-3 text-center text-xs font-bold text-gray-600 last:border-r-0 bg-gray-50">
                      {format(m, 'MMM yyyy', { locale: fr })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Lignes projets ─────────────────────────────────────────────── */}
          {projetsAvecDates.map((p, pi) => {
            const d          = p.dateDebut || p.dateFin
            const f          = p.dateFin   || p.dateDebut
            const couleur    = BARRE_COULEUR[p.statut] || '#94a3b8'
            const tachesP    = taches.filter((t) => t.projetId === p.id && t.echeance)
            const rowBg      = pi % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'

            return (
              <div key={p.id}>
                {/* Ligne projet */}
                <div className={`flex border-b border-gray-100 ${rowBg} hover:bg-teal-50/30 transition-colors`} style={{ minHeight: 48 }}>
                  {/* Nom */}
                  <div style={{ width: COL, minWidth: COL }} className="shrink-0 border-r-2 border-gray-200 flex items-center gap-2 px-4 py-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: couleur }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate" title={p.nom}>{p.nom}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{STATUTS_PROJET[p.statut]?.label}</p>
                    </div>
                  </div>
                  {/* Zone graphique */}
                  <div className="relative flex-1 flex items-center">
                    {/* Grilles verticales mois */}
                    {mois.map((m) => (
                      <div key={m.toISOString()} style={{ left: `${pct(m.getTime())}%` }}
                        className="absolute top-0 bottom-0 w-px bg-gray-100 pointer-events-none" />
                    ))}
                    {/* Ligne aujourd'hui */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div style={{ left: `${todayPct}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none" />
                    )}
                    {/* Barre projet */}
                    <div style={{
                      left: `${pct(d)}%`, width: `${wPct(d, f)}%`,
                      position: 'absolute', height: 22,
                      background: couleur, borderRadius: 6, opacity: 0.9,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                    }} title={`${p.nom}\n${formatDateShort(d)} → ${formatDateShort(f)}`}>
                      {/* Label dates sur la barre */}
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 px-1 overflow-hidden whitespace-nowrap">
                        {formatDateShort(d)} → {formatDateShort(f)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sous-lignes tâches */}
                {tachesP.map((t) => {
                  const terminee = t.statut === 'terminee'
                  return (
                    <div key={t.id} className={`flex border-b border-gray-50 ${rowBg} hover:bg-teal-50/20 transition-colors`} style={{ minHeight: 36 }}>
                      {/* Nom tâche avec indent */}
                      <div style={{ width: COL, minWidth: COL }} className="shrink-0 border-r-2 border-gray-200 flex items-center gap-2 px-4 py-1 pl-10">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminee ? 'bg-green-500' : 'bg-amber-400'}`} />
                        <p className={`text-xs truncate ${terminee ? 'text-gray-400 line-through' : 'text-gray-600'}`} title={t.titre}>{t.titre}</p>
                      </div>
                      {/* Zone graphique tâche */}
                      <div className="relative flex-1 flex items-center">
                        {mois.map((m) => (
                          <div key={m.toISOString()} style={{ left: `${pct(m.getTime())}%` }}
                            className="absolute top-0 bottom-0 w-px bg-gray-100 pointer-events-none" />
                        ))}
                        {todayPct >= 0 && todayPct <= 100 && (
                          <div style={{ left: `${todayPct}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-300 z-10 pointer-events-none opacity-50" />
                        )}
                        {/* Marqueur d'échéance */}
                        <div style={{ left: `calc(${pct(t.echeance)}% - 1px)` }}
                          className="absolute top-1 bottom-1 w-0.5 rounded-full pointer-events-none"
                          style2={{ background: terminee ? '#16a34a' : '#f59e0b' }} />
                        <div
                          style={{ left: `calc(${pct(t.echeance)}% - 7px)`, position:'absolute', top:'50%', transform:'translateY(-50%)' }}
                          title={`${t.titre} — échéance : ${formatDateShort(t.echeance)}`}>
                          <div style={{ width:14, height:14, borderRadius:3, transform:'rotate(45deg)', background: terminee ? '#16a34a' : '#f59e0b', boxShadow:'0 1px 2px rgba(0,0,0,0.2)' }} />
                        </div>
                        {/* Date sous le marqueur */}
                        <span style={{ left: `calc(${pct(t.echeance)}% - 16px)`, top:'calc(50% + 10px)', position:'absolute', fontSize:8, color:'#9ca3af', whiteSpace:'nowrap' }}>
                          {formatDateShort(t.echeance)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* ── Légende ───────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-gray-50 px-4 py-2">
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block w-4 h-0.5 bg-red-400 rounded" />Aujourd'hui
            </span>
            {Object.entries(BARRE_COULEUR).map(([statut, couleur]) => (
              <span key={statut} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: couleur }} />
                {STATUTS_PROJET[statut]?.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" style={{ transform:'rotate(45deg)' }} />Tâche
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" style={{ transform:'rotate(45deg)' }} />Tâche terminée
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉCHÉANCES
// ═══════════════════════════════════════════════════════════════════════════

function EcheancesView({ projets, taches }) {
  const today = startOfDay(new Date())

  const echeances = useMemo(() => {
    const items = []
    projets.filter((p) => p.dateFin).forEach((p) => {
      items.push({ id: `p_${p.id}`, date: p.dateFin, label: p.nom, type: 'Projet', statut: p.statut, tone: STATUTS_PROJET[p.statut]?.tone })
    })
    taches.filter((t) => t.echeance).forEach((t) => {
      const projet = projets.find((p) => p.id === t.projetId)
      items.push({ id: `t_${t.id}`, date: t.echeance, label: t.titre, sous: projet?.nom, type: 'Tâche', statut: t.statut, tone: t.statut === 'terminee' ? 'success' : undefined })
    })
    return items.sort((a, b) => a.date - b.date)
  }, [projets, taches])

  const groupes = useMemo(() => {
    const map = {}
    echeances.forEach((e) => {
      const d    = startOfDay(new Date(e.date))
      const diff = differenceInDays(d, today)
      let groupe
      if (diff < 0)        groupe = 'Dépassé'
      else if (diff === 0) groupe = "Aujourd'hui"
      else if (diff <= 7)  groupe = 'Cette semaine'
      else if (diff <= 14) groupe = 'Semaine prochaine'
      else if (diff <= 30) groupe = 'Ce mois'
      else                  groupe = 'Plus tard'
      if (!map[groupe]) map[groupe] = []
      map[groupe].push(e)
    })
    const ordre = ['Dépassé', "Aujourd'hui", 'Cette semaine', 'Semaine prochaine', 'Ce mois', 'Plus tard']
    return ordre.filter((k) => map[k]).map((k) => ({ label: k, items: map[k] }))
  }, [echeances])

  const toneGroupe  = { 'Dépassé': 'danger', "Aujourd'hui": 'warning', 'Cette semaine': 'info' }
  const TYPE_COLOR  = { Projet: '#0d9488', Tâche: '#6366f1' }

  if (!echeances.length) {
    return <Card><p className="py-10 text-center text-sm text-gray-400">Aucune échéance enregistrée.</p></Card>
  }

  return (
    <div className="space-y-4">
      {groupes.map((g) => (
        <div key={g.label}>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={toneGroupe[g.label] || 'neutral'}>{g.label}</Badge>
            <span className="text-xs text-gray-400">{g.items.length} élément{g.items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1">
            {g.items.map((e) => {
              const passe = e.date < today.getTime()
              return (
                <div key={e.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm backdrop-blur-sm ${passe && e.statut !== 'terminee' ? 'border-red-200/60 bg-red-50/60' : 'border-white/50 bg-white/50'}`}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOR[e.type], flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate ${e.statut === 'terminee' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{e.label}</p>
                    {e.sous && <p className="text-xs text-gray-400 truncate">{e.sous}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-gray-500">{formatDateShort(e.date)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: TYPE_COLOR[e.type] + '20', color: TYPE_COLOR[e.type] }}>{e.type}</span>
                    {e.statut === 'terminee' && <Badge tone="success">Terminé</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
