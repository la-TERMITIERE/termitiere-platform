// RH : Vie d'équipe, anniversaires. Les anniversaires de naissance et d'embauche à venir, rangés par échéance (aujourd'hui, cette semaine, ce mois, plus tard),
// et la liste des employés dont une date n'est pas renseignée. Les alertes du jour (accueil et notification) viennent de echeances.js.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cake, PartyPopper, CalendarHeart, TriangleAlert, ChevronRight } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr, formatDateShort } from '../../utils/formatters'
import { avatarGradient, icone3D } from '../../utils/color'
import { COL } from './store/rhStore'
import { PageHeader } from './rhui'
import { evenementsEmployes, datesManquantes } from './datesEquipe'

const ROSE = '#db2777'
const VIOLET = '#7c3aed'

const TRANCHES = [
  { id: 'jour', titre: "Aujourd'hui", test: (j) => j === 0 },
  { id: 'semaine', titre: 'Cette semaine', test: (j) => j >= 1 && j <= 7 },
  { id: 'mois', titre: 'Ce mois-ci', test: (j) => j >= 8 && j <= 30 },
  { id: 'plus', titre: 'Dans les 3 mois', test: (j) => j >= 31 && j <= 90 }
]

export default function Anniversaires() {
  const { data: employes } = useCollection(COL.employes)
  const today = todayStr()
  const [tout, setTout] = useState(false)
  const evenements = useMemo(() => evenementsEmployes(employes, today, 90), [employes, today])
  const manquantes = useMemo(() => datesManquantes(employes), [employes])
  const nbAujourdhui = evenements.filter((e) => e.jours === 0).length

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarHeart} sousModule="Vie de l'entreprise" titre="Anniversaires" sousTitre="Naissances et anniversaires d'embauche de l'équipe : la RH est alertée le jour même." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[{ icone: Cake, couleur: ROSE, titre: "Aujourd'hui", valeur: nbAujourdhui, sous: nbAujourdhui ? 'à souhaiter' : 'aucun' },
          { icone: PartyPopper, couleur: VIOLET, titre: 'Sous 7 jours', valeur: evenements.filter((e) => e.jours <= 7).length, sous: 'naissances et embauches' },
          { icone: TriangleAlert, couleur: '#f59e0b', titre: 'Dates à renseigner', valeur: manquantes.length, sous: 'employé(s) concerné(s)' }].map((t) => (
          <div key={t.titre} className="ed-entree flex items-center gap-3 rounded-[1.4rem] border border-white/80 bg-white/65 px-3.5 py-3 shadow-[0_10px_22px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl last:col-span-2 lg:last:col-span-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(t.couleur)}><t.icone size={18} aria-hidden="true" /></span>
            <span className="min-w-0"><span className="block text-2xl font-black leading-none tabular-nums text-gray-800">{t.valeur}</span><span className="block truncate text-[11px] font-bold uppercase tracking-wide text-gray-500">{t.titre}</span><span className="block truncate text-[11px] text-gray-400">{t.sous}</span></span>
          </div>
        ))}
      </div>

      {employes.length === 0 && <p className="rounded-3xl border border-white/80 bg-white/60 px-6 py-10 text-center text-sm text-gray-500 backdrop-blur-xl">Ajoutez d'abord des employés dans l'Annuaire.</p>}

      {TRANCHES.map((t) => {
        const liste = evenements.filter((e) => t.test(e.jours))
        if (!liste.length && t.id !== 'jour') return null
        if (t.id === 'plus' && !tout && evenements.filter((e) => TRANCHES.slice(0, 3).some((x) => x.test(e.jours))).length > 0) return null
        return (
          <section key={t.id} aria-label={t.titre} className="space-y-2">
            <h2 className="px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500">{t.titre}</h2>
            {liste.length === 0
              ? <p className="rounded-2xl border border-white/80 bg-white/60 px-4 py-5 text-center text-sm text-gray-400 backdrop-blur-xl">Aucun anniversaire aujourd'hui.</p>
              : <ul className="space-y-1.5">{liste.map((e, i) => <Ligne key={e.cle} e={e} rang={i} />)}</ul>}
          </section>
        )
      })}
      {evenements.some((e) => e.jours >= 31) && !tout && evenements.some((e) => e.jours <= 30) && (
        <button type="button" onClick={() => setTout(true)} className="mx-auto flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-4 py-1.5 text-xs font-bold text-gray-600 shadow-sm backdrop-blur-md transition-all hover:bg-white active:scale-95">Voir aussi les 3 mois à venir <ChevronRight size={13} aria-hidden="true" /></button>
      )}

      {manquantes.length > 0 && (
        <section aria-label="Dates à renseigner" className="space-y-2">
          <h2 className="flex items-center gap-2 px-1 text-sm font-extrabold uppercase tracking-wide text-amber-600"><TriangleAlert size={15} aria-hidden="true" /> Dates à renseigner</h2>
          <ul className="space-y-1.5">
            {manquantes.map(({ employe, naissance, embauche }) => (
              <li key={employe.id} className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 backdrop-blur-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: avatarGradient(employe.nom) }} aria-hidden="true">{(employe.nom || '?').trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-800">{employe.nom}</span>
                  <span className="block truncate text-[11px] text-amber-800">Manque : {[naissance && 'date de naissance', embauche && "date d'arrivée"].filter(Boolean).join(' et ')}</span></span>
                <Link to="/rh/employes" className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm hover:underline">Compléter</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Ligne({ e, rang }) {
  const naissance = e.type === 'naissance'
  const couleur = naissance ? ROSE : VIOLET
  const Icone = naissance ? Cake : PartyPopper
  const aujourdhui = e.jours === 0
  return (
    <li className="ed-entree relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/80 px-3.5 py-2.5 shadow-[0_10px_22px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
      style={{ background: aujourdhui ? `linear-gradient(110deg, ${couleur}26 0%, rgba(255,255,255,0.7) 55%)` : 'rgba(255,255,255,0.65)', animationDelay: `${Math.min(rang, 8) * 40}ms` }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(couleur)}><Icone size={18} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-gray-800">{e.employe.nom}</span>
        <span className="block truncate text-xs text-gray-600">
          {naissance ? `Fête ses ${e.nombre} ans` : `${e.nombre} an${e.nombre > 1 ? 's' : ''} dans l'entreprise`}
          <span className="text-gray-400"> · {[e.employe.poste, e.employe.departement].filter(Boolean).join(' · ') || 'Employé'}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums" style={{ background: `${couleur}1a`, color: couleur }}>{aujourdhui ? "Aujourd'hui" : e.jours === 1 ? 'Demain' : `Dans ${e.jours} j`}</span>
        <span className="mt-0.5 block text-[10px] text-gray-400">{formatDateShort(e.date)}</span>
      </span>
    </li>
  )
}
