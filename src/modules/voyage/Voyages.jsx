// Voyages d'achat — liste et création. Chaque voyage regroupe les articles à
// sourcer à l'étranger, leurs fournisseurs et les achats réalisés.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plane, Plus, Eye, Trash2, MapPin, CalendarDays } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useVoyageStore } from './store/voyageStore'
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { isReadOnlyRole, isFullAccessRole, APPROVER_ROLES } from '../../core/roles'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { STATUTS_VOYAGE, PAYS_FREQUENTS } from './data'

const vide = () => ({ voyageurNom: '', pays: '', ville: '', motif: '', dateDepart: todayStr(), dateRetour: '', budget: '', budgetDevise: 'XOF' })

export default function Voyages() {
  const { user, role } = useAuth()
  const peutSaisir = !isReadOnlyRole(role)
  const peutSupprimer = isFullAccessRole(role)
  const { data: voyages } = useCollection('voyage_voyages')
  const { data: articles } = useCollection('voyage_articles')
  const { data: users } = useCollection('users')
  const devises = useVoyageStore((s) => s.devises)

  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)

  const liste = useMemo(() => [...voyages].sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0))), [voyages])
  const nbArticles = (vId) => articles.filter((a) => a.voyageId === vId).length
  const nbAchetes = (vId) => articles.filter((a) => a.voyageId === vId && a.achat).length

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function enregistrer() {
    if (saving) return
    const d = modal.data
    if (!d.voyageurNom.trim()) return toast.error('Indiquez le voyageur')
    if (!d.pays.trim()) return toast.error('Indiquez le pays de destination')
    setSaving(true)
    try {
      const num = genNumero('VOY', voyages.length)
      await addItem('voyage_voyages', {
        num, ...d, voyageurNom: d.voyageurNom.trim(), pays: d.pays.trim(),
        budget: parseFloat(d.budget) || 0, statut: 'en_cours',
        createdAt: Date.now(), agentNom: user.nom, agentId: user.uid
      })
      await audit('voyage', 'VOYAGE_CREATE', `${d.voyageurNom} → ${d.pays}`)
      await notify({
        type: 'demande', title: `✈️ Nouveau voyage d'achat — ${d.pays}`,
        body: `${d.voyageurNom} part${d.dateDepart ? ' le ' + formatDateShort(d.dateDepart) : ''}${d.motif ? ` · ${d.motif}` : ''}`,
        module: 'voyage', forRoles: [...new Set([...APPROVER_ROLES, 'ge', 'pau'])], excludeUid: user.uid, link: '/voyage/voyages'
      })
      toast.success('Voyage créé ✓')
      setModal(null)
    } finally { setSaving(false) }
  }

  async function supprimer() {
    const v = toDelete
    setToDelete(null)
    // Supprime aussi les articles rattachés.
    await Promise.all(articles.filter((a) => a.voyageId === v.id).map((a) => removeItem('voyage_articles', a.id)))
    await removeItem('voyage_voyages', v.id)
    await audit('voyage', 'VOYAGE_DELETE', v.num || v.pays)
    toast.success('Voyage supprimé ✓')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><Plane size={22} /></div>
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">Voyages d'achat</h2>
            <p className="text-sm text-gray-500">Missions d'achat à l'étranger — fournisseurs, prix et conversions</p>
          </div>
        </div>
        {peutSaisir && <Button style={{ backgroundColor: '#4f46e5' }} onClick={() => setModal({ data: vide() })}><Plus size={16} /> Nouveau voyage</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {liste.map((v) => {
          const st = STATUTS_VOYAGE[v.statut] || STATUTS_VOYAGE.en_cours
          return (
            <Card key={v.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-gray-900">{v.voyageurNom}</p>
                  <p className="flex items-center gap-1 text-sm text-gray-500"><MapPin size={13} className="text-indigo-400" />{v.pays}{v.ville ? ` · ${v.ville}` : ''}</p>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              {v.motif && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{v.motif}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{v.dateDepart ? formatDateShort(v.dateDepart) : '—'}{v.dateRetour ? ` → ${formatDateShort(v.dateRetour)}` : ''}</span>
                <span>{nbArticles(v.id)} article(s)</span>
                <span className="font-semibold text-green-600">{nbAchetes(v.id)} acheté(s)</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">{v.num}</span>
                <div className="flex gap-1">
                  <Link to={`/voyage/voyages/${v.id}`}><Button variant="outline" size="sm"><Eye size={15} /> Ouvrir</Button></Link>
                  {peutSupprimer && <button onClick={() => setToDelete(v)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>}
                </div>
              </div>
            </Card>
          )
        })}
        {!liste.length && (
          <Card className="col-span-full py-12 text-center text-gray-400">
            <Plane size={34} className="mx-auto mb-2 opacity-30" />
            <p>Aucun voyage. Créez une première mission d'achat.</p>
          </Card>
        )}
      </div>

      {/* Modal création */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md" title="Nouveau voyage d'achat"
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#4f46e5' }} onClick={enregistrer} loading={saving}>Créer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Voyageur (acheteur)" required>
              <ChampAutocomplete value={modal.data.voyageurNom} suggestions={users.map((u) => u.nom || u.login).filter(Boolean)}
                placeholder="Nom de la personne envoyée" onChange={(v) => set('voyageurNom', v)} />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Pays de destination" required>
                <ChampAutocomplete value={modal.data.pays} suggestions={PAYS_FREQUENTS} placeholder="ex : Chine" onChange={(v) => set('pays', v)} />
              </FormGroup>
              <FormGroup label="Ville"><Input value={modal.data.ville} onChange={(e) => set('ville', e.target.value)} placeholder="ex : Guangzhou" /></FormGroup>
              <FormGroup label="Départ"><Input type="date" value={modal.data.dateDepart} onChange={(e) => set('dateDepart', e.target.value)} /></FormGroup>
              <FormGroup label="Retour prévu"><Input type="date" value={modal.data.dateRetour} onChange={(e) => set('dateRetour', e.target.value)} /></FormGroup>
              <FormGroup label="Budget alloué">
                <Input type="number" min="0" value={modal.data.budget} onChange={(e) => set('budget', e.target.value)} placeholder="optionnel" />
              </FormGroup>
              <FormGroup label="Devise du budget">
                <Select value={modal.data.budgetDevise} onChange={(e) => set('budgetDevise', e.target.value)}>
                  {devises.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.nom}</option>)}
                </Select>
              </FormGroup>
            </div>
            <FormGroup label="Motif / objectif du voyage">
              <Input value={modal.data.motif} onChange={(e) => set('motif', e.target.value)} placeholder="ex : Achat d'équipements Maxi-Gym et cosmétiques" />
            </FormGroup>
          </div>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer ce voyage ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={supprimer}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Supprimer le voyage de {toDelete.voyageurNom} ({toDelete.pays}) et tous ses articles ?</p>}
      </Modal>
    </div>
  )
}
