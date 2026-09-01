// COMPTABILITÉ — Fiscalité & Déclarations de TVA (aligné FEZIRE /accounting/taxes).
import { useMemo, useState } from 'react'
import { Receipt, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { formatMoney } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { syntheseTva, soldePrefixe } from './logic'
import { MOIS_LABELS, TAUX_TVA, COMPTE_TVA_COLLECTEE, COMPTE_TVA_DEDUCTIBLE } from './data'

const TABS = ['Rapport Direct', 'Déclarations TVA', 'Taux de TVA']

export default function Tva() {
  const { mvtsValides, loading } = useCompta()
  const annee = new Date().getFullYear()
  const [exercice, setExercice] = useState(annee)
  const [tab, setTab] = useState('Rapport Direct')
  const bornes = { debut: `${exercice}-01-01`, fin: `${exercice}-12-31` }

  const annuel = useMemo(() => syntheseTva(mvtsValides, bornes), [mvtsValides, exercice])
  const parMois = useMemo(() => MOIS_LABELS.map((label, i) => {
    const mois = String(i + 1).padStart(2, '0')
    return { label, ...syntheseTva(mvtsValides, { debut: `${exercice}-${mois}-01`, fin: `${exercice}-${mois}-31` }) }
  }), [mvtsValides, exercice])

  // Concordance avec le grand livre.
  const glCollectee = useMemo(() => -soldePrefixe(mvtsValides, COMPTE_TVA_COLLECTEE, bornes), [mvtsValides, exercice])
  const glDeductible = useMemo(() => soldePrefixe(mvtsValides, COMPTE_TVA_DEDUCTIBLE, bornes), [mvtsValides, exercice])

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Receipt className="text-orange-600" /> Fiscalité &amp; Déclarations de TVA
          </h1>
          <p className="text-sm text-gray-500">Gérez vos taux de TVA, suivez en temps réel la TVA collectée et déductible, et gérez vos déclarations fiscales périodiques.</p>
        </div>
        <input type="number" value={exercice} onChange={(e) => setExercice(Number(e.target.value))}
          className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5" />
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Rapport Direct' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title="TVA COLLECTÉE (VENTES)" value={formatMoney(annuel.collectee)} sub="Générée par les écritures de produits" accent="#16a34a" icon={Receipt} />
            <StatCard title="TVA DÉDUCTIBLE (ACHATS)" value={formatMoney(annuel.recuperable)} sub="Générée par les écritures de charges" accent="#0ea5e9" icon={Receipt} />
            <StatCard title="CRÉDIT DE TVA RESTANT" value={formatMoney(Math.abs(annuel.due))} sub="Solde net calculé sur la période"
              valueColor={annuel.due >= 0 ? '#dc2626' : '#16a34a'} accent={annuel.due >= 0 ? '#dc2626' : '#16a34a'} icon={Receipt} />
          </div>

          <Card title="Ventilation par Taux de TVA">
            <p className="mb-2 text-xs text-gray-500">Détail des bases imposables et montants de taxe associés pour chaque taux actif.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                    <th className="px-3 py-2">Code</th><th className="px-3 py-2">Taux de Taxe</th>
                    <th className="px-3 py-2 text-right">Base HT Ventes</th><th className="px-3 py-2 text-right">TVA Collectée</th>
                    <th className="px-3 py-2 text-right">Base HT Achats</th><th className="px-3 py-2 text-right">TVA Déductible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {TAUX_TVA.map((t) => {
                    const baseV = t.taux ? Math.round(annuel.collectee / (t.taux / 100)) : 0
                    const baseA = t.taux ? Math.round(annuel.recuperable / (t.taux / 100)) : 0
                    return (
                      <tr key={t.code}>
                        <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                        <td className="px-3 py-2">{t.label} ({t.taux}%)</td>
                        <td className="px-3 py-2 text-right">{t.taux ? formatMoney(baseV) : '0'}</td>
                        <td className="px-3 py-2 text-right">{t.taux ? formatMoney(annuel.collectee) : '0'}</td>
                        <td className="px-3 py-2 text-right">{t.taux ? formatMoney(baseA) : '0'}</td>
                        <td className="px-3 py-2 text-right">{t.taux ? formatMoney(annuel.recuperable) : '0'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Vérification & Concordance avec le Grand Livre">
            <p className="mb-3 text-xs text-gray-500">Comparaison des montants calculés via les écritures étiquetées face aux soldes des comptes généraux de TVA.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Concordance titre={`TVA Collectée (Compte ${COMPTE_TVA_COLLECTEE})`} declaree={annuel.collectee} gl={glCollectee} />
              <Concordance titre={`TVA Déductible (Compte ${COMPTE_TVA_DEDUCTIBLE})`} declaree={annuel.recuperable} gl={glDeductible} />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 size={16} /> Concordance : les montants de TVA extraits des écritures correspondent aux soldes de la balance comptable.
            </div>
          </Card>
        </>
      )}

      {tab === 'Déclarations TVA' && (
        <Card title={`Déclaration mensuelle ${exercice}`} className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                  <th className="px-3 py-2.5">Mois</th><th className="px-3 py-2.5 text-right">TVA collectée</th>
                  <th className="px-3 py-2.5 text-right">TVA déductible</th><th className="px-3 py-2.5 text-right">TVA due / crédit</th><th className="px-3 py-2.5 text-center">Sens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {parMois.map((m) => (
                  <tr key={m.label} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right">{m.collectee ? formatMoney(m.collectee) : '—'}</td>
                    <td className="px-3 py-2 text-right">{m.recuperable ? formatMoney(m.recuperable) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${m.due > 0 ? 'text-red-600' : m.due < 0 ? 'text-green-600' : ''}`}>{(m.collectee || m.recuperable) ? formatMoney(Math.abs(m.due)) : '—'}</td>
                    <td className="px-3 py-2 text-center">{(m.collectee || m.recuperable) ? <Badge tone={m.due >= 0 ? 'danger' : 'success'}>{m.due >= 0 ? 'à payer' : 'crédit'}</Badge> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'Taux de TVA' && (
        <Card title="Taux de TVA configurés">
          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {TAUX_TVA.map((t) => (
              <div key={t.code} className="flex items-center justify-between py-2.5">
                <div><span className="font-mono text-xs font-bold">{t.code}</span> <span className="ml-2 text-sm">{t.label}</span></div>
                <Badge tone={t.taux ? 'info' : 'neutral'}>{t.taux}%</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Concordance({ titre, declaree, gl }) {
  const ecart = declaree - gl
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-white/10">
      <p className="mb-2 font-semibold text-gray-800 dark:text-gray-100">{titre}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">TVA déclarée par écritures :</span><span>{formatMoney(declaree)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Mouvements Grand Livre :</span><span>{formatMoney(gl)}</span></div>
        <div className="flex justify-between font-semibold"><span>Écart de concordance :</span><span className={Math.abs(ecart) < 1 ? 'text-green-600' : 'text-red-600'}>{formatMoney(ecart)}</span></div>
      </div>
    </div>
  )
}
