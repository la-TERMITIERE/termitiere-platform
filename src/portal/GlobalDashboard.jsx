// Tableau de bord global : KPI consolidés de tous les modules + mini-courbes par secteur
// + alertes cross-modules cliquables.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Line, Bar } from 'react-chartjs-2'
import { Leaf, Truck, BrickWall, Bell, MapPin, TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react'
import StatCard from '../shared/ui/StatCard'
import Card from '../shared/ui/Card'
import Modal from '../shared/ui/Modal'
import { useCollection } from '../hooks/useFirestore'
import { useAuth } from '../hooks/useAuth'
import { todayStr, formatMoney, formatNumber, formatDateShort } from '../utils/formatters'

export default function GlobalDashboard() {
  const { hasModule } = useAuth()
  const navigate = useNavigate()
  const [alerteDetail, setAlerteDetail] = useState(null)

  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: demandes } = useCollection('agro_demandes')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: logInv } = useCollection('logistique_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')
  const { data: dossiersFoncier } = useCollection('foncier_dossiers')

  const invTries = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = invTries[0]
  const moisCourant = todayStr().slice(0, 7)

  // ── AGRO ──
  const totalAnimaux = dernier
    ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)
    : 0
  const demandesAgroAttente = demandes.filter((d) => d.statut === 'en_attente').length
  const last12Agro = useMemo(() => [...invTries].reverse().slice(-12), [invTries])

  // ── LOGISTIQUE ──
  const prestationsMois = prestations.filter((p) => (p.date || '').startsWith(moisCourant)).length
  const autorisationsLog = demandesLog.filter((d) => d.statut === 'en_attente').length
  const caLogMois = useMemo(() => {
    const factures = prestations.filter((p) => (p.date || '').startsWith(moisCourant))
    return factures.reduce((s, p) => s + (p.montant || p.totalTTC || 0), 0)
  }, [prestations, moisCourant])

  // ── BRIQUETERIE ──
  const prodMois = productions
    .filter((p) => (p.date || '').startsWith(moisCourant))
    .reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = demandesBriq.filter((d) => ['en_attente', 'partiel'].includes(d.statut)).length
  const prodLast12 = useMemo(() => {
    const grouped = {}
    productions.forEach((p) => {
      const m = (p.date || '').slice(0, 7)
      if (m) grouped[m] = (grouped[m] || 0) + (p.totalBriques || 0)
    })
    const keys = Object.keys(grouped).sort().slice(-12)
    return { labels: keys.map((k) => k.slice(5)), data: keys.map((k) => grouped[k]) }
  }, [productions])

  // ── FONCIER ──
  const dossiersActifs = dossiersFoncier.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length
  const dossiersMois = dossiersFoncier.filter((d) => (d.dateOuverture || '').startsWith(moisCourant)).length

  // ── ALERTES cross-modules ──
  const alertes = useMemo(() => {
    const list = []
    if (demandesAgroAttente > 0)
      list.push({
        id: 'agro-demandes', module: 'agro', path: '/agro/demandes', tone: 'warning',
        icon: Leaf, text: `${demandesAgroAttente} demande(s) de sortie AGRO en attente`,
        details: demandes.filter((d) => d.statut === 'en_attente')
      })
    if (autorisationsLog > 0)
      list.push({
        id: 'log-demandes', module: 'logistique', path: '/logistique/demandes', tone: 'warning',
        icon: Truck, text: `${autorisationsLog} autorisation(s) sortie matériel en attente`,
        details: demandesLog.filter((d) => d.statut === 'en_attente')
      })
    if (autorisationsBriq > 0)
      list.push({
        id: 'briq-demandes', module: 'evenementiel', path: '/evenementiel/demandes', tone: 'danger',
        icon: BrickWall, text: `${autorisationsBriq} autorisation(s) sortie briques en attente (3 autorités)`,
        details: demandesBriq.filter((d) => ['en_attente', 'partiel'].includes(d.statut))
      })
    return list
  }, [demandesAgroAttente, autorisationsLog, autorisationsBriq, demandes, demandesLog, demandesBriq])

  // ── Mini-graphique AGRO — effectif total (12 dernières saisies) ──
  const chartAgro = {
    labels: last12Agro.map((i) => i.date?.slice(5) || ''),
    datasets: [{
      label: 'Animaux',
      data: last12Agro.map((i) => Object.values(i.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)),
      borderColor: '#BC3C31', backgroundColor: 'rgba(188,60,49,0.12)', fill: true, tension: 0.3, pointRadius: 2
    }]
  }

  // ── Mini-graphique BRIQUETERIE — production mensuelle ──
  const chartBriq = {
    labels: prodLast12.labels,
    datasets: [{
      label: 'Briques',
      data: prodLast12.data,
      backgroundColor: 'rgba(124,58,237,0.7)', borderRadius: 4
    }]
  }

  const chartOpts = { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-xl font-extrabold text-gray-900">Tableau de bord global — La Termitière</h1>

      {/* KPI cards par domaine */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasModule('agro') && (
          <StatCard
            title="MAXI-AGRO"
            value={formatNumber(totalAnimaux)}
            sub={demandesAgroAttente ? `⚠ ${demandesAgroAttente} demande(s) en attente` : 'Effectif animal actuel'}
            icon={Leaf}
            accent="#BC3C31"
          />
        )}
        {hasModule('logistique') && (
          <StatCard
            title="Logistique"
            value={prestationsMois}
            sub={autorisationsLog ? `⚠ ${autorisationsLog} autorisation(s) en attente` : 'Prestations ce mois'}
            icon={Truck}
            accent="#0284c7"
          />
        )}
        {hasModule('evenementiel') && (
          <StatCard
            title="Briqueterie"
            value={formatNumber(prodMois)}
            sub={autorisationsBriq ? `⚠ ${autorisationsBriq} autorisation(s)` : 'Briques produites ce mois'}
            icon={BrickWall}
            accent="#7c3aed"
          />
        )}
        {hasModule('foncier') && (
          <StatCard
            title="Foncier"
            value={dossiersActifs}
            sub={dossiersMois ? `${dossiersMois} ouvert(s) ce mois` : 'Dossiers actifs'}
            icon={MapPin}
            accent="#059669"
          />
        )}
        <button
          onClick={() => alertes.length && setAlerteDetail('all')}
          className="card p-4 text-left transition-all hover:shadow-md"
        >
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle size={18} className={alertes.length ? 'text-amber-600' : 'text-gray-300'} />
            <p className="text-xs font-bold uppercase text-gray-500">Alertes</p>
          </div>
          <p className={`text-2xl font-extrabold ${alertes.length ? 'text-amber-600' : 'text-gray-300'}`}>{alertes.length}</p>
          <p className="text-xs text-gray-400">{alertes.length ? 'Cliquer pour détails' : 'Aucune alerte'}</p>
        </button>
      </div>

      {/* Mini-courbes par secteur */}
      <div className="grid gap-4 lg:grid-cols-2">
        {hasModule('agro') && (
          <Card title="MAXI-AGRO — Évolution effectif (12 dernières saisies)">
            <div className="h-40">
              {last12Agro.length
                ? <Line data={chartAgro} options={chartOpts} />
                : <p className="py-10 text-center text-sm text-gray-400">Aucune saisie</p>}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span>Total actuel : <strong className="text-gray-800">{formatNumber(totalAnimaux)}</strong></span>
              <span>Saisies totales : <strong>{inventaires.length}</strong></span>
            </div>
          </Card>
        )}
        {hasModule('evenementiel') && (
          <Card title="Briqueterie — Production mensuelle">
            <div className="h-40">
              {prodLast12.data.length
                ? <Bar data={chartBriq} options={chartOpts} />
                : <p className="py-10 text-center text-sm text-gray-400">Aucune production</p>}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span>Ce mois : <strong className="text-gray-800">{formatNumber(prodMois)}</strong> briques</span>
              <span>Total productions : <strong>{productions.length}</strong></span>
            </div>
          </Card>
        )}
        {hasModule('logistique') && (
          <Card title="Logistique — Activité du mois">
            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="rounded-lg bg-sky-50 p-3 text-center">
                <p className="text-2xl font-extrabold text-sky-700">{prestationsMois}</p>
                <p className="text-xs text-sky-600">Prestations ce mois</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-extrabold text-amber-700">{autorisationsLog}</p>
                <p className="text-xs text-amber-600">Autorisations en attente</p>
              </div>
            </div>
          </Card>
        )}
        {hasModule('foncier') && (
          <Card title="Foncier — Portefeuille dossiers">
            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-extrabold text-green-700">{dossiersActifs}</p>
                <p className="text-xs text-green-600">Dossiers actifs</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-2xl font-extrabold text-gray-700">{dossiersFoncier.length}</p>
                <p className="text-xs text-gray-600">Total dossiers</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Alertes cross-modules cliquables */}
      <Card title="Alertes cross-modules">
        {alertes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune alerte en cours 🎉</p>
        ) : (
          <div className="space-y-2">
            {alertes.map((a) => (
              <button
                key={a.id}
                onClick={() => setAlerteDetail(a.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-left hover:bg-amber-100 transition-colors"
              >
                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                <span className="flex-1 text-sm font-semibold text-amber-900">{a.text}</span>
                <ChevronRight size={16} className="shrink-0 text-amber-400" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Modal détail d'une alerte */}
      {alerteDetail && (
        <AlerteDetailModal
          alerteId={alerteDetail}
          alertes={alertes}
          onClose={() => setAlerteDetail(null)}
          onNavigate={(path) => { setAlerteDetail(null); navigate(path) }}
        />
      )}
    </div>
  )
}

function AlerteDetailModal({ alerteId, alertes, onClose, onNavigate }) {
  const liste = alerteId === 'all' ? alertes : alertes.filter((a) => a.id === alerteId)
  return (
    <Modal open onClose={onClose} size="lg" title="Détail des alertes">
      <div className="space-y-4">
        {liste.map((a) => (
          <div key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-amber-900">{a.text}</h3>
              <button
                onClick={() => onNavigate(a.path)}
                className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                Accéder <ChevronRight size={13} />
              </button>
            </div>
            {a.details && a.details.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-amber-100 text-xs uppercase text-amber-700">
                    <tr>
                      <th className="px-3 py-2 text-left">N°</th>
                      <th className="px-3 py-2 text-left">Article</th>
                      <th className="px-2 py-2 text-center">Qté</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Demandeur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {a.details.slice(0, 20).map((d) => (
                      <tr key={d.id || d.num}>
                        <td className="px-3 py-1.5 font-mono text-xs">{d.num || d.id?.slice(0, 8) || '—'}</td>
                        <td className="px-3 py-1.5">{d.articleNom || d.materielNom || d.typeArticle || '—'}</td>
                        <td className="px-2 py-1.5 text-center font-semibold">{d.qte || d.quantite || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{formatDateShort(d.date)}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{d.agentNom || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
