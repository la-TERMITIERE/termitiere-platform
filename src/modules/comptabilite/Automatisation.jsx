// COMPTABILITÉ — Automatisation d'écriture (aligné FEZIRE /accounting/posting-templates).
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { Wrench } from 'lucide-react'
import { MODELES_ACTIFS } from './moteur'
import { getJournal } from './data'

export default function Automatisation() {
  const actifs = MODELES_ACTIFS.filter((m) => m.statut === 'actif')
  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          <Wrench className="text-orange-600" /> Automatisation d'écriture
        </h1>
        <p className="text-sm text-gray-500">Ce qu'un événement métier produit au grand livre. Un modèle naît brouillon, s'essaie sur un cas inventé, puis s'active.</p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Actifs" value={actifs.length} tone="success" />
        <Stat label="Brouillons" value={0} />
        <Stat label="Inactifs" value={0} />
        <Stat label="Obsolètes" value={0} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">En service : ces modèles produisent des écritures.</p>
          <p className="text-xs text-gray-500">Règles fait comptable → écriture, appliquées automatiquement par le moteur (passerelles).</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Modèle</th><th className="px-3 py-2.5">Fait visé</th><th className="px-3 py-2.5">Journal</th>
              <th className="px-3 py-2.5">Débit</th><th className="px-3 py-2.5">Crédit</th><th className="px-3 py-2.5">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {actifs.map((m) => (
              <tr key={m.code} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-medium">{m.label}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.fait}</td>
                <td className="px-3 py-2"><Badge tone={getJournal(m.journal)?.tone || 'neutral'}>{m.journal}</Badge></td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{m.debit}</td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{m.credit}</td>
                <td className="px-3 py-2"><Badge tone="success">Actif</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return <Card><div className="text-xs uppercase tracking-wide text-gray-400">{label}</div><div className={`text-2xl font-extrabold ${tone === 'success' ? 'text-green-600' : ''}`}>{value}</div></Card>
}
