import BandeauVolet from '../../shared/ui/BandeauVolet'

// Petits composants partagés des écrans RH (en-tête en bandeau, champ de formulaire).
export function PageHeader({ icon, sousModule, titre, sousTitre, action, children }) {
  return (
    <BandeauVolet couleur="#0284c7" icone={icon} surtitre={sousModule} titre={titre} sous={sousTitre}>
      {children}
      {action}
    </BandeauVolet>
  )
}

export function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
