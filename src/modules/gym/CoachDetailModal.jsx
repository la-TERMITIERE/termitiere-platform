// MAXI-GYM : fiche d'un coach. `vue="calendrier"` : calendrier des jours d'arrivée avec
// l'heure pointée (et les absences) ; `vue="details"` : fiche individuelle complète
// (statistiques, planning, rattachements, absences, derniers pointages + calendrier).
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, UserCog, CheckCircle2, Clock3, UserX, Percent, Ticket, CreditCard } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { JOURS_SEMAINE, MOIS_LABELS_GYM } from './data'
import { estAbsent } from './coachPointage'
import CalendrierPresences from './CalendrierPresences'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

const decaler = (mois, delta) => {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function CoachDetailModal({ coach, vue = 'details', onClose, pointages, seances, abonnements }) {
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  useEffect(() => { if (coach) setMois(todayStr().slice(0, 7)) }, [coach?.id, vue])

  const mesPointages = useMemo(
    () => (coach ? pointages.filter((p) => p.coachId === coach.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [pointages, coach]
  )
  const presents = useMemo(() => mesPointages.filter((p) => !estAbsent(p)), [mesPointages])
  const absents = useMemo(() => mesPointages.filter(estAbsent), [mesPointages])
  const retards = presents.filter((p) => p.statut === 'retard').length
  const ponctualite = presents.length ? Math.round(((presents.length - retards) / presents.length) * 100) : null

  const duMois = useMemo(() => mesPointages.filter((p) => (p.date || '').startsWith(mois)), [mesPointages, mois])
  const presentsMois = duMois.filter((p) => !estAbsent(p))
  const absentsMois = duMois.filter(estAbsent)

  const nbSeances = coach ? seances.filter((s) => s.coachId === coach.id).length : 0
  const nbAbonnements = coach ? abonnements.filter((a) => a.coachId === coach.id).length : 0

  const calendrier = (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMois((m) => decaler(m, -1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" title="Mois précédent"><ChevronLeft size={18} /></button>
        <span className="text-xs font-semibold text-gray-500">{MOIS_LABELS_GYM[Number(mois.slice(5, 7)) - 1]} {mois.slice(0, 4)}</span>
        <button type="button" onClick={() => setMois((m) => decaler(m, 1))} disabled={mois >= todayStr().slice(0, 7)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" title="Mois suivant"><ChevronRight size={18} /></button>
      </div>
      <CalendrierPresences mois={mois}
        joursPresents={presentsMois.map((p) => p.date)}
        joursRetard={presentsMois.filter((p) => p.statut === 'retard').map((p) => p.date)}
        joursAbsents={absentsMois.map((p) => p.date)}
        motifs={Object.fromEntries(absentsMois.map((p) => [p.date, p.motif]))}
        details={Object.fromEntries(presentsMois.filter((p) => p.heureArrivee).map((p) => [p.date, p.heureArrivee]))} />
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: COULEUR }} /> À l'heure</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> En retard</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> Absent</span>
      </div>
    </div>
  )

  const ligne = (p) => (
    <div key={p.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${estAbsent(p) ? 'bg-red-50' : p.statut === 'retard' ? 'bg-amber-50' : 'bg-green-50'}`}>
      <span className="text-gray-700">{formatDateShort(p.date)}</span>
      {estAbsent(p)
        ? <span className="min-w-0 truncate text-right font-semibold text-red-600">Absent : {p.motif || '—'}</span>
        : <span className={`font-semibold ${p.statut === 'retard' ? 'text-amber-600' : 'text-green-700'}`}>{p.heureArrivee || '—'}{p.heureProgrammee ? ` (prévu ${p.heureProgrammee})` : ''}{p.statut === 'retard' ? ' · retard' : ''}</span>}
    </div>
  )

  return (
    <Modal open={!!coach} onClose={onClose} size="lg" {...glassModalProps(COULEUR_MODULE.gym)}
      title={coach ? (vue === 'calendrier' ? `Calendrier : ${coach.nom}` : coach.nom) : ''}
      footer={<Button variant="outline" onClick={onClose}>Fermer</Button>}>
      {coach && (
        <div className="space-y-4">
          <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
            style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
              <UserCog size={22} color="white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold leading-tight">{coach.nom}</p>
              <p className="text-sm text-white/80">{presents.length} jour{presents.length > 1 ? 's' : ''} de présence · {absents.length} absence{absents.length > 1 ? 's' : ''}</p>
            </div>
          </div>

          {vue === 'calendrier' ? (
            <>
              {calendrier}
              <div className="space-y-1.5">
                {duMois.length === 0
                  ? <p className="py-2 text-center text-sm text-gray-400">Aucun pointage ce mois-ci.</p>
                  : duMois.map(ligne)}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Jours présents" value={presents.length} icon={CheckCircle2} accent="#16a34a" />
                <StatCard title="Retards" value={retards} icon={Clock3} accent="#f59e0b" />
                <StatCard title="Absences" value={absents.length} icon={UserX} accent="#ef4444" />
                <StatCard title="Ponctualité" value={ponctualite == null ? '—' : `${ponctualite} %`} icon={Percent} accent="#0ea5e9" />
                <StatCard title="Séances rattachées" value={nbSeances} icon={Ticket} accent={COULEUR} />
                <StatCard title="Abonnements rattachés" value={nbAbonnements} icon={CreditCard} accent={COULEUR2} />
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3.5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">📅 Planning hebdomadaire</p>
                <div className="flex flex-wrap gap-1.5">
                  {JOURS_SEMAINE.map((j) => {
                    const h = coach.horaires?.[j.id]
                    return h?.actif
                      ? <Badge key={j.id} tone="warning">{j.label.slice(0, 3)} {h.heure}</Badge>
                      : <span key={j.id} className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400">{j.label.slice(0, 3)} repos</span>
                  })}
                </div>
              </div>

              {calendrier}

              {absents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-red-600">🚫 Absences ({absents.length})</p>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">{absents.map(ligne)}</div>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">📍 Derniers pointages</p>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {mesPointages.length === 0 ? <p className="py-2 text-center text-sm text-gray-400">Aucun pointage encore.</p> : mesPointages.slice(0, 15).map(ligne)}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
