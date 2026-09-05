// Facturation MAXI-AGRO — workflow strict de sortie de stock :
//   Brouillon → (agent) Demande de sortie → (hiérarchie) Approbation
//            → (agent) Certification  ── ou ──  Écart → (hiérarchie) Ajustement → (agent) Certification
//
// • L'agent crée/édite/supprime les BROUILLONS et certifie.
// • La hiérarchie approuve la sortie (décompte du stock) et ajuste les quantités réelles (écart).
// • Le CA n'est compté (dashboard) qu'à la CERTIFICATION ; le PDF n'est imprimable qu'une fois certifié.
import { useMemo, useState } from 'react'
import { Plus, FileDown, FileSpreadsheet, Trash2, Pencil, Send, Check, X, BadgeCheck, AlertTriangle, RotateCcw, Eye } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import Badge from '../../shared/ui/Badge'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { exportRapportExcel } from '../../utils/excelReport'
import { canExportExcel } from '../../core/roles'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { FACTURE_STATUTS, factureStatut } from './data'
import EcartModal from './EcartModal'
import CorrectifModal from '../../shared/demandes/CorrectifModal'
import { CORRECTIF_STATUTS, correctifEnCours, peutRelancer, deltasLignes, aDesEcarts } from '../../shared/demandes/correctif'
import {
  lignesEffectives, calcTotaux,
  demanderSortie as wfDemander, approuverSortie as wfApprouver, refuserSortie as wfRefuser,
  certifier as wfCertifier, signalerEcart as wfSignaler, appliquerAjustement as wfAjuster, rouvrir as wfRouvrir,
  demanderCorrectif as wfDemanderCorrectif
} from './factureWorkflow'

// Clés identifiant un article dans les lignes d'une facture, et statuts encore
// supprimables — au-delà, le stock est engagé (écart ou correctif).
const CLES = { key: 'articleId', nom: 'article' }
const SUPPRIMABLES = ['brouillon', 'sortie_demandee', 'refusee']

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  apporteur: '',
  lignes: [{ articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

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
  // Articles proposés au correctif, avec ce dont le stock a besoin (type, catégorie).
  const articlesCorrectif = useMemo(() => [
    ...especes.map((e) => ({ ...e, type: 'animal' })),
    ...aliments.map((a) => ({ ...a, type: 'aliment' }))
  ], [especes, aliments])
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [modal, setModal] = useState(null)        // { facture, editId }
  const [ecart, setEcart] = useState(null)        // facture en cours d'ajustement (hiérarchie)
  const [relance, setRelance] = useState(null)    // facture certifiée à relancer (correctif)
  const [detail, setDetail] = useState(null)      // facture consultée (lecture seule)
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
        // Distinct de `createdBy` (nom affiché) : identifiant stable pour cibler les
        // notifications individuelles (forUsers attend un uid/login, pas un nom).
        payload.createdByUid = user.uid || user.login || null
        payload.statut = 'brouillon'   // ← toute nouvelle facture démarre en brouillon
        await addItem('agro_factures', payload)
        await audit('agro', 'FACTURE', `${payload.numero} (brouillon) — ${formatMoney(totalTTC)}`)
        // Notification immédiate à la GE et au PAU (tout enregistrement doit les alerter).
        const especesFacture = [...new Set(lignes.map((l) => l.article).filter(Boolean))].join(', ')
        await notify({
          type: 'info',
          title: `Nouvelle facture — ${user.nom}`,
          body: `${payload.numero} · ${payload.client?.nom || ''}${especesFacture ? ` — ${especesFacture}` : ''} · ${formatMoney(totalTTC)}`,
          module: 'agro', forRoles: ['ge', 'pau'], excludeUid: user.uid || user.login, link: '/agro/factures'
        })
        toast.success('Brouillon créé ✓')
      }
      setModal(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Supprimable tant que la sortie n'a pas été approuvée : le stock est intact.
  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.numero} ?\nAucun stock n'a encore bougé — l'action est définitive.`)) return
    await removeItem('agro_factures', f.id)
    await audit('agro', 'FACTURE_DELETE', `${f.numero} (${factureStatut(f)})`)
    toast.success('Facture supprimée')
  }

  // ─────────── Transitions du workflow (logique partagée dans factureWorkflow) ───────────
  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); if (okMsg) toast.success(okMsg) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function demanderSortie(f) {
    if (!confirm(`Soumettre la sortie de la facture ${f.numero} à la hiérarchie ?`)) return
    run(() => wfDemander(f, user), '📤 Demande de sortie soumise à la hiérarchie ✓')
  }
  async function approuverSortie(f) {
    if (!confirm(`Approuver la sortie de stock de la facture ${f.numero} ? Le stock sera décompté.`)) return
    run(() => wfApprouver(f, user), '✅ Sortie approuvée — stock décompté')
  }
  async function refuserSortie(f) {
    const motif = prompt(`Refuser la sortie de la facture ${f.numero} ?\nMotif (optionnel) :`)
    if (motif === null) return
    run(() => wfRefuser(f, user, motif), 'Sortie refusée')
  }
  async function certifier(f) {
    const { totalTTC } = calcTotaux(lignesEffectives(f), f.remise, f.tva)
    if (!confirm(`Certifier la facture ${f.numero} pour ${formatMoney(totalTTC)} ? Elle deviendra définitive et imprimable.`)) return
    run(() => wfCertifier(f, user), '✅ Facture certifiée — CA enregistré, impression disponible')
  }
  async function signalerEcart(f) {
    const motif = prompt(`Signaler un écart sur la facture ${f.numero}\n(ex : reliquats retournés, pertes au marché)\nMessage à la hiérarchie :`)
    if (motif === null) return
    run(() => wfSignaler(f, user, motif), '📝 Demande de modification envoyée à la hiérarchie')
  }
  async function appliquerAjustement(f, ajustements) {
    await run(() => wfAjuster(f, user, ajustements), '✅ Quantités réelles ajustées — stock réajusté')
    setEcart(null)
  }
  async function rouvrir(f) {
    run(() => wfRouvrir(f), 'Facture rouverte en brouillon')
  }
  // Facture certifiée dont une quantité était fausse : l'agent la relance.
  async function envoyerCorrectif({ lignes, motif }) {
    const f = relance
    if (!motif.trim()) return toast.error('Motif du correctif obligatoire')
    if (!aDesEcarts(deltasLignes(lignesEffectives(f), lignes, CLES))) return toast.error('Aucune quantité modifiée')
    await run(() => wfDemanderCorrectif(f, user, lignes, motif), '🔄 Correctif envoyé à la hiérarchie')
    setRelance(null)
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
    // Suppression tant que le stock n'est pas engagé ; ensuite, relance en correctif.
    if (SUPPRIMABLES.includes(st) && (isAgent || peutApprouver)) {
      a.push({ id: 'del', label: 'Supprimer', icon: Trash2, tone: 'danger', on: () => supprimer(f) })
    }
    if (peutRelancer(f, { estCertifiee: st === 'certifiee', isAuteur: f.createdBy === user.nom, canManage: peutApprouver })) {
      a.push({ id: 'rel', label: 'Relancer (correctif)', icon: RotateCcw, tone: 'warning', on: () => setRelance(f) })
    }
    return a
  }

  const totaux = modal ? calcTotaux(modal.facture.lignes, modal.facture.remise, modal.facture.tva) : null
  const filtres = [['tous', 'Toutes'], ['brouillon', `Brouillons (${compteur('brouillon')})`], ['sortie_demandee', `À approuver (${compteur('sortie_demandee')})`], ['modif_demandee', `Écarts (${compteur('modif_demandee')})`], ['sortie_approuvee', `Approuvées (${compteur('sortie_approuvee')})`], ['certifiee', `Certifiées (${compteur('certifiee')})`]]

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les factures actuellement affichées, dans l'ordre affiché (recherche client +
  // filtre de statut + tri déjà appliqués à `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((f) => {
      const st = factureStatut(f)
      const tot = calcTotaux(lignesEffectives(f), f.remise, f.tva)
      return {
        'N°': f.numero,
        'Date': formatDateShort(f.date),
        'Client': f.client?.nom || '—',
        'Article(s)': lignesEffectives(f).filter((l) => (l.article || '').trim()).map((l) => `${l.article} ×${formatNumber(l.qte)}`).join(', '),
        'Total TTC': tot.totalTTC,
        'Statut': (FACTURE_STATUTS[st] || { label: st }).label
      }
    })
    exportRapportExcel({
      filename: `factures-maxi-agro-${todayStr()}.xlsx`,
      sections: [{
        name: 'Factures MAXI-AGRO',
        title: 'Factures — MAXI-AGRO',
        subtitle: `${liste.length} facture(s)${filtre !== 'tous' ? ` — ${filtres.find(([v]) => v === filtre)?.[1]}` : ''}${recherche ? ` — recherche : « ${recherche} »` : ''}`,
        columns: [
          { key: 'N°', label: 'N°', width: 14 },
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 22 },
          { key: 'Article(s)', label: 'Article(s)', width: 40 },
          { key: 'Total TTC', label: 'Total TTC', width: 16, type: 'money' },
          { key: 'Statut', label: 'Statut', width: 16 }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Total TTC': rows.reduce((s, r) => s + (r['Total TTC'] || 0), 0) }
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <strong>Sortie de stock en 4 étapes :</strong> ① l'agent crée une facture <em>brouillon</em> → ② il demande la sortie →
        ③ la hiérarchie l'approuve (décompte du stock) → ④ l'agent <em>certifie</em> (CA enregistré, impression). En cas d'écart, l'agent signale et la hiérarchie ajuste les quantités réelles.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="🔍 Rechercher un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {canExportExcel(role) && (
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
        )}
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
        <div className="max-h-[calc(100vh-16rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 px-3 py-2 text-left">N°</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Espèce(s) / Article(s)</th>
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
                  <tr key={f.id} className="group hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs group-hover:bg-gray-50">{f.numero}</td>
                    <td className="px-3 py-2">{formatDateShort(f.date)}</td>
                    <td className="px-3 py-2">{f.client?.nom || '—'}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const arts = lignesEffectives(f).filter((l) => (l.article || '').trim())
                        if (!arts.length) return <span className="text-gray-400">—</span>
                        return (
                          <div className="flex flex-wrap gap-1">
                            {arts.map((l, i) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                                <span className="font-semibold text-gray-700">{l.article}</span>
                                <span className="text-gray-400">×{formatNumber(l.qte)}</span>
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{formatMoney(tot.totalTTC)}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge tone={sd.tone}>{sd.label}</Badge>
                      {f.ecartAjuste && st !== 'certifiee' && <p className="mt-0.5 text-[10px] text-amber-600">quantités ajustées</p>}
                      {f.correctif && (
                        <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                          {CORRECTIF_STATUTS[f.correctif.statut]?.label}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {/* Consultation ouverte à tous, quel que soit le statut. */}
                        <button onClick={() => setDetail(f)} title="Voir le détail"
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
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
              {!liste.length && <tr><td colSpan={7} className="py-10 text-center text-gray-400">Aucune facture.</td></tr>}
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
                <ChampAutocomplete
                  value={modal.facture.client.nom}
                  suggestions={clientsConnus}
                  getLabel={(c) => c.nom}
                  onChange={(nom) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom } } }))}
                  onSelect={(connu) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom: connu.nom, tel: connu.tel, email: connu.email, adresse: connu.adresse } } }))}
                />
              </FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.facture.client.tel} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Email"><Input value={modal.facture.client.email} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, email: e.target.value } } }))} /></FormGroup>
            </div>
            <div className="mt-2">
              <FormGroup label="Apporté / recommandé par (membre de l'entreprise)" hint="Laissez vide si le client est venu en direct.">
                <ChampAutocomplete
                  value={modal.facture.apporteur || ''}
                  suggestions={users.map((u) => u.nom || u.login)}
                  placeholder="Nom du membre…"
                  onChange={(v) => setModal((m) => ({ ...m, facture: { ...m.facture, apporteur: v } }))}
                />
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
      {/* Consultation d'une facture — lecture seule */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.agro)}
        title={detail ? `Facture ${detail.numero}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
          {detail && factureStatut(detail) === 'certifiee' && (
            <Button variant="secondary" onClick={() => generateFacturePDF(detail)}><FileDown size={15} /> PDF</Button>
          )}
        </>}>
        {detail && (() => {
          const st = factureStatut(detail)
          const lignes = lignesEffectives(detail).filter((l) => l.articleId || (l.article || '').trim())
          const t = calcTotaux(lignes, detail.remise, detail.tva)
          return (
            <FicheDetail
              entetes={[
                { label: 'Client', value: detail.client?.nom || '—' },
                { label: 'Statut', value: (FACTURE_STATUTS[st] || { label: st }).label },
                { label: 'Date', value: formatDateShort(detail.date) },
                { label: 'Téléphone', value: detail.client?.tel },
                { label: 'Apporteur', value: detail.apporteur },
                { label: 'Créée par', value: detail.createdBy },
                { label: 'Sortie demandée', value: detail.sortieDemandeePar ? `${detail.sortieDemandeePar}${detail.sortieDemandeeLe ? ' · ' + detail.sortieDemandeeLe : ''}` : null },
                { label: 'Sortie approuvée', value: detail.sortieApprouveePar ? `${detail.sortieApprouveePar}${detail.sortieApprouveeLe ? ' · ' + detail.sortieApprouveeLe : ''}` : null },
                { label: 'Certifiée', value: detail.certifieePar ? `${detail.certifieePar}${detail.certifieeLe ? ' · ' + detail.certifieeLe : ''}` : null },
                { label: 'Motif de refus', value: detail.refusMotif }
              ]}
              colonnes={[
                { label: 'Article', render: (l) => l.article || '—' },
                { label: 'Catégorie', render: (l) => l.articleCat || '' },
                { label: 'Quantité', align: 'center', render: (l) => formatNumber(l.qte) },
                { label: 'Prix unitaire', align: 'right', render: (l) => formatMoney(l.prixUnit ?? l.prix ?? 0) },
                { label: 'Total', align: 'right', render: (l) => formatMoney(l.total || 0) }
              ]}
              lignes={lignes}
              vide="Aucune ligne sur cette facture."
              pied={[
                { label: 'Total HT', value: t.totalHT },
                { label: 'Remise', value: detail.remise ? `${detail.remise} %` : null },
                { label: 'TVA', value: detail.tva ? `${detail.tva} %` : null },
                { label: 'Total TTC', value: t.totalTTC, fort: true }
              ]}
            >
              {detail.ecartAjuste && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Quantités ajustées après écart{detail.ecartAjustePar ? ` par ${detail.ecartAjustePar}` : ''}
                  {detail.ecartMotif ? ` · « ${detail.ecartMotif} »` : ''}
                </p>
              )}
              {detail.correctif && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {CORRECTIF_STATUTS[detail.correctif.statut]?.label} — demandé par {detail.correctif.parNom}
                  {detail.correctif.traitePar ? `, tranché par ${detail.correctif.traitePar}` : ''}
                  {detail.correctif.motif ? ` · « ${detail.correctif.motif} »` : ''}
                </p>
              )}
            </FicheDetail>
          )
        })()}
      </Modal>

      <EcartModal facture={ecart} onClose={() => setEcart(null)} onSubmit={appliquerAjustement} busy={busy} />

      {/* Relance : correctif de quantités sur une facture déjà certifiée */}
      {relance && (
        <CorrectifModal
          key={relance.id} onClose={() => setRelance(null)} busy={busy}
          titre={`Relancer la facture ${relance.numero}`}
          lignes={lignesEffectives(relance).map((l, i) => ({ ...l, _idx: i })).filter((l) => l.articleId)}
          champs={CLES}
          articles={articlesCorrectif}
          onPickArticle={(a) => ({ articleType: a.type, articleCat: a.cat || '', prixUnit: a.prix || 0 })}
          prixField="prixUnit"
          onSubmit={envoyerCorrectif}
        />
      )}
    </div>
  )
}
