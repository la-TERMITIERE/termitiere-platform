// Facturation MAXI-AGRO — workflow strict de sortie de stock :
//   Brouillon → (agent) Demande de sortie → (hiérarchie) Approbation
//            → (agent) Certification  ── ou ──  Écart → (hiérarchie) Ajustement → (agent) Certification
//
// • L'agent crée/édite/supprime les BROUILLONS et certifie.
// • La hiérarchie approuve la sortie (décompte du stock) et ajuste les quantités réelles (écart).
// • Le CA n'est compté (dashboard) qu'à la CERTIFICATION ; le PDF n'est imprimable qu'une fois certifié.
import { useMemo, useState } from 'react'
import { Plus, FileDown, Trash2, Pencil, Send, Check, X, BadgeCheck, AlertTriangle, Clock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { APPROVER_ROLES } from '../../core/roles'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { FACTURE_STATUTS, factureStatut } from './data'
import { creerDemandesFacture, ajusterFactureEcart } from './factureStock'

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  apporteur: '',
  lignes: [{ articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

// Lignes effectives pour le calcul (réelles après écart, sinon facturées).
const lignesEffectives = (f) => (f.lignesReelles?.length ? f.lignesReelles : f.lignes) || []
const calcTotaux = (lignes, remise = 0, tva = 0) => {
  const totalHT = (lignes || []).reduce((s, l) => s + (l.total || 0), 0)
  const apresRemise = totalHT * (1 - (remise || 0) / 100)
  const t = apresRemise * ((tva || 0) / 100)
  return { totalHT, totalTTC: Math.round(apresRemise + t) }
}

export default function Factures() {
  const { user, role, canManage } = useAuth()
  const isAgent = role === 'agent'
  const peutApprouver = canManage()      // hiérarchie : approuve / ajuste
  const { data: factures } = useCollection('agro_factures')
  const { data: users } = useCollection('users')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const getArticle = useAgroStore((s) => s.getArticle)
  const { generateFacturePDF } = usePDF('agro')

  const tousArticles = [...especes, ...aliments]
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [modal, setModal] = useState(null)        // { facture, editId }
  const [ecart, setEcart] = useState(null)        // facture en cours d'ajustement (hiérarchie)
  const [busy, setBusy] = useState(false)

  const liste = useMemo(
    () =>
      [...factures]
        .filter((f) => (f.client?.nom || '').toLowerCase().includes(recherche.toLowerCase()))
        .filter((f) => (filtre === 'tous' ? true : factureStatut(f) === filtre))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [factures, recherche, filtre]
  )

  const compteur = (st) => factures.filter((f) => factureStatut(f) === st).length

  const clientsConnus = useMemo(() => {
    const map = {}
    factures.forEach((f) => {
      const nom = (f.client?.nom || '').trim()
      if (!nom) return
      if (!map[nom] || (f.date || '') > (map[nom]._date || '')) {
        map[nom] = { nom, _date: f.date || '', tel: f.client?.tel || '', email: f.client?.email || '', adresse: f.client?.adresse || '' }
      }
    })
    return Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom))
  }, [factures])

  function openCreate() { setModal({ facture: emptyFacture(), editId: null }) }
  function openEdit(f) { setModal({ facture: structuredClone(f), editId: f.id }) }

  function setLigne(i, patch) {
    setModal((m) => {
      const lignes = [...m.facture.lignes]
      lignes[i] = { ...lignes[i], ...patch }
      lignes[i].total = (parseInt(lignes[i].qte) || 0) * (parseFloat(lignes[i].prixUnit) || 0)
      return { ...m, facture: { ...m.facture, lignes } }
    })
  }
  function pickArticle(i, id) {
    const art = getArticle(id)
    const type = especes.some((e) => e.id === id) ? 'animal' : aliments.some((a) => a.id === id) ? 'aliment' : ''
    setLigne(i, { articleId: id, article: art?.nom || '', articleType: type, articleCat: art?.cat || '' })
  }
  const addLigne = () => setModal((m) => ({ ...m, facture: { ...m.facture, lignes: [...m.facture.lignes, { articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }] } }))
  const removeLigne = (i) => setModal((m) => ({ ...m, facture: { ...m.facture, lignes: m.facture.lignes.filter((_, j) => j !== i) } }))

  async function save() {
    const f = modal.facture
    if (!f.client.nom.trim()) return toast.error('Nom du client requis')
    const lignes = (f.lignes || []).filter((l) => l.articleId || (parseInt(l.qte) || 0) > 0 || (parseFloat(l.prixUnit) || 0) > 0)
    if (!lignes.some((l) => l.articleId && (parseInt(l.qte) || 0) > 0)) return toast.error('Ajoutez au moins une ligne avec un article')
    if (lignes.some((l) => (parseInt(l.qte) || 0) > 0 && !l.articleId)) return toast.error('Chaque ligne facturée doit avoir un article sélectionné')
    const { totalHT, totalTTC } = calcTotaux(lignes, f.remise, f.tva)
    const payload = { ...f, lignes, totalHT, totalTTC }
    try {
      if (modal.editId) {
        await updateItem('agro_factures', modal.editId, payload)
        await audit('agro', 'FACTURE_EDIT', `${f.numero}`)
        toast.success('Brouillon modifié ✓')
      } else {
        payload.numero = genNumero('FAC', factures.length)
        payload.createdBy = user.nom
        payload.statut = 'brouillon'   // ← toute nouvelle facture démarre en brouillon
        await addItem('agro_factures', payload)
        await audit('agro', 'FACTURE', `${payload.numero} (brouillon) — ${formatMoney(totalTTC)}`)
        toast.success('Brouillon créé ✓')
      }
      setModal(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  async function supprimer(f) {
    if (!confirm(`Supprimer le brouillon ${f.numero} ?`)) return
    await removeItem('agro_factures', f.id)
    await audit('agro', 'FACTURE_DELETE', f.numero)
    toast.success('Facture supprimée')
  }

  // ─────────── Transitions du workflow ───────────
  const horoNote = () => `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`

  async function demanderSortie(f) {
    if (!confirm(`Soumettre la sortie de la facture ${f.numero} à la hiérarchie ?`)) return
    setBusy(true)
    try {
      await updateItem('agro_factures', f.id, { statut: 'sortie_demandee', sortieDemandeeLe: horoNote(), sortieDemandeePar: user.nom })
      await audit('agro', 'FACTURE_SORTIE_DEMANDE', `${f.numero} — ${formatMoney(f.totalTTC || 0)}`)
      await notify({ type: 'demande', title: 'Sortie de stock à approuver 📦', body: `Facture ${f.numero} — ${f.client?.nom || ''} (${formatMoney(f.totalTTC || 0)})`, module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/factures' })
      toast.success('📤 Demande de sortie soumise à la hiérarchie ✓')
    } finally { setBusy(false) }
  }

  async function approuverSortie(f) {
    if (!confirm(`Approuver la sortie de stock de la facture ${f.numero} ? Les quantités seront décomptées du stock.`)) return
    setBusy(true)
    try {
      await creerDemandesFacture(f, user)
      await updateItem('agro_factures', f.id, { statut: 'sortie_approuvee', sortieApprouveeLe: horoNote(), sortieApprouveePar: user.nom })
      await audit('agro', 'FACTURE_SORTIE_APPROUVEE', `${f.numero} — sortie autorisée`)
      await notify({ type: 'approuve', title: 'Sortie approuvée ✅', body: `Facture ${f.numero} — vous pouvez certifier ou signaler un écart`, module: 'agro', forUsers: [f.createdBy], excludeUid: user.uid, link: '/agro/factures' })
      toast.success('✅ Sortie approuvée — stock décompté')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally { setBusy(false) }
  }

  async function refuserSortie(f) {
    const motif = prompt(`Refuser la sortie de la facture ${f.numero} ?\nMotif (optionnel) :`)
    if (motif === null) return
    setBusy(true)
    try {
      await updateItem('agro_factures', f.id, { statut: 'refusee', refuseLe: horoNote(), refusePar: user.nom, refusMotif: motif.trim() })
      await audit('agro', 'FACTURE_SORTIE_REFUSEE', `${f.numero}${motif.trim() ? ' — ' + motif.trim() : ''}`)
      await notify({ type: 'refus', title: 'Sortie refusée ⛔', body: `Facture ${f.numero}${motif.trim() ? ' — ' + motif.trim() : ''}`, module: 'agro', forUsers: [f.createdBy], excludeUid: user.uid, link: '/agro/factures' })
      toast.error('Sortie refusée')
    } finally { setBusy(false) }
  }

  async function certifier(f) {
    const lignes = lignesEffectives(f)
    const { totalHT, totalTTC } = calcTotaux(lignes, f.remise, f.tva)
    if (!confirm(`Certifier la facture ${f.numero} pour ${formatMoney(totalTTC)} ? Elle deviendra définitive et imprimable.`)) return
    setBusy(true)
    try {
      // Les lignes réelles deviennent les lignes facturées (impression + CA).
      await updateItem('agro_factures', f.id, { statut: 'certifiee', lignes, totalHT, totalTTC, certifieeLe: horoNote(), certifieePar: user.nom })
      await audit('agro', 'FACTURE_CERTIFIEE', `${f.numero} — ${formatMoney(totalTTC)} (CA enregistré)`)
      await notify({ type: 'info', title: 'Facture certifiée ✅', body: `${f.numero} — ${formatMoney(totalTTC)}`, module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/factures' })
      toast.success('✅ Facture certifiée — CA enregistré, impression disponible')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally { setBusy(false) }
  }

  async function signalerEcart(f) {
    const motif = prompt(`Signaler un écart sur la facture ${f.numero}\n(ex : reliquats retournés, pertes au marché)\nMessage à la hiérarchie :`)
    if (motif === null) return
    setBusy(true)
    try {
      await updateItem('agro_factures', f.id, { statut: 'modif_demandee', ecartMotif: motif.trim(), ecartSignaleLe: horoNote(), ecartSignalePar: user.nom })
      await audit('agro', 'FACTURE_ECART_DEMANDE', `${f.numero}${motif.trim() ? ' — ' + motif.trim() : ''}`)
      await notify({ type: 'demande', title: 'Demande de modification 📝', body: `Facture ${f.numero} — écart à ajuster${motif.trim() ? ' : ' + motif.trim() : ''}`, module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/factures' })
      toast.success('📝 Demande de modification envoyée à la hiérarchie')
    } finally { setBusy(false) }
  }

  // Ajustement de l'écart par la hiérarchie (depuis EcartModal).
  async function appliquerAjustement(f, ajustements) {
    setBusy(true)
    try {
      const lignesReelles = await ajusterFactureEcart(f, ajustements)
      await updateItem('agro_factures', f.id, {
        statut: 'sortie_approuvee',
        lignesDemandees: f.lignesDemandees || f.lignes,
        lignesReelles, ecartAjuste: true, ecartAjusteLe: horoNote(), ecartAjustePar: user.nom
      })
      await audit('agro', 'FACTURE_ECART_AJUSTE', `${f.numero} — quantités réelles ajustées`)
      await notify({ type: 'approuve', title: 'Quantités ajustées ✅', body: `Facture ${f.numero} — vous pouvez certifier la facture ajustée`, module: 'agro', forUsers: [f.createdBy], excludeUid: user.uid, link: '/agro/factures' })
      toast.success('✅ Quantités réelles ajustées — stock réajusté')
      setEcart(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally { setBusy(false) }
  }

  async function rouvrir(f) {
    await updateItem('agro_factures', f.id, { statut: 'brouillon' })
    toast.success('Facture rouverte en brouillon')
  }

  // Boutons contextuels selon statut + rôle.
  function actions(f) {
    const st = factureStatut(f)
    const a = []
    if (st === 'certifiee') a.push({ id: 'pdf', label: 'PDF', icon: FileDown, tone: 'secondary', on: () => generateFacturePDF(f) })
    if (st === 'brouillon') {
      if (isAgent) {
        a.push({ id: 'dem', label: 'Demander la sortie', icon: Send, tone: 'primary', on: () => demanderSortie(f) })
        a.push({ id: 'edit', label: 'Modifier', icon: Pencil, tone: 'ghost', on: () => openEdit(f) })
        a.push({ id: 'del', label: 'Supprimer', icon: Trash2, tone: 'danger', on: () => supprimer(f) })
      }
    } else if (st === 'sortie_demandee') {
      if (peutApprouver) {
        a.push({ id: 'app', label: 'Approuver la sortie', icon: Check, tone: 'success', on: () => approuverSortie(f) })
        a.push({ id: 'ref', label: 'Refuser', icon: X, tone: 'danger', on: () => refuserSortie(f) })
      }
    } else if (st === 'sortie_approuvee') {
      if (isAgent) {
        a.push({ id: 'cert', label: 'Certifier (tout vendu)', icon: BadgeCheck, tone: 'success', on: () => certifier(f) })
        a.push({ id: 'ec', label: 'Signaler un écart', icon: AlertTriangle, tone: 'ghost', on: () => signalerEcart(f) })
      }
    } else if (st === 'modif_demandee') {
      if (peutApprouver) a.push({ id: 'adj', label: 'Ajuster les quantités', icon: Pencil, tone: 'primary', on: () => setEcart(f) })
    } else if (st === 'refusee') {
      if (isAgent) a.push({ id: 're', label: 'Rouvrir', icon: Pencil, tone: 'ghost', on: () => rouvrir(f) })
    }
    return a
  }

  const totaux = modal ? calcTotaux(modal.facture.lignes, modal.facture.remise, modal.facture.tva) : null
  const filtres = [['tous', 'Toutes'], ['brouillon', `Brouillons (${compteur('brouillon')})`], ['sortie_demandee', `À approuver (${compteur('sortie_demandee')})`], ['modif_demandee', `Écarts (${compteur('modif_demandee')})`], ['sortie_approuvee', `Approuvées (${compteur('sortie_approuvee')})`], ['certifiee', `Certifiées (${compteur('certifiee')})`]]

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <strong>Sortie de stock en 4 étapes :</strong> ① l'agent crée une facture <em>brouillon</em> → ② il demande la sortie →
        ③ la hiérarchie l'approuve (décompte du stock) → ④ l'agent <em>certifie</em> (CA enregistré, impression). En cas d'écart, l'agent signale et la hiérarchie ajuste les quantités réelles.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="🔍 Rechercher un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {isAgent && <Button className="ml-auto" onClick={openCreate}><Plus size={16} /> Nouvelle facture</Button>}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1">
        {filtres.map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${filtre === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {l}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">N°</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">Total TTC</th>
                <th className="px-3 py-2 text-center">Statut</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liste.map((f) => {
                const st = factureStatut(f)
                const sd = FACTURE_STATUTS[st] || { label: st, tone: 'neutral' }
                const tot = calcTotaux(lignesEffectives(f), f.remise, f.tva)
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{f.numero}</td>
                    <td className="px-3 py-2">{formatDateShort(f.date)}</td>
                    <td className="px-3 py-2">{f.client?.nom || '—'}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatMoney(tot.totalTTC)}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge tone={sd.tone}>{sd.label}</Badge>
                      {f.ecartAjuste && st !== 'certifiee' && <p className="mt-0.5 text-[10px] text-amber-600">quantités ajustées</p>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {actions(f).map((act) => (
                          <Button key={act.id} size="sm" variant={act.tone} disabled={busy} onClick={act.on}>
                            <act.icon size={14} /> {act.label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!liste.length && <tr><td colSpan={6} className="py-10 text-center text-gray-400">Aucune facture.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal création / édition (brouillon) */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="xl"
        title={modal?.editId ? 'Modifier le brouillon' : 'Nouvelle facture (brouillon)'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer le brouillon</Button></>}>
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FormGroup label="Date"><Input type="date" value={modal.facture.date} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, date: e.target.value } }))} /></FormGroup>
              <FormGroup label="Client" required hint="Client existant ou nouveau nom">
                <Input list="clients-list" value={modal.facture.client.nom}
                  onChange={(e) => {
                    const nom = e.target.value
                    const connu = clientsConnus.find((c) => c.nom.toLowerCase() === nom.trim().toLowerCase())
                    setModal((m) => ({ ...m, facture: { ...m.facture, client: connu ? { ...m.facture.client, nom, tel: connu.tel, email: connu.email, adresse: connu.adresse } : { ...m.facture.client, nom } } }))
                  }} />
                <datalist id="clients-list">{clientsConnus.map((c) => <option key={c.nom} value={c.nom} />)}</datalist>
              </FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.facture.client.tel} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Email"><Input value={modal.facture.client.email} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, email: e.target.value } } }))} /></FormGroup>
            </div>
            <div className="mt-2">
              <FormGroup label="Apporté / recommandé par (membre de l'entreprise)" hint="Laissez vide si le client est venu en direct.">
                <Input list="apporteurs-list" placeholder="Nom du membre…" value={modal.facture.apporteur || ''}
                  onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, apporteur: e.target.value } }))} />
                <datalist id="apporteurs-list">{users.map((u) => <option key={u.id} value={u.nom || u.login} />)}</datalist>
              </FormGroup>
            </div>

            <div className="mb-2 mt-2 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-2 py-2 text-left">Article</th><th className="px-2 py-2">Qté</th><th className="px-2 py-2">Prix unit.</th><th className="px-2 py-2 text-right">Total</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modal.facture.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select value={l.articleId} onChange={(e) => pickArticle(i, e.target.value)}>
                          <option value="">— Choisir —</option>
                          {tousArticles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5"><Input type="number" min="1" className="w-20" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min="0" className="w-28" value={l.prixUnit} onChange={(e) => setLigne(i, { prixUnit: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(l.total)}</td>
                      <td className="px-2 py-1.5"><button onClick={() => removeLigne(i)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addLigne}><Plus size={14} /> Ajouter une ligne</Button>

            <div className="mt-3 flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Remise %</label>
                <Input type="number" min="0" max="100" className="w-20" value={modal.facture.remise} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, remise: parseFloat(e.target.value) || 0 } }))} />
                <label className="text-sm text-gray-600">TVA %</label>
                <Input type="number" min="0" max="100" className="w-20" value={modal.facture.tva} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, tva: parseFloat(e.target.value) || 0 } }))} />
              </div>
              <p className="text-sm text-gray-600">Total HT : <strong>{formatMoney(totaux.totalHT)}</strong></p>
              <p className="text-lg font-extrabold text-primary-dark">TOTAL TTC : {formatMoney(totaux.totalTTC)}</p>
            </div>
          </>
        )}
      </Modal>

      {/* Modal écart : ajustement des quantités réelles par la hiérarchie */}
      <EcartModal facture={ecart} onClose={() => setEcart(null)} onSubmit={appliquerAjustement} busy={busy} />
    </div>
  )
}

// Ajustement de l'écart (hiérarchie) : pour chaque ligne, quantités réellement
// vendues + mortes au marché ; le reliquat est retourné au stock.
function EcartModal({ facture, onClose, onSubmit, busy }) {
  const lignes = (facture?.lignes || []).map((l, i) => ({ ...l, _idx: i })).filter((l) => l.articleId && (parseInt(l.qte) || 0) > 0)
  const [vals, setVals] = useState({})

  // Initialise (vendus = qté demandée, morts = 0) à l'ouverture.
  const initIfNeeded = (idx, qte) => {
    if (vals[idx]) return vals[idx]
    return { sold: qte, dead: 0 }
  }
  const set = (idx, patch, qte) => setVals((v) => ({ ...v, [idx]: { ...initIfNeeded(idx, qte), ...patch } }))

  function submit() {
    const ajustements = lignes.map((l) => {
      const cur = vals[l._idx] || { sold: parseInt(l.qte) || 0, dead: 0 }
      const sold = Math.max(0, parseInt(cur.sold) || 0)
      const dead = Math.max(0, parseInt(cur.dead) || 0)
      return { ligneIdx: l._idx, sold, dead }
    })
    // Garde-fou : vendus + morts ne peut dépasser la quantité sortie.
    for (const l of lignes) {
      const aj = ajustements.find((a) => a.ligneIdx === l._idx)
      if (aj.sold + aj.dead > (parseInt(l.qte) || 0)) {
        return toast.error(`${l.article} : vendus + morts dépasse la quantité sortie (${l.qte})`)
      }
    }
    onSubmit(facture, ajustements)
  }

  return (
    <Modal open={!!facture} onClose={onClose} size="lg"
      title={facture ? `Ajuster l'écart — ${facture.numero}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy}><Check size={15} /> Appliquer & réajuster le stock</Button></>}>
      {facture && (
        <div className="space-y-3">
          {facture.ecartMotif && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><Clock size={14} className="mr-1 inline" />Écart signalé par {facture.ecartSignalePar} : « {facture.ecartMotif} »</p>}
          <p className="text-xs text-gray-500">Indiquez, pour chaque ligne, le nombre réellement <strong>vendu</strong> et le nombre <strong>mort au marché</strong>. Le reliquat (sortie − vendus − morts) est <strong>retourné au stock</strong>.</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Article</th><th className="px-2 py-2 text-center">Sortis</th><th className="px-2 py-2 text-center">Vendus</th><th className="px-2 py-2 text-center">Morts</th><th className="px-2 py-2 text-center">Retournés</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map((l) => {
                  const cur = vals[l._idx] || { sold: parseInt(l.qte) || 0, dead: 0 }
                  const sold = parseInt(cur.sold) || 0
                  const dead = parseInt(cur.dead) || 0
                  const ret = Math.max(0, (parseInt(l.qte) || 0) - sold - dead)
                  return (
                    <tr key={l._idx}>
                      <td className="px-3 py-1.5 font-semibold">{l.article}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{l.qte}</td>
                      <td className="px-2 py-1.5 text-center"><Input type="number" min="0" className="w-20" value={cur.sold} onChange={(e) => set(l._idx, { sold: e.target.value }, parseInt(l.qte) || 0)} /></td>
                      <td className="px-2 py-1.5 text-center"><Input type="number" min="0" className="w-20" value={cur.dead} onChange={(e) => set(l._idx, { dead: e.target.value }, parseInt(l.qte) || 0)} /></td>
                      <td className="px-2 py-1.5 text-center text-sky-700 font-semibold">{ret}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">Le CA sera calculé sur les quantités <strong>vendues</strong> lors de la certification par l'agent.</p>
        </div>
      )}
    </Modal>
  )
}
