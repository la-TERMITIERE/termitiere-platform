// COMPTABILITÉ — Modèles de Plans Comptables (aligné FEZIRE /accounting/plans).
import { Link } from 'react-router-dom'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { FileText, Plus, BookOpen } from 'lucide-react'

const PLANS = [
  { code: 'PCF_FR', nom: 'Plan Comptable Français (PCF)', desc: 'Plan comptable standard utilisé par les entreprises en France.', fourni: true, actif: false },
  { code: 'SYSCOHADA', nom: 'Plan SYSCOHADA Révisé', desc: 'Plan comptable général de l\'OHADA en vigueur en Afrique de l\'Ouest et Centrale.', fourni: true, actif: true }
]

export default function ModelesPlans() {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <FileText className="text-orange-600" /> Modèles de Plans Comptables
          </h1>
          <p className="text-sm text-gray-500">Les plans fournis avec la plateforme sont partagés et ne se modifient pas. Créez le vôtre pour l'adapter, et importez sa structure via Excel/CSV.</p>
        </div>
        <Button><Plus size={16} /> Créer un plan comptable</Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((p) => (
          <Card key={p.code} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-100">{p.nom}</h3>
                <p className="font-mono text-xs text-gray-400">{p.code}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {p.fourni && <Badge tone="neutral">Fourni avec la plateforme</Badge>}
                {p.actif && <Badge tone="success">Actif sur ce tenant</Badge>}
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{p.desc}</p>
            <Link to="/comptabilite/plan" className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-orange-600 hover:underline">
              <BookOpen size={14} /> Consulter les comptes
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
