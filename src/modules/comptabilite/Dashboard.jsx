// COMPTABILITÉ — tableau de bord : grandes masses et résultat de l'exercice.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Scale, TrendingUp, TrendingDown, Wallet, Landmark, Building2, Receipt,
  BookOpen, FileText, Boxes, AlertTriangle, CheckCircle2
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { formatMoney } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { compteDeResultat, grandesMasses, balance, syntheseTva } from './logic'

export default function Dashboard() {
  const { plan, mvtsValides, ecritures, immobilisations, patrimoine, loading } = useCompta()
  const annee = new Date().getFullYear()
  const [exercice] = useState(annee)
  const bornes = { debut: `${exercice}-01-01`, fin: `${exercice}-12-31` }

  const resultat = useMemo(() => compteDeResultat(mvtsValides, bornes), [mvtsValides, exercice])
  const masses = useMemo(() => grandesMasses(mvtsValides, bornes), [mvtsValides, exercice])
  const bal = useMemo(() => balance(mvtsValides, plan, bornes), [mvtsValides, plan, exercice])
  const tva = useMemo(() => syntheseTva(mvtsValides, bornes), [mvtsValides, exercice])

  const nbEcritures = ecritures.length
  const nbBrouillons = ecritures.filter((e) => e.statut !== 'validee').length
  const valeurPatrimoine = patrimoine.reduce((s, b) => s + (Number(b.valeur) || 0), 0)
  const valeurImmo = immobilisations.reduce((s, i) => s + (Number(i.valeur) || 0), 0)

  if (loading) {
    return <div className="py-16 text-center text-gray-400">Chargement de la comptabilité…</div>
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Scale className="text-orange-600" /> Comptabilité
          </h1>
          <p className="text-sm text-gray-500">Exercice {exercice} — partie double (SYSCOHADA)</p>
        </div>
        <Badge tone={bal.equilibree ? 'success' : 'danger'}>
          {bal.equilibree ? <><CheckCircle2 size={13} /> Balance équilibrée</> : <><AlertTriangle size={13} /> Balance déséquilibrée</>}
        </Badge>
      </header>

      {/* Résultat & grandes masses */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Résultat de l'exercice"
          value={formatMoney(resultat.resultat)}
          sub={resultat.benefice ? 'Bénéfice' : 'Perte'}
          icon={resultat.benefice ? TrendingUp : TrendingDown}
          accent={resultat.benefice ? '#16a34a' : '#dc2626'}
          valueColor={resultat.benefice ? '#16a34a' : '#dc2626'}
        />
        <StatCard title="Produits (classe 7)" value={formatMoney(resultat.produits)} icon={TrendingUp} accent="#0ea5e9" />
        <StatCard title="Charges (classe 6)" value={formatMoney(resultat.charges)} icon={TrendingDown} accent="#f59e0b" />
        <StatCard title="Trésorerie (classe 5)" value={formatMoney(masses.tresorerie)} icon={Wallet} accent="#7c3aed" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Actif immobilisé (classe 2)" value={formatMoney(masses.actifImmobilise)} icon={Building2} accent="#0d9488" />
        <StatCard title="Stocks (classe 3)" value={formatMoney(masses.stocks)} icon={Boxes} accent="#65a30d" />
        <StatCard title="Créances clients" value={formatMoney(masses.clients)} icon={FileText} accent="#2563eb" />
        <StatCard title="Dettes fournisseurs" value={formatMoney(masses.fournisseurs)} icon={Landmark} accent="#dc2626" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Synthèse TVA */}
        <Card title="TVA (exercice)">
          <div className="space-y-2 text-sm">
            <Ligne label="TVA collectée (4431)" value={tva.collectee} />
            <Ligne label="TVA récupérable (445)" value={tva.recuperable} />
            <div className="my-2 border-t border-gray-100 dark:border-white/10" />
            <div className="flex items-center justify-between font-bold">
              <span>TVA {tva.sens}</span>
              <span className={tva.due >= 0 ? 'text-red-600' : 'text-green-600'}>{formatMoney(Math.abs(tva.due))}</span>
            </div>
          </div>
          <Link to="/comptabilite/tva" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:underline">
            <Receipt size={14} /> Détail TVA
          </Link>
        </Card>

        {/* Patrimoine */}
        <Card title="Patrimoine & immobilisations">
          <div className="space-y-2 text-sm">
            <Ligne label={`Biens immobiliers (${patrimoine.length})`} value={valeurPatrimoine} />
            <Ligne label={`Immobilisations (${immobilisations.length})`} value={valeurImmo} />
            <div className="my-2 border-t border-gray-100 dark:border-white/10" />
            <div className="flex items-center justify-between font-bold">
              <span>Total patrimoine</span>
              <span>{formatMoney(valeurPatrimoine + valeurImmo)}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-3 text-sm font-semibold text-orange-600">
            <Link to="/comptabilite/patrimoine" className="inline-flex items-center gap-1 hover:underline"><Building2 size={14} /> Immobilier</Link>
            <Link to="/comptabilite/immobilisations" className="inline-flex items-center gap-1 hover:underline"><Boxes size={14} /> Immobilisations</Link>
          </div>
        </Card>

        {/* Activité écritures */}
        <Card title="Journal comptable">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Écritures enregistrées</span>
              <span className="font-bold">{nbEcritures}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Brouillons à valider</span>
              <Badge tone={nbBrouillons > 0 ? 'warning' : 'neutral'}>{nbBrouillons}</Badge>
            </div>
          </div>
          <div className="mt-3 flex gap-3 text-sm font-semibold text-orange-600">
            <Link to="/comptabilite/ecritures" className="inline-flex items-center gap-1 hover:underline"><BookOpen size={14} /> Saisir</Link>
            <Link to="/comptabilite/grand-livre" className="inline-flex items-center gap-1 hover:underline"><Scale size={14} /> Balance</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Ligne({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold">{formatMoney(value)}</span>
    </div>
  )
}
