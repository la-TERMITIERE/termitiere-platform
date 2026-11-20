// RH : Dotations, le matériel remis aux employés (uniforme, téléphone, clés, ordinateur, badge…). Chaque ligne dit qui a quoi, depuis quand, et si
// l'article a été restitué. Quand un employé quitte l'entreprise avec du matériel non restitué, la RH est alertée (echeances.js).
import { Package, PackageCheck, PackageX, Users, Check, Undo2, TriangleAlert } from 'lucide-react'
import { updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { todayStr, formatDateShort } from '../../utils/formatters'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import CrudList from './CrudList'
import { COL, STATUTS_DOTATION, ARTICLES_DOTATION } from './store/rhStore'

export default function Dotations() {
  async function changerStatut(row, statut, fermer) {
    await updateItem(COL.dotations, row.id, { statut, dateRestitution: statut === 'restituee' ? todayStr() : '' })
    toast.success(statut === 'restituee' ? `${row.article} restitué par ${row.employeNom} ✓` : statut === 'perdue' ? `${row.article} déclaré perdu ou non rendu` : `${row.article} de nouveau en possession`)
    fermer?.()
  }
  return (
    <CrudList collection={COL.dotations} icon={Package} sousModule="Vie de l'entreprise" titre="Dotations"
      sousTitre="Le matériel remis aux employés, à restituer à leur départ." boutonLabel="Remettre du matériel"
      emptyText="Aucun matériel remis pour le moment."
      vide={() => ({ employeId: '', article: '', detail: '', quantite: 1, dateRemise: todayStr(), statut: 'en_possession', dateRestitution: '', observation: '' })}
      stats={(data) => (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <TuileVerre icone={Package} couleur="#0284c7" titre="En possession" valeur={data.filter((d) => d.statut === 'en_possession' || !d.statut).length} sous="article(s) remis" />
          <TuileVerre icone={PackageCheck} couleur="#16a34a" titre="Restitués" valeur={data.filter((d) => d.statut === 'restituee').length} sous="article(s) rendus" />
          <TuileVerre icone={PackageX} couleur="#dc2626" titre="Perdus ou non rendus" valeur={data.filter((d) => d.statut === 'perdue').length} sous="à régler" />
          <TuileVerre icone={Users} couleur="#7c3aed" titre="Employés équipés" valeur={new Set(data.filter((d) => d.statut === 'en_possession' || !d.statut).map((d) => d.employeId)).size} sous="avec du matériel" />
        </div>
      )}
      actionsLigne={(row, fermer) => (
        row.statut === 'restituee' || row.statut === 'perdue'
          ? [{ label: 'Remettre en possession', icone: Undo2, tone: 'primaire', onClick: () => changerStatut(row, 'en_possession', fermer) }]
          : [{ label: 'Marquer restitué', icone: Check, tone: 'succes', onClick: () => changerStatut(row, 'restituee', fermer) },
             { label: 'Perdu ou non rendu', icone: TriangleAlert, tone: 'danger', onClick: () => changerStatut(row, 'perdue', fermer) }]
      )}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'article', label: 'Article', render: (r) => <span>{r.article}{r.detail ? <span className="block text-[11px] text-gray-400">{r.detail}</span> : null}</span> },
        { key: 'quantite', label: 'Qté', align: 'right', render: (r) => r.quantite || 1 },
        { key: 'dateRemise', label: 'Remis le', render: (r) => (r.dateRemise ? formatDateShort(r.dateRemise) : '-') },
        { key: 'statut', label: 'Statut', badge: (v) => STATUTS_DOTATION[v || 'en_possession'] },
        { key: 'dateRestitution', label: 'Restitué le', render: (r) => (r.dateRestitution ? formatDateShort(r.dateRestitution) : '-') }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true, placeholder: "Choisissez l'employé" },
        { key: 'article', label: 'Article remis', type: 'choix', options: ARTICLES_DOTATION, autre: 'Autre article', placeholder: "Nom de l'article", required: true },
        { key: 'detail', label: 'Précision', placeholder: 'Ex. taille L, modèle, numéro de série' },
        { key: 'quantite', label: 'Quantité', type: 'number', placeholder: 'Ex. 2' },
        { key: 'dateRemise', label: 'Date de remise', type: 'date' },
        { key: 'statut', label: 'Statut', type: 'boutons', options: Object.entries(STATUTS_DOTATION).map(([value, o]) => ({ value, label: o.label })) },
        { key: 'dateRestitution', label: 'Date de restitution', type: 'date' },
        { key: 'observation', label: 'Observation', type: 'textarea', placeholder: "État du matériel, remarques" }
      ]} />
  )
}
