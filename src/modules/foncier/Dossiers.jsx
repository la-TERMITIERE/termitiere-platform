// Dossiers fonciers — CRUD + suivi des étapes administratives.
import { useMemo, useState } from 'react'
import { Plus, Eye, ChevronRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, genId, formatDateShort } from '../../utils/formatters'
import {
  TYPES_DOSSIER, MODES_ACQUISITION, STATUTS_DOSSIER, STATUTS_ETAPE
} from './data'
import { initEtapesPour, progressionDossier, etapeCourante, peutPasserSuivante, statutAutoDossier } from './logic'
import { useFoncierStore } from './store/referentielStore'

const emptyDossier = () => ({
  type: 'titre_en_cours',
  modeAcquisition: 'achat',
  commune: '',
  quartier: '',
  lot: '',
  superficie: '',
  proprietaire: '',
  contact: '',
  reference: '',
  montantAchat: '',
  notes: '',
  dateOuverture: todayStr()
})

export default function Dossiers() {
  const { user } = useAuth()
  const { data: dossiers } = useCollection('foncier_dossiers')
  const customTypes = useFoncierStore((s) => s.customTypes)
  const saveType = useFoncierStore((s) => s.saveType)

  // Types disponibles = par défaut + personnalisés.
  const typesAll = useMemo(() => [...TYPES_DOSSIER, ...customTypes], [customTypes])
  const labelType = (id) => typesAll.find((t) => t.id === id)?.label || id

  const [filtreType, setFiltreType] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null) // create/edit
  const [detail, setDetail] = useState(null)
  const [typeModal, setTypeModal] = useState(false)

  function handleAddType({ label, description, modele }) {
    if (!label.trim()) return toast.error('Libellé requis')
    const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'type') + '_' + genId().slice(0, 3).toLowerCase()
    saveType({ id, label: label.trim(), description: description.trim(), modele })
    setTypeModal(false)
    toast.success(`Type « ${label.trim()} » ajouté ✓`)
  }

  const liste = useMemo(() => {
    let rows = [...dossiers]
    if (filtreType !== 'tous') rows = rows.filter((d) => d.type === filtreType)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => [d.num, d.commune, d.lot, d.proprietaire, d.reference].join(' ').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.dateOuverture < b.dateOuverture ? 1 : -1))
  }, [dossiers, filtreType, recherche])

  function openCreate() {
    setModal({ data: emptyDossier(), isNew: true })
  }

  function openEdit(d) {
    setModal({ data: { ...emptyDossier(), ...d }, isNew: false, id: d.id })
  }

  async function saveDossier() {
    const d = modal.data
    if (!d.commune.trim()) return toast.error('Commune requise')
    if (!d.proprietaire.trim()) return toast.error('Propriétaire requis')

    if (modal.isNew) {
      const num = genNumero('FON', dossiers.length)
      const etapes = initEtapesPour(d.type, customTypes)
      await addItem('foncier_dossiers', {
        num,
        ...d,
        etapes,
        statut: 'ouvert',
        agentNom: user.nom,
        dateOuverture: d.dateOuverture || todayStr(),
        updatedAt: Date.now()
      })
      await audit('foncier', 'DOSSIER_CREE', `${num} — ${d.commune}`)
      toast.success(`Dossier ${num} créé ✓`)
    } else {
      const existing = dossiers.find((x) => x.id === modal.id)
      const etapes = existing?.type !== d.type ? initEtapesPour(d.type, customTypes) : existing.etapes
      await updateItem('foncier_dossiers', modal.id, {
        ...d, etapes, statut: statutAutoDossier({ ...d, etapes }), updatedAt: Date.now()
      })
      toast.success('Dossier mis à jour ✓')
    }
    setModal(null)
  }

  async function updateEtape(dossierId, etapeId, patch) {
    const d = dossiers.find((x) => x.id === dossierId)
    if (!d) return
    const etapes = d.etapes.map((e) => (e.id === etapeId ? { ...e, ...patch } : e))
    const statut = statutAutoDossier({ ...d, etapes })
    await updateItem('foncier_dossiers', dossierId, { etapes, statut, updatedAt: Date.now() })
    setDetail((det) => det?.id === dossierId ? { ...det, etapes, statut } : det)
    toast.success('Étape mise à jour ✓')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Gestion des dossiers liés à l'autorité foncière : achat avec titre, morcellement, mutation, titre en cours d'obtention.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-48" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <Select className="w-auto" value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
          <option value="tous">Tous les types</option>
          {typesAll.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setTypeModal(true)}><Plus size={16} /> Ajouter un type</Button>
          <Button onClick={openCreate}><Plus size={16} /> Nouveau dossier</Button>
        </div>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Localisation</th>
              <th className="px-3 py-2">Propriétaire</th>
              <th className="px-3 py-2">Progression</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.map((d) => {
              const pct = progressionDossier(d.etapes)
              const typeLabel = labelType(d.type)
              const etape = etapeCourante(d.etapes)
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                  <td className="px-3 py-2 text-xs">{typeLabel}</td>
                  <td className="px-3 py-2"><strong>{d.commune}</strong>{d.lot && <span className="text-gray-500"> — Lot {d.lot}</span>}</td>
                  <td className="px-3 py-2">{d.proprietaire}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                      <span className="text-[10px] font-bold">{pct}%</span>
                    </div>
                    {etape && <p className="text-[10px] text-gray-500">{etape.label}</p>}
                  </td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_DOSSIER[d.statut]?.tone}>{STATUTS_DOSSIER[d.statut]?.label}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDetail(d)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!liste.length && <p className="py-10 text-center text-gray-400">Aucun dossier.</p>}
      </Card>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal?.isNew ? 'Nouveau dossier foncier' : `Modifier ${modal?.data?.num || ''}`}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={saveDossier}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Type de dossier" className="col-span-2">
              <Select value={modal.data.type} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, type: e.target.value } }))}>
                {typesAll.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
              <p className="mt-1 text-xs text-gray-500">{typesAll.find((t) => t.id === modal.data.type)?.description}</p>
            </FormGroup>
            <FormGroup label="Mode d'acquisition">
              <Select value={modal.data.modeAcquisition} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, modeAcquisition: e.target.value } }))}>
                {MODES_ACQUISITION.map((mo) => <option key={mo.id} value={mo.id}>{mo.label}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Date ouverture"><Input type="date" value={modal.data.dateOuverture} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, dateOuverture: e.target.value } }))} /></FormGroup>
            <FormGroup label="Commune" required><Input value={modal.data.commune} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, commune: e.target.value } }))} placeholder="Ex: Golfe 4" /></FormGroup>
            <FormGroup label="Quartier"><Input value={modal.data.quartier} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, quartier: e.target.value } }))} /></FormGroup>
            <FormGroup label="Lot / Parcelle"><Input value={modal.data.lot} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, lot: e.target.value } }))} /></FormGroup>
            <FormGroup label="Superficie (m²)"><Input value={modal.data.superficie} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, superficie: e.target.value } }))} /></FormGroup>
            <FormGroup label="Propriétaire" required className="col-span-2"><Input value={modal.data.proprietaire} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, proprietaire: e.target.value } }))} /></FormGroup>
            <FormGroup label="Contact"><Input value={modal.data.contact} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, contact: e.target.value } }))} /></FormGroup>
            <FormGroup label="Référence titre"><Input value={modal.data.reference} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, reference: e.target.value } }))} /></FormGroup>
            <FormGroup label="Montant achat (FCFA)"><Input type="number" min="0" value={modal.data.montantAchat} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, montantAchat: e.target.value } }))} /></FormGroup>
            <FormGroup label="Notes" className="col-span-2"><Input value={modal.data.notes} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal détail + étapes */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={`Dossier ${detail?.num || ''} — ${detail?.commune || ''}`}
        footer={<Button onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p><span className="text-gray-500">Type :</span> <strong>{labelType(detail.type)}</strong></p>
              <p><span className="text-gray-500">Acquisition :</span> {MODES_ACQUISITION.find((m) => m.id === detail.modeAcquisition)?.label}</p>
              <p><span className="text-gray-500">Propriétaire :</span> {detail.proprietaire}</p>
              <p><span className="text-gray-500">Lot :</span> {detail.lot || '—'} · {detail.superficie ? `${detail.superficie} m²` : ''}</p>
            </div>

            <div className="flex items-center gap-2">
              <Badge tone={STATUTS_DOSSIER[detail.statut]?.tone}>{STATUTS_DOSSIER[detail.statut]?.label}</Badge>
              <span className="text-sm font-bold text-emerald-700">{progressionDossier(detail.etapes)}% complété</span>
              <button onClick={() => openEdit(detail)} className="ml-auto text-xs text-secondary underline">Modifier infos</button>
            </div>

            <p className="text-xs font-bold uppercase text-gray-500">Étapes administratives</p>
            <div className="space-y-2">
              {(detail.etapes || []).sort((a, b) => a.ordre - b.ordre).map((e, idx) => (
                <div key={e.id} className={`rounded-lg border p-3 ${e.statut === 'termine' ? 'border-green-200 bg-green-50/50' : e.statut === 'en_cours' ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{idx + 1}</span>
                    <span className="flex-1 font-semibold text-sm">{e.label}</span>
                    <Badge tone={STATUTS_ETAPE[e.statut]?.tone}>{STATUTS_ETAPE[e.statut]?.label}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select className="text-xs" value={e.statut} onChange={(ev) => {
                      if (ev.target.value === 'termine' && !peutPasserSuivante(detail.etapes, e.id)) {
                        return toast.error('Terminez l\'étape précédente d\'abord')
                      }
                      updateEtape(detail.id, e.id, {
                        statut: ev.target.value,
                        dateFin: ev.target.value === 'termine' ? todayStr() : e.dateFin
                      })
                    }}>
                      {Object.entries(STATUTS_ETAPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                    <Input type="date" className="text-xs" placeholder="Début" value={e.dateDebut || ''}
                      onChange={(ev) => updateEtape(detail.id, e.id, { dateDebut: ev.target.value })} />
                    <Input type="date" className="text-xs" placeholder="Fin" value={e.dateFin || ''}
                      onChange={(ev) => updateEtape(detail.id, e.id, { dateFin: ev.target.value })} />
                    <Input className="text-xs" placeholder="Responsable" value={e.responsable || ''}
                      onChange={(ev) => updateEtape(detail.id, e.id, { responsable: ev.target.value })} />
                  </div>
                  <Input className="mt-2 text-xs" placeholder="Notes étape…" value={e.notes || ''}
                    onChange={(ev) => updateEtape(detail.id, e.id, { notes: ev.target.value })} />
                </div>
              ))}
            </div>

            {detail.type === 'titre_en_cours' && progressionDossier(detail.etapes) === 100 && (
              <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
                <ChevronRight size={14} className="inline" /> Titre obtenu — vous pouvez lancer un <strong>morcellement</strong> ou une <strong>mutation</strong> via un nouveau dossier.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal création d'un type de dossier personnalisé */}
      <AddTypeModal open={typeModal} onClose={() => setTypeModal(false)} onSave={handleAddType} />
    </div>
  )
}

// Fenêtre de création d'un type de dossier personnalisé (modèle d'étapes réutilisé).
function AddTypeModal({ open, onClose, onSave }) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [modele, setModele] = useState(TYPES_DOSSIER[0]?.id || 'titre_en_cours')

  useEffect(() => {
    if (open) { setLabel(''); setDescription(''); setModele(TYPES_DOSSIER[0]?.id || 'titre_en_cours') }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un type de dossier"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ label, description, modele })}>Ajouter</Button></>}>
      <FormGroup label="Libellé du type" required>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex : Bail emphytéotique" autoFocus />
      </FormGroup>
      <FormGroup label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brève description de la procédure" />
      </FormGroup>
      <FormGroup label="Modèle d'étapes" hint="Réutilise l'enchaînement administratif d'un type existant">
        <Select value={modele} onChange={(e) => setModele(e.target.value)}>
          {TYPES_DOSSIER.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </FormGroup>
    </Modal>
  )
}
