// E-TACHES : vue par directeur. La capacité de chaque directeur (et de la responsable RH) à confier et suivre les tâches, avec un score sur 100.
// La direction générale et la RH voient tous les directeurs ; un directeur ne voit que sa propre fiche.
import { useMemo, useState } from 'react'
import { Briefcase, Users } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import StatCard from '../../shared/ui/StatCard'
import EtatVide from '../../shared/ui/EtatVide'
import AvatarNom from '../../shared/ui/AvatarNom'
import Badge from '../../shared/ui/Badge'
import { todayStr, formatNumber } from '../../utils/formatters'
import { COULEUR, enRetard, niveauTaches } from './data'
import { useMoi, useTaches, usePersonnel } from './hooks'
import { filtrerParPeriode } from './pilotageCalculs'
import { scoreDirecteur } from './analyse'
import { usePeriode } from './Periode'
import { Tuile, Bento, Barre } from './ui'
import FicheActeur from './FicheActeur'

const classeScore = (s) => (s >= 80 ? { l: 'Excellent', c: '#16a34a' } : s >= 65 ? { l: 'Bon', c: '#0284c7' } : s >= 50 ? { l: 'Moyen', c: '#d97706' } : { l: 'À améliorer', c: '#dc2626' })

export default function ParDirecteur() {
  const { moi, role } = useMoi()
  const niveau = niveauTaches(role)
  const { taches } = useTaches()
  const { personnel } = usePersonnel()
  const { periode, bande, info } = usePeriode('month')
  const [ouvert, setOuvert] = useState(null)
  const jour = todayStr()

  const liste = useMemo(() => filtrerParPeriode(taches, periode), [taches, periode.mode, periode.from, periode.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const directeurs = useMemo(() => personnel.filter((p) => ['df', 'directeur', 'rh'].includes(p.role)).filter((p) => niveau !== 'dir' || p.uid === moi), [personnel, niveau, moi])

  const stats = useMemo(() => directeurs.map((d) => {
    const assignees = liste.filter((t) => t.parUid === d.uid)
    const recues = liste.filter((t) => t.destUid === d.uid)
    const finies = assignees.filter((t) => t.statut === 'Terminé').length
    const retard = assignees.filter((t) => enRetard(t, jour)).length
    const tardif = assignees.filter((t) => t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour).length
    const taux = assignees.length ? Math.round((finies * 100) / assignees.length) : 0
    return {
      d, assignees: assignees.length, finies, retard, tardif, taux, score: scoreDirecteur({ assignees: assignees.length, enRetard: retard, demarrageTardif: tardif, tauxCompletion: taux }),
      recuesDesAutres: recues.filter((t) => t.parUid !== d.uid).length, aux: assignees.filter((t) => t.destUid !== d.uid).length, auto: assignees.filter((t) => t.destUid === d.uid).length,
      recuesFinies: recues.filter((t) => t.statut === 'Terminé').length, recuesRetard: recues.filter((t) => enRetard(t, jour)).length, equipe: personnel.filter((p) => p.secteur && d.secteur && p.secteur.toLowerCase() === d.secteur.toLowerCase() && p.uid !== d.uid).length
    }
  }).sort((a, b) => b.score - a.score), [directeurs, liste, personnel, jour])

  if (!['chef', 'dir', 'rh'].includes(niveau)) return <EtatVide icone={Briefcase} accent={COULEUR} texte="Cette vue est réservée à la direction" />

  const seul = niveau === 'dir'
  const total = stats.reduce((s, x) => s + x.assignees, 0), finies = stats.reduce((s, x) => s + x.finies, 0), retard = stats.reduce((s, x) => s + x.retard, 0)
  const moyen = stats.length ? Math.round(stats.reduce((s, x) => s + x.score, 0) / stats.length) : 0

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Briefcase} surtitre="E-TACHES" titre={seul ? 'Ma performance de directeur' : 'Vue par directeur'}
        sous={`${seul ? 'Indicateurs sur les tâches que vous gérez et qui vous sont confiées.' : 'Capacité de chaque directeur (et de la RH) à confier et suivre les tâches.'} ${info(liste.length)}`} pied={bande} />

      {stats.length > 1 && (
        <Bento>
          <StatCard title="Directeurs actifs" value={formatNumber(stats.length)} icon={Users} accent={COULEUR} />
          <StatCard title="Tâches confiées" value={formatNumber(total)} icon={Briefcase} accent="#0284c7" />
          <StatCard title="Terminées" value={formatNumber(finies)} sub={total ? `${Math.round((finies * 100) / total)}%` : ''} icon={Briefcase} accent="#16a34a" />
          <StatCard title="En retard" value={formatNumber(retard)} sub={`Score moyen ${moyen}/100`} icon={Briefcase} accent={retard ? '#dc2626' : '#16a34a'} />
        </Bento>
      )}

      {stats.length ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {stats.map((s) => {
            const cl = classeScore(s.score)
            return (
              <li key={s.d.uid} className="min-w-0">
                <Tuile className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <button type="button" onClick={() => setOuvert(s.d)} className="block w-full space-y-3 text-left">
                    <span className="flex items-center gap-3">
                      <AvatarNom nom={s.d.nom} accent={COULEUR} size={40} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-gray-800">{s.d.nom}</span><span className="block truncate text-xs text-gray-500">{s.d.role === 'rh' ? 'DA-RH' : 'Directeur'}{s.d.secteur ? ` · ${s.d.secteur}` : ''}{s.d.poste ? ` · ${s.d.poste}` : ''}</span></span>
                      <span className="shrink-0 text-right"><span className="block text-xl font-black" style={{ color: cl.c }}>{s.score}<span className="text-xs text-gray-400">/100</span></span><Badge tone="neutral">{cl.l}</Badge></span>
                    </span>
                    <span className="block"><Barre valeur={s.score} couleur={cl.c} /></span>
                    <span className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                      {[['Confiées', s.assignees], ['Terminées', s.finies, s.assignees ? `${s.taux}%` : ''], ['En retard', s.retard, '', s.retard ? '#dc2626' : ''], ['Dém. tardif', s.tardif, '', s.tardif ? '#d97706' : ''], ['Reçues', s.recuesDesAutres], ['Équipe', s.equipe]].map(([l, v, sous, c]) => (
                        <span key={l} className="rounded-xl bg-white/60 px-1 py-1.5"><span className="block text-[10px] font-bold uppercase text-gray-400">{l}</span><span className="block text-base font-black" style={{ color: c || '#1f2937' }}>{v}</span>{sous && <span className="block text-[10px] text-gray-400">{sous}</span>}</span>
                      ))}
                    </span>
                    <span className="block text-[11px] text-gray-500">{s.aux} confiée{s.aux > 1 ? 's' : ''} aux autres · {s.auto} auto-confiée{s.auto > 1 ? 's' : ''} · {s.recuesFinies} reçue{s.recuesFinies > 1 ? 's' : ''} terminée{s.recuesFinies > 1 ? 's' : ''}{s.recuesRetard ? ` · ${s.recuesRetard} en retard` : ''}</span>
                  </button>
                </Tuile>
              </li>
            )
          })}
        </ul>
      ) : <EtatVide icone={Briefcase} accent={COULEUR} texte="Aucun directeur trouvé" />}

      <p className="rounded-2xl border border-white/70 bg-white/50 px-4 py-3 text-xs text-gray-500 backdrop-blur-md"><strong>Score sur 100</strong> : 50 + la moitié du taux de complétion des tâches confiées, moins 2 points par tâche en retard (jusqu'à 30) et 1 point par démarrage tardif (jusqu'à 20). Sans tâche confiée, le score reste neutre (50).</p>
      {ouvert && <FicheActeur acteur={ouvert} taches={liste} onClose={() => setOuvert(null)} />}
    </div>
  )
}
