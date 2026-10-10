// Autorisations de sortie des briques — workflow à deux niveaux :
// un gérant approuve, puis la Direction / GE certifie (libère le chargement).
//
// Même écran, onglet « Location matériel » : les demandes de location de matériel
// (créées depuis Materiel.jsx → bouton « Louer ») suivent EXACTEMENT le même circuit
// (approbation puis certification, mêmes rôles) — distinguées par `type: 'location'`
// (les demandes de sortie briques n'ont pas de `type`, traité comme 'sortie').
import { useMemo, useState } from 'react'
import { Plus, Shield, Trash2, RotateCcw, Eye, KeyRound, Send, ShieldCheck, Info, Boxes, CalendarDays, AlertTriangle, ShoppingCart, UserRound } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import PillTabs from '../../shared/ui/PillTabs'
import ActionIcone from '../../shared/ui/ActionIcone'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import EtatVide from '../../shared/ui/EtatVide'
import SignatureApprobation from '../../shared/ui/SignatureApprobation'
import AutorisationHero from '../../shared/ui/AutorisationHero'
import { demanderAutorisationVente } from './venteActions'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { COULEUR_MODULE, icone3D, glassModalProps } from '../../utils/color'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem, setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { dernierStockBriques, retirerVenteDuStock, appliquerDeltasStockBriques } from './logic'
import { APPROVER_ROLES, CERTIFIER_ROLES, isReadOnlyRole, logistiquePeutApprouver, logistiqueVoitValidateur } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, actionsDemande, peutSupprimerDemande, estAuteurDemande, estActif } from '../../shared/workflow'
import DemandeDetail from '../../shared/demandes/DemandeDetail'
import CorrectifModal from '../../shared/demandes/CorrectifModal'
import CorrectifCompare from '../../shared/demandes/CorrectifCompare'
import {
  CORRECTIF_STATUTS, correctifEnCours, peutRelancer, deltasLignes, aDesEcarts,
  sommeQte, appliquerCorrectif, changementsArticle, payloadDemandeCorrectif, payloadDecisionCorrectif
} from '../../shared/demandes/correctif'
import { useBriqueterieStore } from './store/referentielStore'

const STATUTS = STATUTS_DEMANDE
// Clés identifiant une brique dans les lignes d'une demande / d'une vente.
const CLES = { key: 'briqueId', nom: 'briqueNom' }

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)
  const isManager = canManage()
  const isCertifier = canCertify()
  const lectureSeule = isReadOnlyRole(role)
  // La secrétaire gère une demande (approuver/refuser/supprimer) au 1er niveau
  // UNIQUEMENT tant qu'elle est encore « en_attente » — au-delà (correctifs,
  // certification), c'est réservé à la hiérarchie (même règle qu'en Logistique).
  const peutGererDemande = (d) => isManager || (logistiquePeutApprouver(role) && normaliserStatut(d.statut) === 'en_attente')

  // Onglet 'sortie' (briques) ou 'location' (matériel) — même workflow, données
  // affichées différentes. La création d'une location se fait depuis Materiel.jsx,
  // pas ici (contextuelle au matériel choisi).
  const [recherche, setRecherche] = useState('')
  const [ongletDemande, setOngletDemande] = useState('sortie')
  const typeDe = (d) => d.type || 'sortie'

  const [filtre, setFiltre] = useState('tous') // plus de pastilles de statut : toutes les demandes s'affichent
  // Filtre de période — bandeau (glassmorphism). Vide par défaut = tout l'historique
  // (ne doit jamais masquer une demande en_attente faute d'avoir choisi une période).
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const dansPeriode = (dateStr) => {
    if (modePeriode === 'mois') return !filtreMois || (dateStr || '').startsWith(filtreMois)
    if (modePeriode === 'annee') return !filtreAnnee || (dateStr || '').startsWith(filtreAnnee)
    if (modePeriode === 'plage') return (!filtreDebut || dateStr >= filtreDebut) && (!filtreFin || dateStr <= filtreFin)
    return !filtreJour || dateStr === filtreJour
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [relance, setRelance] = useState(null)   // demande certifiée à relancer
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ venteId: '', dateSortie: todayStr(), message: '' })

  // Triée du plus récemment créé au plus ancien — une vente qu'on vient de créer
  // pour un nouveau client doit apparaître en haut du sélecteur, pas tout en bas.
  const ventesBrouillon = ventes.filter((v) => ['brouillon', 'en_attente'].includes(v.statut))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  // Vente sélectionnée : ses informations (client, briques, quantités) remplissent la demande.
  const selectedVente = ventes.find((v) => v.id === form.venteId) || null
  const estAuteur = (d) => d.demandeur === user.login
  const nbCorrectifs = useMemo(() => demandes.filter((d) => typeDe(d) === 'sortie' && correctifEnCours(d)).length, [demandes])
  const demandesOnglet = useMemo(() => demandes.filter((d) => typeDe(d) === ongletDemande), [demandes, ongletDemande])
  const nbLocationEnAttente = useMemo(() => demandes.filter((d) => typeDe(d) === 'location' && estActif(normaliserStatut(d.statut))).length, [demandes])
  const filtrees = useMemo(() =>
    [...demandesOnglet]
      .filter((d) => (filtre === 'tous' ? true : filtre === 'correctif' ? correctifEnCours(d) : normaliserStatut(d.statut) === filtre))
      .filter((d) => dansPeriode(d.date))
      .filter((d) => correspond(recherche, d.clientNom, d.demandeurNom, d.venteNum, d.num))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  [demandesOnglet, filtre, recherche, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])

  const stockDe = (briqueId) => dernierStockBriques(inventaires, briqueId, briqueId === 'caillasses' ? 'caillasses' : 'pret')

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
    try {
      const r = await demanderAutorisationVente({ vente: vte, user, demandes, inventaires, dateSortie: form.dateSortie, message: form.message })
      toast.success('Demande soumise : approbation puis certification requises')
      if (r.destinataires === 0) toast.warning(`Aucun validateur n'a accès au module Briqueterie : personne n'a été alerté. Prévenez la hiérarchie.`)
      setCreateOpen(false)
    } catch (e) { toast.error(e.message) }
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
      patch.stockDecremente = true // idempotence : cf. AutoApproveWorkflow
      if (!d.approuveN1Par) { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    } else { patch.refusePar = user.nom; patch.dateDecision = horodate }
    await updateItem('evenementiel_demandes', d.id, patch)

    // ── Location matériel — même circuit, effet métier différent : le matériel ne
    // part « en location » qu'à la CERTIFICATION, jamais avant (comme le stock des
    // briques n'est décrémenté qu'à la certification). ──
    if (typeDe(d) === 'location') {
      if (statut === 'certifie') {
        await updateItem('evenementiel_materiels', d.materielId, {
          statut: 'loue', updatedAt: Date.now(),
          locationEnCours: {
            demandeId: d.id, locataireNom: d.locataireNom, locataireContact: d.locataireContact || '',
            dateDebut: d.dateDebut, nombreJours: d.nombreJours, prixTotal: d.prixTotal
          }
        })
        await notify({
          type: 'success', title: 'Location matériel autorisée ✅',
          body: `${d.materielNom} : ${d.nombreJours} jour(s) : ${formatMoney(d.prixTotal)} : locataire ${d.locataireNom}`,
          module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/materiel'
        })
        await notify({
          type: 'info', title: `Location autorisée par ${user.nom} ✅`,
          body: `${d.materielNom} : demandée par ${d.demandeurNom}`,
          module: 'evenementiel', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
        })
      } else if (statut === 'approuve_n1') {
        await notify({
          type: 'demande', title: 'Location matériel à certifier 🟡',
          body: `${d.materielNom} : approuvée par ${user.nom}`,
          module: 'evenementiel', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
        })
      } else { // refuse
        await notify({
          type: 'refus', title: 'Demande de location refusée ⛔',
          body: `${d.materielNom}${commentaire.trim() ? ' : ' + commentaire.trim() : ''}`,
          module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/demandes'
        })
      }
      await audit('evenementiel',
        statut === 'refuse' ? 'LOCATION_REFUS' : statut === 'certifie' ? 'LOCATION_CERTIFICATION' : 'LOCATION_APPROBATION', d.num)
      toast.success(statut === 'certifie' ? 'Location certifiée ✓' : statut === 'approuve_n1' ? 'Approuvé : en attente de certification' : 'Demande refusée')
      setDecision(null)
      setCommentaire('')
      return
    }

    if (statut === 'certifie') {
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'autorisee' })
      // Sortie autorisée : on décrémente le stock prêt (ou caillasses) des briques
      // vendues — sauf si le système l'a déjà fait (idempotence via stockDecremente).
      const vente = !d.stockDecremente && ventes.find((v) => v.id === d.venteId)
      const maj = vente && retirerVenteDuStock(inventaires, vente)
      if (maj) {
        await setItem('evenementiel_inventaires', maj.date, {
          ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(),
          agentId: user.uid, agentNom: user.nom
        })
      }
      await notify({
        type: 'success', title: 'Sortie briques autorisée ✅',
        body: `${d.qte} × ${d.briqueNom} : chargement ${d.dateSortie}`,
        module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/stock'
      })
      await notify({
        type: 'info', title: `Sortie autorisée par ${user.nom} ✅`,
        body: `${d.qte} × ${d.briqueNom} : demandée par ${d.demandeurNom}`,
        module: 'evenementiel', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
      })
    } else if (statut === 'approuve_n1') {
      await notify({
        type: 'demande', title: 'Sortie briques à certifier 🟡',
        body: `${d.qte} × ${d.briqueNom} : approuvée par ${user.nom}`,
        module: 'evenementiel', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
      })
    } else { // refuse
      await updateItem('evenementiel_ventes', d.venteId, { statut: 'brouillon' })
      await notify({
        type: 'refus', title: 'Demande refusée ⛔',
        body: `${d.qte} × ${d.briqueNom}${commentaire.trim() ? ' : ' + commentaire.trim() : ''}`,
        module: 'evenementiel', forUsers: [d.demandeur], link: '/evenementiel/demandes'
      })
    }
    await audit('evenementiel',
      statut === 'refuse' ? 'AUTORISATION_REFUS' : statut === 'certifie' ? 'CERTIFICATION' : 'AUTORISATION_OK', d.num)
    toast.success(statut === 'certifie' ? 'Sortie certifiée ✓' : statut === 'approuve_n1' ? 'Approuvé : en attente de certification' : 'Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); if (okMsg) toast.success(okMsg) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  // ─── Suppression (tant que la demande n'est pas certifiée) ───
  // Le stock n'ayant pas encore bougé, il suffit de rendre la vente au brouillon.
  async function supprimer(d) {
    const msg = typeDe(d) === 'location'
      ? `Supprimer la demande de location ${d.num} ?`
      : `Supprimer l'autorisation ${d.num} ?\nLa vente ${d.venteNum || ''} redevient un brouillon modifiable.`
    if (!confirm(msg)) return
    await run(async () => {
      await removeItem('evenementiel_demandes', d.id)
      if (d.venteId) await updateItem('evenementiel_ventes', d.venteId, { statut: 'brouillon' })
      await audit('evenementiel', 'DEMANDE_SUPPRESSION', d.num)
    }, 'Autorisation supprimée : la vente repasse en brouillon')
    setDecision(null)
  }

  // ─── Relance : correctif sur une autorisation CERTIFIÉE ───
  async function envoyerCorrectif({ lignes, motif }) {
    const d = relance
    if (!motif.trim()) return toast.error('Motif du correctif obligatoire')
    const deltas = deltasLignes(d.lignes || [], lignes, CLES)
    if (!aDesEcarts(deltas)) return toast.error('Aucun article ni quantité modifié')
    for (const dd of deltas) {
      if (dd.delta > stockDe(dd.id)) return toast.error(`Stock insuffisant pour ${dd.nom} (${dd.delta} à sortir en plus, ${stockDe(dd.id)} disponible)`)
    }
    await run(async () => {
      await updateItem('evenementiel_demandes', d.id, {
        correctif: payloadDemandeCorrectif({ lignes, lignesAvant: d.lignes || [], motif, user, horodate: todayStr() + ' ' + nowHM() })
      })
      await notify({
        type: 'demande', title: 'Demande de correctif 🔄',
        body: `Autorisation ${d.num} : ${d.clientNom || ''} : quantités à corriger${motif.trim() ? ' : ' + motif.trim() : ''}`,
        module: 'evenementiel', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/evenementiel/demandes'
      })
      await audit('evenementiel', 'CORRECTIF_DEMANDE', d.num)
    }, '🔄 Correctif envoyé à la hiérarchie')
    setRelance(null)
  }

  // ─── La hiérarchie tranche le correctif ───
  // Accepté : les anciennes quantités RENTRENT au stock, les nouvelles en RESSORTENT
  // (un seul mouvement net par brique), et la vente — ainsi que sa facture éventuelle —
  // s'aligne sur les quantités corrigées.
  async function trancherCorrectif(accepte) {
    const d = decision.demande
    const c = d.correctif
    const horodate = todayStr() + ' ' + nowHM()
    const deltas = deltasLignes(c.lignesAvant || d.lignes || [], c.lignes || [], CLES)

    await run(async () => {
      if (accepte) {
        const maj = appliquerDeltasStockBriques(inventaires, deltas)
        if (maj) {
          await setItem('evenementiel_inventaires', maj.date, {
            ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(), agentId: user.uid, agentNom: user.nom
          })
        }
        // La vente suit : brique remplacée, quantité et montant recalculés.
        const report = { avant: c.lignesAvant || d.lignes || [], apres: c.lignes || [], key: 'briqueId' }
        const vente = ventes.find((v) => v.id === d.venteId)
        if (vente) {
          const lignes = appliquerCorrectif(vente.lignes, {
            ...report,
            mapper: (x) => {
              const qte = parseInt(x.qte) || 0
              const pu = parseFloat(x.prixUnitaire) || 0
              return { briqueId: x.briqueId, briqueNom: x.briqueNom, qte, prixUnitaire: pu, montant: qte * pu }
            }
          })
          await updateItem('evenementiel_ventes', vente.id, { lignes, total: lignes.reduce((s, l) => s + (l.montant || 0), 0) })
        }
        // Facture déjà émise sur cette vente : ses lignes suivent aussi (CA juste).
        const fac = factures.find((f) => f.venteId === d.venteId)
        if (fac) {
          const lignes = appliquerCorrectif(fac.lignes, {
            ...report, keyCible: 'articleId',
            mapper: (x, l) => {
              const qte = parseInt(x.qte) || 0
              const pu = parseFloat(x.prixUnitaire) || parseFloat(l.prixUnit) || 0
              return { articleId: x.briqueId, article: x.briqueNom, qte, prixUnit: pu, total: qte * pu }
            }
          })
          const totalHT = lignes.reduce((s, l) => s + (l.total || 0), 0)
          const apresRemise = totalHT * (1 - (fac.remise || 0) / 100)
          await updateItem('evenementiel_factures', fac.id, {
            lignes, totalHT, totalTTC: Math.round(apresRemise * (1 + (fac.tva || 0) / 100))
          })
        }
      }
      const nouv = c.lignes || []
      await updateItem('evenementiel_demandes', d.id, {
        ...(accepte ? {
          lignes: nouv, qte: sommeQte(nouv),
          briqueId: nouv[0]?.briqueId || d.briqueId,
          // Le résumé affiché en liste suit la brique effectivement sortie.
          briqueNom: nouv.length === 1 ? nouv[0].briqueNom : `${nouv.length} types de briques`
        } : {}),
        correctif: payloadDecisionCorrectif(c, { accepte, user, horodate, commentaire })
      })
      await notify({
        type: accepte ? 'success' : 'refus',
        title: accepte ? 'Correctif appliqué ✅' : 'Correctif refusé ⛔',
        body: `Autorisation ${d.num} : ${accepte ? `quantités corrigées (${sommeQte(c.lignes)} brique(s)) et stock réajusté` : 'les quantités certifiées restent inchangées'}`,
        module: 'evenementiel', forUsers: [c.par || d.demandeur], excludeUid: user.uid, link: '/evenementiel/demandes'
      })
      await audit('evenementiel', accepte ? 'CORRECTIF_APPLIQUE' : 'CORRECTIF_REFUSE', d.num)
    }, accepte ? '✅ Correctif appliqué : stock réajusté' : 'Correctif refusé')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(71,85,105,0.35),0_8px_20px_-8px_rgba(71,85,105,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(138,155,179,0.92) 0%, rgba(100,116,139,0.9) 40%, rgba(51,65,85,0.88) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#475569', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Shield size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Autorisations</h2>
          <p className="text-sm text-white/80">Sortie de briques et location de matériel : validation à deux niveaux</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism) — vide par
            défaut, ne masque jamais une demande en attente. */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <div className="band-filtres">
<ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client, un demandeur…" />
        </div>
      </div>

      {/* Deux onglets, même écran, même workflow — cf. en-tête du fichier. */}
      <PillTabs active={ongletDemande} accent={COULEUR_MODULE.evenementiel}
        onChange={(id) => { setOngletDemande(id); setFiltre('tous') }}
        tabs={[
          { id: 'sortie', label: '📦 Sortie briques', accent: '#475569' },
          { id: 'location', label: `🔑 Location matériel${nbLocationEnAttente ? ` (${nbLocationEnAttente})` : ''}`, accent: '#0891b2' }
        ]} />

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 to-white/70 px-4 py-3 text-sm text-slate-900 shadow-[0_10px_22px_-16px_rgba(71,85,105,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#475569')}><Info size={16} /></span>
        <span>
          {ongletDemande === 'sortie'
            ? <>Circuit : <strong>approbation</strong> (gérant) → <strong>certification</strong> (Direction / GE). À la certification, la vente est autorisée et le stock de briques baisse.</>
            : <>Circuit : <strong>approbation</strong> (gérant) → <strong>certification</strong> (Direction / GE). Une location se demande depuis <strong>Matériel & Matériaux</strong>, bouton « Louer ».</>}
        </span>
      </div>

      {!lectureSeule && ongletDemande === 'sortie' && (
        <div className="flex justify-end">
          <style>{`
            @keyframes da-balayage { 0% { transform: translateX(-130%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
            @keyframes da-envol { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(3px, -3px) rotate(-8deg); } }
            @keyframes da-tampon { 0%, 55% { opacity: 0; transform: scale(2.2) rotate(-25deg); } 68% { opacity: 1; transform: scale(0.9) rotate(-10deg); } 74%, 88% { opacity: 1; transform: scale(1) rotate(-10deg); } 100% { opacity: 0; transform: scale(1) rotate(-10deg); } }
          `}</style>
          {/* Demander une autorisation : l'avion part, puis le tampon d'autorisation tombe sur le bouton. */}
          <button onClick={openCreate} disabled={!ventesBrouillon.length}
            title={ventesBrouillon.length ? "Demander l'autorisation de sortie d'une vente" : "Aucune vente en attente d'autorisation : créez d'abord une vente"}
            className="group relative flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(71,85,105,0.7),inset_0_1px_0_0_rgba(255,255,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-10px_rgba(71,85,105,0.85)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #64748b 45%, #334155 100%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              style={{ animation: 'da-balayage 3.2s ease-in-out infinite' }} />
            <span className="relative flex h-6 w-6 items-center justify-center">
              <Send size={17} style={{ animation: 'da-envol 2.4s ease-in-out infinite' }} />
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-green-600 shadow"
                style={{ animation: 'da-tampon 4s ease-in-out infinite' }}><ShieldCheck size={11} strokeWidth={3} /></span>
            </span>
            <span className="relative">Demander une autorisation</span>
          </button>
        </div>
      )}


      <Card className="p-0">
       <div className="table-verre overflow-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-gray-500">
            {ongletDemande === 'sortie' ? (
            <tr className="bg-gray-50">
              <th className="sticky left-0 top-0 z-30 bg-gray-50 px-3 py-2 text-left" style={{ width: '110px' }}>N°</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Vente / Client</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Brique</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2 text-center">Qté</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Chargement</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Validation</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Statut</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2" />
            </tr>
            ) : (
            <tr className="bg-gray-50">
              <th className="sticky left-0 top-0 z-30 bg-gray-50 px-3 py-2 text-left" style={{ width: '110px' }}>N°</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Matériel / Locataire</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2 text-center">Durée</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2 text-right">Prix</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Validation</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2">Statut</th>
              <th className="sticky top-0 z-20 bg-gray-50 px-3 py-2" />
            </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrees.map((d) => {
              const sn = normaliserStatut(d.statut)
              const estLocation = typeDe(d) === 'location'
              const gereCetteDemande = peutGererDemande(d)
              const acts = actionsDemande(d.statut, {
                canManage: gereCetteDemande, canCertify: isCertifier,
                estAuteur: estAuteurDemande(d, user), dejaApprouvePar: d.approuveN1Par, moiNom: user?.nom
              })
              const enCorrectif = !estLocation && correctifEnCours(d)
              const suppressible = !lectureSeule && role !== 'agent' && peutSupprimerDemande(d.statut, { isAuteur: estAuteur(d), canManage: gereCetteDemande })
              const relancable = !estLocation && !lectureSeule && peutRelancer(d, { estCertifiee: sn === 'certifie', isAuteur: estAuteur(d), canManage: isManager })
              return (
              <tr key={d.id} onClick={() => setDecision({ demande: d, lecture: true })}
                className={`group cursor-pointer ${enCorrectif ? 'bg-amber-50/50' : ''}`}>
                <td className={`sticky left-0 z-10 px-3 py-2 font-mono text-xs ${enCorrectif ? 'bg-amber-50' : 'bg-white group-hover:bg-gray-50'}`} style={{ width: '110px' }}><NumDoc num={d.num} /></td>
                {estLocation ? (
                  <>
                    <td className="px-3 py-2"><span className="flex items-center gap-2"><AvatarNom nom={d.locataireNom} size={26} accent={COULEUR_MODULE.evenementiel} className="hidden sm:inline-flex" /><span><span className="font-semibold">{d.materielNom}</span><br /><span className="text-xs text-gray-500">{d.locataireNom}</span></span></span></td>
                    <td className="px-3 py-2 text-center">{d.nombreJours} j.</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(d.prixTotal)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2"><span className="flex items-center gap-2"><AvatarNom nom={d.clientNom} size={26} accent={COULEUR_MODULE.evenementiel} className="hidden sm:inline-flex" /><span><span className="font-semibold">{d.clientNom}</span><br /><span className="font-mono text-[10px] text-gray-400">{d.venteNum}</span></span></span></td>
                    <td className="px-3 py-2 font-semibold">{d.briqueNom}</td>
                    <td className="px-3 py-2 text-center"><span className="inline-flex min-w-[2.5rem] justify-center rounded-xl bg-white/80 px-2 py-0.5 text-xs font-extrabold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_3px_6px_-3px_rgba(0,0,0,0.25)]">{d.qte}</span></td>
                    <td className="px-3 py-2">{d.dateSortie}</td>
                  </>
                )}
                <td className="px-3 py-2 text-xs text-gray-500">
                  {logistiqueVoitValidateur(role) ? (
                    d.certifiePar
                      ? <SignatureApprobation par={d.certifiePar} le={d.certifieLe ? formatDateShort(String(d.certifieLe).slice(0, 10)) : ''} auto={/syst/i.test(d.certifiePar)} />
                      : d.approuveN1Par ? <span className="block">Approuvé : {d.approuveN1Par}</span> : <span className="text-gray-300">:</span>
                  ) : (d.approuveN1Par ? <span className="block">Approuvée</span> : <span className="text-gray-300">:</span>)}
                </td>
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
                    {/* Consultation ouverte à tous : la même fiche, sans les actions. */}
                    <ActionIcone icone={Eye} tone="voir" title="Voir le détail" onClick={() => setDecision({ demande: d, lecture: true })} />
                    {(acts.length > 0 || enCorrectif) && gereCetteDemande && (
                      <button onClick={(e) => { e.stopPropagation(); setDecision({ demande: d }) }} className="btn-balaye inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-[0_10px_18px_-8px_rgba(71,85,105,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5" style={{ background: sn === 'approuve_n1' ? 'linear-gradient(135deg, #34d399, #059669)' : 'linear-gradient(135deg, #64748b, #334155)' }}>
                        {enCorrectif ? 'Correctif' : sn === 'approuve_n1' ? 'Certifier' : 'Traiter'}
                      </button>
                    )}
                    {relancable && (
                      <button onClick={(e) => { e.stopPropagation(); setRelance(d) }} title="Demander un correctif"
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-bold text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:-translate-y-0.5 hover:bg-amber-100">
                        <RotateCcw size={13} /> Relancer
                      </button>
                    )}
                    {suppressible && (
                      <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer la demande" disabled={busy} onClick={() => supprimer(d)} />
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        {!filtrees.length && <EtatVide icone={ShieldCheck} texte="Aucune demande" accent={COULEUR_MODULE.evenementiel} />}
       </div>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
        title="Demande d'autorisation de sortie"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={submitDemande}><Send size={15} /> Soumettre</Button></>}>
        <style>{`
          @keyframes aut-barre { from { width: 0; } }
          @keyframes aut-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.25); } }
        `}</style>
        <div className="space-y-3">
          <AutorisationHero accent={COULEUR_MODULE.evenementiel} sous="Les briques ne sortent qu'après approbation puis certification." />

          <div className="tuile-verre">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(COULEUR_MODULE.evenementiel)}><ShoppingCart size={14} /></span>
              Vente liée <span className="text-red-500">*</span>
            </p>
            <Select value={form.venteId} onChange={(e) => {
              const v = ventes.find((x) => x.id === e.target.value)
              setForm((s) => ({ ...s, venteId: e.target.value, venteNum: v?.num, dateSortie: v?.dateChargement || todayStr() }))
            }}>
              {ventesBrouillon.map((v) => <option key={v.id} value={v.id}>{v.num} : {v.clientNom} ({formatMoney(v.total)})</option>)}
            </Select>
            {selectedVente && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <AvatarNom nom={selectedVente.clientNom} size={16} accent={COULEUR_MODULE.evenementiel} />{selectedVente.clientNom}
                </span>
                <span className="text-[11px] text-gray-500">Le client et les briques sont repris de la vente.</span>
              </div>
            )}
          </div>

          {selectedVente && (
            <div className="tuile-verre">
              <p className="mb-2 flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-600">
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#E8850F')}><Boxes size={14} /></span>
                  Briques à sortir
                </span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  {(selectedVente.lignes || []).reduce((t, l) => t + (parseInt(l.qte) || 0), 0)} brique(s)
                </span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(selectedVente.lignes || []).map((l, i) => {
                  const stock = stockDe(l.briqueId)
                  const qte = parseInt(l.qte) || 0
                  const insuffisant = qte > stock
                  const pct = stock > 0 ? Math.min(100, Math.round((qte / stock) * 100)) : 100
                  const couleur = insuffisant ? '#DC2626' : pct > 80 ? '#E8850F' : '#16A34A'
                  return (
                    <div key={i} className="rounded-2xl border border-white/80 bg-white/65 p-2.5 shadow-[0_8px_16px_-14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)]">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}>
                          {insuffisant ? <AlertTriangle size={14} style={{ animation: 'aut-pulse 1.4s ease-in-out infinite' }} /> : <Boxes size={14} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800" title={l.briqueNom}>{l.briqueNom}</span>
                        <span className="rounded-lg bg-slate-50 px-2 py-0.5 text-xs font-extrabold text-slate-700">× {qte}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200/80">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${couleur}, ${couleur}aa)`, animation: 'aut-barre 0.8s ease-out' }} />
                      </div>
                      <p className={`mt-1 text-[11px] ${insuffisant ? 'font-bold text-red-600' : 'text-gray-500'}`}>
                        Stock prêt : {stock}{insuffisant ? ' : insuffisant pour cette sortie' : ''}
                      </p>
                    </div>
                  )
                })}
                {!(selectedVente.lignes || []).length && <p className="py-2 text-sm text-gray-400">Aucune ligne.</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3">
            <FormGroup label="Date de sortie" className="col-span-2 sm:col-span-1">
              <div className="relative">
                <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
                <Input className="pl-9" type="date" value={form.dateSortie} onChange={(e) => setForm((s) => ({ ...s, dateSortie: e.target.value }))} />
              </div>
            </FormGroup>
            <FormGroup label="Motif / justification" required className="col-span-2 sm:col-span-1">
              <Input value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Destination, véhicule…" />
            </FormGroup>
          </div>
        </div>
      </Modal>

      <Modal open={!!decision} onClose={() => { setDecision(null); setCommentaire('') }} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
        title={decision?.lecture
          ? `Autorisation ${decision.demande.num}`
          : decision && correctifEnCours(decision.demande) ? 'Trancher le correctif' : 'Traiter la demande'}
        footer={decision?.lecture
          ? <Button variant="ghost" onClick={() => setDecision(null)}>Fermer</Button>
          : <>
            <Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
            {decision && role !== 'agent' && peutSupprimerDemande(decision.demande.statut, { isAuteur: estAuteur(decision.demande), canManage: peutGererDemande(decision.demande) }) && !lectureSeule && (
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
            ))}
          </>}>
        {decision && (() => {
          const d = decision.demande
          const sn = normaliserStatut(d.statut)
          const estLocation = typeDe(d) === 'location'
          const lignes = estLocation ? [] : (d.lignes || [])
          const items = estLocation
            ? [{ nom: d.materielNom, qte: 1, montant: d.prixTotal }]
            : (lignes.length
              ? lignes.map((l) => ({
                  nom: l.briqueNom, qte: parseInt(l.qte) || 0,
                  stock: dernierStockBriques(inventaires, l.briqueId, l.briqueId === 'caillasses' ? 'caillasses' : 'pret'),
                  montant: l.montant
                }))
              : [{ nom: d.briqueNom, qte: parseInt(d.qte) || 0 }])
          const montant = estLocation ? d.prixTotal : (lignes.length ? lignes.reduce((s, l) => s + (l.montant || 0), 0) : undefined)
          return (
            <>
              <div className="mb-3"><AutorisationHero accent={COULEUR_MODULE.evenementiel} titre={`Autorisation ${d.num}`} sous={estLocation ? `Location : ${d.materielNom}` : `Vente ${d.venteNum} : ${d.clientNom || ''}`} /></div>
              {!estLocation && correctifEnCours(d) && (
                <div className="mb-3">
                  <CorrectifCompare
                    correctif={d.correctif}
                    deltas={deltasLignes(d.correctif.lignesAvant || d.lignes || [], d.correctif.lignes || [], CLES)}
                    changements={changementsArticle(d.correctif.lignesAvant || d.lignes || [], d.correctif.lignes || [], CLES)}
                    stockOf={(x) => stockDe(x.id)}
                  />
                </div>
              )}
              <DemandeDetail
                demandeur={d.demandeurNom}
                dateHeure={d.date ? `${formatDateShort(d.date)}${d.heure ? ' ' + d.heure : ''}` : null}
                client={estLocation ? `${d.locataireNom}${d.locataireContact ? ' · ☎ ' + d.locataireContact : ''} (locataire)` : d.clientNom}
                motif={d.message}
                sortieLabel={estLocation ? 'Début de location' : 'Chargement prévu'}
                sortieValue={estLocation ? (d.dateDebut ? `${formatDateShort(d.dateDebut)} : ${d.nombreJours} jour(s)` : null) : (d.dateSortie ? formatDateShort(d.dateSortie) : null)}
                items={items}
                montant={montant}
                statutNode={<Badge tone={STATUTS[sn]?.tone}>{STATUTS[sn]?.label}</Badge>}
                trail={logistiqueVoitValidateur(role) ? [
                  { label: 'Approuvé (N1)', value: d.approuveN1Par ? `${d.approuveN1Par}${d.approuveN1Le ? ' · ' + d.approuveN1Le : ''}` : '' },
                  { label: 'Certifié', value: d.certifiePar ? `${d.certifiePar}${d.certifieLe ? ' · ' + d.certifieLe : ''}` : '' }
                ] : []}
              />
              {decision.lecture ? (
                <>
                  {d.commentaireDecision && (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">
                      Commentaire de décision : « {d.commentaireDecision} »
                    </p>
                  )}
                  {!estLocation && d.correctif && !correctifEnCours(d) && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {CORRECTIF_STATUTS[d.correctif.statut]?.label} : demandé par {d.correctif.parNom}
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
          lignes={relance.lignes || []} champs={CLES}
          articles={briques}
          onPickArticle={(b) => ({ prixUnitaire: b.tarifVente || 0 })}
          prixField="prixUnitaire"
          stockOf={(l) => stockDe(l.briqueId)}
          onSubmit={envoyerCorrectif}
        />
      )}
    </div>
  )
}
