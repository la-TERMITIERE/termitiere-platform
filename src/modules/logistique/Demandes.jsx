// Autorisations de sortie matériel — après émission de facture, validation hiérarchique.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem, updateItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatDateTime, formatMoney } from '../../utils/formatters'
import { dernierStock } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande } from '../../shared/workflow'

const STATUTS = STATUTS_DEMANDE

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const { data: liste } = useCollection('logistique_demandes')
  const { data: factures } = useCollection('logistique_factures')
  const { data: inventaires } = useCollection('logistique_inventaires')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const isManager = canManage()
  const isCertifier = canCertify()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ factureId: '', materielId: '', qte: 1, dateSortie: todayStr(), message: '' })

  const facturesEmises = factures.filter((f) => f.statut === 'emise')
  const filtrees = useMemo(() =>
    [...liste].filter((d) => filtre === 'tous' || normaliserStatut(d.statut) === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
  [liste, filtre])

  function openCreate() {
    const f = facturesEmises[0]
    const l = f?.lignes?.[0]
    setForm({
      factureId: f?.id || '',
      factureNum: f?.num || '',
      materielId: l?.materielId || materiel[0]?.id || '',
      qte: l?.qte || 1,
      dateSortie: todayStr(),
      message: ''
    })
    setCreateOpen(true)
  }

  async function submitDemande() {
    if (!form.factureId || !form.message.trim()) return toast.error('Facture et motif obligatoires')
    const m = materiel.find((x) => x.id === form.materielId)
    const fac = factures.find((f) => f.id === form.factureId)
    const stock = dernierStock(inventaires, form.materielId)
    if ((parseInt(form.qte) || 0) > stock) return toast.error(`Stock insuffisant (${stock} disponible)`)

    const num = genNumero('AUT', liste.length)
    await addItem('logistique_demandes', {
      num, date: todayStr(), heure: nowHM(),
      demandeur: user.login, demandeurNom: user.nom,
      factureId: form.factureId, factureNum: fac?.num,
      materielId: m?.id, materielNom: m?.nom, materielCat: m?.cat,
      qte: parseInt(form.qte) || 0, dateSortie: form.dateSortie,
      message: form.message.trim(), statut: 'en_attente'
    })
    await notify({
      type: 'demande',
      title: 'Autorisation de sortie matériel',
      body: `${form.qte} × ${m?.nom} — facture ${fac?.num} — par ${user.nom}`,
      module: 'logistique',
      forRoles: APPROVER_ROLES,
      excludeUid: user.uid,
      link: '/logistique/demandes'
    })
    await audit('logistique', 'DEMANDE_SORTIE', num)
    toast.success('Demande soumise à la hiérarchie ✓')
    setCreateOpen(false)
  }

  // Applique une action du workflow (approuver / certifier / refuser).
  async function appliquerDecision(action) {
    const d = decision.demande
    const statut = action.statut
    const horodate = todayStr() + ' ' + nowHM()
    const patch = { statut, decidedAt: ts(), commentaireDecision: commentaire.trim() }
    if (statut === 'approuve_n1') { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    else if (statut === 'certifie') {
      patch.certifiePar = user.nom; patch.certifieLe = horodate
      patch.approbateur = user.login; patch.approbateurNom = user.nom; patch.dateDecision = horodate
      if (!d.approuveN1Par) { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    } else { patch.refusePar = user.nom; patch.dateDecision = horodate }
    await updateItem('logistique_demandes', d.id, patch)

    if (statut === 'approuve_n1') {
      await notify({
        type: 'demande', title: 'Sortie matériel à certifier 🟡',
        body: `${d.qte} × ${d.materielNom} — approuvée par ${user.nom}`,
        module: 'logistique', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: '/logistique/demandes'
      })
    } else if (statut === 'certifie') {
      await notify({
        type: 'success', title: 'Sortie matériel autorisée ✅',
        body: `${d.qte} × ${d.materielNom} pour le ${d.dateSortie}`,
        module: 'logistique', forUsers: [d.demandeur], link: '/logistique/saisie'
      })
      await notify({
        type: 'info', title: `Sortie autorisée par ${user.nom} ✅`,
        body: `${d.qte} × ${d.materielNom} — demandée par ${d.demandeurNom}`,
        module: 'logistique', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/logistique/demandes'
      })
    } else {
      await notify({
        type: 'refus', title: 'Demande refusée ⛔',
        body: `${d.qte} × ${d.materielNom}${commentaire.trim() ? ' — ' + commentaire.trim() : ''}`,
        module: 'logistique', forUsers: [d.demandeur], link: '/logistique/demandes'
      })
    }
    await audit('logistique',
      statut === 'refuse' ? 'AUTORISATION_REFUS' : statut === 'certifie' ? 'CERTIFICATION' : 'AUTORISATION_OK', d.num)
    toast.success(statut === 'certifie' ? 'Sortie certifiée ✓' : statut === 'approuve_n1' ? 'Approuvé — en attente de certification' : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Toute sortie de matériel exige une <strong>facture émise</strong>, puis une <strong>approbation</strong> (gérant) suivie d'une <strong>certification</strong> (Direction / GE).
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['en_attente', 'approuve_n1', 'certifie', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : STATUTS[f]?.short || f}
          </button>
        ))}
        {role !== 'superviseur' && (
          <Button className="ml-auto" onClick={openCreate} disabled={!facturesEmises.length}>
            <Plus size={16} /> Demander une autorisation
          </Button>
        )}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Facture</th>
              <th className="px-3 py-2">Matériel</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2">Sortie prévue</th>
              <th className="px-3 py-2">Statut</th>
              {isManager && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrees.map((d) => {
              const sn = normaliserStatut(d.statut)
              const acts = actionsDemande(d.statut, { canManage: isManager, canCertify: isCertifier })
              return (
              <tr key={d.id}>
                <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                <td className="px-3 py-2">{d.factureNum}</td>
                <td className="px-3 py-2 font-semibold">{d.materielNom}</td>
                <td className="px-3 py-2 text-center">{d.qte}</td>
                <td className="px-3 py-2">{d.dateSortie}</td>
                <td className="px-3 py-2"><Badge tone={STATUTS[sn]?.tone}>{STATUTS[sn]?.label}</Badge></td>
                {isManager && (
                  <td className="px-3 py-2 text-right">
                    {acts.length > 0 && (
                      <button onClick={() => setDecision({ demande: d })} className="rounded bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary hover:bg-secondary/20">
                        {sn === 'approuve_n1' ? 'Certifier' : 'Traiter'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )})}
          </tbody>
        </table>
        {!filtrees.length && <p className="py-10 text-center text-gray-400">Aucune demande.</p>}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Demande d'autorisation de sortie"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={submitDemande}>Soumettre</Button></>}>
        <FormGroup label="Facture liée" required>
          <Select value={form.factureId} onChange={(e) => {
            const f = factures.find((x) => x.id === e.target.value)
            setForm((s) => ({ ...s, factureId: e.target.value, factureNum: f?.num }))
          }}>
            {facturesEmises.map((f) => <option key={f.id} value={f.id}>{f.num} — {f.clientNom} ({formatMoney(f.totalTTC)})</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Matériel">
          <Select value={form.materielId} onChange={(e) => setForm((s) => ({ ...s, materielId: e.target.value }))}>
            {materiel.map((m) => <option key={m.id} value={m.id}>{m.nom} (stock : {dernierStock(inventaires, m.id)})</option>)}
          </Select>
        </FormGroup>
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Quantité"><Input type="number" min="1" value={form.qte} onChange={(e) => setForm((s) => ({ ...s, qte: e.target.value }))} /></FormGroup>
          <FormGroup label="Date de sortie"><Input type="date" value={form.dateSortie} onChange={(e) => setForm((s) => ({ ...s, dateSortie: e.target.value }))} /></FormGroup>
        </div>
        <FormGroup label="Motif / justification" required>
          <Input value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Événement, client, lieu…" />
        </FormGroup>
      </Modal>

      <Modal open={!!decision} onClose={() => { setDecision(null); setCommentaire('') }} title="Traiter la demande"
        footer={<><Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
          {decision && actionsDemande(decision.demande.statut, { canManage: isManager, canCertify: isCertifier }).map((a) => (
            <Button key={a.id} onClick={() => appliquerDecision(a)} style={{ background: a.tone === 'danger' ? '#dc2626' : '#16a34a' }}>
              {a.label}
            </Button>
          ))}</>}>
        {decision && (
          <>
            <p className="mb-1 text-sm">{decision.demande.qte} × <strong>{decision.demande.materielNom}</strong> — Facture {decision.demande.factureNum}</p>
            <p className="mb-3"><Badge tone={STATUTS[normaliserStatut(decision.demande.statut)]?.tone}>{STATUTS[normaliserStatut(decision.demande.statut)]?.label}</Badge></p>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
