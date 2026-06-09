// Autorisations de sortie — validation par 3 autorités avant chargement des briques.
import { useMemo, useState } from 'react'
import { Plus, Check, X, Shield } from 'lucide-react'
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
import { AUTORITES_SORTIE } from './data'
import { statutAutorisation, dernierStockBriques } from './logic'

const STATUTS = {
  en_attente: { label: '⏳ En attente (0/3)', tone: 'warning' },
  partiel: { label: '🔄 Partiel', tone: 'info' },
  approuve: { label: '✅ Approuvé (3/3)', tone: 'success' },
  refuse: { label: '❌ Refusé', tone: 'danger' }
}

export default function Demandes() {
  const { user, canManage, role } = useAuth()
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ venteId: '', briqueId: '', qte: 1, dateSortie: todayStr(), message: '' })

  const ventesBrouillon = ventes.filter((v) => ['brouillon', 'en_attente'].includes(v.statut))
  const filtrees = useMemo(() =>
    [...demandes].filter((d) => filtre === 'tous' || d.statut === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
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

    const approbations = {}
    AUTORITES_SORTIE.forEach((a) => { approbations[a] = 'en_attente' })

    const num = genNumero('AUT-BRIQ', demandes.length)
    await addItem('evenementiel_demandes', {
      num, date: todayStr(), heure: nowHM(),
      demandeur: user.login, demandeurNom: user.nom,
      venteId: form.venteId, venteNum: vte?.num, clientNom: vte?.clientNom,
      briqueId: m?.id, briqueNom: m?.nom,
      qte: parseInt(form.qte) || 0, dateSortie: form.dateSortie,
      message: form.message.trim(),
      approbations, statut: 'en_attente'
    })
    await updateItem('evenementiel_ventes', form.venteId, { statut: 'en_attente' })
    await notify({
      type: 'demande',
      title: 'Autorisation sortie briques',
      body: `${form.qte} × ${m?.nom} — vente ${vte?.num} — par ${user.nom}`,
      module: 'evenementiel',
      forRoles: ['admin', 'controleur'],
      excludeUid: user.uid,
      link: '/evenementiel/demandes'
    })
    await audit('evenementiel', 'DEMANDE_SORTIE', num)
    toast.success('Demande soumise — 3 autorités doivent valider')
    setCreateOpen(false)
  }

  function autoriteUtilisateur() {
    if (role === 'admin') return AUTORITES_SORTIE[0]
    if (role === 'controleur') return AUTORITES_SORTIE[1]
    return null
  }

  async function appliquerDecision(autorite, action) {
    const d = decision.demande
    const approbations = { ...(d.approbations || {}), [autorite]: action }
    const statut = statutAutorisation(approbations, AUTORITES_SORTIE)
    await updateItem('evenementiel_demandes', d.id, {
      approbations, statut,
      [`decision_${autorite}`]: { action, par: user.nom, date: todayStr() + ' ' + nowHM(), commentaire: commentaire.trim() },
      decidedAt: ts()
    })
    if (statut === 'approuve') {
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'autorisee' })
      await notify({
        type: 'success',
        title: 'Sortie briques autorisée (3/3)',
        body: `${d.qte} × ${d.briqueNom} — chargement ${d.dateSortie}`,
        module: 'evenementiel',
        forUsers: [d.demandeur],
        link: '/evenementiel/stock'
      })
    }
    if (statut === 'refuse') {
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'brouillon' })
    }
    await audit('evenementiel', action === 'approuve' ? 'AUTORISATION_OK' : 'AUTORISATION_REFUS', d.num)
    toast.success(action === 'approuve' ? `${autorite} : approuvé` : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Shield size={16} className="mr-1 inline" />
        Toute sortie de briques exige l'accord des <strong>3 autorités</strong> :
        {AUTORITES_SORTIE.map((a) => <span key={a} className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs font-semibold">{a}</span>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['en_attente', 'partiel', 'approuve', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : STATUTS[f]?.label || f}
          </button>
        ))}
        <Button className="ml-auto" onClick={openCreate} disabled={!ventesBrouillon.length}>
          <Plus size={16} /> Demander une autorisation
        </Button>
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
              <th className="px-3 py-2">Autorisations</th>
              <th className="px-3 py-2">Statut</th>
              {canManage() && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrees.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                <td className="px-3 py-2"><span className="font-semibold">{d.venteNum}</span><br /><span className="text-xs text-gray-500">{d.clientNom}</span></td>
                <td className="px-3 py-2 font-semibold">{d.briqueNom}</td>
                <td className="px-3 py-2 text-center">{d.qte}</td>
                <td className="px-3 py-2">{d.dateSortie}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {AUTORITES_SORTIE.map((a) => {
                      const v = d.approbations?.[a]
                      const tone = v === 'approuve' ? 'success' : v === 'refuse' ? 'danger' : 'neutral'
                      const short = a.split(' ').pop()
                      return <Badge key={a} tone={tone} className="text-[9px]">{short}: {v === 'approuve' ? '✓' : v === 'refuse' ? '✗' : '…'}</Badge>
                    })}
                  </div>
                </td>
                <td className="px-3 py-2"><Badge tone={STATUTS[d.statut]?.tone}>{STATUTS[d.statut]?.label}</Badge></td>
                {canManage() && !['approuve', 'refuse'].includes(d.statut) && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDecision({ demande: d })} className="text-green-600"><Check size={18} /></button>
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

      <Modal open={!!decision} onClose={() => setDecision(null)} title="Valider en tant qu'autorité"
        footer={<>
          <Button variant="ghost" onClick={() => setDecision(null)}>Annuler</Button>
          <Button onClick={() => appliquerDecision(decision.autorite, 'refuse')} style={{ background: '#dc2626' }}>Refuser</Button>
          <Button onClick={() => appliquerDecision(decision.autorite, 'approuve')} style={{ background: '#16a34a' }}>Approuver</Button>
        </>}>
        {decision && (
          <>
            <p className="mb-3 text-sm">{decision.demande.qte} × <strong>{decision.demande.briqueNom}</strong> — Vente {decision.demande.venteNum}</p>
            <FormGroup label="Votre autorité">
              <Select value={decision.autorite || autoriteUtilisateur() || AUTORITES_SORTIE[0]}
                onChange={(e) => setDecision((d) => ({ ...d, autorite: e.target.value }))}>
                {AUTORITES_SORTIE.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
