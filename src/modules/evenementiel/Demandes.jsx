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
import { addItem, updateItem, setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatMoney } from '../../utils/formatters'
import { dernierStockBriques, retirerVenteDuStock } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande } from '../../shared/workflow'

const STATUTS = STATUTS_DEMANDE

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const isManager = canManage()
  const isCertifier = canCertify()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ venteId: '', dateSortie: todayStr(), message: '' })

  const ventesBrouillon = ventes.filter((v) => ['brouillon', 'en_attente'].includes(v.statut))
  // Vente sélectionnée : ses informations (client, briques, quantités) remplissent la demande.
  const selectedVente = ventes.find((v) => v.id === form.venteId) || null
  const filtrees = useMemo(() =>
    [...demandes].filter((d) => filtre === 'tous' || normaliserStatut(d.statut) === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
  [demandes, filtre])

  function openCreate() {
    const v = ventesBrouillon[0]
    setForm({
      venteId: v?.id || '',
      venteNum: v?.num || '',
      dateSortie: v?.dateChargement || todayStr(),
      message: ''
    })
    setCreateOpen(true)
  }

  async function submitDemande() {
    const vte = ventes.find((v) => v.id === form.venteId)
    if (!vte) return toast.error('Sélectionnez une vente')
    if (!form.message.trim()) return toast.error('Motif obligatoire')
    const lignes = vte.lignes || []
    if (!lignes.length) return toast.error('Cette vente ne contient aucune ligne')

    // Contrôle du stock disponible pour chaque brique de la vente.
    for (const l of lignes) {
      const etat = l.briqueId === 'caillasses' ? 'caillasses' : 'pret'
      const stock = dernierStockBriques(inventaires, l.briqueId, etat)
      if ((parseInt(l.qte) || 0) > stock) return toast.error(`Stock insuffisant pour ${l.briqueNom} (${stock} disponible)`)
    }

    const totalQte = lignes.reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const resume = lignes.length === 1 ? lignes[0].briqueNom : `${lignes.length} types de briques`
    const num = genNumero('AUT-BRIQ', demandes.length)
    await addItem('evenementiel_demandes', {
      num, date: todayStr(), heure: nowHM(),
      demandeur: user.login, demandeurNom: user.nom,
      venteId: vte.id, venteNum: vte.num, clientNom: vte.clientNom,
      briqueId: lignes[0].briqueId, briqueNom: resume,
      qte: totalQte, lignes,
      dateSortie: form.dateSortie || vte.dateChargement || todayStr(),
      message: form.message.trim(),
      statut: 'en_attente'
    })
    await updateItem('evenementiel_ventes', form.venteId, { statut: 'en_attente' })
    await notify({
      type: 'demande',
      title: 'Autorisation sortie briques',
      body: `${totalQte} brique(s) — ${resume} — vente ${vte.num} — par ${user.nom}`,
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
      // Sortie autorisée : on décrémente le stock prêt (ou caillasses) des briques vendues.
      const vente = ventes.find((v) => v.id === d.venteId)
      const maj = vente && retirerVenteDuStock(inventaires, vente)
      if (maj) {
        await setItem('evenementiel_inventaires', maj.date, {
          ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(),
          agentId: user.uid, agentNom: user.nom
        })
      }
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
        <FormGroup label="Vente liée" required hint="Le client, les briques et les quantités sont repris automatiquement de la vente.">
          <Select value={form.venteId} onChange={(e) => {
            const v = ventes.find((x) => x.id === e.target.value)
            setForm((s) => ({ ...s, venteId: e.target.value, venteNum: v?.num, dateSortie: v?.dateChargement || todayStr() }))
          }}>
            {ventesBrouillon.map((v) => <option key={v.id} value={v.id}>{v.num} — {v.clientNom} ({formatMoney(v.total)})</option>)}
          </Select>
        </FormGroup>

        {/* Détail repris automatiquement de la vente (non modifiable par l'agent). */}
        {selectedVente && (
          <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
            <p className="mb-2 text-xs font-bold uppercase text-gray-500">Contenu de la vente (automatique)</p>
            <p className="mb-2">Client : <strong>{selectedVente.clientNom || '—'}</strong></p>
            <table className="w-full">
              <thead className="text-xs uppercase text-gray-400">
                <tr><th className="pb-1 text-left">Brique</th><th className="pb-1 text-right">Quantité</th></tr>
              </thead>
              <tbody>
                {(selectedVente.lignes || []).map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1 font-medium">{l.briqueNom}</td>
                    <td className="py-1 text-right font-semibold">{l.qte}</td>
                  </tr>
                ))}
                {!(selectedVente.lignes || []).length && (
                  <tr><td colSpan={2} className="py-2 text-center text-gray-400">Aucune ligne.</td></tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">Chargement prévu : {selectedVente.dateChargement || '—'}</p>
          </div>
        )}

        <FormGroup label="Motif / justification" required>
          <Input value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Destination, véhicule…" />
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
            <p className="mb-1 text-sm">Vente <strong>{decision.demande.venteNum}</strong> — {decision.demande.clientNom}</p>
            {decision.demande.lignes?.length ? (
              <div className="mb-3 rounded-lg bg-gray-50 p-2 text-sm">
                {decision.demande.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between border-t border-gray-100 py-1 first:border-t-0">
                    <span>{l.briqueNom}</span><strong>{l.qte}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-1 text-sm">{decision.demande.qte} × <strong>{decision.demande.briqueNom}</strong></p>
            )}
            <p className="mb-3"><Badge tone={STATUTS[normaliserStatut(decision.demande.statut)]?.tone}>{STATUTS[normaliserStatut(decision.demande.statut)]?.label}</Badge></p>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
