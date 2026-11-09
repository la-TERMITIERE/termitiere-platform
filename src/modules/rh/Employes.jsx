// Employés — CRUD complet.
import { useState, useMemo } from 'react'
import { Plus, Trash2, UserRound, Briefcase, Building2, CalendarDays, Banknote, Phone } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useDepartements } from './useDepartements'
import { COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh, ChoixBoutons } from './rhui'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'
import { UserCircle as IconeEmployes } from 'lucide-react'

const empty = () => ({ nom: '', poste: '', departement: '', dateEmbauche: todayStr(), salaire: 0, contact: '' })

export default function Employes() {
  const departements = useDepartements()
  const { data: postes } = useCollection(COL.postes)
  const intitulesPostes = useMemo(() => [...new Set(postes.map((p) => p.intitule).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [postes])
  const { data: employes } = useCollection('rh_employes')
  const [modal, setModal] = useState(null)

  // Choisir un poste du catalogue reprend son département et son salaire de base, sans écraser ce qui est déjà renseigné.
  const choisirPoste = (v) => setModal((m) => {
    const p = postes.find((x) => x.intitule === v)
    const data = { ...m.data, poste: v }
    if (p && !data.departement && p.departement) data.departement = p.departement
    if (p && !(Number(data.salaire) > 0) && Number(p.salaireBase) > 0) data.salaire = Number(p.salaireBase)
    return { ...m, data }
  })
  const maj = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))
  async function save() {
    const e = modal.data
    if (!e.nom.trim()) return toast.error('Nom requis')
    const nom = (t) => String(t || '').trim().toLowerCase()
    const dep = String(e.departement || '').trim()
    const poste = String(e.poste || '').trim()
    const fiche = { ...e, departement: dep, poste }
    // Un département ou un poste saisi à la main (« + Autre ») rejoint tout seul le catalogue : plus besoin de passer par les autres volets.
    // Le poste créé ainsi reprend le département et le salaire de l'employé ; la classification reste à compléter si besoin.
    if (dep && !departements.some((d) => nom(d) === nom(dep))) await addItem(COL.departements, { nom: dep, responsable: '', description: '' })
    if (poste && !postes.some((p) => nom(p.intitule) === nom(poste))) {
      await addItem(COL.postes, { intitule: poste, departement: dep, classification: '', salaireBase: Number(e.salaire) || 0, missions: '' })
    }
    if (modal.id) await updateItem('rh_employes', modal.id, fiche)
    else await addItem('rh_employes', fiche)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(e) { if (confirm(`Supprimer ${e.nom} ?`)) { await removeItem('rh_employes', e.id); toast.success('Supprimé') } }

  return (
    <div className="space-y-4">
      <PageHeader icon={IconeEmployes} sousModule="Collaborateurs & Contrats" titre="Employés & Annuaire" sousTitre="Fiches des employés, postes, départements et contacts."
        action={<BoutonBande anime icone={Plus} onClick={() => setModal({ data: empty(), id: null })}>Ajouter un employé</BoutonBande>} />
      <Card className="p-0">
        <Table searchBy={['nom', 'prenom', 'matricule']}
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'poste', label: 'Poste' },
            { key: 'departement', label: 'Département' },
            { key: 'dateEmbauche', label: 'Embauche', render: (r) => formatDateShort(r.dateEmbauche) },
            { key: 'salaire', label: 'Salaire', align: 'right', render: (r) => formatMoney(r.salaire) },
            { key: 'contact', label: 'Contact' },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={employes}
          empty="Aucun employé."
        />
      </Card>

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier un employé' : 'Nouvel employé'} titreHero={modal?.data?.nom?.trim() || undefined}
        icone={UserRound} intro="La fiche d'un collaborateur : poste, département, embauche et salaire." onSave={save}>
        {modal && (<>
          <Champ label="Nom" icone={UserRound} required>
            <input value={modal.data.nom} onChange={(e) => maj('nom', e.target.value)} className="input-base" placeholder="Nom et prénom" autoFocus />
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Champ label="Poste" icone={Briefcase} iconeLabel>
                <ChoixBoutons options={intitulesPostes} value={modal.data.poste} onChange={choisirPoste} placeholderAutre="Intitulé du poste"
                  vide="Aucun poste créé : saisissez-en un ci-dessous ou créez-les dans « Postes de travail »." />
              </Champ>
            </div>
            <div className="sm:col-span-2">
            <Champ label="Département" icone={Building2} iconeLabel>
              <ChoixBoutons options={departements} value={modal.data.departement} onChange={(v) => maj('departement', v)}
                placeholderAutre="Nom du département" vide="Aucun département créé : saisissez-en un ci-dessous ou créez-les dans le volet Départements." />
            </Champ>
            </div>
            <Champ label="Date d'embauche" icone={CalendarDays}>
              <input type="date" value={modal.data.dateEmbauche} onChange={(e) => maj('dateEmbauche', e.target.value)} className="input-base" />
            </Champ>
            <Champ label="Salaire (FCFA)" icone={Banknote}>
              <input type="number" min="0" value={modal.data.salaire} onChange={(e) => maj('salaire', parseInt(e.target.value) || 0)} className="input-base" />
            </Champ>
          </div>
          <Champ label="Contact" icone={Phone}>
            <input value={modal.data.contact} onChange={(e) => maj('contact', e.target.value)} className="input-base" placeholder="Téléphone ou e-mail" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}
