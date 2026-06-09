// Autorisations de sortie matériel — après émission de facture, validation hiérarchique.
import { useMemo, useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
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

const STATUTS = {
  en_attente: { label: '⏳ En attente', tone: 'warning' },
  approuve: { label: '✅ Approuvé', tone: 'success' },
  refuse: { label: '❌ Refusé', tone: 'danger' }
}

export default function Demandes() {
  const { user, canManage } = useAuth()
  const { data: liste } = useCollection('logistique_demandes')
  const { data: factures } = useCollection('logistique_factures')
  const { data: inventaires } = useCollection('logistique_inventaires')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const isManager = canManage()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ factureId: '', materielId: '', qte: 1, dateSortie: todayStr(), message: '' })

  const facturesEmises = factures.filter((f) => f.statut === 'emise')
  const filtrees = useMemo(() =>
    [...liste].filter((d) => filtre === 'tous' || d.statut === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
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
      forRoles: ['admin', 'controleur'],
      excludeUid: user.uid,
      link: '/logistique/demandes'
    })
    await audit('logistique', 'DEMANDE_SORTIE', num)
    toast.success('Demande soumise à la hiérarchie ✓')
    setCreateOpen(false)
  }

  async function appliquerDecision(statut) {
    const d = decision.demande
    await updateItem('logistique_demandes', d.id, {
      statut, approbateur: user.login, approbateurNom: user.nom,
      dateDecision: todayStr() + ' ' + nowHM(), commentaireDecision: commentaire.trim(), decidedAt: ts()
    })
    if (statut === 'approuve') {
      await notify({
        type: 'success',
        title: 'Sortie matériel autorisée',
        body: `${d.qte} × ${d.materielNom} pour le ${d.dateSortie}`,
        module: 'logistique',
        forUsers: [d.demandeur],
        link: '/logistique/saisie'
      })
    }
    await audit('logistique', statut === 'approuve' ? 'AUTORISATION_OK' : 'AUTORISATION_REFUS', d.num)
    toast.success(statut === 'approuve' ? 'Autorisation accordée ✓' : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Toute sortie de matériel exige une <strong>facture émise</strong> puis une <strong>autorisation</strong> de la hiérarchie.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['en_attente', 'approuve', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : STATUTS[f]?.label || f}
          </button>
        ))}
        <Button className="ml-auto" onClick={openCreate} disabled={!facturesEmises.length}>
          <Plus size={16} /> Demander une autorisation
        </Button>
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
            {filtrees.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                <td className="px-3 py-2">{d.factureNum}</td>
                <td className="px-3 py-2 font-semibold">{d.materielNom}</td>
                <td className="px-3 py-2 text-center">{d.qte}</td>
                <td className="px-3 py-2">{d.dateSortie}</td>
                <td className="px-3 py-2"><Badge tone={STATUTS[d.statut]?.tone}>{STATUTS[d.statut]?.label}</Badge></td>
                {isManager && d.statut === 'en_attente' && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDecision({ demande: d, action: 'approuve' })} className="mr-1 text-green-600"><Check size={18} /></button>
                    <button onClick={() => setDecision({ demande: d, action: 'refuse' })} className="text-red-600"><X size={18} /></button>
                  </td>
                )}
              </tr>
            ))}
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

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.action === 'approuve' ? 'Approuver la sortie' : 'Refuser la demande'}
        footer={<><Button variant="ghost" onClick={() => setDecision(null)}>Annuler</Button>
          <Button onClick={() => appliquerDecision(decision.action)} style={{ background: decision?.action === 'approuve' ? '#16a34a' : '#dc2626' }}>
            Confirmer
          </Button></>}>
        {decision && (
          <>
            <p className="mb-3 text-sm">{decision.demande.qte} × <strong>{decision.demande.materielNom}</strong> — Facture {decision.demande.factureNum}</p>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
