// Autorisations de sortie matériel — pilotées par la PRESTATION + sa FACTURE.
// L'agent émet une autorisation liée à une facture (brouillon) : elle couvre tout
// le matériel loué de la prestation. À la CERTIFICATION :
//   • la facture passe « approuvée » → elle compte alors dans le chiffre d'affaires ;
//   • le matériel loué est décompté du stock magasin (sorties auto, cf. logic.autoSorties).
import { useMemo, useState } from 'react'
import { Plus, Trash2, RotateCcw, Eye, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { dernierStock } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES, isReadOnlyRole, logistiquePeutApprouver, logistiqueVoitMontants } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande, peutSupprimerDemande, estAuteurDemande } from '../../shared/workflow'
import DemandeDetail from '../../shared/demandes/DemandeDetail'
import CorrectifModal from '../../shared/demandes/CorrectifModal'
import CorrectifCompare from '../../shared/demandes/CorrectifCompare'
import {
  CORRECTIF_STATUTS, correctifEnCours, peutRelancer, deltasLignes, aDesEcarts,
  appliquerCorrectif, changementsArticle, payloadDemandeCorrectif, payloadDecisionCorrectif
} from '../../shared/demandes/correctif'
import { useLogistiqueStore } from './store/referentielStore'
import { useSite, matchSite, siteLabel } from './site/useSite'

const STATUTS = STATUTS_DEMANDE
// Clés identifiant un matériel dans les lignes d'une demande / facture / prestation.
const CLES = { key: 'materielId', nom: 'materielNom' }

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
  const materiel = useLogistiqueStore((s) => s.materiel)
  const isFullManager = canManage() // gérant / direction : accès total, à tout statut
  const isCertifier = canCertify()
  // Montants masqués pour la secrétaire : elle valide sur la quantité et le motif,
  // pas sur la valeur financière de la prestation.
  const voitMontants = logistiqueVoitMontants(role)
  // La secrétaire approuve au 1er niveau dans CE module uniquement (sans être ajoutée
  // à APPROVER_ROLES, qui lui ouvrirait aussi MAXI-AGRO et la Briqueterie). Elle ne
  // certifie jamais : la certification approuve la facture, donc reste à la direction.
  // Et son accès est borné à l'étape « en_attente » : une fois la demande sortie de
  // cet état (par elle ou par quelqu'un d'autre), elle sort définitivement de son
  // périmètre — plus de décision, plus de correctif, plus même la simple consultation.
  const peutGererDemande = (d) => isFullManager || (logistiquePeutApprouver(role) && normaliserStatut(d.statut) === 'en_attente')
  const peutVoirDetail = (d) => role !== 'secretaire' || normaliserStatut(d.statut) === 'en_attente'

  const liste = useMemo(() => allDemandes.filter((d) => matchSite(d, site)), [allDemandes, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [relance, setRelance] = useState(null)   // autorisation certifiée à relancer
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ factureId: '', dateSortie: todayStr(), message: '' })
  const lectureSeule = isReadOnlyRole(role)
  const estAuteur = (d) => d.demandeur === user.login
  // N'importe quel agent (pas seulement l'auteur) peut annuler une autorisation de
  // sortie TANT QU'ELLE N'EST PAS CERTIFIÉE (ex. reprendre le dossier d'un collègue
  // absent) — ne lui donne PAS pour autant le pouvoir d'approuver/certifier/refuser,
  // qui reste réservé à logistiquePeutApprouver/CERTIFIER_ROLES (cf. peutSupprimerDemande,
  // qui ferme de toute façon la suppression dès que le statut passe à `certifie`).
  const peutAnnulerAgent = role === 'agent'

  // Factures en brouillon dont l'autorisation de sortie reste à émettre.
  const facturesAvecDemande = useMemo(() => new Set(liste.map((d) => d.factureId).filter(Boolean)), [liste])
  const facturesDispo = factures.filter((f) => f.statut === 'brouillon' && !facturesAvecDemande.has(f.id))

  // Lignes source (facture, sinon prestation) de l'autorisation relancée : c'est
  // sur elles que porte le correctif. La demande ne retient que le matériel du
  // référentiel — on garde donc `_idx`, la position réelle dans la facture, et on
  // y joint le tarif pratiqué pour que le prix soit visible et modifiable.
  const lignesRelance = useMemo(() => {
    if (!relance) return []
    const fac = factures.find((f) => f.id === relance.factureId)
    const p = prestations.find((x) => x.id === relance.prestationId)
    const source = (fac?.lignes?.length ? fac.lignes : p?.lignes) || []
    return source
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.materielId)
      .map(({ l, i }) => {
        const dl = (relance.lignes || []).find((x) => x.materielId === l.materielId)
        return {
          materielId: l.materielId, materielNom: l.materielNom,
          materielCat: l.cat, unite: l.unite,
          qte: parseInt(dl?.qte ?? l.qte) || 0,
          nbJours: parseInt(l.nbJours) || 1,
          tarifUnitaire: parseFloat(l.tarifUnitaire) || 0,
          _idx: i
        }
      })
  }, [relance, factures, prestations])
  const lignesSourceRelance = useMemo(() => {
    if (!relance) return []
    const fac = factures.find((f) => f.id === relance.factureId)
    const p = prestations.find((x) => x.id === relance.prestationId)
    return (fac?.lignes?.length ? fac.lignes : p?.lignes) || []
  }, [relance, factures, prestations])

  const nbCorrectifs = useMemo(() => liste.filter(correctifEnCours).length, [liste])
  const filtrees = useMemo(() =>
    [...liste]
      .filter((d) => (filtre === 'tous' ? true : filtre === 'correctif' ? correctifEnCours(d) : normaliserStatut(d.statut) === filtre))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
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
      forRoles: [...APPROVER_ROLES, 'secretaire'],
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
      // Le demandeur doit savoir que sa demande est approuvée — sans cela il n'apprenait
      // son sort qu'à la certification (2e niveau), parfois bien plus tard.
      if (d.demandeur && d.demandeur !== user.login) {
        await notify({
          type: 'approuve', title: 'Sortie approuvée ✅',
          body: `${siteLabel(site)} — prestation ${d.prestationNum} (${totalQte} pièce(s)) — approuvée par ${user.nom}. En attente de certification.`,
          module: 'logistique', forUsers: [d.demandeur], link: `/logistique/${site}/demandes`
        })
      }
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

  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); if (okMsg) toast.success(okMsg) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  // ─── Suppression (tant que l'autorisation n'est pas certifiée) ───
  // Ni le stock ni la facture n'ont bougé : la facture brouillon redevient
  // simplement disponible pour une nouvelle autorisation.
  async function supprimer(d) {
    if (!confirm(`Supprimer l'autorisation ${d.num} ?\nLa facture ${d.factureNum || ''} (brouillon) redevient disponible.`)) return
    await run(async () => {
      await removeItem('logistique_demandes', d.id)
      await audit('logistique', 'DEMANDE_SUPPRESSION', `${siteLabel(site)} — ${d.num}`)
    }, 'Autorisation supprimée')
    setDecision(null)
  }

  // ─── Relance : correctif sur une autorisation CERTIFIÉE ───
  async function envoyerCorrectif({ lignes, motif }) {
    const d = relance
    const source = lignesSourceRelance
    if (!motif.trim()) return toast.error('Motif du correctif obligatoire')
    const deltas = deltasLignes(lignesRelance, lignes, CLES)
    if (!aDesEcarts(deltas)) return toast.error('Aucun matériel ni quantité modifié')
    for (const dd of deltas) {
      const stock = dernierStock(inventaires, dd.id)
      if (dd.delta > stock) return toast.error(`Stock insuffisant pour ${dd.nom} (${dd.delta} à sortir en plus, ${stock} disponible)`)
    }
    await run(async () => {
      await updateItem('logistique_demandes', d.id, {
        // `lignesAvant` suit l'indexation de la facture, cible du report.
        correctif: payloadDemandeCorrectif({ lignes, lignesAvant: source, motif, user, horodate: todayStr() + ' ' + nowHM() })
      })
      await notify({
        type: 'demande', title: 'Demande de correctif 🔄',
        body: `${siteLabel(site)} — autorisation ${d.num} · prestation ${d.prestationNum || ''} : quantités à corriger${motif.trim() ? ' — ' + motif.trim() : ''}`,
        module: 'logistique', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: `/logistique/${site}/demandes`
      })
      await audit('logistique', 'CORRECTIF_DEMANDE', `${siteLabel(site)} — ${d.num}`)
    }, '🔄 Correctif envoyé à la hiérarchie')
    setRelance(null)
  }

  // ─── La hiérarchie tranche le correctif ───
  // Accepté : les lignes de l'autorisation portent les nouvelles quantités — les
  // sorties automatiques (logic.autoSorties) s'en déduisent, donc les anciennes
  // quantités reviennent au stock et les nouvelles en ressortent. La facture et
  // la prestation suivent pour que le chiffre d'affaires reste juste.
  async function trancherCorrectif(accepte) {
    const d = decision.demande
    const c = d.correctif
    const horodate = todayStr() + ' ' + nowHM()
    // Matériel remplacé et/ou quantité corrigée, reportés sur la facture et la
    // prestation ; le nombre de jours de location de la ligne est conservé.
    const majLignes = (src) => appliquerCorrectif(src, {
      avant: c.lignesAvant || d.lignes || [], apres: c.lignes || [], key: 'materielId',
      mapper: (x, l) => {
        const qte = parseInt(x.qte) || 0
        const jours = parseInt(l.nbJours) || 1
        const tarif = parseFloat(x.tarifUnitaire ?? l.tarifUnitaire) || 0
        return {
          materielId: x.materielId, materielNom: x.materielNom,
          cat: x.materielCat || l.cat, unite: x.unite || l.unite,
          qte, tarifUnitaire: tarif, montant: qte * jours * tarif
        }
      }
    })
    const totalAvecFrais = (lignes, frais) =>
      lignes.reduce((s, l) => s + (l.montant || 0), 0) + (frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)

    await run(async () => {
      if (accepte) {
        const fac = factures.find((f) => f.id === d.factureId)
        if (fac) {
          const lignes = majLignes(fac.lignes)
          const total = totalAvecFrais(lignes, fac.frais)
          await updateItem('logistique_factures', fac.id, { lignes, totalHT: total, totalTTC: total })
        }
        const p = prestations.find((x) => x.id === d.prestationId)
        if (p) {
          const lignes = majLignes(p.lignes)
          await updateItem('logistique_prestations', p.id, { lignes, total: totalAvecFrais(lignes, p.frais) })
        }
      }
      await updateItem('logistique_demandes', d.id, {
        ...(accepte ? { lignes: c.lignes } : {}),
        correctif: payloadDecisionCorrectif(c, { accepte, user, horodate, commentaire })
      })
      await notify({
        type: accepte ? 'success' : 'refus',
        title: accepte ? 'Correctif appliqué ✅' : 'Correctif refusé ⛔',
        body: `${siteLabel(site)} — autorisation ${d.num} : ${accepte ? 'quantités corrigées, stock et facture réajustés' : 'les quantités certifiées restent inchangées'}`,
        module: 'logistique', forUsers: [c.par || d.demandeur], excludeUid: user.uid, link: `/logistique/${site}/demandes`
      })
      await audit('logistique', accepte ? 'CORRECTIF_APPLIQUE' : 'CORRECTIF_REFUSE', `${siteLabel(site)} — ${d.num}`)
    }, accepte ? '✅ Correctif appliqué — stock et facture réajustés' : 'Correctif refusé')
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
        {['en_attente', 'approuve_n1', 'correctif', 'certifie', 'refuse', 'tous'].map((f) => (
          <button key={f} onClick={() => setFiltre(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === f ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f === 'tous' ? 'Toutes' : f === 'correctif' ? `${CORRECTIF_STATUTS.demande.short}${nbCorrectifs ? ` (${nbCorrectifs})` : ''}` : STATUTS[f]?.short || f}
          </button>
        ))}
        {!lectureSeule && (
          <Button className="ml-auto" onClick={openCreate} disabled={!facturesDispo.length}>
            <Plus size={16} /> Autorisation de sortie
          </Button>
        )}
      </div>

      {!lectureSeule && !facturesDispo.length && (
        <div className="rounded-lg bg-sky-50 px-4 py-2 text-xs text-sky-700">
          Aucune facture en attente d'autorisation. Émettez d'abord une facture (onglet Facturation).
        </div>
      )}

      <Card className="p-0">
       <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-2xl">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 bg-gray-50 px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2">Facture</th>
              <th className="px-3 py-2">Prestation</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2 text-center">Pièces</th>
              <th className="px-3 py-2">Sortie prévue</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrees.map((d) => {
              const sn = normaliserStatut(d.statut)
              const gereCetteDemande = peutGererDemande(d)
              const voitCeDetail = peutVoirDetail(d)
              const acts = actionsDemande(d.statut, {
                canManage: gereCetteDemande, canCertify: isCertifier,
                estAuteur: estAuteurDemande(d, user), dejaApprouvePar: d.approuveN1Par, moiNom: user?.nom
              })
              const totalQte = (d.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0) || d.qte || 0
              const enCorrectif = correctifEnCours(d)
              const suppressible = !lectureSeule && peutSupprimerDemande(d.statut, { isAuteur: estAuteur(d), canManage: gereCetteDemande || peutAnnulerAgent })
              // Correctif ouvert à TOUT agent (pas seulement l'auteur) — comme l'annulation :
              // n'importe quel agent peut demander une correction d'une autorisation certifiée
              // (ex. reprendre le dossier d'un collègue). La hiérarchie tranche de toute façon.
              const relancable = !lectureSeule && peutRelancer(d, { estCertifiee: sn === 'certifie', isAuteur: estAuteur(d), canManage: gereCetteDemande || peutAnnulerAgent })
              return (
              <tr key={d.id} className={`group ${enCorrectif ? 'bg-amber-50/50' : ''}`}>
                <td className={`sticky left-0 z-10 px-3 py-2 font-mono text-xs ${enCorrectif ? 'bg-amber-50' : 'bg-white'} group-hover:bg-gray-50`}>{d.num}</td>
                <td className="px-3 py-2">{d.factureNum}</td>
                <td className="px-3 py-2 font-semibold">{d.prestationNum || '—'}</td>
                <td className="px-3 py-2">{d.clientNom || '—'}</td>
                <td className="px-3 py-2 text-center">{totalQte}</td>
                <td className="px-3 py-2">{formatDateShort(d.dateSortie)}</td>
                <td className="px-3 py-2">
                  <Badge tone={STATUTS[sn]?.tone}>{STATUTS[sn]?.label}</Badge>
                  {d.correctif && (
                    <Badge tone={CORRECTIF_STATUTS[d.correctif.statut]?.tone} className="mt-1">
                      {CORRECTIF_STATUTS[d.correctif.statut]?.label}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {/* Consultation ouverte à tous — SAUF la secrétaire une fois la demande
                        sortie de « en_attente » : passé ce point, elle n'a plus à la rouvrir. */}
                    {voitCeDetail && (
                      <button onClick={() => setDecision({ demande: d, lecture: true })} title="Voir le détail"
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                    )}
                    {/* Action prioritaire (approuver/certifier/traiter le correctif) : bien
                        visible plutôt qu'une pastille discrète — c'est l'action attendue. */}
                    {(acts.length > 0 || enCorrectif) && gereCetteDemande && (
                      <button onClick={() => setDecision({ demande: d })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/40 transition-colors hover:bg-emerald-700">
                        <CheckCircle2 size={14} />
                        {enCorrectif ? 'Correctif' : sn === 'approuve_n1' ? 'Certifier' : 'Approuver'}
                      </button>
                    )}
                    {relancable && (
                      <button onClick={() => setRelance(d)} title="Demander un correctif"
                        className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200">
                        <RotateCcw size={13} /> Relancer
                      </button>
                    )}
                    {suppressible && (
                      <button onClick={() => supprimer(d)} disabled={busy} title="Supprimer l'autorisation"
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        {!filtrees.length && <p className="py-10 text-center text-gray-400">Aucune demande.</p>}
       </div>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Autorisation de sortie (prestation)"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={submitDemande}>Soumettre</Button></>}>
        <FormGroup label="Facture liée (brouillon)" required>
          <Select value={form.factureId} onChange={(e) => choisirFacture(e.target.value)}>
            {facturesDispo.map((f) => <option key={f.id} value={f.id}>{f.num} — {f.clientNom}{voitMontants ? ` (${formatMoney(f.totalTTC)})` : ''}</option>)}
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

      <Modal open={!!decision} onClose={() => { setDecision(null); setCommentaire('') }}
        title={decision?.lecture
          ? `Autorisation ${decision.demande.num}`
          : decision && correctifEnCours(decision.demande) ? 'Trancher le correctif' : "Traiter l'autorisation"}
        footer={decision?.lecture
          ? <Button variant="ghost" onClick={() => setDecision(null)}>Fermer</Button>
          : <><Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
            {decision && !lectureSeule && peutSupprimerDemande(decision.demande.statut, { isAuteur: estAuteur(decision.demande), canManage: peutGererDemande(decision.demande) || peutAnnulerAgent }) && (
              <Button variant="danger" loading={busy} onClick={() => supprimer(decision.demande)}><Trash2 size={15} /> Supprimer</Button>
            )}
            {decision && correctifEnCours(decision.demande) ? (
              <>
                <Button variant="danger" loading={busy} onClick={() => trancherCorrectif(false)}>Refuser le correctif</Button>
                <Button variant="success" loading={busy} onClick={() => trancherCorrectif(true)}>Appliquer le correctif</Button>
              </>
            ) : decision && actionsDemande(decision.demande.statut, {
              canManage: peutGererDemande(decision.demande), canCertify: isCertifier,
              estAuteur: estAuteurDemande(decision.demande, user),
              dejaApprouvePar: decision.demande.approuveN1Par, moiNom: user?.nom
            }).map((a) => (
              <Button key={a.id} onClick={() => appliquerDecision(a)} style={{ background: a.tone === 'danger' ? '#dc2626' : '#16a34a' }}>
                {a.label}
              </Button>
            ))}</>}>
        {decision && (() => {
          const d = decision.demande
          const sn = normaliserStatut(d.statut)
          const fac = factures.find((f) => f.id === d.factureId)
          const items = (d.lignes || []).map((l) => ({
            nom: l.materielNom, cat: l.materielCat,
            qte: parseInt(l.qte) || 0, stock: dernierStock(inventaires, l.materielId)
          }))
          return (
            <>
              <p className="mb-2 text-sm font-semibold text-gray-800">
                Prestation {d.prestationNum} · Facture {d.factureNum}
              </p>
              {correctifEnCours(d) && (
                <div className="mb-3">
                  <CorrectifCompare
                    correctif={d.correctif}
                    deltas={deltasLignes(d.correctif.lignesAvant || d.lignes || [], d.correctif.lignes || [], CLES)}
                    changements={changementsArticle(d.correctif.lignesAvant || d.lignes || [], d.correctif.lignes || [], CLES)}
                    stockOf={(x) => dernierStock(inventaires, x.id)}
                  />
                </div>
              )}
              <DemandeDetail
                demandeur={d.demandeurNom}
                dateHeure={d.date ? `${formatDateShort(d.date)}${d.heure ? ' ' + d.heure : ''}` : null}
                client={d.clientNom}
                motif={d.message}
                sortieLabel="Sortie prévue"
                sortieValue={d.dateSortie ? formatDateShort(d.dateSortie) : null}
                items={items}
                montant={fac?.totalTTC}
                masquerMontants={!voitMontants}
                statutNode={<Badge tone={STATUTS[sn]?.tone}>{STATUTS[sn]?.label}</Badge>}
                trail={[
                  { label: 'Approuvé (N1)', value: d.approuveN1Par ? `${d.approuveN1Par}${d.approuveN1Le ? ' · ' + d.approuveN1Le : ''}` : '' },
                  { label: 'Certifié', value: d.certifiePar ? `${d.certifiePar}${d.certifieLe ? ' · ' + d.certifieLe : ''}` : '' }
                ]}
              />

              {/* Détail complet de la facturation (même en brouillon) — visible avant approbation. */}
              <div className="mt-3 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
                  <span className="text-xs font-bold uppercase text-gray-500">Détail de la facturation</span>
                  {fac && <span className="text-xs text-gray-500">Facture {fac.num}{fac.evenement ? ` · ${fac.evenement}` : ''}</span>}
                </div>
                {fac ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-400">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Prestation</th>
                        <th className="px-2 py-1.5 text-center">Qté</th>
                        <th className="px-2 py-1.5 text-center">Jours</th>
                        {/* Colonnes financières retirées pour la secrétaire : elle valide
                            sur la quantité et le motif, jamais sur le montant. */}
                        {voitMontants && <th className="px-2 py-1.5 text-right">Prix unit.</th>}
                        {voitMontants && <th className="px-3 py-1.5 text-right">Montant</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(fac.lignes || []).map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-semibold">{l.materielNom || 'Élément'}</td>
                          <td className="px-2 py-1.5 text-center">{l.qte ?? '—'}</td>
                          <td className="px-2 py-1.5 text-center">{l.nbJours || 1}</td>
                          {voitMontants && <td className="px-2 py-1.5 text-right">{formatMoney(l.tarifUnitaire || 0)}</td>}
                          {voitMontants && <td className="px-3 py-1.5 text-right font-bold">{formatMoney(l.montant || 0)}</td>}
                        </tr>
                      ))}
                      {(fac.frais || []).map((x, i) => (
                        <tr key={`f${i}`} className="bg-amber-50/40">
                          <td className="px-3 py-1.5 text-amber-700">{x.label} <span className="text-[10px]">(frais)</span></td>
                          <td className="px-2 py-1.5 text-center">—</td><td className="px-2 py-1.5 text-center">—</td>
                          {voitMontants && <td className="px-2 py-1.5 text-center">—</td>}
                          {voitMontants && <td className="px-3 py-1.5 text-right font-bold">{formatMoney(x.montant || 0)}</td>}
                        </tr>
                      ))}
                    </tbody>
                    {voitMontants && (
                      <tfoot>
                        <tr className="border-t bg-gray-50"><td colSpan={4} className="px-3 py-2 text-right font-bold">Total</td><td className="px-3 py-2 text-right font-extrabold text-secondary">{formatMoney(fac.totalTTC ?? fac.totalHT ?? 0)}</td></tr>
                      </tfoot>
                    )}
                  </table>
                  </div>
                ) : (
                  <p className="px-3 py-3 text-sm text-gray-400">Facture introuvable — impossible d'afficher le détail.</p>
                )}
              </div>

              {decision.lecture ? (
                <>
                  {d.commentaireDecision && (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">
                      Commentaire de décision : « {d.commentaireDecision} »
                    </p>
                  )}
                  {d.correctif && !correctifEnCours(d) && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {CORRECTIF_STATUTS[d.correctif.statut]?.label} — demandé par {d.correctif.parNom}
                      {d.correctif.traitePar ? `, tranché par ${d.correctif.traitePar}` : ''}
                      {d.correctif.motif ? ` · « ${d.correctif.motif} »` : ''}
                    </p>
                  )}
                </>
              ) : (
                <FormGroup label="Commentaire" className="mt-3"><Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></FormGroup>
              )}
            </>
          )
        })()}
      </Modal>

      {/* Relance : correctif de quantités sur une autorisation déjà certifiée */}
      {relance && (
        <CorrectifModal
          key={relance.id} onClose={() => setRelance(null)} busy={busy}
          titre={`Relancer l'autorisation ${relance.num}`}
          lignes={lignesRelance} champs={CLES}
          articles={materiel}
          onPickArticle={(m) => ({ materielCat: m.cat, unite: m.unite, tarifUnitaire: m.tarifLocation || 0 })}
          prixField="tarifUnitaire" prixLabel="Tarif / jour"
          stockOf={(l) => dernierStock(inventaires, l.materielId)}
          onSubmit={envoyerCorrectif}
        />
      )}
    </div>
  )
}
