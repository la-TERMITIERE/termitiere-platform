// COMPTABILITÉ — Supervision du moteur (aligné FEZIRE /accounting/supervision).
import { useMemo } from 'react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { Gauge, RefreshCw } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { CATALOGUE_FAITS } from './moteur'

export default function Supervision() {
  const { data: depenses } = useCollection('depense_depenses')

  // « Événements en attente » : dépenses reçues mais pas encore comptabilisées
  // (circuit d'autorisation en cours) — reçues par le moteur, pas encore imputées.
  const enAttente = useMemo(
    () => (depenses || []).filter((d) => d.statut && d.statut !== 'decaissee' && (Number(d.montant) || 0) > 0),
    [depenses]
  )

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Gauge className="text-orange-600" /> Supervision du moteur
          </h1>
          <p className="text-sm text-gray-500">Ce que le moteur a reçu, ce qu'il a produit, et ce qui l'a empêché.</p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">
          <RefreshCw size={14} /> Actualiser
        </button>
      </header>

      <Card title="Incidents ouverts">
        <p className="mb-2 text-xs text-gray-500">Ce qui a empêché une écriture d'aboutir, et qui attend une décision.</p>
        <p className="py-4 text-center text-sm text-gray-400">Aucun incident ouvert.</p>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">Événements en attente</p>
          <p className="text-xs text-gray-500">Reçus par le moteur, pas encore comptabilisés. Rejouables une fois décaissés/validés.</p>
        </div>
        {enAttente.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">La file est vide.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Fait</th><th className="px-3 py-2.5">Détail</th>
                <th className="px-3 py-2.5 text-right">Montant</th><th className="px-3 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {enAttente.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateShort(d.date)}</td>
                  <td className="px-3 py-2 font-mono text-xs">DEPENSE_DECAISSEE</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{d.description || d.categorie || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(d.montant)}</td>
                  <td className="px-3 py-2"><Badge tone="warning">{d.statut}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Les faits que la plateforme émet">
        <p className="mb-2 text-xs text-gray-500">Le catalogue comptable — un modèle d'écriture doit viser l'un d'eux.</p>
        <div className="flex flex-wrap gap-2">
          {CATALOGUE_FAITS.map((f) => <Badge key={f.code} tone="neutral">{f.code}</Badge>)}
        </div>
      </Card>
    </div>
  )
}
