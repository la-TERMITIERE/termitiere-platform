// Comptabilité — module en préparation.
import { Calculator, Construction } from 'lucide-react'
import Card from '../../shared/ui/Card'

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
        <Calculator size={40} />
      </div>
      <h1 className="text-2xl font-extrabold text-gray-900">Comptabilité</h1>
      <p className="text-gray-500">Module en cours de conception — finances et suivi comptable.</p>
      <Card>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Construction size={20} className="text-orange-500" />
          <span>Ce module sera développé prochainement.</span>
        </div>
      </Card>
    </div>
  )
}
