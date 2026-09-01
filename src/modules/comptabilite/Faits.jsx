// COMPTABILITÉ — Faits comptables (aligné FEZIRE /accounting/faits-comptables).
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { Repeat, Info } from 'lucide-react'
import { CATALOGUE_FAITS, MODELES_ACTIFS } from './moteur'

export default function Faits() {
  const cible = new Set(MODELES_ACTIFS.map((m) => m.fait))
  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          <Repeat className="text-orange-600" /> Faits comptables
        </h1>
        <p className="text-sm text-gray-500">Ce qui peut donner naissance à une écriture — et sous quel nom vous le désignez.</p>
      </header>

      <Card>
        <div className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-500" />
          <p>Un fait ne produit une écriture que si un <b>modèle actif</b> le vise, dans « Automatisation d'écriture ». Déclarer un fait ne suffit pas — c'est le premier maillon, pas le dernier.</p>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Catalogue de la plateforme" value={CATALOGUE_FAITS.length} />
        <Stat label="Reliés à un modèle actif" value={CATALOGUE_FAITS.filter((f) => cible.has(f.code)).length} />
        <Stat label="Sans modèle" value={CATALOGUE_FAITS.filter((f) => !cible.has(f.code)).length} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">Faits comptables</p>
          <p className="text-xs text-gray-500">Les événements émis par vos modules qui peuvent donner naissance à une écriture.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Code</th><th className="px-3 py-2.5">Fait</th><th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {CATALOGUE_FAITS.map((f) => (
              <tr key={f.code} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                <td className="px-3 py-2"><div className="font-medium text-gray-800 dark:text-gray-100">{f.label}</div><div className="text-xs text-gray-400">{f.desc}</div></td>
                <td className="px-3 py-2"><Badge tone="neutral">{f.source}</Badge></td>
                <td className="px-3 py-2">{cible.has(f.code) ? <Badge tone="success">Modèle actif</Badge> : <Badge tone="warning">Sans modèle</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Stat({ label, value }) {
  return <Card><div className="text-xs uppercase tracking-wide text-gray-400">{label}</div><div className="text-2xl font-extrabold">{value}</div></Card>
}
