// Page indicative pour les écrans non encore implémentés.
import { Hammer } from 'lucide-react'

export default function Placeholder({ title, description }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <Hammer size={30} />
      </div>
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500">{description || 'Module en cours de construction.'}</p>
    </div>
  )
}
