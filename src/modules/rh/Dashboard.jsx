// RH — Tableau de bord (3 vues : Admin / Manager / Employé), aligné FEZIRE /hr/dashboard.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, CalendarCheck, CalendarDays, Receipt, FileText, Send, ListChecks, Award, Clock, LayoutDashboard } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, todayStr } from '../../utils/formatters'
import { calculerBulletin, DROIT_CONGE_ANNUEL } from './store/rhStore'

const VUES = [
  { id: 'admin', label: 'Vue Admin RH', perimetre: "Toute l'Organisation" },
  { id: 'manager', label: 'Vue Manager', perimetre: 'Mon Équipe / Départements' },
  { id: 'employe', label: 'Vue Employé (Self-Service)', perimetre: 'Moi uniquement (Self-Service)' }
]

export default function Dashboard() {
  const { data: employes } = useCollection('rh_employes')
  const { data: presences } = useCollection('rh_presences')
  const { data: conges } = useCollection('rh_conges')
  const { data: bulletins } = useCollection('rh_bulletins')
  const { data: contrats } = useCollection('rh_contrats')
  const { data: recrutements } = useCollection('rh_recrutements')
  const [vue, setVue] = useState('admin')

  const today = todayStr()
  const moisCourant = today.slice(0, 7)

  const kpi = useMemo(() => {
    const actifs = employes.filter((e) => (e.statut || 'actif') === 'actif')
    const presToday = presences.filter((p) => p.date === today)
    const retards = presToday.filter((p) => p.statut === 'retard').length
    const absents = presToday.filter((p) => p.statut === 'absent').length
    const congesAttente = conges.filter((c) => (c.statut || 'en_attente') === 'en_attente')
    const bulletinsMois = bulletins.filter((b) => (b.mois || '') === moisCourant)
    const masseSalariale = bulletinsMois.length
      ? bulletinsMois.reduce((s, b) => s + (Number(b.brutTotal) || 0), 0)
      : actifs.reduce((s, e) => s + calculerBulletin(e.salaire).brutTotal, 0)
    const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const cddProches = contrats.filter((c) => c.type === 'cdd' && c.dateFin && c.dateFin >= today && c.dateFin <= dans30)
    const offresOuvertes = recrutements.filter((r) => (r.statut || '') === 'publiee')
    return { actifs: actifs.length, total: employes.length, presToday: presToday.length, retards, absents,
      congesAttente: congesAttente.length, masseSalariale, nbBulletins: bulletinsMois.length,
      cddProches, offresOuvertes: offresOuvertes.length }
  }, [employes, presences, conges, bulletins, contrats, recrutements, today, moisCourant])

  const perimetre = VUES.find((v) => v.id === vue)?.perimetre

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <LayoutDashboard className="text-sky-600" /> Tableau de Bord RH
          </h1>
          <p className="text-sm text-gray-500">Vue globale d'administration des ressources humaines, paie et conformité.</p>
        </div>
        <Link to="/rh/employes"><Button style={{ background: '#0284c7' }}><Users size={16} /> Nouvel Employé</Button></Link>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {VUES.map((v) => (
          <button key={v.id} onClick={() => setVue(v.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${vue === v.id ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{v.label}</button>
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Périmètre : {perimetre}</p>

      {vue === 'admin' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Effectif Actif" value={kpi.actifs} sub={`sur ${kpi.total} répertorié(s)`} accent="#0284c7" icon={Users} />
          <StatCard title="Présences du Jour" value={kpi.presToday} sub={`${kpi.retards} retard(s) • ${kpi.absents} absent(s)`} accent="#16a34a" icon={CalendarCheck} />
          <StatCard title="Congés à Traiter" value={kpi.congesAttente} sub="À valider par RH/Manager" accent="#f59e0b" icon={CalendarDays} />
          <StatCard title="Paie du Mois" value={formatMoney(kpi.masseSalariale)} sub={`${kpi.nbBulletins} bulletin(s) généré(s)`} accent="#7c3aed" icon={Receipt} />
          <StatCard title="Échéances CDD" value={kpi.cddProches.length} sub="Fins de contrat < 30 jours" accent="#dc2626" icon={FileText} />
          <StatCard title="Offres Ouvertes" value={kpi.offresOuvertes} sub="Recrutements en cours" accent="#0d9488" icon={Send} />
        </div>
      )}

      {vue === 'manager' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title="Congés Équipe à Valider" value={kpi.congesAttente} sub="Demandes en attente" accent="#f59e0b" icon={CalendarDays} />
            <StatCard title="Anomalies de Pointage" value={kpi.retards + kpi.absents} sub={`${kpi.retards} retard(s) • ${kpi.absents} absent(s)`} accent="#dc2626" icon={Clock} />
            <StatCard title="Effectif de l'Équipe" value={kpi.actifs} sub="Collaborateurs actifs" accent="#0284c7" icon={Users} />
          </div>
          <Card title="Actions de Pilotage d'Équipe">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionTile to="/rh/organigramme" icon={Users} label="Organigramme" />
              <ActionTile to="/rh/evaluations" icon={ListChecks} label="Évaluations Équipe" />
              <ActionTile to="/rh/competences" icon={Award} label="GPEC & Compétences" />
              <ActionTile to="/rh/onboarding" icon={Receipt} label="Onboarding Membres" />
            </div>
          </Card>
        </>
      )}

      {vue === 'employe' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Mon Solde de Congés" value={`${DROIT_CONGE_ANNUEL} j`} sub="Jours ouvrés restants" accent="#0284c7" icon={CalendarDays} />
            <StatCard title="Mon Dernier Bulletin" value="Disponible" sub="Consultez vos bulletins" accent="#7c3aed" icon={Receipt} />
            <StatCard title="Mes Tâches du Jour" value={0} sub="Tâche(s) à faire" accent="#f59e0b" icon={ListChecks} />
          </div>
          <Card title="Actions rapides (Self-Service)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionTile to="/rh/conges" icon={CalendarDays} label="Poser une demande" />
              <ActionTile to="/rh/paie" icon={Receipt} label="Voir mon bulletin" />
              <ActionTile to="/rh/presences" icon={Clock} label="Pointer arrivée/départ" />
              <ActionTile to="/rh/impacts" icon={Award} label="Publier une reconnaissance" />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function ActionTile({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3 text-center text-xs font-semibold text-gray-600 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
      <Icon size={18} className="text-sky-500" /> {label}
    </Link>
  )
}
