// Dossiers fonciers — acteurs, parcelle, suivi des étapes, pièces jointes (PDF/images),
// cession/vente avec grille d'appréciation (verdict approbation/annulation base).
import { useEffect, useMemo, useState } from 'react'
import { Plus, Eye, Trash2, UserPlus, ChevronRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, genId, formatMoney } from '../../utils/formatters'
import {
  TYPES_DOSSIER, MODES_ACQUISITION, STATUTS_DOSSIER, STATUTS_ETAPE,
  ACTEURS_ROLES, CESSION_CATEGORIES, APPRECIATION_CRITERES, VERDICTS_APPRECIATION,
  PIECES_ACTEUR, PIECES_PARCELLE, COUTS_REFERENCE, PLAN_VISE_OPTIONS, planViseLabel
} from './data'
import { initEtapesPour, progressionDossier, etapeCourante, peutPasserSuivante, statutAutoDossier } from './logic'
import { useFoncierStore } from './store/referentielStore'

// Rubriques de classement des pièces jointes (pour les taguer à l'upload).
const RUBRIQUES = [
  ...PIECES_ACTEUR.map((p) => ({ id: p.id, label: p.label })),
  ...PIECES_PARCELLE.map((p) => ({ id: p.id, label: p.label })),
  { id: 'acte_vente', label: 'Acte de vente / cession' },
  { id: 'autre', label: 'Autre document' }
]
const rubriqueLabel = (id) => RUBRIQUES.find((r) => r.id === id)?.label || id
const coutLabel = (id) => COUTS_REFERENCE.find((c) => c.id === id)?.label || ''

const emptyParcelle = () => ({
  numRequisition: '', numTitre: '', numLeve: '', attestationCoutumiere: '', planParcellaire: '',
  prefecture: '', commune: '', quartier: '', lot: '', hectares: '', superficie: ''
})
const newActeur = () => ({ id: genId(), role: 'proprietaire', nom: '', contact: '', nif: '', notes: '' })
const emptyDossier = () => ({
  type: 'vente_cession',
  modeAcquisition: 'achat',
  dateOuverture: todayStr(),
  parcelle: emptyParcelle(),
  acteurs: [newActeur()],
  cession: { categorie: 'terrain_nu', docsFournis: {}, appreciation: { criteres: {}, verdict: 'en_attente', observations: '' } },
  montantAchat: '',
  notes: ''
})

// Nom du propriétaire/cédant principal → champ plat `proprietaire` (compat dashboard).
function proprietairePrincipal(acteurs = []) {
  const prio = ['proprietaire', 'cedant', 'donateur', 'heritier']
  for (const r of prio) {
    const a = acteurs.find((x) => x.role === r && x.nom?.trim())
    if (a) return a.nom.trim()
  }
  return acteurs.find((x) => x.nom?.trim())?.nom?.trim() || ''
}

export default function Dossiers() {
  const { user } = useAuth()
  const { data: dossiers } = useCollection('foncier_dossiers')
  const { data: toutesPieces } = useCollection('foncier_pieces')
  const customTypes = useFoncierStore((s) => s.customTypes)
  const saveType = useFoncierStore((s) => s.saveType)

  const typesAll = useMemo(() => [...TYPES_DOSSIER, ...customTypes], [customTypes])
  const labelType = (id) => typesAll.find((t) => t.id === id)?.label || id

  const [filtreType, setFiltreType] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [typeModal, setTypeModal] = useState(false)

  // Le détail se resynchronise automatiquement avec la collection (temps réel).
  const detail = useMemo(() => dossiers.find((d) => d.id === detailId) || null, [dossiers, detailId])
  const piecesDetail = useMemo(
    () => toutesPieces.filter((p) => p.dossierId === detailId).map((p) => ({ ...p, rubriqueLabel: rubriqueLabel(p.rubrique) })),
    [toutesPieces, detailId]
  )

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
    if (dateDebut) rows = rows.filter((d) => (d.dateOuverture || '') >= dateDebut)
    if (dateFin) rows = rows.filter((d) => (d.dateOuverture || '') <= dateFin)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => [d.num, d.commune, d.lot, d.proprietaire, d.reference, d.parcelle?.numTitre]
        .join(' ').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.dateOuverture < b.dateOuverture ? 1 : -1))
  }, [dossiers, filtreType, recherche, dateDebut, dateFin])

  // Coût total dépensé sur les dossiers de la période/filtre courant.
  const totalPeriode = useMemo(
    () => liste.reduce((s, d) => s + (d.etapes || []).reduce((t, e) => t + (parseFloat(e.montant) || 0), 0), 0),
    [liste]
  )

  function openCreate() { setModal({ data: emptyDossier(), isNew: true }) }
  function openEdit(d) {
    setModal({
      data: { ...emptyDossier(), ...d, parcelle: { ...emptyParcelle(), ...(d.parcelle || {}) }, acteurs: d.acteurs?.length ? d.acteurs : [newActeur()] },
      isNew: false, id: d.id
    })
  }

  // ── Helpers de mise à jour du formulaire ──
  const setData = (patch) => setModal((m) => ({ ...m, data: { ...m.data, ...patch } }))
  const setParcelle = (patch) => setData({ parcelle: { ...modal.data.parcelle, ...patch } })
  const setActeur = (i, patch) => setData({ acteurs: modal.data.acteurs.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  const addActeur = () => setData({ acteurs: [...modal.data.acteurs, newActeur()] })
  const removeActeur = (i) => setData({ acteurs: modal.data.acteurs.filter((_, j) => j !== i) })
  const setCession = (patch) => setData({ cession: { ...modal.data.cession, ...patch } })

  async function saveDossier() {
    const d = modal.data
    if (!d.parcelle.commune.trim()) return toast.error('Commune de la parcelle requise')
    const prop = proprietairePrincipal(d.acteurs)
    if (!prop) return toast.error('Au moins un acteur avec un nom est requis')

    // Champs plats (compat dashboard/params + recherche).
    const flat = {
      commune: d.parcelle.commune, quartier: d.parcelle.quartier, lot: d.parcelle.lot,
      superficie: d.parcelle.superficie, reference: d.parcelle.numTitre, proprietaire: prop
    }

    if (modal.isNew) {
      const num = genNumero('FON', dossiers.length)
      const etapes = initEtapesPour(d.type, customTypes)
      const payload = { num, ...d, ...flat, etapes, agentNom: user.nom, dateOuverture: d.dateOuverture || todayStr(), updatedAt: Date.now() }
      payload.statut = statutAutoDossier({ ...payload })
      await addItem('foncier_dossiers', payload)
      await audit('foncier', 'DOSSIER_CREATE', `${num} — ${d.parcelle.commune}`)
      toast.success(`Dossier ${num} créé ✓`)
    } else {
      const existing = dossiers.find((x) => x.id === modal.id)
      const etapes = existing?.type !== d.type ? initEtapesPour(d.type, customTypes) : existing.etapes
      const merged = { ...d, ...flat, etapes }
      await updateItem('foncier_dossiers', modal.id, { ...merged, statut: statutAutoDossier(merged), updatedAt: Date.now() })
      await audit('foncier', 'DOSSIER_EDIT', `${d.num || ''} — ${d.parcelle.commune}`)
      toast.success('Dossier mis à jour ✓')
    }
    setModal(null)
  }

  async function patchDossier(dossierId, patch) {
    const d = dossiers.find((x) => x.id === dossierId)
    if (!d) return
    const merged = { ...d, ...patch }
    await updateItem('foncier_dossiers', dossierId, { ...patch, statut: statutAutoDossier(merged), updatedAt: Date.now() })
  }

  async function updateEtape(dossierId, etapeId, patch) {
    const d = dossiers.find((x) => x.id === dossierId)
    if (!d) return
    const etapes = (d.etapes || []).map((e) => (e.id === etapeId ? { ...e, ...patch } : e))
    await patchDossier(dossierId, { etapes })
  }

  async function setVerdict(dossierId, appreciationPatch) {
    const d = dossiers.find((x) => x.id === dossierId)
    if (!d) return
    const cession = { ...(d.cession || {}), appreciation: { ...(d.cession?.appreciation || {}), ...appreciationPatch } }
    await patchDossier(dossierId, { cession })
    await audit('foncier', 'APPRECIATION', `${d.num} — ${VERDICTS_APPRECIATION[cession.appreciation.verdict]?.label || ''}`)
  }

  async function ajouterPiece(piece) {
    if (!detailId) return
    await addItem('foncier_pieces', { dossierId: detailId, ...piece, addedAt: Date.now(), agentNom: user.nom })
    await audit('foncier', 'PIECE_AJOUT', `${detail?.num || ''} — ${piece.nom}`)
  }
  async function supprimerPiece(piece) {
    if (!confirm(`Supprimer « ${piece.nom} » ?`)) return
    await removeItem('foncier_pieces', piece.id)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Dossiers fonciers (Togo) : cession/vente, immatriculation, mutation, morcellement, donation, héritage, lotissement —
        acteurs, parcelle, pièces jointes et suivi des étapes jusqu'au titre foncier.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-48" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <Select className="w-auto" value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
          <option value="tous">Tous les types</option>
          {typesAll.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Période&nbsp;:</span>
          <Input type="date" className="w-auto text-xs" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} title="Date d'ouverture — début" />
          <span className="text-xs text-gray-400">→</span>
          <Input type="date" className="w-auto text-xs" value={dateFin} onChange={(e) => setDateFin(e.target.value)} title="Date d'ouverture — fin" />
          {(dateDebut || dateFin) && (
            <button onClick={() => { setDateDebut(''); setDateFin('') }} className="text-xs text-gray-400 underline hover:text-gray-600">effacer</button>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setTypeModal(true)}><Plus size={16} /> Ajouter un type</Button>
          <Button onClick={openCreate}><Plus size={16} /> Nouveau dossier</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span><strong className="text-gray-700">{liste.length}</strong> dossier(s){(dateDebut || dateFin) ? ' sur la période' : ''}</span>
        {totalPeriode > 0 && <span>Total dépensé : <strong className="text-emerald-700">{formatMoney(totalPeriode)}</strong></span>}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Localisation</th>
              <th className="px-3 py-2">Propriétaire / Cédant</th>
              <th className="px-3 py-2">Progression</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.map((d) => {
              const pct = progressionDossier(d.etapes)
              const etape = etapeCourante(d.etapes)
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                  <td className="px-3 py-2 text-xs">{labelType(d.type)}</td>
                  <td className="px-3 py-2"><strong>{d.commune}</strong>{d.lot && <span className="text-gray-500"> — Lot {d.lot}</span>}</td>
                  <td className="px-3 py-2">{d.proprietaire}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                      <span className="text-[10px] font-bold">{pct}%</span>
                    </div>
                    {etape && <p className="text-[10px] text-gray-500">{etape.label}</p>}
                  </td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_DOSSIER[d.statut]?.tone}>{STATUTS_DOSSIER[d.statut]?.label || d.statut}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDetailId(d.id)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!liste.length && <p className="py-10 text-center text-gray-400">Aucun dossier.</p>}
      </Card>

      {/* ─────────── Modal création / édition ─────────── */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="xl"
        title={modal?.isNew ? 'Nouveau dossier foncier' : `Modifier ${modal?.data?.num || ''}`}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={saveDossier}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-5">
            {/* Contexte */}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <FormGroup label="Type de dossier" className="col-span-2 md:col-span-1">
                <Select value={modal.data.type} onChange={(e) => setData({ type: e.target.value })}>
                  {typesAll.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Mode d'acquisition">
                <Select value={modal.data.modeAcquisition} onChange={(e) => setData({ modeAcquisition: e.target.value })}>
                  {MODES_ACQUISITION.map((mo) => <option key={mo.id} value={mo.id}>{mo.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date d'ouverture"><Input type="date" value={modal.data.dateOuverture} onChange={(e) => setData({ dateOuverture: e.target.value })} /></FormGroup>
              <p className="col-span-2 -mt-1 text-xs text-gray-500 md:col-span-3">{typesAll.find((t) => t.id === modal.data.type)?.description}</p>
            </section>

            {/* Cession : catégorie + appréciation */}
            {modal.data.type === 'vente_cession' && (
              <CessionForm cession={modal.data.cession} setCession={setCession} />
            )}

            {/* Parcelle */}
            <section>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Parcelle / Domaine</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <FormGroup label="Commune" required><Input value={modal.data.parcelle.commune} onChange={(e) => setParcelle({ commune: e.target.value })} placeholder="Ex : Golfe 4" /></FormGroup>
                <FormGroup label="Préfecture"><Input value={modal.data.parcelle.prefecture} onChange={(e) => setParcelle({ prefecture: e.target.value })} /></FormGroup>
                <FormGroup label="Quartier / Canton"><Input value={modal.data.parcelle.quartier} onChange={(e) => setParcelle({ quartier: e.target.value })} /></FormGroup>
                <FormGroup label="Référence — Lot" hint="Facultatif"><Input value={modal.data.parcelle.lot} onChange={(e) => setParcelle({ lot: e.target.value })} placeholder="Ex : Lot 128" /></FormGroup>
                <FormGroup label="Référence — Hectare(s)" hint="Facultatif"><Input value={modal.data.parcelle.hectares} onChange={(e) => setParcelle({ hectares: e.target.value })} placeholder="Ex : 2,5 ha" /></FormGroup>
                <FormGroup label="Superficie (m²)"><Input value={modal.data.parcelle.superficie} onChange={(e) => setParcelle({ superficie: e.target.value })} /></FormGroup>
                <FormGroup label="N° levé topographique"><Input value={modal.data.parcelle.numLeve} onChange={(e) => setParcelle({ numLeve: e.target.value })} /></FormGroup>
                <FormGroup label="N° de réquisition"><Input value={modal.data.parcelle.numRequisition} onChange={(e) => setParcelle({ numRequisition: e.target.value })} /></FormGroup>
                <FormGroup label="N° Titre Foncier"><Input value={modal.data.parcelle.numTitre} onChange={(e) => setParcelle({ numTitre: e.target.value })} /></FormGroup>
                <FormGroup label="Attestation coutumière"><Input value={modal.data.parcelle.attestationCoutumiere} onChange={(e) => setParcelle({ attestationCoutumiere: e.target.value })} placeholder="Réf. / détenteur" /></FormGroup>
                <FormGroup label="Plan visé" className="col-span-2 md:col-span-1">
                  <Select value={modal.data.parcelle.planParcellaire} onChange={(e) => setParcelle({ planParcellaire: e.target.value })}>
                    {PLAN_VISE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                </FormGroup>
              </div>
            </section>

            {/* Acteurs */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-gray-500">Acteurs</p>
                <Button variant="outline" size="sm" onClick={addActeur}><UserPlus size={14} /> Ajouter un acteur</Button>
              </div>
              <div className="space-y-2">
                {modal.data.acteurs.map((a, i) => (
                  <div key={a.id} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 p-2 md:grid-cols-12">
                    <Select className="md:col-span-3" value={a.role} onChange={(e) => setActeur(i, { role: e.target.value })}>
                      {ACTEURS_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </Select>
                    <Input className="md:col-span-3" placeholder="Nom complet" value={a.nom} onChange={(e) => setActeur(i, { nom: e.target.value })} />
                    <Input className="md:col-span-2" placeholder="Contact" value={a.contact} onChange={(e) => setActeur(i, { contact: e.target.value })} />
                    <Input className="md:col-span-2" placeholder="NIF" value={a.nif} onChange={(e) => setActeur(i, { nif: e.target.value })} />
                    <div className="flex items-center justify-end md:col-span-2">
                      {modal.data.acteurs.length > 1 && (
                        <button onClick={() => removeActeur(i)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Pièces exigées par acteur (à téléverser dans le détail) : CNI/passeport légalisé, acte de naissance &lt; 3 mois, NIF.</p>
            </section>

            <FormGroup label="Notes"><Input value={modal.data.notes} onChange={(e) => setData({ notes: e.target.value })} /></FormGroup>
          </div>
        )}
      </Modal>

      {/* ─────────── Modal détail ─────────── */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} size="xl"
        title={detail ? `Dossier ${detail.num} — ${detail.commune || ''}` : ''}
        footer={<Button onClick={() => setDetailId(null)}>Fermer</Button>}>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUTS_DOSSIER[detail.statut]?.tone}>{STATUTS_DOSSIER[detail.statut]?.label || detail.statut}</Badge>
              <span className="text-sm font-bold text-emerald-700">{progressionDossier(detail.etapes)}% complété</span>
              <span className="text-xs text-gray-500">· {labelType(detail.type)}</span>
              <button onClick={() => openEdit(detail)} className="ml-auto text-xs text-secondary underline">Modifier infos</button>
            </div>

            {/* Informations du dossier */}
            <section>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Informations du dossier</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-gray-100 p-3 text-sm sm:grid-cols-3">
                <InfoField label="Type" value={labelType(detail.type)} />
                <InfoField label="Mode d'acquisition" value={MODES_ACQUISITION.find((m) => m.id === detail.modeAcquisition)?.label} />
                <InfoField label="Date d'ouverture" value={detail.dateOuverture} />
                <InfoField label="Commune" value={detail.parcelle?.commune} />
                <InfoField label="Préfecture" value={detail.parcelle?.prefecture} />
                <InfoField label="Quartier / Canton" value={detail.parcelle?.quartier} />
                <InfoField label="Lot" value={detail.parcelle?.lot} />
                <InfoField label="Hectare(s)" value={detail.parcelle?.hectares} />
                <InfoField label="Superficie (m²)" value={detail.parcelle?.superficie} />
                <InfoField label="N° levé topographique" value={detail.parcelle?.numLeve} />
                <InfoField label="N° de réquisition" value={detail.parcelle?.numRequisition} />
                <InfoField label="N° Titre Foncier" value={detail.parcelle?.numTitre} />
                <InfoField label="Attestation coutumière" value={detail.parcelle?.attestationCoutumiere} />
                <InfoField label="Plan visé" value={planViseLabel(detail.parcelle?.planParcellaire)} />
                {detail.montantAchat && <InfoField label="Montant d'achat" value={formatMoney(parseFloat(detail.montantAchat) || 0)} />}
              </div>
              {detail.notes && <p className="mt-2 text-sm text-gray-600"><span className="font-semibold">Notes :</span> {detail.notes}</p>}
            </section>

            {/* Acteurs */}
            <section>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Acteurs</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(detail.acteurs || []).map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-100 p-2 text-sm">
                    <p className="font-semibold">{a.nom || '—'} <span className="text-xs font-normal text-gray-500">· {ACTEURS_ROLES.find((r) => r.id === a.role)?.label || a.role}</span></p>
                    <p className="text-xs text-gray-500">{[a.contact, a.nif && `NIF ${a.nif}`].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                ))}
                {!(detail.acteurs || []).length && <p className="text-xs text-gray-400">Aucun acteur.</p>}
              </div>
            </section>

            {/* Cession / appréciation */}
            {detail.type === 'vente_cession' && (
              <AppreciationPanel detail={detail} onVerdict={(patch) => setVerdict(detail.id, patch)} />
            )}

            {/* Étapes */}
            <section>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Étapes administratives</p>
              <div className="space-y-2">
                {(detail.etapes || []).slice().sort((a, b) => a.ordre - b.ordre).map((e, idx) => (
                  <div key={e.id} className={`rounded-lg border p-3 ${e.statut === 'termine' ? 'border-green-200 bg-green-50/50' : e.statut === 'en_cours' ? 'border-amber-200 bg-amber-50/50' : e.statut === 'bloque' ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{idx + 1}</span>
                      <span className="flex-1 text-sm font-semibold">{e.label}</span>
                      {e.personnel && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{e.personnel}</span>}
                      <Badge tone={STATUTS_ETAPE[e.statut]?.tone}>{STATUTS_ETAPE[e.statut]?.label}</Badge>
                    </div>
                    {e.cout && <p className="mt-1 text-[11px] text-gray-500">Coût lié : {coutLabel(e.cout)}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Select className="text-xs" value={e.statut} onChange={(ev) => {
                        if (ev.target.value === 'termine' && !peutPasserSuivante(detail.etapes, e.id)) {
                          return toast.error('Validez l\'étape précédente d\'abord')
                        }
                        updateEtape(detail.id, e.id, { statut: ev.target.value, dateFin: ev.target.value === 'termine' ? todayStr() : e.dateFin })
                      }}>
                        {Object.entries(STATUTS_ETAPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </Select>
                      <Input type="date" className="text-xs" value={e.dateDebut || ''} onChange={(ev) => updateEtape(detail.id, e.id, { dateDebut: ev.target.value })} />
                      <Input type="date" className="text-xs" value={e.dateFin || ''} onChange={(ev) => updateEtape(detail.id, e.id, { dateFin: ev.target.value })} />
                      <Input type="number" min="0" className="text-xs" placeholder="Montant payé" value={e.montant || ''} onChange={(ev) => updateEtape(detail.id, e.id, { montant: ev.target.value })} />
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input className="text-xs" placeholder="Responsable (nous)" value={e.responsable || ''} onChange={(ev) => updateEtape(detail.id, e.id, { responsable: ev.target.value })} />
                      <Input className="text-xs" placeholder="Notes étape…" value={e.notes || ''} onChange={(ev) => updateEtape(detail.id, e.id, { notes: ev.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Coût total payé */}
            {(() => {
              const total = (detail.etapes || []).reduce((s, e) => s + (parseFloat(e.montant) || 0), 0)
              return total > 0 ? <p className="text-right text-sm font-bold text-emerald-700">Total payé : {formatMoney(total)}</p> : null
            })()}

            {/* Pièces jointes */}
            <section>
              <PiecesJointes pieces={piecesDetail} onAdd={ajouterPiece} onRemove={supprimerPiece} rubriques={RUBRIQUES} withProprietaire label="Pièces jointes (PDF / images)" />
              <p className="mt-1 text-[11px] text-gray-400">Images compressées automatiquement · PDF jusqu'à 4 Mo.</p>
            </section>

            {detail.type === 'titre_en_cours' && progressionDossier(detail.etapes) === 100 && (
              <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
                <ChevronRight size={14} className="inline" /> Titre obtenu — vous pouvez lancer un <strong>morcellement</strong> ou une <strong>mutation</strong> via un nouveau dossier.
              </div>
            )}
          </div>
        )}
      </Modal>

      <AddTypeModal open={typeModal} onClose={() => setTypeModal(false)} onSave={handleAddType} />
    </div>
  )
}

// ─────────── Champ d'affichage (lecture seule) pour la fiche d'informations ───────────
function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-400">{label}</p>
      <p className="font-medium text-gray-800">{value || '—'}</p>
    </div>
  )
}

// ─────────── Cession : catégorie + documents + critères (formulaire) ───────────
function CessionForm({ cession, setCession }) {
  const cat = CESSION_CATEGORIES.find((c) => c.id === cession.categorie) || CESSION_CATEGORIES[0]
  const toggleDoc = (label) => setCession({ docsFournis: { ...cession.docsFournis, [label]: !cession.docsFournis?.[label] } })
  const toggleCritere = (id) => setCession({ appreciation: { ...cession.appreciation, criteres: { ...cession.appreciation.criteres, [id]: !cession.appreciation.criteres?.[id] } } })
  const bloquantConstate = APPRECIATION_CRITERES.some((c) => c.bloquant && cession.appreciation?.criteres?.[c.id])

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="mb-2 text-xs font-bold uppercase text-amber-800">Cession / Vente — appréciation de la base</p>
      <FormGroup label="Catégorie de terrain">
        <Select value={cession.categorie} onChange={(e) => setCession({ categorie: e.target.value })}>
          {CESSION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <p className="mt-1 text-xs text-gray-500">{cat.description}</p>
      </FormGroup>

      <p className="mt-3 mb-1 text-xs font-semibold text-gray-700">Documents essentiels du cédant</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {cat.docsCedant.map((doc) => (
          <label key={doc} className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={!!cession.docsFournis?.[doc]} onChange={() => toggleDoc(doc)} />
            <span>{doc}</span>
          </label>
        ))}
      </div>

      <p className="mt-3 mb-1 text-xs font-semibold text-gray-700">Critères d'appréciation (cocher si constaté)</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {APPRECIATION_CRITERES.map((c) => (
          <label key={c.id} className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={!!cession.appreciation?.criteres?.[c.id]} onChange={() => toggleCritere(c.id)} />
            <span>{c.label} {c.bloquant && <span className="font-bold text-red-600">(bloquant)</span>}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <FormGroup label="Verdict">
          <Select value={cession.appreciation?.verdict || 'en_attente'} onChange={(e) => setCession({ appreciation: { ...cession.appreciation, verdict: e.target.value } })}>
            {Object.entries(VERDICTS_APPRECIATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Observations"><Input value={cession.appreciation?.observations || ''} onChange={(e) => setCession({ appreciation: { ...cession.appreciation, observations: e.target.value } })} /></FormGroup>
      </div>
      {bloquantConstate && (
        <p className="mt-2 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
          ⚠ Critère bloquant constaté → la mission doit être <strong>annulée</strong> (approbation refusée par la base).
        </p>
      )}
    </section>
  )
}

// ─────────── Panneau d'appréciation (vue détail, édition rapide du verdict) ───────────
function AppreciationPanel({ detail, onVerdict }) {
  const ap = detail.cession?.appreciation || {}
  const cat = CESSION_CATEGORIES.find((c) => c.id === detail.cession?.categorie)
  const v = VERDICTS_APPRECIATION[ap.verdict] || VERDICTS_APPRECIATION.en_attente
  const bloquants = APPRECIATION_CRITERES.filter((c) => c.bloquant && ap.criteres?.[c.id])
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase text-amber-800">Appréciation cession</p>
        {cat && <span className="text-xs text-gray-600">· {cat.label}</span>}
        <Badge tone={v.tone}>{v.label}</Badge>
      </div>
      {bloquants.length > 0 && (
        <p className="mt-2 text-xs text-red-700">Constaté : {bloquants.map((b) => b.label).join(', ')}</p>
      )}
      {ap.observations && <p className="mt-1 text-xs italic text-gray-600">« {ap.observations} »</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => onVerdict({ verdict: 'approuvee' })} className="rounded bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">Approuver</button>
        <button onClick={() => onVerdict({ verdict: 'reserve' })} className="rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600">Sous réserve</button>
        <button onClick={() => onVerdict({ verdict: 'annulee' })} className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">Annuler la mission</button>
      </div>
    </section>
  )
}

// ─────────── Création d'un type de dossier personnalisé ───────────
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
