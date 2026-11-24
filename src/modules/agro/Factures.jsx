// Facturation MAXI-AGRO — workflow strict de sortie de stock :
//   Brouillon → (agent) Demande de sortie → (hiérarchie) Approbation
//            → (agent) Certification  ── ou ──  Écart → (hiérarchie) Ajustement → (agent) Certification
//
// • L'agent crée/édite/supprime les BROUILLONS et certifie.
// • La hiérarchie approuve la sortie (décompte du stock) et ajuste les quantités réelles (écart).
// • Le CA n'est compté (dashboard) qu'à la CERTIFICATION ; le PDF n'est imprimable qu'une fois certifié.
import { useMemo, useState } from 'react'
import { Plus, FileDown, FileSpreadsheet, Trash2, Pencil, Send, Check, X, BadgeCheck, AlertTriangle, RotateCcw, Wallet, Receipt, Package } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import ModalAgro from './ModalAgro'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import Badge from '../../shared/ui/Badge'
import BoutonIcone3D from '../../shared/ui/BoutonIcone3D'
import StatCard from '../../shared/ui/StatCard'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import BandeAgro, { usePeriodeBande } from './BandeAgro'
import FriseVente from './FriseVente'
import { BoutonBande, ChampBande, CLASSE_CHAMP_BANDE, OngletsBande } from '../../shared/ui/BandeauVolet'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { exportRapportExcel } from '../../utils/excelReport'
import { canExportExcel, canViewFinance, agirCommeAgent } from '../../core/roles'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { FACTURE_STATUTS, factureStatut } from './data'
import { stockLome, depassementsLome, venteHorsFerme, lieuDeFacture, localitesAutres, filtreDuLieu, COL_AJUSTEMENTS_LOME } from './stockLome'
import EcartModal from './EcartModal'
import CorrectifModal from '../../shared/demandes/CorrectifModal'
import { CORRECTIF_STATUTS, correctifEnCours, peutRelancer, deltasLignes, aDesEcarts } from '../../shared/demandes/correctif'
import {
  lignesEffectives, calcTotaux,
  demanderSortie as wfDemander, approuverSortie as wfApprouver, refuserSortie as wfRefuser,
  certifier as wfCertifier, signalerEcart as wfSignaler, appliquerAjustement as wfAjuster, rouvrir as wfRouvrir,
  demanderCorrectif as wfDemanderCorrectif, supprimerFactureCertifiee as wfSupprimerCertifiee, supprimerFacture as wfSupprimer, STATUTS_STOCK_ENGAGE
} from './factureWorkflow'

// Clés identifiant un article dans les lignes d'une facture, et statuts encore
// supprimables — au-delà, le stock est engagé (écart ou correctif).
const CLES = { key: 'articleId', nom: 'article' }
// Couleur de chaque action (boutons à icône seule, légende dans l'infobulle).
const COULEURS_ACTION = { primary: '#2EAA3F', success: '#16a34a', danger: '#dc2626', warning: '#d97706', secondary: '#475569', ghost: '#6b7280' }
const SUPPRIMABLES = ['brouillon', 'sortie_demandee', 'refusee']

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  apporteur: '',
  lieuVente: 'ferme', // 'ferme' : vendu depuis la ferme (stock de la ferme) ; 'lome' : vendu à Lomé ; 'autre' : vendu dans la localité `localite` (voir stockLome.js)
  localite: '',
  lignes: [{ articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

export default function Factures() {
  const { user, role, canManage } = useAuth()
  const isAgent = agirCommeAgent(role)
  const peutApprouver = canManage()      // hiérarchie : approuve / ajuste
  const estAdministration = canViewFinance(role)
  const { data: factures } = useCollection('agro_factures')
  const { data: users } = useCollection('users')
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: pertesLome } = useCollection(COL_AJUSTEMENTS_LOME)
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
  const [lieuFiltre, setLieuFiltre] = useState('tous') // 'tous' | 'ferme' | 'lome' | clé d'une autre localité
  const [modal, setModal] = useState(null)        // { facture, editId }
  const [ecart, setEcart] = useState(null)        // facture en cours d'ajustement (hiérarchie)
  const [relance, setRelance] = useState(null)    // facture certifiée à relancer (correctif)
  const [detail, setDetail] = useState(null)      // facture consultée (lecture seule)
  const [busy, setBusy] = useState(false)

  const periode = usePeriodeBande()
  const liste = useMemo(
    () =>
      [...factures]
        .filter((f) => (f.client?.nom || '').toLowerCase().includes(recherche.toLowerCase()))
        .filter((f) => periode.dansPeriode(f.date))
        .filter((f) => (lieuFiltre === 'tous' ? true : lieuFiltre === 'ferme' ? !venteHorsFerme(f) : lieuDeFacture(f)?.cle === lieuFiltre))
        .filter((f) => (filtre === 'tous' ? true : filtre === 'correctif' ? correctifEnCours(f) : factureStatut(f) === filtre))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [factures, recherche, filtre, lieuFiltre, periode.cle]
  )

  // Cumul de facturation — réservé à l'administration, recalculé selon la recherche
  // client + le filtre de statut déjà appliqués à `liste`. Sans filtre de statut
  // (« Toutes »), il mélange donc brouillon/en cours/certifiée, comme le total
  // affiché sur la période ; pour ne voir que le CA réellement acquis, filtrer sur
  // « Certifiées » — cf. l'en-tête ci-dessous : le CA n'est compté qu'à la certification.
  const cumulFacturation = useMemo(
    () => liste.reduce((s, f) => s + (calcTotaux(lignesEffectives(f), f.remise, f.tva).totalTTC || 0), 0),
    [liste]
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

  // Stock de Lomé et lignes du brouillon qui le dépassent (avertissement, jamais un blocage : le stock peut être en retard de saisie).
  const localites = useMemo(() => localitesAutres({ inventaires, factures, ajustements: pertesLome }), [inventaires, factures, pertesLome])
  const lieuModal = modal ? lieuDeFacture(modal.facture) : null
  const stockDuLieu = useMemo(
    () => (modal && lieuModal ? stockLome({ inventaires, factures, ajustements: pertesLome, especes, filtre: filtreDuLieu(modal.facture) }).lignes : []),
    [modal, lieuModal?.cle, inventaires, factures, pertesLome, especes] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const depassements = modal && lieuModal ? depassementsLome(modal.facture, stockDuLieu) : []

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
    if (f.lieuVente === 'autre' && !(f.localite || '').trim()) return toast.error('Indiquez la localité de vente')
    const { totalHT, totalTTC } = calcTotaux(lignes, f.remise, f.tva)
    const payload = { ...f, lignes, totalHT, totalTTC, localite: f.lieuVente === 'autre' ? f.localite.trim() : '' }
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
        await audit('agro', 'FACTURE', `${payload.numero} (brouillon) : ${formatMoney(totalTTC)}`)
        // Notification immédiate à la GE et au PAU (tout enregistrement doit les alerter).
        const especesFacture = [...new Set(lignes.map((l) => l.article).filter(Boolean))].join(', ')
        await notify({
          type: 'info',
          title: `Nouvelle facture : ${user.nom}`,
          body: `${payload.numero} · ${payload.client?.nom || ''}${especesFacture ? ` : ${especesFacture}` : ''} · ${formatMoney(totalTTC)}`,
          module: 'agro', forRoles: ['ge', 'df', 'pau'], excludeUid: user.uid || user.login, link: '/agro/factures'
        })
        toast.success('Brouillon créé ✓')
      }
      setModal(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Supprimable tant que la sortie n'a pas été approuvée (le stock n'a pas bougé). Par sécurité, tout stock déjà sorti serait rendu à la ferme.
  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.numero} ?\nL'action est définitive ; si du stock avait été sorti, il est réintégré.`)) return
    await run(async () => {
      await wfSupprimer(f)
      await audit('agro', 'FACTURE_DELETE', `${f.numero} (${factureStatut(f)})`)
    }, 'Facture supprimée')
  }

  // Info seul : supprime une facture certifiée et réintègre le stock sorti.
  async function supprimerCertifiee(f) {
    const lignes = lignesEffectives(f).filter((l) => l.articleId && (parseInt(l.qte) || 0) > 0).map((l) => `${l.qte} ${l.article}`).join(', ')
    const lome = venteHorsFerme(f)
    if (!confirm(`Supprimer la facture ${factureStatut(f) === 'certifiee' ? 'CERTIFIÉE ' : ''}${f.numero} (${f.client?.nom || ''}, ${formatMoney(calcTotaux(lignesEffectives(f), f.remise, f.tva).totalTTC)}) ?\n\n${lome ? 'Le stock du point de vente sera recalculé sans cette facture.' : `Le stock sorti (${lignes || 'aucun article'}) sera réintégré au stock de la ferme.`}\nLe chiffre d'affaires de cette facture disparaît. Action IRRÉVERSIBLE.`)) return
    if (!confirm(`Dernière confirmation : supprimer définitivement ${f.numero} ?`)) return
    await run(() => wfSupprimerCertifiee(f, user), 'Facture supprimée : stock réintégré')
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
    run(() => wfApprouver(f, user), '✅ Sortie approuvée : stock décompté')
  }
  async function refuserSortie(f) {
    const motif = prompt(`Refuser la sortie de la facture ${f.numero} ?\nMotif (optionnel) :`)
    if (motif === null) return
    run(() => wfRefuser(f, user, motif), 'Sortie refusée')
  }
  async function certifier(f) {
    const { totalTTC } = calcTotaux(lignesEffectives(f), f.remise, f.tva)
    if (!confirm(`Certifier la facture ${f.numero} pour ${formatMoney(totalTTC)} ? Elle deviendra définitive et imprimable.`)) return
    run(() => wfCertifier(f, user), '✅ Facture certifiée : CA enregistré, impression disponible')
  }
  async function signalerEcart(f) {
    const motif = prompt(`Signaler un écart sur la facture ${f.numero}\n(ex : reliquats retournés, pertes au marché)\nMessage à la hiérarchie :`)
    if (motif === null) return
    run(() => wfSignaler(f, user, motif), '📝 Demande de modification envoyée à la hiérarchie')
  }
  async function appliquerAjustement(f, ajustements) {
    await run(() => wfAjuster(f, user, ajustements), '✅ Quantités réelles ajustées : stock réajusté')
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
        a.push({ id: 'ec', label: 'Signaler un écart', icon: AlertTriangle, tone: 'ghost', compact: true, on: () => signalerEcart(f) })
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
    // Info seul : suppression d'une facture dont le stock est engagé (approuvée, écart, certifiée), avec réintégration du stock sorti.
    if (STATUTS_STOCK_ENGAGE.includes(st) && user?.role === 'info') {
      a.push({ id: 'delc', label: st === 'certifiee' ? 'Supprimer la facture certifiée' : 'Supprimer la facture (stock réintégré)', icon: Trash2, tone: 'danger', on: () => supprimerCertifiee(f) })
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
        title: 'Factures : MAXI-AGRO',
        subtitle: `${liste.length} facture(s)${filtre !== 'tous' ? ` : ${filtres.find(([v]) => v === filtre)?.[1]}` : ''}${recherche ? ` : recherche : « ${recherche} »` : ''}`,
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
      <BandeAgro icone={Receipt} titre="Facturation" sous="Factures clients, sorties de stock et certification">
        {periode.node}
        <ChampBande label="Lieu de vente">
          <select value={lieuFiltre} onChange={(e) => setLieuFiltre(e.target.value)} className={CLASSE_CHAMP_BANDE} aria-label="Filtrer par lieu de vente">
            <option value="tous">Tous les lieux</option>
            <option value="ferme">Ferme</option>
            <option value="lome">Lomé</option>
            {localites.map((l) => <option key={l.cle} value={l.cle}>{l.nom}</option>)}
          </select>
        </ChampBande>
        <ChampBande label="Client">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un client…" className={CLASSE_CHAMP_BANDE} />
        </ChampBande>
        {canExportExcel(role) && <BoutonBande icone={FileSpreadsheet} plein={false} onClick={exportXLSX}>Export Excel</BoutonBande>}
        {isAgent && <BoutonBande anime icone={Plus} onClick={openCreate}>Nouvelle facture</BoutonBande>}
      </BandeAgro>

      <FriseVente filtre={filtre} onFiltre={setFiltre}
        compte={{ brouillon: compteur('brouillon'), sortie_demandee: compteur('sortie_demandee'), sortie_approuvee: compteur('sortie_approuvee'), certifiee: compteur('certifiee'),
          refusee: compteur('refusee'), modif_demandee: compteur('modif_demandee'), correctif: factures.filter(correctifEnCours).length }} />

      {/* Cumul de facturation — réservé à l'administration (masqué à l'agent, cf.
          canViewFinance), recalculé selon la recherche + le filtre de statut ci-dessous. */}
      {estAdministration && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title={`Cumul facturation${filtre !== 'tous' ? ` (${(filtres.find(([v]) => v === filtre)?.[1] || filtre).replace(/ \(\d+\)$/, "")})` : ''}`}
            value={formatMoney(cumulFacturation)}
            sub={`${liste.length} facture${liste.length > 1 ? 's' : ''}${recherche ? ' · recherche filtrée' : ''}`}
            icon={Wallet} accent={COULEUR_MODULE.agro} />
        </div>
      )}


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
                  <tr key={f.id} className="group cursor-pointer hover:bg-gray-50" tabIndex={0} title="Cliquer pour voir le détail de la facture"
                    onClick={() => setDetail(f)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetail(f) }}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs group-hover:bg-gray-50">{f.numero}{venteHorsFerme(f) && <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-sky-700">{lieuDeFacture(f)?.nom || 'Autre localité'}</span>}</td>
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
                      {/* Les boutons d'action n'ouvrent pas le détail (le clic ne remonte pas à la ligne). */}
                      <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {actions(f).map((act) => (
                          <BoutonIcone3D key={act.id} icone={act.icon} label={act.label} couleur={COULEURS_ACTION[act.tone] || '#475569'} disabled={busy} onClick={act.on} />
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
      <ModalAgro open={!!modal} onClose={() => setModal(null)} size="xl" intro="Client, articles, remise et TVA : le brouillon part ensuite en demande de sortie."
        title={modal?.editId ? 'Modifier le brouillon' : 'Nouvelle facture (brouillon)'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer le brouillon</Button></>}>
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-x-3 md:grid-cols-6">
              <FormGroup label="Date" className="col-span-2 md:col-span-2"><Input type="date" value={modal.facture.date} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, date: e.target.value } }))} /></FormGroup>
              <FormGroup label="Client" required hint="Client existant ou nouveau nom" className="col-span-2 md:col-span-4">
                <ChampAutocomplete
                  value={modal.facture.client.nom}
                  suggestions={clientsConnus}
                  getLabel={(c) => c.nom}
                  onChange={(nom) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom } } }))}
                  onSelect={(connu) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom: connu.nom, tel: connu.tel, email: connu.email, adresse: connu.adresse } } }))}
                />
              </FormGroup>
              <FormGroup label="Téléphone" className="md:col-span-3"><Input value={modal.facture.client.tel} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Email" className="md:col-span-3"><Input value={modal.facture.client.email} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, email: e.target.value } } }))} /></FormGroup>
            </div>
            <div className="mt-2">
              <FormGroup label="Lieu de vente" hint="Hors de la ferme, la vente décompte le stock du point de vente (animaux envoyés depuis la ferme), pas celui de la ferme.">
                <Select value={modal.facture.lieuVente || 'ferme'} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, lieuVente: e.target.value } }))}>
                  <option value="ferme">Ferme</option>
                  <option value="lome">Lomé</option>
                  <option value="autre">Autre localité</option>
                </Select>
              </FormGroup>
              {modal.facture.lieuVente === 'autre' && (
                <FormGroup label="Localité de vente" required hint="Une localité déjà utilisée se propose en tapant son nom.">
                  <ChampAutocomplete
                    value={modal.facture.localite || ''}
                    suggestions={localites.map((l) => l.nom)}
                    placeholder="ex : Kara, Kpalimé…"
                    onChange={(v) => setModal((m) => ({ ...m, facture: { ...m.facture, localite: v } }))}
                  />
                </FormGroup>
              )}
              {depassements.length > 0 && (
                <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Stock de {lieuModal?.nom || 'la localité'} insuffisant : {depassements.map((d) => `${getArticle(d.id)?.nom || d.id} (demandé ${d.demande}, disponible ${d.stock})`).join(' ; ')}. Vérifiez que le transfert depuis la ferme a bien été saisi.
                </p>
              )}
              <FormGroup label="Apporté / recommandé par (membre de l'entreprise)" hint="Laissez vide si le client est venu en direct.">
                <ChampAutocomplete
                  value={modal.facture.apporteur || ''}
                  suggestions={users.map((u) => u.nom || u.login)}
                  placeholder="Nom du membre…"
                  onChange={(v) => setModal((m) => ({ ...m, facture: { ...m.facture, apporteur: v } }))}
                />
              </FormGroup>
            </div>

            <div className="fg-tuile mb-3 !p-0 overflow-x-auto">
              <p className="flex items-center gap-1.5 px-3 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-green-800"><Package size={14} aria-hidden="true" />Articles de la facture</p>
              <table className="mt-1 w-full text-sm">
                <thead className="bg-green-50/60 text-xs uppercase text-green-900/70">
                  <tr><th className="px-2 py-2 text-left">Article</th><th className="px-2 py-2">Qté</th><th className="px-2 py-2">Prix unit.</th><th className="px-2 py-2 text-right">Total</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modal.facture.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select value={l.articleId} onChange={(e) => pickArticle(i, e.target.value)}>
                          <option value="">Choisir</option>
                          {tousArticles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5"><Input type="number" min="1" className="w-20" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min="0" className="w-28" value={l.prixUnit} onChange={(e) => setLigne(i, { prixUnit: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(l.total)}</td>
                      <td className="px-2 py-1.5"><button onClick={() => removeLigne(i)} className="icone-verre icone-verre--danger rounded-xl p-1" aria-label="Supprimer la ligne"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addLigne}><Plus size={14} /> Ajouter une ligne</Button>

            <div className="mt-3 grid grid-cols-2 gap-x-3 md:grid-cols-4">
              <FormGroup label="Remise %" className="md:col-span-1"><Input type="number" min="0" max="100" value={modal.facture.remise} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, remise: parseFloat(e.target.value) || 0 } }))} /></FormGroup>
              <FormGroup label="TVA %" className="md:col-span-1"><Input type="number" min="0" max="100" value={modal.facture.tva} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, tva: parseFloat(e.target.value) || 0 } }))} /></FormGroup>
              <div className="relative col-span-2 mb-3 flex flex-col justify-center overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(22,101,52,0.7),inset_0_1px_0_rgba(255,255,255,0.45)]"
                style={{ background: 'linear-gradient(135deg, #2EAA3Ff2 0%, #14532dee 100%)' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <p className="relative text-xs text-white/85">Total HT : <strong>{formatMoney(totaux.totalHT)}</strong></p>
                <p className="relative text-[11px] font-bold uppercase tracking-wide text-white/80">Total TTC</p>
                <p className="relative text-2xl font-extrabold tabular-nums">{formatMoney(totaux.totalTTC)}</p>
              </div>
            </div>
          </>
        )}
      </ModalAgro>

      {/* Modal écart : ajustement des quantités réelles par la hiérarchie */}
      {/* Consultation d'une facture — lecture seule */}
      <ModalAgro open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.agro)}
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
                  {CORRECTIF_STATUTS[detail.correctif.statut]?.label} : demandé par {detail.correctif.parNom}
                  {detail.correctif.traitePar ? `, tranché par ${detail.correctif.traitePar}` : ''}
                  {detail.correctif.motif ? ` · « ${detail.correctif.motif} »` : ''}
                </p>
              )}
            </FicheDetail>
          )
        })()}
      </ModalAgro>

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
