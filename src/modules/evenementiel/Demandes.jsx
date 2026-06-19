// Autorisations de sortie des briques — workflow à deux niveaux :
// un gérant approuve, puis la Direction / GE certifie (libère le chargement).
import { useMemo, useState } from 'react'
import { Plus, Shield } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatMoney } from '../../utils/formatters'
import { dernierStockBriques } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande } from '../../shared/workflow'

const STATUTS = STATUTS_DEMANDE

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)
  const isManager = canManage()
  const isCertifier = canCertify()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ venteId: '', briqueId: '', qte: 1, dateSortie: todayStr(), message: '' })

  const ventesBrouillon = ventes.filter((v) => ['brouillon', 'en_attente'].includes(v.statut))
  const filtrees = useMemo(() =>
    [...demandes].filter((d) => filtre === 'tous' || normaliserStatut(d.statut) === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
  [demandes, filtre])

  function openCreate() {
    const v = ventesBrouillon[0]
    const l = v?.lignes?.[0]
    setForm({
      venteId: v?.id || '',
      venteNum: v?.num || '',
      briqueId: l?.briqueId || briques.find((b) => b.id !== 'caillasses')?.id || '',
      qte: l?.qte || 1,
      dateSortie: v?.dateChargement || todayStr(),
      message: ''
    })
    setCreateOpen(true)
  }

  async function submitDemande() {
    if (!form.venteId || !form.message.trim()) return toast.error('Vente et motif obligatoires')
    const m = briques.find((x) => x.id === form.briqueId)
    const vte = ventes.find((v) => v.id === form.venteId)
    const etat = form.briqueId === 'caillasses' ? 'caillasses' : 'pret'
    const stock = dernierStockBriques(inventaires, form.briqueId, etat)
    if ((parseInt(form.qte) || 0) > stock) return toast.error(`Stock insuffisant (${stock} disponible)`)

    const num = genNumero('AUT-BRIQ', demandes.length)
    await addItem('evenementiel_demandes', {
      num, date: todayStr(), heure: nowHM(),
      demandeur: user.login, demandeurNom: user.nom,
      venteId: form.venteId, venteNum: vte?.num, clientNom: vte?.clientNom,
      briqueId: m?.id, briqueNom: m?.nom,
      qte: parseInt(form.qte) || 0, dateSortie: form.dateSortie,
      message: form.message.trim(),
      statut: 'en_attente'
    })
    await updateItem('evenementiel_ventes', form.venteId, { statut: 'en_attente' })
    await notify({
      type: 'demande',
      title: 'Autorisation sortie briques',
      body: `${form.qte} × ${m?.nom} — vente ${vte?.num} — par ${user.nom}`,
      module: 'evenementiel',
      forRoles: APPROVER_ROLES,
      excludeUid: user.uid,
      link: '/evenementiel/demandes'
    })
    await audit('evenementiel', 'DEMANDE_SORTIE', num)
    toast.success('Demande soumise — approbation puis certification requises')
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
      patch.dateDecision = horodate
      if (!d.approuveN1Par) { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    } else { patch.refusePar = user.nom; patch.dateDecision = horodate }
    await updateItem('evenementiel_demandes', d.id, patch)

    if (statut === 'certifie') {
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'autorisee' })
      await notify({
        type: 'success', title: 'Sortie briques autorisée ✅',
        body: `${d.qte} × ${d.briqueNom} — chargement ${d.dateSortie}`,
        module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/stock'
      })
      await notify({
        type: 'info', title: `Sortie autorisée par ${user.nom} ✅`,
        body: `${d.qte} × ${d.briqueNom} — demandée par ${d.demandeurNom}`,
        module: 'evenementiel', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
      })
    } else if (statut === 'approuve_n1') {
      await notify({
        type: 'demande', title: 'Sortie briques à certifier 🟡',
        body: `${d.qte} × ${d.briqueNom} — approuvée par ${user.nom}`,
        module: 'evenementiel', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
      })
    } else { // refuse
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'brouillon' })
      await notify({
        type: 'refus', title: 'Demande refusée ⛔',
        body: `${d.qte} × ${d.briqueNom}${commentaire.trim() ? ' — ' + commentaire.trim() : ''}`,
        module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/demandes'
      })
    }
    await audit('evenementiel',
      statut === 'refuse' ? 'AUTORISATION_REFUS' : statut === 'certifie' ? 'CERTIFICATION' : 'AUTORISATION_OK', d.num)
    toast.success(statut === 'certifie' ? 'Sortie certifiée ✓' : statut === 'approuve_n1' ? 'Approuvé — en attente de certification' : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Shield size={16} className="mr-1 inline" />
        Toute sortie de briques exige une <strong>approbation</strong> (gérant) puis une <strong>certification</strong> (Direction / GE) avant le chargement.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['en_attente', 'approuve_n1', 'certifie', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : STATUTS[f]?.short || f}
          </button>
        ))}
        {role !== 'superviseur' && (
          <Button className="ml-auto" onClick={openCreate} disabled={!ventesBrouillon.length}>
            <Plus size={16} /> Demander une autorisation
          </Button>
        )}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Vente / Client</th>
              <th className="px-3 py-2">Brique</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2">Chargement</th>
              <th className="px-3 py-2">Validation</th>
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
                <td className="px-3 py-2"><span className="font-semibold">{d.venteNum}</span><br /><span className="text-xs text-gray-500">{d.clientNom}</span></td>
                <td className="px-3 py-2 font-semibold">{d.briqueNom}</td>
                <td className="px-3 py-2 text-center">{d.qte}</td>
                <td className="px-3 py-2">{d.dateSortie}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {d.approuveN1Par ? <span className="block">Approuvé : {d.approuveN1Par}</span> : '—'}
                  {d.certifiePar && <span className="block">Certifié : {d.certifiePar}</span>}
                </td>
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
        <FormGroup label="Vente liée" required>
          <Select value={form.venteId} onChange={(e) => {
            const v = ventes.find((x) => x.id === e.target.value)
            setForm((s) => ({ ...s, venteId: e.target.value, venteNum: v?.num, dateSortie: v?.dateChargement || todayStr() }))
          }}>
            {ventesBrouillon.map((v) => <option key={v.id} value={v.id}>{v.num} — {v.clientNom} ({formatMoney(v.total)})</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Type de brique">
          <Select value={form.briqueId} onChange={(e) => setForm((s) => ({ ...s, briqueId: e.target.value }))}>
            {briques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </Select>
        </FormGroup>
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Quantité"><Input type="number" min="1" value={form.qte} onChange={(e) => setForm((s) => ({ ...s, qte: e.target.value }))} /></FormGroup>
          <FormGroup label="Date chargement"><Input type="date" value={form.dateSortie} onChange={(e) => setForm((s) => ({ ...s, dateSortie: e.target.value }))} /></FormGroup>
        </div>
        <FormGroup label="Motif / justification" required>
          <Input value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Client, destination, véhicule…" />
        </FormGroup>
      </Modal>

      <Modal open={!!decision} onClose={() => { setDecision(null); setCommentaire('') }} title="Traiter la demande"
        footer={<>
          <Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
          {decision && actionsDemande(decision.demande.statut, { canManage: isManager, canCertify: isCertifier }).map((a) => (
            <Button key={a.id} onClick={() => appliquerDecision(a)} style={{ background: a.tone === 'danger' ? '#dc2626' : '#16a34a' }}>
              {a.label}
            </Button>
          ))}
        </>}>
        {decision && (
          <>
            <p className="mb-1 text-sm">{decision.demande.qte} × <strong>{decision.demande.briqueNom}</strong> — Vente {decision.demande.venteNum}</p>
            <p className="mb-3"><Badge tone={STATUTS[normaliserStatut(decision.demande.statut)]?.tone}>{STATUTS[normaliserStatut(decision.demande.statut)]?.label}</Badge></p>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
