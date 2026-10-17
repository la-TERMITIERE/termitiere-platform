// Onglet « Partenaires » — contacts externes d'un secteur (vétérinaires, techniciens,
// prestataires, fournisseurs…). Ce ne sont PAS des employés : ils vivent dans une
// collection dédiée `${module}_partenaires`, indépendante des utilisateurs.
//
// Accès en écriture restreint : seuls les rôles à accès total et l'utilisateur à qui
// la direction a « donné la main » (champ profil `gerePartenaires`) peuvent
// ajouter / modifier / supprimer. Les autres n'atteignent normalement pas cet onglet
// (masqué dans la navigation) ; s'ils y accèdent, il reste en lecture seule.
import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Handshake, Phone } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Table from '../ui/Table'
import Badge from '../ui/Badge'
import BandeauVolet, { BoutonBande } from '../ui/BandeauVolet'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import ChampAutocomplete from '../forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { canManagePartenaires } from '../../core/roles'
import { COULEUR_MODULE, icone3D } from '../../utils/color'

const empty = () => ({ nom: '', contact: '', type: '' })

// Suggestions de « type / spécificité » par plateforme (le champ reste libre).
const SUGGESTIONS = {
  agro: ['Vétérinaire', 'Technicien agricole', "Fournisseur d'intrants", 'Provendier', 'Transporteur'],
  logistique: ['Transporteur', 'Loueur de matériel', 'Prestataire événementiel', 'Fournisseur'],
  evenementiel: ['Fournisseur (ciment / sable)', 'Transporteur', 'Revendeur', 'Maçon'],
  foncier: ['Géomètre', 'Notaire', 'Huissier', 'Avocat', 'Agent domanial'],
  garderie: ['Pédiatre', 'Fournisseur alimentaire', "Prestataire d'activités", 'Transporteur'],
  projet: ['Sous-traitant', 'Consultant', 'Fournisseur', "Bureau d'études"],
  depense: ['Fournisseur', 'Prestataire', 'Banque']
}

export default function Partenaires({ module, suggestions }) {
  const { user, role } = useAuth()
  const peutGerer = canManagePartenaires(role, user)
  const listeSuggestions = suggestions || SUGGESTIONS[module] || []
  const col = `${module}_partenaires`
  const couleur = COULEUR_MODULE[module] || '#0d9488'
  const { data: partenaires } = useCollection(col)
  const [modal, setModal] = useState(null) // { data, id }

  const liste = useMemo(
    () => [...partenaires].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
    [partenaires]
  )

  async function save() {
    if (!peutGerer) return toast.error('Action réservée au gestionnaire des partenaires')
    const p = { nom: modal.data.nom.trim(), contact: (modal.data.contact || '').trim(), type: (modal.data.type || '').trim() }
    if (!p.nom) return toast.error('Nom du partenaire requis')
    if (modal.id) { await updateItem(col, modal.id, p); await audit(module, 'PARTENAIRE_EDIT', p.nom) }
    else { await addItem(col, p); await audit(module, 'PARTENAIRE', `${p.nom}${p.type ? ' : ' + p.type : ''}`) }
    toast.success('Partenaire enregistré ✓')
    setModal(null)
  }

  async function supprimer(r) {
    if (!peutGerer) return toast.error('Action réservée au gestionnaire des partenaires')
    if (!confirm(`Supprimer le partenaire « ${r.nom} » ?`)) return
    await removeItem(col, r.id)
    await audit(module, 'PARTENAIRE_DELETE', r.nom)
    toast.success('Partenaire supprimé')
  }

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={couleur} icone={Handshake} titre="Partenaires"
        sous={`${liste.length} partenaire(s) : contacts externes du secteur, ce ne sont pas des employés.`}>
        {peutGerer && <BoutonBande icone={Plus} anime onClick={() => setModal({ data: empty(), id: null })}>Nouveau partenaire</BoutonBande>}
      </BandeauVolet>

      {!peutGerer && (
        <div className="ed-entree flex items-center gap-2 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-800 backdrop-blur-xl">
          <span className="ed-flotte flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0284c7')}>👁️</span>
          Mode consultation : la gestion des partenaires est réservée à l'utilisateur désigné par la direction.
        </div>
      )}

      <Card className="ed-entree p-0">
        <Table searchBy={['nom', 'contact', 'type']}
          columns={[
            { key: 'nom', label: 'Nom', render: (r) => <span className="font-semibold">{r.nom}</span> },
            { key: 'type', label: 'Type / spécificité', render: (r) => r.type ? <Badge tone="neutral">{r.type}</Badge> : <span className="text-xs text-gray-400">—</span> },
            { key: 'contact', label: 'Contact / téléphone', render: (r) => r.contact
              ? <span className="inline-flex items-center gap-1"><Phone size={13} className="text-gray-400" /> {r.contact}</span>
              : <span className="text-xs text-gray-400">—</span> },
            ...(peutGerer ? [{ key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-gray-800"><Pencil size={16} /></button>
                <button onClick={() => supprimer(r)} className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }] : [])
          ]}
          rows={liste}
          empty="Aucun partenaire enregistré."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le partenaire' : 'Nouveau partenaire'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Nom du partenaire" required>
              <Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} placeholder="ex : Dr Koffi / Clinique vétérinaire du Golfe" autoFocus />
            </FormGroup>
            <FormGroup label="Type / spécificité" hint="Ex. Vétérinaire, Technicien agricole, Fournisseur…">
              <ChampAutocomplete
                value={modal.data.type}
                onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, type: v } }))}
                suggestions={listeSuggestions}
                placeholder="ex : Vétérinaire"
              />
            </FormGroup>
            <FormGroup label="Contact / téléphone">
              <Input value={modal.data.contact} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, contact: e.target.value } }))} placeholder="ex : 22890000000" />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
