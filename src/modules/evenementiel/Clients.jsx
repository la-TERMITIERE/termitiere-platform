// Clients briqueterie. Les clients s'ajoutent AUTOMATIQUEMENT quand on crée une vente ou une
// facture (cf. clientAuto.js) : ici on les consulte (fiche détaillée au clic), on les corrige.
import { useState } from 'react'
import { Pencil, Trash2, Users, Eye, Phone, MapPin, Briefcase } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import ActionIcone from '../../shared/ui/ActionIcone'
import AvatarNom from '../../shared/ui/AvatarNom'
import ChampRecherche from '../../shared/ui/ChampRecherche'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import ClientDetailModal from './ClientDetailModal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COULEUR_MODULE } from '../../utils/color'

const empty = () => ({ nom: '', telephone: '', adresse: '', profession: '' })

// Professions courantes (statistiques) : l'utilisateur peut aussi saisir la sienne.
const PROFESSIONS = ['Maçon', 'Architecte', 'Entrepreneur BTP', 'Ingénieur', 'Promoteur immobilier', 'Particulier', 'Revendeur', 'Autre']

export default function Clients() {
  const { data: clients } = useCollection('evenementiel_clients')
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  // Les agents modifient partout mais ne suppriment jamais (décision explicite).
  const peutSupprimer = isFullAccessRole(role)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [saving, setSaving] = useState(false)

  const cle = (x) => `${(x.nom || '').trim().toLowerCase()}|${(x.telephone || '').replace(/ /g, '')}`

  async function save() {
    if (saving) return
    const c = modal.data
    if (!c.nom.trim()) return toast.error('Nom requis')
    if (clients.some((x) => x.id !== modal.id && cle(x) === cle(c))) return toast.error('Ce client existe déjà (même nom et même téléphone)')
    setSaving(true)
    try {
      await updateItem('evenementiel_clients', modal.id, c)
      toast.success('Enregistré ✓')
      setModal(null)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(71,85,105,0.35),0_8px_20px_-8px_rgba(71,85,105,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(138,155,179,0.92) 0%, rgba(100,116,139,0.9) 40%, rgba(51,65,85,0.88) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#475569', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Clients</h2>
          <p className="text-sm text-white/80">{clients.length} client(s) · Briqueterie</p>
        </div>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
      </div>

      <p className="text-sm text-gray-500">Les clients s'ajoutent automatiquement quand vous créez une vente ou une facture : inutile de les saisir ici avant. Cliquez sur un client pour voir son historique d'achats.</p>

      <Card className="p-0">
        <Table searchBy={['nom', 'telephone', 'profession', 'adresse']} searchQuery={recherche} onRowClick={(r) => setDetail(r)}
          columns={[
            { key: 'nom', label: 'Nom', render: (r) => (
              <span className="flex items-center gap-2.5">
                <AvatarNom nom={r.nom} accent={COULEUR_MODULE.evenementiel} />
                <span className="font-semibold">{r.nom}</span>
              </span>
            ) },
            { key: 'profession', label: 'Profession', render: (r) => r.profession
              ? <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50/80 px-2.5 py-0.5 text-xs font-bold text-slate-700"><Briefcase size={11} />{r.profession}</span>
              : <span className="text-gray-300">:</span> },
            { key: 'telephone', label: 'Téléphone', render: (r) => r.telephone
              ? <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"><Phone size={12} className="text-slate-500" />{r.telephone}</span>
              : <span className="text-gray-300">:</span> },
            { key: 'adresse', label: 'Adresse', render: (r) => r.adresse
              ? <span className="inline-flex items-center gap-1.5 text-xs text-gray-600"><MapPin size={12} className="text-slate-500" />{r.adresse}</span>
              : <span className="text-gray-300">:</span> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <ActionIcone icone={Eye} tone="voir" title="Voir la fiche" onClick={() => setDetail(r)} />
                {!lectureSeule && <ActionIcone icone={Pencil} tone="modifier" title="Modifier" onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} />}
                {peutSupprimer && <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer" onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeItem('evenementiel_clients', r.id) }} />}
              </div>
            ) }
          ]}
          rows={clients}
          emptyIcon={Users}
          empty="Aucun client pour le moment : ils apparaîtront dès la première vente."
        />
      </Card>

      <ClientDetailModal client={detail} onClose={() => setDetail(null)} />

      <Modal open={!!modal} onClose={() => setModal(null)} title="Modifier le client"
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-x-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
            <FormGroup label="Profession" hint="pour les statistiques (qui achète le plus)" className="col-span-2">
              <Input list="briq-professions" value={modal.data.profession || ''} placeholder="ex : Maçon, Architecte…"
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, profession: e.target.value } }))} />
              <datalist id="briq-professions">
                {PROFESSIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </FormGroup>
            <FormGroup label="Téléphone"><Input value={modal.data.telephone} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, telephone: e.target.value } }))} /></FormGroup>
            <FormGroup label="Adresse"><Input value={modal.data.adresse} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, adresse: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
