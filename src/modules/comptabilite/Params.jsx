// COMPTABILITÉ — paramètres du module.
import { Settings, Info } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { PLAN_COMPTABLE_DEFAUT, JOURNAUX, TAUX_TVA, CATEGORIES_IMMO } from './data'

export default function Params() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          <Settings className="text-orange-600" /> Paramètres comptables
        </h1>
        <p className="text-sm text-gray-500">Référentiel et conventions du module</p>
      </header>

      <Card title="Référentiel">
        <div className="grid gap-3 sm:grid-cols-2">
          <Item label="Norme comptable" value="SYSCOHADA révisé (OHADA)" />
          <Item label="Devise" value="Franc CFA — XOF (BCEAO)" />
          <Item label="Comptes au plan par défaut" value={`${PLAN_COMPTABLE_DEFAUT.length} comptes`} />
          <Item label="Taux de TVA" value={TAUX_TVA.map((t) => t.label).join(' · ')} />
        </div>
      </Card>

      <Card title="Journaux disponibles">
        <div className="flex flex-wrap gap-2">
          {JOURNAUX.map((j) => <Badge key={j.code} tone={j.tone}>{j.code} — {j.label}</Badge>)}
        </div>
      </Card>

      <Card title="Durées d'amortissement par défaut">
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES_IMMO.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/5">
              <span>{c.label} <span className="font-mono text-xs text-gray-400">({c.compte})</span></span>
              <span className="font-semibold">{c.amortissable ? `${c.dureeAmort} ans` : 'non amortissable'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-500" />
          <div className="space-y-1">
            <p className="font-semibold text-gray-800 dark:text-gray-100">Prochaine étape — passerelles automatiques</p>
            <p>Les achats/dépenses saisis dans les autres modules (MAXI-AGRO, LOGISTIQUE, BRIQUETERIE, E-DÉPENSES, E-VOYAGE…) seront convertis automatiquement en écritures comptables (journal Achats/Caisse/Banque) selon le plan comptable ci-dessus — sur le modèle des passerelles déjà en place dans E-DÉPENSES.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Item({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="font-semibold text-gray-800 dark:text-gray-100">{value}</div>
    </div>
  )
}
