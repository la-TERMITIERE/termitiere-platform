// RH : tableau de bord par secteur (un secteur = un département, les départements sont les modules de l'entreprise).
// Pour chacun : l'effectif, l'absentéisme des 30 derniers jours, l'ancienneté moyenne et, pour PAU, GE, DF et Info seulement, la masse salariale brute.
// Au clic sur une carte : la liste des employés du secteur.
import { useMemo, useState } from 'react'
import { Building2, Users, UserX, Hourglass, Wallet } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { canExportExcel } from '../../core/roles'
import { formatMoney, todayStr } from '../../utils/formatters'
import { COL, calculerBulletin } from './store/rhStore'
import { visuelDepartement, LogoDepartement } from './departementsVisuel'
import DetailKpiModal from './DetailKpiModal'

const norme = (t) => String(t || '').trim().toLowerCase()
const JOUR = 864e5

export default function ParSecteurRh({ employes, presences }) {
  const roleReel = useAuth((s) => s.roleReel)
  const voitArgent = canExportExcel(roleReel)
  const { data: departements } = useCollection(COL.departements)
  const [ouvert, setOuvert] = useState(null)

  const secteurs = useMemo(() => {
    const aujourdhui = todayStr()
    const debut = new Date(new Date(`${aujourdhui}T00:00:00`).getTime() - 30 * JOUR).toISOString().slice(0, 10)
    const groupes = {}
    employes.filter((e) => (e.statut || 'actif') !== 'sorti').forEach((e) => {
      const nom = (e.departement || '').trim() || 'Non renseigné'
      ;(groupes[nom] = groupes[nom] || []).push(e)
    })
    return Object.entries(groupes).map(([nom, liste]) => {
      const ids = new Set(liste.map((e) => e.id))
      const pointages = presences.filter((p) => ids.has(p.employeId) && p.date >= debut && p.date <= aujourdhui)
      const absences = pointages.filter((p) => p.statut === 'absent').length
      const absenteisme = pointages.length ? Math.round((absences / pointages.length) * 1000) / 10 : null
      const anciennetes = liste.filter((e) => e.dateEmbauche).map((e) => Math.max(0, (Date.now() - new Date(`${e.dateEmbauche}T00:00:00`).getTime()) / (365.25 * JOUR)))
      const anciennete = anciennetes.length ? anciennetes.reduce((s, a) => s + a, 0) / anciennetes.length : null
      const masse = liste.reduce((s, e) => s + calculerBulletin(e.salaire).brutTotal, 0)
      const visuel = visuelDepartement(departements.find((d) => norme(d.nom) === norme(nom)) || { nom })
      return { nom, liste, effectif: liste.length, absenteisme, absences, pointages: pointages.length, anciennete, masse, visuel }
    }).sort((a, b) => b.effectif - a.effectif)
  }, [employes, presences, departements])

  if (!secteurs.length) return null
  const texteAnciennete = (a) => (a === null ? 'n.d.' : a < 1 ? `${Math.round(a * 12)} mois` : `${a.toFixed(1).replace('.', ',')} an${a >= 2 ? 's' : ''}`)
  const texteAbsence = (s) => (s.absenteisme === null ? 'n.d.' : `${String(s.absenteisme).replace('.', ',')} %`)
  const ton = (s) => (s.absenteisme === null ? 'text-gray-400' : s.absenteisme >= 10 ? 'text-red-600' : s.absenteisme >= 5 ? 'text-amber-600' : 'text-green-600')

  const fiche = ouvert ? (() => {
    const s = secteurs.find((x) => x.nom === ouvert)
    if (!s) return null
    return {
      titre: s.nom, sous: `${s.effectif} employé${s.effectif > 1 ? 's' : ''} dans ce secteur`, icone: Building2, couleur: s.visuel.couleur, logo: s.visuel.logo || undefined,
      tuiles: [
        { icone: Users, titre: 'Effectif', valeur: s.effectif },
        { icone: UserX, titre: 'Absentéisme', valeur: texteAbsence(s), sous: s.pointages ? `${s.absences} absence(s) sur ${s.pointages} pointage(s), 30 jours` : 'Aucun pointage sur 30 jours' },
        { icone: Hourglass, titre: 'Ancienneté', valeur: texteAnciennete(s.anciennete), sous: 'moyenne du secteur' },
        ...(voitArgent ? [{ icone: Wallet, titre: 'Masse brute', valeur: formatMoney(s.masse), sous: 'par mois' }] : [])
      ],
      lignes: [...s.liste].sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')).map((e) => ({ id: e.id, libelle: e.nom || 'Sans nom', sous: e.poste || '', detail: (e.statut || 'actif') === 'essai' ? "En essai" : 'Actif', ton: (e.statut || 'actif') === 'essai' ? 'orange' : 'vert' })),
      vide: 'Aucun employé dans ce secteur.', lien: { to: '/rh/employes', label: 'Ouvrir les employés' }
    }
  })() : null

  return (
    <section aria-label="Par secteur" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500"><Building2 size={15} aria-hidden="true" /> Par secteur</h2>
        <p className="text-xs text-gray-400">Absentéisme sur les 30 derniers jours</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secteurs.map((s, i) => (
          <button key={s.nom} type="button" onClick={() => setOuvert(s.nom)}
            className="ed-entree group relative overflow-hidden rounded-[1.6rem] border border-white/80 p-4 text-left shadow-[0_14px_30px_-20px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 active:scale-[0.99]"
            style={{ background: `linear-gradient(140deg, ${s.visuel.couleur}22 0%, rgba(255,255,255,0.72) 62%)`, animationDelay: `${Math.min(i, 8) * 45}ms`, '--tw-ring-color': s.visuel.couleur }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
            <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl" style={{ background: s.visuel.couleur }} />
            <div className="relative flex items-center gap-3">
              <LogoDepartement visuel={s.visuel} taille={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-gray-800" title={s.nom}>{s.nom}</p>
                <p className="text-xs font-semibold text-gray-500"><span className="text-2xl font-black tabular-nums text-gray-900">{s.effectif}</span> employé{s.effectif > 1 ? 's' : ''}</p>
              </div>
            </div>
            <dl className={`relative mt-3 grid gap-2 border-t border-white/70 pt-2.5 text-center grid-cols-2`}>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Absentéisme</dt><dd className={`text-sm font-black tabular-nums ${ton(s)}`}>{texteAbsence(s)}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Ancienneté</dt><dd className="text-sm font-black tabular-nums text-gray-800">{texteAnciennete(s.anciennete)}</dd></div>
              {voitArgent && <div className="col-span-2 border-t border-white/70 pt-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Masse brute</dt><dd className="text-sm font-black tabular-nums text-gray-800">{formatMoney(s.masse)}</dd></div>}
            </dl>
          </button>
        ))}
      </div>
      <DetailKpiModal fiche={fiche} onClose={() => setOuvert(null)} />
    </section>
  )
}
