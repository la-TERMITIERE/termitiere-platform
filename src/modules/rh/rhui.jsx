// Petits composants partagés des écrans RH (en-tête, champ de formulaire).
export function PageHeader({ icon: Icon, sousModule, titre, sousTitre, action }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {sousModule && <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">{sousModule}</div>}
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          {Icon && <Icon className="text-sky-600" />} {titre}
        </h1>
        {sousTitre && <p className="text-sm text-gray-500">{sousTitre}</p>}
      </div>
      {action}
    </header>
  )
}

export function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
