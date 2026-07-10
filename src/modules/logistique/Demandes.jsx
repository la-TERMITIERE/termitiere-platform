// Autorisations de sortie matériel — pilotées par la PRESTATION + sa FACTURE.
// L'agent émet une autorisation liée à une facture (brouillon) : elle couvre tout
// le matériel loué de la prestation. À la CERTIFICATION :
//   • la facture passe « approuvée » → elle compte alors dans le chiffre d'affaires ;
//   • le matériel loué est décompté du stock magasin (sorties auto, cf. logic.autoSorties).
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
import { addItem, updateItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { dernierStock } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande } from '../../shared/workflow'
import { useSite, matchSite, siteLabel } from './site/useSite'

const STATUTS = STATUTS_DEMANDE

// Lignes de matériel du référentiel (avec stock) d'une prestation.
const lignesMateriel = (p) => (p?.lignes || [])
  .filter((l) => l.materielId)
  .map((l) => ({ materielId: l.materielId, materielNom: l.materielNom, materielCat: l.cat, qte: parseInt(l.qte) || 0 }))

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const site = useSite()
  const { data: allDemandes } = useCollection('logistique_demandes')
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: allInventaires } = useCollection('logistique_inventaires')
  const isManager = canManage()
  const isCertifier = canCertify()

  const liste = useMemo(() => allDemandes.filter((d) => matchSite(d, site)), [allDemandes, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [form, setForm] = useState({ factureId: '', dateSortie: todayStr(), message: '' })

  // Factures en brouillon dont l'autorisation de sortie reste à émettre.
  const facturesAvecDemande = useMemo(() => new Set(liste.map((d) => d.factureId).filter(Boolean)), [liste])
  const facturesDispo = factures.filter((f) => f.statut === 'brouillon' && !facturesAvecDemande.has(f.id))

  const filtrees = useMemo(() =>
    [...liste].filter((d) => filtre === 'tous' || normaliserStatut(d.statut) === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
  [liste, filtre])

  const prestationDeFacture = (factureId) => {
    const f = factures.find((x) => x.id === factureId)
    return f ? prestations.find((p) => p.id === f.prestationId) : null
  }
  const formPresta = prestationDeFacture(form.factureId)
  const formLignes = lignesMateriel(formPresta)

  function openCreate() {
    const f = facturesDispo[0]
    const p = f ? prestations.find((x) => x.id === f.prestationId) : null
    setForm({ factureId: f?.id || '', dateSortie: p?.dateDebut || todayStr(), message: '' })
    setCreateOpen(true)
  }

  function choisirFacture(id) {
    const p = prestationDeFacture(id)
    setForm((s) => ({ ...s, factureId: id, dateSortie: p?.dateDebut || s.dateSortie }))
  }

  async function submitDemande() {
    const fac = factures.find((f) => f.id === form.factureId)
    const p = fac ? prestations.find((x) => x.id === fac.prestationId) : null
    if (!fac || !p) return toast.error('Sélectionnez une facture')
    if (!form.message.trim()) return toast.error('Motif obligatoire')
    const lignes = lignesMateriel(p)
    if (!lignes.length) return toast.error('Cette prestation ne contient aucun matériel du référentiel à sortir')

    const num = genNumero(`AUT-${site.toUpperCase()}`, liste.length)
    const totalQte = lignes.reduce((s, l) => s + l.qte, 0)
    await addItem('logistique_demandes', {
      num, date: todayStr(), heure: nowHM(), site,
      demandeur: user.login, demandeurNom: user.nom,
      factureId: fac.id, factureNum: fac.num,
      prestationId: p.id, prestationNum: p.num, clientNom: p.clientNom,
      lignes, dateSortie: form.dateSortie,
      message: form.message.trim(), statut: 'en_attente'
    })
    await notify({
      type: 'demande',
      title: 'Autorisation de sortie matériel',
      body: `${siteLabel(site)} — ${totalQte} pièce(s) · prestation ${p.num} — facture ${fac.num} — par ${user.nom}`,
      module: 'logistique',
      forRoles: APPROVER_ROLES,
      excludeUid: user.uid,
      link: `/logistique/${site}/demandes`
    })
    await audit('logistique', 'DEMANDE_SORTIE', `${siteLabel(site)} — ${num} — prestation ${p.num}`)
    toast.success('Autorisation soumise à la hiérarchie ✓')
    setCreateOpen(false)
  }

  // Applique une action du workflow (approuver / certifier / refuser).
  async function appliquerDecision(action) {
    const d = decision.demande
    const statut = action.statut
    const horodate = todayStr() + ' ' + nowHM()
    const totalQte = (d.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const patch = { statut, decidedAt: ts(), commentaireDecision: commentaire.trim() }
    if (statut === 'approuve_n1') { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    else if (statut === 'certifie') {
      patch.certifiePar = user.nom; patch.certifieLe = horodate
      patch.approbateur = user.login; patch.approbateurNom = user.nom; patch.dateDecision = horodate
      if (!d.approuveN1Par) { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    } else { patch.refusePar = user.nom; patch.dateDecision = horodate }
    await updateItem('logistique_demandes', d.id, patch)

    // Effet métier à la CERTIFICATION : facture approuvée (→ CA) + stock décrémenté (auto).
    if (statut === 'certifie') {
      if (d.factureId) await updateItem('logistique_factures', d.factureId, { statut: 'approuvee', approuveePar: user.nom, approuveeLe: horodate })
      if (d.prestationId) await updateItem('logistique_prestations', d.prestationId, { approuvee: true, approuveePar: user.nom, approuveeLe: horodate })
    }

    if (statut === 'approuve_n1') {
      await notify({
        type: 'demande', title: 'Sortie matériel à certifier 🟡',
        body: `${siteLabel(site)} — prestation ${d.prestationNum} (${totalQte} pièce(s)) — approuvée par ${user.nom}`,
        module: 'logistique', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: `/logistique/${site}/demandes`
      })
    } else if (statut === 'certifie') {
      await notify({
        type: 'success', title: 'Sortie autorisée · facture approuvée ✅',
        body: `${siteLabel(site)} — prestation ${d.prestationNum} — facture ${d.factureNum} approuvée, ${totalQte} pièce(s) sorties le ${d.dateSortie}`,
        module: 'logistique', forUsers: [d.demandeur], link: `/logistique/${site}/saisie`
      })
      await notify({
        type: 'info', title: `Sortie certifiée par ${user.nom} ✅`,
        body: `${siteLabel(site)} — prestation ${d.prestationNum} (${totalQte} pièce(s)) — demandée par ${d.demandeurNom}`,
        module: 'logistique', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: `/logistique/${site}/demandes`
      })
    } else {
      await notify({
        type: 'refus', title: 'Autorisation refusée ⛔',
        body: `${siteLabel(site)} — prestation ${d.prestationNum}${commentaire.trim() ? ' — ' + commentaire.trim() : ''}`,
        module: 'logistique', forUsers: [d.demandeur], link: `/logistique/${site}/demandes`
      })
    }
    await audit('logistique',
      statut === 'refuse' ? 'AUTORISATION_REFUS' : statut === 'certifie' ? 'CERTIFICATION' : 'AUTORISATION_OK',
      `${siteLabel(site)} — ${d.num}`)
    toast.success(statut === 'certifie' ? 'Sortie certifiée ✓ — facture approuvée & stock décrémenté' : statut === 'approuve_n1' ? 'Approuvé — en attente de certification' : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Chaque sortie de matériel exige une <strong>facture (brouillon)</strong>, puis une <strong>approbation</strong> (gérant) suivie d'une <strong>certification</strong> (Direction / GE).
        À la certification, la <strong>facture est approuvée</strong> (chiffre d'affaires) et le <strong>stock est décrémenté</strong>.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['en_attente', 'approuve_n1', 'certifie', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : STATUTS[f]?.short || f}
          </button>
        ))}
        {role !== 'superviseur' && (
          <Button className="ml-auto" onClick={openCreate} disabled={!facturesDispo.length}>
            <Plus size={16} /> Autorisation de sortie
          </Button>
        )}
      </div>

      {role !== 'superviseur' && !facturesDispo.length && (
        <div className="rounded-lg bg-sky-50 px-4 py-2 text-xs text-sky-700">
          Aucune facture en attente d'autorisation. Émettez d'abord une facture (onglet Facturation).
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Facture</th>
              <th className="px-3 py-2">Prestation</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2 text-center">Pièces</th>
              <th className="px-3 py-2">Sortie prévue</th>
              <th className="px-3 py-2">Statut</th>
              {isManager && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrees.map((d) => {
              const sn = normaliserStatut(d.statut)
              const acts = actionsDemande(d.statut, { canManage: isManager, canCertify: isCertifier })
              const totalQte = (d.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0) || d.qte || 0
              return (
              <tr key={d.id}>
                <td className="px-3 py-2 font-mono text-xs">{d.num}</td>
                <td className="px-3 py-2">{d.factureNum}</td>
                <td className="px-3 py-2 font-semibold">{d.prestationNum || '—'}</td>
                <td className="px-3 py-2">{d.clientNom || '—'}</td>
                <td className="px-3 py-2 text-center">{totalQte}</td>
                <td className="px-3 py-2">{formatDateShort(d.dateSortie)}</td>
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Autorisation de sortie (prestation)"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={submitDemande}>Soumettre</Button></>}>
        <FormGroup label="Facture liée (brouillon)" required>
          <Select value={form.factureId} onChange={(e) => choisirFacture(e.target.value)}>
            {facturesDispo.map((f) => <option key={f.id} value={f.id}>{f.num} — {f.clientNom} ({formatMoney(f.totalTTC)})</option>)}
          </Select>
        </FormGroup>
        {formPresta && (
          <div className="mt-2 rounded-lg border border-gray-200 p-3">
            <p className="mb-1 text-xs font-bold uppercase text-gray-500">Matériel de la prestation {formPresta.num}</p>
            {formLignes.length ? (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-400"><tr><th className="py-1 text-left">Matériel</th><th className="py-1 text-center">Qté</th><th className="py-1 text-center">Stock</th></tr></thead>
                <tbody>
                  {formLignes.map((l, i) => {
                    const stock = dernierStock(inventaires, l.materielId)
                    const insuffisant = l.qte > stock
                    return (
                      <tr key={i} className="border-t">
                        <td className="py-1">{l.materielNom}</td>
                        <td className="py-1 text-center font-semibold">{l.qte}</td>
                        <td className={`py-1 text-center ${insuffisant ? 'font-bold text-red-600' : 'text-gray-500'}`}>{stock}{insuffisant ? ' ⚠️' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            ) : <p className="text-sm text-gray-400">Aucun matériel du référentiel dans cette prestation.</p>}
          </div>
        )}
        <FormGroup label="Date de sortie" className="mt-2">
          <Input type="date" value={form.dateSortie} onChange={(e) => setForm((s) => ({ ...s, dateSortie: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Motif / justification" required>
          <Input value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Événement, client, lieu…" />
        </FormGroup>
      </Modal>

      <Modal open={!!decision} onClose={() => { setDecision(null); setCommentaire('') }} title="Traiter l'autorisation"
        footer={<><Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
          {decision && actionsDemande(decision.demande.statut, { canManage: isManager, canCertify: isCertifier }).map((a) => (
            <Button key={a.id} onClick={() => appliquerDecision(a)} style={{ background: a.tone === 'danger' ? '#dc2626' : '#16a34a' }}>
              {a.label}
            </Button>
          ))}</>}>
        {decision && (
          <>
            <p className="mb-1 text-sm">Prestation <strong>{decision.demande.prestationNum}</strong> — Facture {decision.demande.factureNum}</p>
            <p className="mb-2 text-sm text-gray-600">{decision.demande.clientNom}</p>
            <div className="mb-3 rounded-lg bg-gray-50 p-2 text-sm">
              {(decision.demande.lignes || []).map((l, i) => (
                <div key={i} className="flex justify-between"><span>{l.materielNom}</span><span className="font-semibold">×{l.qte}</span></div>
              ))}
            </div>
            <p className="mb-3"><Badge tone={STATUTS[normaliserStatut(decision.demande.statut)]?.tone}>{STATUTS[normaliserStatut(decision.demande.statut)]?.label}</Badge></p>
            <FormGroup label="Commentaire"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}
