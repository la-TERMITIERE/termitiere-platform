// Écran RH « structuré » — en-tête + description fidèles à FEZIRE + points clés.
// Utilisé pour les espaces dont le détail interne de la démo FEZIRE n'était pas
// accessible : la structure et l'intention sont reproduites, le contenu se branchera
// au fur et à mesure (mêmes libellés que FEZIRE).
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { Construction } from 'lucide-react'

export default function Scaffold({ icon: Icon, titre, sousTitre, sousModule, points = [], children }) {
  return (
    <div className="space-y-5">
      <header>
        {sousModule && <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">{sousModule}</div>}
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          {Icon && <Icon className="text-sky-600" />} {titre}
        </h1>
        {sousTitre && <p className="text-sm text-gray-500">{sousTitre}</p>}
      </header>

      {points.length > 0 && (
        <Card title="Ce que cet espace gère">
          <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2"><span className="text-sky-500">›</span><span>{p}</span></li>
            ))}
          </ul>
        </Card>
      )}

      {children}

      <div className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
        <Construction size={18} className="shrink-0" />
        <span>Espace structuré d'après le module RH de FEZIRE. La saisie détaillée se connecte progressivement. <Badge tone="info" className="ml-1">Prochainement</Badge></span>
      </div>
    </div>
  )
}
