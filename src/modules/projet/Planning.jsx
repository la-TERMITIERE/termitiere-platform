import { useState, useMemo } from 'react'
import { CalendarDays, BarChart3, FolderKanban, Wrench, AlertTriangle, Clock } from 'lucide-react'
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
    <div className="relative space-y-4 rounded-[28px]" style={{ background: 'radial-gradient(120% 60% at 15% 0%, rgba(13,148,136,0.07) 0%, rgba(255,255,255,0) 55%), radial-gradient(120% 60% at 100% 100%, rgba(16,185,129,0.05) 0%, rgba(255,255,255,0) 50%)' }}>
      {/* En-tête */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <CalendarDays size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Planning</h2>
          <p className="text-sm text-white/80">Diagramme de Gantt et échéances de tous les projets</p>
        </div>
      </div>

      <div className="flex gap-1.5 rounded-2xl border border-white/55 bg-white/60 p-1.5 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
        {TABS.map((t) => {
          const Icon = t.icon
          const actif = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200
                ${actif ? 'bg-teal-600 text-white shadow-[0_8px_18px_-6px_rgba(13,148,136,0.55)]' : 'text-gray-500 hover:bg-white/70 hover:text-teal-700'}`}>
              <Icon size={15} className={actif ? 'text-white' : 'text-teal-500'} />{t.label}
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
  const COL   = 260 // largeur colonne noms (px)

  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreResponsable, setFiltreResponsable] = useState('')
  const [filtreProjet, setFiltreProjet] = useState('')

  const chefsDeProjet = useMemo(() =>
    [...new Set(projets.map((p) => p.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  [projets])

  const projetsFiltres = useMemo(() => projets
    .filter((p) => !filtreStatut || p.statut === filtreStatut)
    .filter((p) => !filtreResponsable || p.responsable === filtreResponsable)
    .filter((p) => !filtreProjet || p.id === filtreProjet),
  [projets, filtreStatut, filtreResponsable, filtreProjet])

  const { debut, fin, mois } = useMemo(() => {
    const avecDates = projetsFiltres.filter((p) => p.dateDebut || p.dateFin)
    if (!avecDates.length) return { debut: today, fin: addDays(today, 90), mois: [] }
    const ds    = avecDates.map((p) => p.dateDebut || p.dateFin)
    const fs    = avecDates.map((p) => p.dateFin   || p.dateDebut)
    const start = startOfDay(addDays(new Date(Math.min(...ds)), -15))
    const end   = endOfMonth(addDays(new Date(Math.max(...fs)), 15))
    return { debut: start, fin: end, mois: eachMonthOfInterval({ start, end }) }
  }, [projetsFiltres])

  const totalDays = differenceInDays(fin, debut) + 1

  const pct   = (ts) => (Math.max(0, Math.min(differenceInDays(startOfDay(new Date(ts)), debut), totalDays - 1)) / totalDays) * 100
  const wPct  = (t1, t2) => Math.max(0.8, ((Math.min(totalDays - 1, differenceInDays(startOfDay(new Date(t2)), debut)) - Math.max(0, differenceInDays(startOfDay(new Date(t1)), debut)) + 1) / totalDays) * 100)

  const todayPct           = pct(today.getTime())
  const projetsAvecDates   = projetsFiltres.filter((p) => p.dateDebut || p.dateFin)

  return (
    <div className="space-y-3">
      {/* ── Filtres ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/55 bg-white/60 p-2.5 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
        <select className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {[...projets].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_PROJET).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {chefsDeProjet.length > 0 && (
          <select className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            value={filtreResponsable} onChange={(e) => setFiltreResponsable(e.target.value)}>
            <option value="">Tous les chefs de projet</option>
            {chefsDeProjet.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {(filtreStatut || filtreResponsable || filtreProjet) && (
          <button onClick={() => { setFiltreStatut(''); setFiltreResponsable(''); setFiltreProjet('') }}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-400 transition-colors hover:bg-white hover:text-gray-600">Réinitialiser</button>
        )}
      </div>

      {!projetsAvecDates.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <BarChart3 size={32} className="opacity-30" />
            <p className="text-sm">Aucun projet avec des dates ne correspond à ces filtres.</p>
          </div>
        </Card>
      ) : (
      <div className="overflow-hidden rounded-3xl border border-white/55 bg-white/70 backdrop-blur-xl backdrop-saturate-150 shadow-[0_28px_56px_-20px_rgba(13,148,136,0.30),0_8px_20px_-8px_rgba(13,148,136,0.15),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
        <div className="overflow-x-auto">
          <div style={{ minWidth: COL + Math.max(600, totalDays * 4) }}>

            {/* ── Lignes défilables, en-tête figé en haut ──────────────────── */}
            <div className="overflow-y-auto" style={{ maxHeight: '62vh' }}>
              <div className="flex border-b-2 border-teal-100 bg-teal-50/70 sticky top-0 z-20 backdrop-blur-md">
                <div style={{ width: COL, minWidth: COL }} className="shrink-0 border-r-2 border-teal-100 bg-teal-50/70 px-4 py-3 text-xs font-black text-teal-700 uppercase tracking-wide">
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
                          className="border-r border-teal-100 py-3 text-center text-xs font-bold capitalize text-teal-700 last:border-r-0">
                          {format(m, 'MMM yyyy', { locale: fr })}
                        </div>
                      )
                    })}
                  </div>
                  {/* Étiquette « Aujourd'hui » alignée sur la ligne repère */}
                  {todayPct >= 0 && todayPct <= 100 && (
                    <div style={{ left: `${todayPct}%` }} className="pointer-events-none absolute -bottom-2.5 z-20 -translate-x-1/2">
                      <span className="whitespace-nowrap rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-[0_3px_8px_-2px_rgba(239,68,68,0.6)]">Aujourd'hui</span>
                    </div>
                  )}
                </div>
              </div>

          {/* ── Lignes projets ─────────────────────────────────────────────── */}
          {projetsAvecDates.map((p, pi) => {
            const d          = p.dateDebut || p.dateFin
            const f          = p.dateFin   || p.dateDebut
            const couleur    = BARRE_COULEUR[p.statut] || '#94a3b8'
            const tachesP    = taches.filter((t) => t.projetId === p.id && t.echeance)
            const rowBg      = pi % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
            const largeurPct = wPct(d, f)
            const barreEtroite = largeurPct < 12 // pas assez large pour le texte à l'intérieur

            return (
              <div key={p.id}>
                {/* Ligne projet */}
                <div className={`flex border-b border-gray-100 ${rowBg} hover:bg-teal-50/30 transition-colors`} style={{ minHeight: 48 }}>
                  {/* Nom */}
                  <div style={{ width: COL, minWidth: COL }} className="shrink-0 border-r-2 border-gray-200 flex items-center gap-2 px-4 py-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: couleur }} />
                    {p.responsable && (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white shadow-sm" style={{ background: couleur }} title={p.responsable}>
                        {p.responsable.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-gray-800" title={p.nom}>{p.nom}</p>
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
                      <div style={{ left: `${todayPct}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-400/80 z-10 pointer-events-none" />
                    )}
                    {/* Barre projet */}
                    <div className="transition-transform duration-150 hover:scale-y-110" style={{
                      left: `${pct(d)}%`, width: `${largeurPct}%`,
                      position: 'absolute', height: 22,
                      background: `linear-gradient(180deg, ${couleur}f0, ${couleur})`, borderRadius: 8,
                      boxShadow: `0 3px 8px -2px ${couleur}88, inset 0 1px 0 0 rgba(255,255,255,0.35)`
                    }} title={`${p.nom}\n${formatDateShort(d)} → ${formatDateShort(f)}`}>
                      {/* Label dates — à l'intérieur si la barre est assez large, sinon à droite pour rester lisible */}
                      {barreEtroite ? (
                        <span className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[9px] font-bold text-gray-500">
                          {formatDateShort(d)} → {formatDateShort(f)}
                        </span>
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 px-1 overflow-hidden whitespace-nowrap">
                          {formatDateShort(d)} → {formatDateShort(f)}
                        </span>
                      )}
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
                        <div style={{ left: `calc(${pct(t.echeance)}% - 1px)`, background: terminee ? '#16a34a' : '#f59e0b' }}
                          className="absolute top-1 bottom-1 w-0.5 rounded-full pointer-events-none opacity-70" />
                        <div className="transition-transform duration-150 hover:scale-125"
                          style={{ left: `calc(${pct(t.echeance)}% - 7px)`, position:'absolute', top:'50%', transform:'translateY(-50%)' }}
                          title={`${t.titre} — échéance : ${formatDateShort(t.echeance)}`}>
                          <div style={{ width:14, height:14, borderRadius:4, transform:'rotate(45deg)', background: terminee ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#fbbf24,#f59e0b)', boxShadow:'0 2px 6px -1px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.4)' }} />
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
            </div>
            {/* ── Légende — hors zone de défilement, toujours visible en bas ──── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-teal-100 bg-teal-50/50 px-3 py-2.5">
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-sm">
                <span className="inline-block h-0.5 w-4 rounded bg-red-400" />Aujourd'hui
              </span>
              {Object.entries(BARRE_COULEUR).map(([statut, couleur]) => (
                <span key={statut} className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-sm">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: couleur }} />
                  {STATUTS_PROJET[statut]?.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" style={{ transform:'rotate(45deg)' }} />Tâche
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" style={{ transform:'rotate(45deg)' }} />Tâche terminée
              </span>
            </div>

          </div>
        </div>
      </div>
      )}
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
  const TYPE_ICON   = { Projet: FolderKanban, Tâche: Wrench }
  const GROUPE_ICON = { 'Dépassé': AlertTriangle, "Aujourd'hui": Clock, 'Cette semaine': Clock, 'Semaine prochaine': CalendarDays, 'Ce mois': CalendarDays, 'Plus tard': CalendarDays }

  if (!echeances.length) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
          <CalendarDays size={32} className="opacity-30" />
          <p className="text-sm">Aucune échéance enregistrée.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {groupes.map((g) => {
        const GroupeIcon = GROUPE_ICON[g.label] || CalendarDays
        return (
        <div key={g.label}>
          <div className="mb-2 flex items-center gap-2">
            <GroupeIcon size={14} className="text-gray-400" />
            <Badge tone={toneGroupe[g.label] || 'neutral'}>{g.label}</Badge>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{g.items.length} élément{g.items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1.5">
            {g.items.map((e) => {
              const passe = e.date < today.getTime()
              const enRetard = passe && e.statut !== 'terminee'
              const TypeIcon = TYPE_ICON[e.type]
              return (
                <div key={e.id}
                  className={`flex items-center gap-3 rounded-2xl border border-white/55 border-l-4 px-3.5 py-2.5 text-sm backdrop-blur-md backdrop-saturate-150 transition-all duration-200 hover:-translate-y-0.5 ${enRetard ? 'border-l-red-400 bg-red-50/70 shadow-[0_10px_28px_-16px_rgba(220,38,38,0.35),inset_0_1px_0_0_rgba(255,255,255,0.5)] hover:shadow-[0_16px_36px_-16px_rgba(220,38,38,0.4)]' : 'bg-white/65 shadow-[0_10px_28px_-16px_rgba(13,148,136,0.25),inset_0_1px_0_0_rgba(255,255,255,0.55)] hover:shadow-[0_16px_36px_-16px_rgba(13,148,136,0.3)]'}`}
                  style={enRetard ? undefined : { borderLeftColor: TYPE_COLOR[e.type] }}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: TYPE_COLOR[e.type] + '18', color: TYPE_COLOR[e.type] }}>
                    <TypeIcon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate ${e.statut === 'terminee' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{e.label}</p>
                    {e.sous && <p className="text-xs text-gray-400 truncate">{e.sous}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-xs font-medium ${enRetard ? 'text-red-500' : 'text-gray-500'}`}>{formatDateShort(e.date)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: TYPE_COLOR[e.type] + '18', color: TYPE_COLOR[e.type] }}>{e.type}</span>
                    {e.statut === 'terminee' && <Badge tone="success">Terminé</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })}
    </div>
  )
}
