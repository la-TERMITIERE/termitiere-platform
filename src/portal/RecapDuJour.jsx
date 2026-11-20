// Tableau de bord global, version « récap du jour » : ce que voit un compte à qui Info a donné l'accès (en dehors de l'administration).
// Uniquement l'activité de chaque secteur AUJOURD'HUI, sans aucun montant : séances, prestations, briques, trajets… Les compteurs du jour
// repartent à zéro le lendemain ; seuls les chiffres « d'état » (effectif animal, enfants inscrits) restent, car ils ne dépendent pas du jour.
import { useMemo } from 'react'
import { LayoutDashboard, CalendarDays, Info } from 'lucide-react'
import BandeauVolet from '../shared/ui/BandeauVolet'
import { useCollection } from '../hooks/useFirestore'
import { todayStr, formatNumber } from '../utils/formatters'
import { icone3D } from '../utils/color'
import { ICONE_POLE } from '../modules/comptabilite/quotas'
import { SECTEURS_RAPPORT } from './rapportGlobal'

const ROUGE = '#BC3C31'
const aujourdhui = (d, jour) => String(d || '').slice(0, 10) === jour

export default function RecapDuJour() {
  const jour = todayStr()
  const { data: inventairesAgro } = useCollection('agro_inventaires')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: seances } = useCollection('gym_seances')
  const { data: abonnements } = useCollection('gym_abonnements')
  const { data: enfants } = useCollection('garderie_enfants')
  const { data: transports } = useCollection('evenementiel_transports')
  const { data: dossiers } = useCollection('foncier_dossiers')

  // Pour chaque secteur : un compteur principal et, au plus, deux lignes de précision. Aucun montant nulle part.
  const tuiles = useMemo(() => {
    const duSite = (x, site) => (x.site || 'lome') === site
    const dernierInv = [...inventairesAgro].filter((i) => i.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    const effectif = dernierInv ? Object.values(dernierInv.animaux || {}).reduce((s, a) => s + (Number(a.fin) || 0), 0) : 0
    const secteur = (id) => SECTEURS_RAPPORT.find((s) => s.id === id)
    return [
      { id: 'agro', principal: inventairesAgro.filter((i) => aujourdhui(i.date, jour)).length, libelle: 'saisie(s) du jour', details: [`Effectif animal : ${formatNumber(effectif)}`] },
      { id: 'briques', principal: productions.filter((p) => aujourdhui(p.date, jour)).reduce((s, p) => s + (Number(p.totalBriques) || 0), 0), libelle: 'briques produites', details: [] },
      { id: 'log_lome', principal: prestations.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'lome')).length, libelle: 'prestation(s)', details: [] },
      { id: 'log_kara', principal: prestations.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'kara')).length, libelle: 'prestation(s)', details: [] },
      { id: 'gym_lome', principal: seances.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'lome')).length, libelle: 'séance(s)', details: [`${abonnements.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'lome')).length} abonnement(s) du jour`] },
      { id: 'gym_kara', principal: seances.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'kara')).length, libelle: 'séance(s)', details: [`${abonnements.filter((p) => aujourdhui(p.date, jour) && duSite(p, 'kara')).length} abonnement(s) du jour`] },
      { id: 'garderie', principal: enfants.filter((e) => e.statut === 'actif').length, libelle: 'enfants inscrits', details: [] },
      { id: 'transport', principal: transports.filter((t) => aujourdhui(t.date, jour)).length, libelle: 'trajet(s)', details: [] },
      { id: 'foncier', icone: null, label: 'FONCIER', couleur: '#059669', principal: dossiers.filter((d) => aujourdhui(d.dateOuverture, jour)).length, libelle: 'dossier(s) ouvert(s)', details: [`${dossiers.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length} dossier(s) actif(s)`] }
    ].map((t) => ({ ...t, ...(secteur(t.id) || {}), ...(t.id === 'foncier' ? { label: 'FONCIER', couleur: '#059669' } : {}) }))
  }, [inventairesAgro, prestations, productions, seances, abonnements, enfants, transports, dossiers, jour])

  const dateLongue = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <BandeauVolet couleur={ROUGE} icone={LayoutDashboard} surtitre="Bilan global" titre="Récap du jour" sous="Ce que fait chaque secteur aujourd’hui.">
        <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-bold capitalize text-white backdrop-blur-sm"><CalendarDays size={13} aria-hidden="true" />{dateLongue}</span>
      </BandeauVolet>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tuiles.map((t, i) => {
          const Ico = ICONE_POLE[t.id] || LayoutDashboard
          const c = t.couleur || ROUGE
          return (
            <div key={t.id} className="ed-entree relative overflow-hidden rounded-[1.7rem] border border-white/80 p-4 shadow-[0_14px_30px_-20px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl transition-all hover:-translate-y-0.5"
              style={{ background: `linear-gradient(140deg, ${c}22 0%, rgba(255,255,255,0.72) 62%)`, animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl" style={{ background: c }} />
              <div className="relative flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(c)}><Ico size={19} /></span>
                <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-gray-500" title={t.label}>{t.label}</p>
              </div>
              <p className="relative mt-2 text-3xl font-black leading-tight tabular-nums text-gray-900">{formatNumber(t.principal)}</p>
              <p className="relative text-xs font-semibold text-gray-500">{t.libelle}</p>
              {t.details.map((d) => <p key={d} className="relative mt-0.5 text-[11px] font-semibold text-gray-400">{d}</p>)}
            </div>
          )
        })}
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-xs text-gray-500 backdrop-blur-md">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Ce tableau montre l’activité du jour, sans aucun montant. Les compteurs repartent à zéro chaque matin.
      </p>
    </div>
  )
}
