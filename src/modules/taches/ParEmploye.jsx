// E-TACHES : vue par employé. Performance individuelle de chaque personne sur une période ; un clic ouvre sa fiche détaillée.
import { useMemo, useState } from 'react'
import { User } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import EtatVide from '../../shared/ui/EtatVide'
import { todayStr } from '../../utils/formatters'
import { COULEUR, enRetard, niveauTaches } from './data'
import { useMoi, useTaches, usePersonnel } from './hooks'
import { filtrerParPeriode, dateAttribution, joursEntre } from './pilotageCalculs'
import { usePeriode } from './Periode'
import { Tuile, Barre } from './ui'
import FicheActeur from './FicheActeur'

export default function ParEmploye() {
  const { role } = useMoi()
  const { taches } = useTaches()
  const { personnel } = usePersonnel()
  const { periode, bande, info } = usePeriode('month')
  const [ouvert, setOuvert] = useState(null)
  const jour = todayStr()

  const liste = useMemo(() => filtrerParPeriode(taches, periode), [taches, periode.mode, periode.from, periode.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const lignes = useMemo(() => {
    const m = {}
    personnel.forEach((p) => { m[p.uid] = { ...p, total: 0, finies: 0, encours: 0, afaire: 0, retard: 0, tardif: 0, somme: 0, n: 0 } })
    liste.forEach((t) => {
      const s = m[t.destUid]
      if (!s) return
      s.total++
      if (t.statut === 'Terminé') { s.finies++; if (t.dateCloture && dateAttribution(t)) { s.somme += Math.max(0, joursEntre(dateAttribution(t), t.dateCloture)); s.n++ } }
      else if (t.statut === 'En cours') s.encours++
      else s.afaire++
      if (enRetard(t, jour)) s.retard++
      if (t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour) s.tardif++
    })
    return Object.values(m).filter((s) => s.total > 0).map((s) => ({ ...s, taux: Math.round((s.finies * 100) / s.total), delai: s.n ? Math.round(s.somme / s.n) : 0 })).sort((a, b) => b.total - a.total)
  }, [liste, personnel, jour])

  if (!['chef', 'dir'].includes(niveauTaches(role))) return <EtatVide icone={User} accent={COULEUR} texte="Cette vue est réservée à la direction" />

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={User} surtitre="E-TACHES" titre="Vue par employé" sous={`Performance individuelle de chaque personne. ${info(liste.length)}`} pied={bande} />
      <Tuile titre={`Performance par employé (${lignes.length})`} icone={User} pad="p-0">
        {lignes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead><tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Employé</th><th className="px-3 py-2.5">Département</th><th className="px-3 py-2.5">Total</th><th className="px-3 py-2.5">Terminées</th><th className="px-3 py-2.5">En cours</th>
                <th className="px-3 py-2.5">À faire</th><th className="px-3 py-2.5">En retard</th><th className="px-3 py-2.5">Dém. tardif</th><th className="px-3 py-2.5">Délai</th><th className="px-3 py-2.5">Taux</th>
              </tr></thead>
              <tbody className="divide-y divide-black/5">
                {lignes.map((s) => (
                  <tr key={s.uid} onClick={() => setOuvert(s)} className="cursor-pointer transition-colors hover:bg-white/70">
                    <td className="px-4 py-2.5 font-bold text-gray-800">{s.nom}</td>
                    <td className="px-3 py-2.5 text-gray-500">{s.secteur || '-'}</td>
                    <td className="px-3 py-2.5 font-extrabold">{s.total}</td>
                    <td className="px-3 py-2.5 font-extrabold text-green-600">{s.finies}</td>
                    <td className="px-3 py-2.5 font-extrabold text-sky-600">{s.encours}</td>
                    <td className="px-3 py-2.5">{s.afaire}</td>
                    <td className="px-3 py-2.5">{s.retard ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-700">{s.retard}</span> : '-'}</td>
                    <td className="px-3 py-2.5">{s.tardif ? <span className="font-extrabold text-amber-600">{s.tardif}</span> : '-'}</td>
                    <td className="px-3 py-2.5">{s.delai ? `${s.delai} j` : '-'}</td>
                    <td className="w-32 px-3 py-2.5"><span className="flex items-center gap-2"><span className="flex-1"><Barre valeur={s.taux} couleur={s.taux >= 70 ? '#16a34a' : s.taux >= 40 ? '#d97706' : '#dc2626'} /></span><span className="w-9 text-right text-xs font-black">{s.taux}%</span></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-4"><EtatVide icone={User} accent={COULEUR} texte="Aucune donnée sur cette période" /></div>}
      </Tuile>
      {ouvert && <FicheActeur acteur={ouvert} taches={liste} onClose={() => setOuvert(null)} />}
    </div>
  )
}
