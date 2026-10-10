// Ventes briques — création de commandes, liées aux autorisations de sortie.
import { useMemo, useState } from 'react'
import BandeauFiltreIds, { useFiltreIds } from '../../shared/ui/FiltreIds'
import { Plus, Send, Trash2, Eye, Pencil, ShoppingCart, Wallet, FileSpreadsheet, AlertTriangle, Receipt, Boxes, CalendarDays, UserRound, Info, Ban } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import ChampRecherche from '../../shared/ui/ChampRecherche'
import FicheDetail from '../../shared/ui/FicheDetail'
import ActionIcone from '../../shared/ui/ActionIcone'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { TitreSection, BoutonAjout } from '../logistique/PrestationFormUI'
import { VenteHero, BoutonBascule } from './VenteUI'
import { resoudreClientBriq } from './clientAuto'
import { demanderAutorisationVente, facturerVente } from './venteActions'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateItem, removeItem, setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { demanderMotif } from '../../core/motifSuppression'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { isReadOnlyRole, isFullAccessRole, canViewFinance, canExportExcel } from '../../core/roles'
import { dernierStockBriques, appliquerDeltasStockBriques } from './logic'

const PROFESSIONS = ['Maçon', 'Architecte', 'Entrepreneur BTP', 'Ingénieur', 'Promoteur immobilier', 'Particulier', 'Revendeur', 'Autre']

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  en_attente: { label: 'Autorisation requise', tone: 'warning' },
  autorisee: { label: 'Autorisée', tone: 'success' },
  chargee: { label: 'Chargée / Partie', tone: 'info' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

export default function Ventes() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  // Les agents modifient/créent partout mais ne suppriment jamais (décision explicite).
  const peutSupprimer = isFullAccessRole(role)
  // L'administration (Info compris, cf. isFullAccessRole) peut modifier une vente à
  // TOUT statut (stock/facture réajustés dans save()) ; un agent uniquement tant
  // qu'elle est encore un brouillon (rien n'a encore bougé en stock/facturation).
  const peutModifierVente = (v) => v.statut !== 'annulee' && (isFullAccessRole(role) || (!lectureSeule && v.statut === 'brouillon'))
  const estAdministration = canViewFinance(role)
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: clients } = useCollection('evenementiel_clients')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: factures } = useCollection('evenementiel_factures')
  const briques = useBriqueterieStore((s) => s.briques)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)   // vente consultée
  const [toDelete, setToDelete] = useState(null)
  const [suppression, setSuppression] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState(null)
  // Agents et administration : demandent l'autorisation et facturent depuis la vente.
  const peutAgir = !lectureSeule && (role === 'agent' || isFullAccessRole(role))
  const stockDe = (briqueId) => dernierStockBriques(inventaires, briqueId, briqueId === 'caillasses' ? 'caillasses' : 'pret')
  // Suggestions de clients : les fiches strictement identiques (même nom, même téléphone) ne comptent qu'une fois.
  const clientsUniques = useMemo(() => {
    const vus = new Map()
    clients.forEach((x) => {
      const k = `${(x.nom || '').trim().toLowerCase()}|${(x.telephone || '').replace(/ /g, '')}`
      if (!vus.has(k)) vus.set(k, x)
    })
    return [...vus.values()]
  }, [clients])

  async function demanderAutorisation(v) {
    if (busyAction) return
    setBusyAction(v.id)
    try {
      const r = await demanderAutorisationVente({ vente: v, user, demandes, inventaires, dateSortie: v.dateChargement, message: `Sortie de briques pour ${v.clientNom || 'le client'}` })
      toast.success(`Autorisation ${r.num} envoyée à la hiérarchie ✓`)
      if (r.destinataires === 0) toast.warning(`Aucun validateur n'a accès au module Briqueterie : personne n'a été alerté. Prévenez la hiérarchie.`)
      setDetail(null)
    } catch (e) { toast.error(e.message) } finally { setBusyAction(null) }
  }
  async function facturer(v) {
    if (busyAction) return
    setBusyAction(v.id)
    try {
      const r = await facturerVente({ vente: v, clients, factures, user })
      toast.success(`Facture ${r.numero} émise ✓ : visible dans Facturation`)
      setDetail(null)
    } catch (e) { toast.error(e.message) } finally { setBusyAction(null) }
  }
  const peutDemander = (v) => peutAgir && v.statut === 'brouillon'
  const peutFacturer = (v) => peutAgir && v.statut === 'autorisee' && !factures.some((f) => f.venteId === v.id)

  // Filtre de tri — période (Jour / Mois / Plage), client et statut — même
  // composant et même comportement que la Facturation MAXI LOGISTIQUE.
  const [modePeriode, setModePeriode] = useState('jour')
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreClient, setFiltreClient] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour

  const filtreIds = useFiltreIds()
  const liste = useMemo(() => {
    let rows = [...ventes]
    // Lien d'une alerte : uniquement les dossiers concernés, sans tenir compte des autres filtres.
    if (filtreIds.ids) return rows.filter((x) => filtreIds.ids.has(x.id)).sort((a, b) => (a.date < b.date ? 1 : -1))
    if (modePeriode === 'mois' && filtreMois) {
      rows = rows.filter((v) => (v.date || '').startsWith(filtreMois))
    } else if (modePeriode === 'annee' && filtreAnnee) {
      rows = rows.filter((v) => (v.date || '').startsWith(filtreAnnee))
    } else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      rows = rows.filter((v) => (!filtreDebut || v.date >= filtreDebut) && (!filtreFin || v.date <= filtreFin))
    } else if (modePeriode === 'jour' && filtreJour) {
      rows = rows.filter((v) => v.date === filtreJour)
    }
    if (filtreStatut) rows = rows.filter((v) => v.statut === filtreStatut)
    if (filtreClient.trim()) {
      const q = filtreClient.trim().toLowerCase()
      rows = rows.filter((v) => (v.clientNom || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [ventes, filtreIds.ids, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtreStatut, filtreClient])

  // Cumul des ventes — réservé à l'administration, recalculé selon les filtres
  // ci-dessus (période, statut, client) : sans filtre de statut, il mélange donc
  // tous les statuts (brouillon compris), comme la valeur brute déjà affichée.
  const cumulVentes = useMemo(() => liste.filter((v) => v.statut !== 'annulee').reduce((s, v) => s + (Number(v.total) || 0), 0), [liste])

  function openCreate() {
    setForm({
      id: null,
      clientId: '', clientNom: '', clientTel: '', clientAdresse: '', clientProfession: '',
      dateChargement: todayStr(),
      lignes: [{ briqueId: briques.find((b) => b.id !== 'caillasses')?.id || '', qte: 100, prixUnitaire: 350 }],
      notes: '', demanderAussi: false
    })
    setOpen(true)
  }

  // Modifier — ouvert aux agents comme à l'administration (Info compris). Un
  // agent seulement tant que la vente est un BROUILLON ; l'administration à tout
  // statut, save() réajustant alors le stock déjà décrémenté et la facture liée
  // (cf. peutModifierVente).
  function openEdit(v) {
    const cl = clients.find((c) => c.id === v.clientId) || clients.find((c) => (c.nom || '').trim().toLowerCase() === (v.clientNom || '').trim().toLowerCase())
    setForm({
      id: v.id,
      clientId: v.clientId || '',
      clientNom: v.clientNom || '',
      clientTel: cl?.telephone || '', clientAdresse: cl?.adresse || '', clientProfession: cl?.profession || '',
      dateChargement: v.dateChargement || todayStr(),
      lignes: (v.lignes || []).map((l) => ({ briqueId: l.briqueId, qte: l.qte, prixUnitaire: l.prixUnitaire })),
      notes: v.notes || ''
    })
    setOpen(true)
  }

  const totalForm = useMemo(() => {
    if (!form) return 0
    return form.lignes.reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.prixUnitaire) || 0), 0)
  }, [form])

  // Un second clic pendant l'enregistrement créait la vente (et le client) en double.
  async function save() {
    if (saving) return
    setSaving(true)
    try { await enregistrer() } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function enregistrer() {
    if (!form.clientNom?.trim() && !form.clientId) return toast.error('Client requis')
    // Vente déjà certifiée (administration uniquement, cf. peutModifierVente) :
    // le stock a déjà été décrémenté pour les quantités ACTUELLES — seul le
    // SURPLUS éventuel (nouvelle qté − ancienne qté) doit encore trouver de la
    // place ; la quantité déjà sortie n'est pas à re-vérifier.
    const vAvant = form.id ? ventes.find((v) => v.id === form.id) : null
    const dejaCertifiee = vAvant && (vAvant.statut === 'autorisee' || vAvant.statut === 'chargee')
    const ancienneQte = (briqueId) => (vAvant?.lignes || []).filter((l) => l.briqueId === briqueId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    for (const l of form.lignes) {
      const stock = dernierStockBriques(inventaires, l.briqueId, l.briqueId === 'caillasses' ? 'caillasses' : 'pret')
      const dispo = dejaCertifiee ? stock + ancienneQte(l.briqueId) : stock
      if ((parseInt(l.qte) || 0) > dispo) {
        const b = briques.find((x) => x.id === l.briqueId)
        return toast.error(`Stock insuffisant pour ${b?.nom} (${dispo} disponible)`)
      }
    }
    // Client retrouvé ou créé automatiquement dans le volet Clients.
    const client = await resoudreClientBriq({ clients, clientId: form.clientId, nom: form.clientNom, telephone: form.clientTel, adresse: form.clientAdresse, profession: form.clientProfession })
    const lignes = form.lignes.map((l) => {
      const b = briques.find((x) => x.id === l.briqueId)
      const qte = parseInt(l.qte) || 0
      const pu = parseFloat(l.prixUnitaire) || b?.tarifVente || 0
      return { briqueId: b?.id, briqueNom: b?.nom, qte, prixUnitaire: pu, montant: qte * pu }
    })
    const total = lignes.reduce((s, l) => s + l.montant, 0)
    if (form.id) {
      await updateItem('evenementiel_ventes', form.id, {
        clientId: client.id, clientNom: client.nom,
        dateChargement: form.dateChargement, lignes, total, notes: form.notes
      })
      if (dejaCertifiee) {
        // Répercute l'écart de quantités par brique sur le stock déjà décrémenté
        // (delta > 0 → on sort le surplus ; delta < 0 → l'excédent rentre au stock).
        const briqueIds = new Set([...(vAvant.lignes || []).map((l) => l.briqueId), ...lignes.map((l) => l.briqueId)])
        const deltas = [...briqueIds].map((id) => {
          const apres = lignes.filter((l) => l.briqueId === id).reduce((s, l) => s + (l.qte || 0), 0)
          return { id, delta: apres - ancienneQte(id) }
        }).filter((d) => d.id && d.delta !== 0)
        if (deltas.length) {
          const maj = appliquerDeltasStockBriques(inventaires, deltas)
          if (maj) {
            await setItem('evenementiel_inventaires', maj.date, {
              ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(),
              agentId: user.uid, agentNom: user.nom
            })
          }
        }
        // Répercute le nouveau montant sur la facture déjà émise, s'il y en a une.
        const facture = factures.find((f) => f.venteId === form.id)
        if (facture) await updateItem('evenementiel_factures', facture.id, { totalHT: total, totalTTC: total })
      }
      await audit('evenementiel', 'VENTE_EDIT', `${vAvant?.num || form.id}${dejaCertifiee ? ` (${STATUTS[vAvant.statut]?.label || vAvant.statut} : stock/facture réajustés)` : ''}`)
      toast.success('Vente modifiée ✓')
    } else {
      const num = genNumero('VTE', ventes.length)
      const idVente = await addItem('evenementiel_ventes', {
        num, date: todayStr(), clientId: client.id, clientNom: client.nom,
        dateChargement: form.dateChargement, lignes, total,
        statut: 'brouillon', notes: form.notes, agentNom: user.nom, agentId: user.uid
      })
      await audit('evenementiel', 'VENTE', num)
      if (form.demanderAussi && peutAgir) {
        // Option « tout de suite » : l'autorisation de sortie part dès l'enregistrement.
        try {
          const r = await demanderAutorisationVente({
            vente: { id: idVente, num, clientNom: client.nom, lignes, dateChargement: form.dateChargement },
            user, demandes, inventaires, dateSortie: form.dateChargement, message: `Sortie de briques pour ${client.nom}`
          })
          toast.success(`Vente ${num} créée et autorisation ${r.num} envoyée à la hiérarchie ✓`)
          if (r.destinataires === 0) toast.warning(`Aucun validateur n'a accès au module Briqueterie : personne n'a été alerté. Prévenez la hiérarchie.`)
        } catch (e) { toast.error(`Vente créée, mais l'autorisation n'a pas pu être demandée : ${e.message}`) }
      } else {
        toast.success("Vente créée ✓ : demandez maintenant l'autorisation de sortie avant le chargement")
      }
    }
    setOpen(false)
  }

  // Suppression — administration + Info, à TOUT statut (pas seulement brouillon) :
  //  - brouillon / en_attente : le stock n'a pas encore bougé, simple suppression
  //    (+ l'autorisation en attente liée, si elle existe, pour ne rien laisser
  //    d'orphelin).
  //  - autorisée / chargée : le stock a déjà été décrémenté à la certification —
  //    on le restaure (quantités remises en stock « prêt »/« caillasses »), puis
  //    on supprime l'autorisation et la facture liées s'il y en a.
  async function confirmerSuppression() {
    const v = toDelete
    if (!v || suppression) return
    setSuppression(true)
    try {
      if (v.statut === 'autorisee' || v.statut === 'chargee') {
        const deltas = (v.lignes || []).map((l) => ({ id: l.briqueId, delta: -(parseInt(l.qte) || 0) }))
        const maj = appliquerDeltasStockBriques(inventaires, deltas)
        if (maj) {
          await setItem('evenementiel_inventaires', maj.date, {
            ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(),
            agentId: user.uid, agentNom: user.nom
          })
        }
      }
      const demande = demandes.find((d) => d.venteId === v.id)
      if (demande) await removeItem('evenementiel_demandes', demande.id)
      const facture = factures.find((f) => f.venteId === v.id)
      if (facture) await removeItem('evenementiel_factures', facture.id)
      await removeItem('evenementiel_ventes', v.id)
      await audit('evenementiel', 'VENTE_DELETE',
        `${v.num} : ${v.clientNom || ''}${v.statut !== 'brouillon' ? ` (${STATUTS[v.statut]?.label || v.statut} : stock restauré)` : ''}`)
      toast.success('Vente supprimée ✓')
      setToDelete(null)
    } catch (e) {
      toast.error(e?.message || 'La suppression a échoué')
    } finally {
      setSuppression(false)
    }
  }

  // Annuler une vente (administration + Info) : les briques reviennent en stock « prêt » / « caillasses »,
  // l'autorisation et la facture liées sont retirées, et la vente reste visible, marquée « Annulée ».
  async function annulerVente(v) {
    if (!peutSupprimer || v.statut === 'annulee' || busyAction) return
    const motif = await demanderMotif({ libelle: `Annuler la vente ${v.num} : ${v.clientNom || ''}` })
    if (!motif) return
    setBusyAction(v.id)
    try {
      if (v.statut === 'autorisee' || v.statut === 'chargee') {
        const maj = appliquerDeltasStockBriques(inventaires, (v.lignes || []).map((l) => ({ id: l.briqueId, delta: -(parseInt(l.qte) || 0) })))
        if (maj) {
          await setItem('evenementiel_inventaires', maj.date, { ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts(), agentId: user.uid, agentNom: user.nom })
        }
      }
      const demande = demandes.find((d) => d.venteId === v.id)
      if (demande) await removeItem('evenementiel_demandes', demande.id, { motif })
      const facture = factures.find((f) => f.venteId === v.id)
      if (facture) await removeItem('evenementiel_factures', facture.id, { motif })
      await updateItem('evenementiel_ventes', v.id, { statut: 'annulee', annuleeLe: Date.now(), annuleePar: user.nom, motifAnnulation: motif })
      await audit('evenementiel', 'VENTE_ANNULEE', `${v.num} : ${v.clientNom || ''}${v.statut === 'autorisee' || v.statut === 'chargee' ? ' : stock de briques rétabli' : ''} : motif : ${motif}`)
      toast.success('Vente annulée : briques rétablies en stock')
      setDetail(null)
    } catch (e) { toast.error(e.message) } finally { setBusyAction(null) }
  }

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les ventes actuellement affichées (période, statut, client, tri déjà
  // appliqués à `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((v) => ({
      'N°': v.num,
      'Date': formatDateShort(v.date),
      'Client': v.clientNom || '—',
      'Chargement': formatDateShort(v.dateChargement),
      'Brique(s)': (v.lignes || []).filter((l) => (l.briqueNom || '').trim()).map((l) => `${l.briqueNom} ×${formatNumber(l.qte)}`).join(', '),
      'Montant': Number(v.total) || 0,
      'Statut': (STATUTS[v.statut] || { label: v.statut }).label
    }))
    exportRapportExcel({
      filename: `ventes-briqueterie-${todayStr()}.xlsx`,
      sections: [{
        name: 'Ventes Briqueterie',
        title: 'Ventes : Briqueterie',
        subtitle: `${liste.length} vente(s)${filtreStatut ? ` : ${STATUTS[filtreStatut]?.label}` : ''}${filtrePeriodeActif ? ' : période filtrée' : ''}${filtreClient.trim() ? ` : client : « ${filtreClient} »` : ''}`,
        columns: [
          { key: 'N°', label: 'N°', width: 14 },
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 22 },
          { key: 'Chargement', label: 'Chargement', width: 14 },
          { key: 'Brique(s)', label: 'Brique(s)', width: 40 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'Statut', label: 'Statut', width: 16 }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Montant': rows.reduce((s, r) => s + (r['Montant'] || 0), 0) }
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(71,85,105,0.35),0_8px_20px_-8px_rgba(71,85,105,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(138,155,179,0.92) 0%, rgba(100,116,139,0.9) 40%, rgba(51,65,85,0.88) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#475569', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <ShoppingCart size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Ventes</h2>
          <p className="text-sm text-white/80">Commandes clients : chargement et autorisation de sortie</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <ChampRecherche variant="glass" value={filtreClient} onChange={setFiltreClient} placeholder="Rechercher un client…" />
        <div className="flex flex-wrap gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
          {[['', 'Tous'], ...Object.entries(STATUTS).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${filtreStatut === v ? 'bg-white text-slate-700' : 'text-white/80 hover:bg-white/20'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 to-white/70 px-4 py-3 text-sm text-slate-900 shadow-[0_10px_22px_-16px_rgba(71,85,105,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#475569')}><Info size={16} /></span>
        <span>
          Circuit : <strong>vente</strong> → <strong>autorisation</strong> (approbation gérant, certification Direction / GE) → <strong>facture</strong>. Le client se crée tout seul avec la vente.{' '}
          <Link to="/evenementiel/demandes" className="font-semibold underline">Voir les autorisations</Link>
        </span>
      </div>
      {estAdministration && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title={`Cumul des ventes${filtreStatut ? ` (${STATUTS[filtreStatut]?.label.toLowerCase()})` : ''}`}
            value={formatMoney(cumulVentes)}
            sub={`${liste.length} vente${liste.length > 1 ? 's' : ''}${!filtreStatut ? ' · tous statuts confondus' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}${filtreClient.trim() ? ' · client filtré' : ''}`}
            icon={Wallet} accent={COULEUR_MODULE.evenementiel} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <style>{`
          @keyframes vt-balayage { 0% { transform: translateX(-130%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
          @keyframes vt-panier { 0%, 55%, 100% { transform: translateY(0) rotate(0deg); } 62% { transform: translateY(1px) rotate(-5deg); } 72% { transform: translateY(0) rotate(4deg); } }
          @keyframes vt-brique { 0% { opacity: 0; transform: translateY(-4px); } 15% { opacity: 1; } 55% { opacity: 1; transform: translateY(9px); } 62%, 100% { opacity: 0; transform: translateY(11px); } }
          @keyframes vt-plus { 0%, 65%, 100% { transform: rotate(0deg) scale(1); } 80% { transform: rotate(90deg) scale(1.25); } 92% { transform: rotate(90deg) scale(1); } }
          @keyframes vt-fichier { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        `}</style>
        {canExportExcel(role) && (
          <button type="button" onClick={exportXLSX}
            className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/60 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-[0_10px_22px_-12px_rgba(71,85,105,0.45),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_14px_26px_-12px_rgba(71,85,105,0.55)]">
            <FileSpreadsheet size={16} style={{ animation: 'vt-fichier 2.8s ease-in-out infinite' }} /> Export Excel
          </button>
        )}
        {!lectureSeule && (
          <button type="button" onClick={openCreate}
            className="group relative flex items-center gap-2 overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(71,85,105,0.7),inset_0_1px_0_0_rgba(255,255,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-10px_rgba(71,85,105,0.85)] active:translate-y-0"
            style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #64748b 45%, #334155 100%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" style={{ animation: 'vt-balayage 3.2s ease-in-out infinite' }} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            {/* Nouvelle vente : une brique tombe dans le panier, le « + » pivote de temps en temps. */}
            <span className="relative flex h-6 w-6 items-center justify-center">
              <span aria-hidden="true" className="absolute -top-2 left-1 h-1.5 w-3 rounded-[3px]" style={{ background: 'linear-gradient(180deg, #fb923c, #c2410c)', animation: 'vt-brique 2.6s ease-in infinite' }} />
              <ShoppingCart size={19} style={{ animation: 'vt-panier 2.6s ease-in-out infinite' }} />
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-700 shadow"><Plus size={11} strokeWidth={3.4} style={{ animation: 'vt-plus 4s ease-in-out infinite' }} /></span>
            </span>
            <span className="relative">Nouvelle vente</span>
          </button>
        )}
      </div>

      <BandeauFiltreIds filtre={filtreIds} total={liste.length} accent={COULEUR_MODULE.evenementiel} libelle="vente" />
      <Card className="p-0">
        <Table
          stickyHeader
          onRowClick={(r) => setDetail(r)}
          emptyIcon={ShoppingCart}
          columns={[
            { key: 'num', label: 'N°', sticky: true, width: '95px', render: (r) => <NumDoc num={r.num} /> },
            { key: 'clientNom', label: 'Client', render: (r) => (
              <span className="flex items-center gap-2">
                <AvatarNom nom={r.clientNom} size={26} accent={COULEUR_MODULE.evenementiel} className="hidden sm:inline-flex" />
                <span className="font-semibold">{r.clientNom}</span>
              </span>
            ) },
            { key: 'dateChargement', label: 'Chargement', render: (r) => formatDateShort(r.dateChargement) },
            { key: 'total', label: 'Montant', align: 'right', render: (r) => <strong className="whitespace-nowrap">{formatMoney(r.total)}</strong> },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <ActionIcone icone={Eye} tone="voir" title="Voir le détail" onClick={() => setDetail(r)} />
                {peutDemander(r) && <ActionIcone icone={Send} tone="#475569" title="Demander l'autorisation de sortie" disabled={busyAction === r.id} onClick={() => demanderAutorisation(r)} />}
                {peutFacturer(r) && <ActionIcone icone={Receipt} tone="valider" title="Facturer cette vente" disabled={busyAction === r.id} onClick={() => facturer(r)} />}
                {peutModifierVente(r) && <ActionIcone icone={Pencil} tone="modifier" title="Modifier la vente" onClick={() => openEdit(r)} />}
                {peutSupprimer && ['en_attente', 'autorisee', 'chargee'].includes(r.statut) && <ActionIcone icone={Ban} tone="#B45309" title="Annuler la vente (le stock est rétabli)" disabled={busyAction === r.id} onClick={() => annulerVente(r)} />}
                {peutSupprimer && <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer la vente" onClick={() => setToDelete(r)} />}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune vente."
        />
      </Card>

      {/* Consultation d'une vente : briques animées, tuiles, actions rapides */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
        title={detail ? `Vente ${detail.num}` : ''}
        footer={<>
          {detail && peutDemander(detail) && <Button loading={busyAction === detail.id} onClick={() => demanderAutorisation(detail)}><Send size={15} /> Demander l'autorisation</Button>}
          {detail && peutFacturer(detail) && <Button variant="success" loading={busyAction === detail.id} onClick={() => facturer(detail)}><Receipt size={15} /> Facturer</Button>}
          {detail && peutModifierVente(detail) && <Button variant="outline" onClick={() => { const d = detail; setDetail(null); openEdit(d) }}><Pencil size={15} /> Modifier</Button>}
          {detail && peutSupprimer && ['en_attente', 'autorisee', 'chargee'].includes(detail.statut) && <Button variant="outline" loading={busyAction === detail.id} onClick={() => annulerVente(detail)}><Ban size={15} /> Annuler la vente</Button>}
          {detail && peutSupprimer && <Button variant="danger" onClick={() => { const d = detail; setDetail(null); setToDelete(d) }}><Trash2 size={15} /> Supprimer</Button>}
          <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
        </>}>
        {detail && (
          <FicheDetail
            hero={<VenteHero sous="Vente de briques" titre={`${detail.num} : ${detail.clientNom || ''}`}
              pastilles={[{ label: STATUTS[detail.statut]?.label || detail.statut, tone: STATUTS[detail.statut]?.tone }]}
              total={Number(detail.total) || 0} voitMontants />}
            entetes={[
              { label: 'Date de la vente', value: formatDateShort(detail.date) },
              { label: 'Chargement prévu', value: formatDateShort(detail.dateChargement) },
              { label: 'Enregistrée par', value: detail.agentNom },
              { label: 'Notes', value: detail.notes }
            ]}
            colonnes={[
              { label: 'Brique', render: (l) => l.briqueNom || '—' },
              { label: 'Quantité', align: 'center', render: (l) => formatNumber(l.qte) },
              { label: 'Prix unitaire', align: 'right', render: (l) => formatMoney(l.prixUnitaire || 0) },
              { label: 'Montant', align: 'right', render: (l) => formatMoney(l.montant || 0) }
            ]}
            lignes={detail.lignes || []}
            vide="Aucune brique sur cette vente."
            pied={[
              { label: 'Total briques', value: formatNumber((detail.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)) },
              { label: 'Montant total', value: detail.total || 0, fort: true }
            ]}
          />
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
        title={form?.id ? 'Modifier la vente' : 'Nouvelle vente'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save} loading={saving}>{form?.id ? 'Mettre à jour' : 'Enregistrer'}</Button></>}>
        {form && (
          <div className="space-y-3">
            {form.id && ventes.find((v) => v.id === form.id)?.statut !== 'brouillon' && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 backdrop-blur-md">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  Cette vente est déjà <strong>{(STATUTS[ventes.find((v) => v.id === form.id)?.statut]?.label || '').toLowerCase()}</strong> :
                  modifier les quantités réajustera automatiquement le stock déjà sorti et la facture liée, s'il y en a une.
                </span>
              </div>
            )}
            <VenteHero sous="Briques" titre={form.id ? 'Modifier la vente' : 'Nouvelle vente'} voitMontants total={totalForm} />

            <div className="grid grid-cols-2 gap-x-3">
              <FormGroup required className="col-span-2"
                label={<span className="inline-flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(COULEUR_MODULE.evenementiel)}><UserRound size={13} /></span>Client</span>}>
                {/* Saisie libre : les clients connus sont proposés et la liste se filtre à chaque lettre. */}
                <div className="relative">
                  <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
                  <ChampAutocomplete accent="slate" className="input-base pl-9" autoFocus={!form.id}
                    value={form.clientNom} placeholder="Tapez le nom du client…"
                    suggestions={clientsUniques} getLabel={(c) => (c.nom || '').trim()} getDetail={(c) => c.telephone || ''} maxSuggestions={12}
                    emptyLabel="Nouveau client : il sera ajouté automatiquement."
                    onChange={(t) => setForm((f) => ({ ...f, clientNom: t, clientId: '' }))}
                    onSelect={(c) => setForm((f) => ({ ...f, clientId: c.id, clientNom: (c.nom || '').trim(), clientTel: c.telephone || '', clientAdresse: c.adresse || '', clientProfession: c.profession || '' }))} />
                </div>
                {form.clientNom.trim() && (
                  clients.some((c) => c.id === form.clientId || (c.nom || '').trim().toLowerCase() === form.clientNom.trim().toLowerCase())
                    ? <p className="mt-1.5 text-[11px] font-semibold text-green-600">Client existant ✓ : ses coordonnées sont reprises.</p>
                    : <p className="mt-1.5 text-[11px] font-semibold text-sky-600">Nouveau client : il sera ajouté automatiquement au volet Clients.</p>
                )}
              </FormGroup>
              <FormGroup label="Téléphone du client"><Input type="tel" value={form.clientTel} onChange={(e) => setForm((f) => ({ ...f, clientTel: e.target.value }))} placeholder="ex : 90 00 00 00" /></FormGroup>
              <FormGroup label="Profession" hint="pour les statistiques">
                <Input list="briq-prof-vente" value={form.clientProfession} onChange={(e) => setForm((f) => ({ ...f, clientProfession: e.target.value }))} placeholder="ex : Maçon" />
                <datalist id="briq-prof-vente">{PROFESSIONS.map((x) => <option key={x} value={x} />)}</datalist>
              </FormGroup>
              <FormGroup label="Adresse (facultatif)"><Input value={form.clientAdresse} onChange={(e) => setForm((f) => ({ ...f, clientAdresse: e.target.value }))} /></FormGroup>
              <FormGroup label="Date de chargement">
                <div className="relative">
                  <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
                  <Input className="pl-9" type="date" value={form.dateChargement} onChange={(e) => setForm((f) => ({ ...f, dateChargement: e.target.value }))} />
                </div>
              </FormGroup>
            </div>

            <div className="tuile-verre">
              <TitreSection icone={Boxes} titre="Briques vendues" accent={COULEUR_MODULE.evenementiel} />
              <div className="space-y-2">
                {form.lignes.map((l, i) => {
                  const stock = stockDe(l.briqueId)
                  const qte = parseInt(l.qte) || 0
                  const insuffisant = qte > stock
                  return (
                    <div key={i} className="rounded-2xl border border-white/80 bg-white/60 p-2 shadow-[0_8px_16px_-14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)]">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                        <Select className="col-span-2 md:col-span-5" value={l.briqueId} onChange={(e) => {
                          const b = briques.find((x) => x.id === e.target.value)
                          setForm((f) => {
                            const lignes = [...f.lignes]
                            lignes[i] = { ...lignes[i], briqueId: e.target.value, prixUnitaire: b?.tarifVente || 0 }
                            return { ...f, lignes }
                          })
                        }}>
                          {briques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                        </Select>
                        <Input className="md:col-span-2" type="number" min="1" value={l.qte} placeholder="Qté" onChange={(e) => {
                          setForm((f) => { const lignes = [...f.lignes]; lignes[i] = { ...lignes[i], qte: e.target.value }; return { ...f, lignes } })
                        }} />
                        <Input className="md:col-span-2" type="number" min="0" value={l.prixUnitaire} placeholder="Prix" onChange={(e) => {
                          setForm((f) => { const lignes = [...f.lignes]; lignes[i] = { ...lignes[i], prixUnitaire: e.target.value }; return { ...f, lignes } })
                        }} />
                        <div className="col-span-2 flex items-center justify-end font-bold text-secondary md:col-span-3">{formatMoney(qte * (parseFloat(l.prixUnitaire) || 0))}</div>
                      </div>
                      <p className={`mt-1.5 flex items-center gap-1 text-[11px] ${insuffisant ? 'font-bold text-red-600' : 'text-gray-500'}`}>
                        {insuffisant && <AlertTriangle size={11} className="animate-pulse" />}
                        Stock prêt : {formatNumber(stock)}{insuffisant ? ` : insuffisant pour ${formatNumber(qte)} brique(s)` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2.5">
                <BoutonAjout onClick={() => setForm((f) => ({ ...f, lignes: [...f.lignes, { briqueId: briques[0]?.id, qte: 100, prixUnitaire: briques[0]?.tarifVente || 0 }] }))}>Ligne</BoutonAjout>
              </div>
            </div>

            {form.lignes.some((l) => (parseInt(l.qte) || 0) > stockDe(l.briqueId)) && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-xs text-red-800 backdrop-blur-md">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 animate-pulse text-red-500" />
                <span>Stock insuffisant pour au moins une brique : l'enregistrement sera refusé tant que la quantité dépasse le stock prêt.</span>
              </div>
            )}

            {!form.id && peutAgir && (
              <BoutonBascule actif={!!form.demanderAussi} onClick={() => setForm((f) => ({ ...f, demanderAussi: !f.demanderAussi }))}
                titre="Créer la vente et demander l'autorisation tout de suite"
                titreActif="Vente et demande d'autorisation activées"
                texte="Cliquez pour envoyer l'autorisation de sortie à la hiérarchie dès l'enregistrement (chargement à la date choisie)."
                texteActif="À l'enregistrement : la vente est créée et l'autorisation de sortie part aux validateurs. Cliquez pour annuler." />
            )}

            <div className="relative flex items-center justify-between overflow-hidden rounded-[1.1rem] p-4 text-white shadow-[0_16px_28px_-14px_rgba(71,85,105,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]"
              style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #475569 55%, #1e293b 100%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <p className="relative text-[11px] font-bold uppercase tracking-wide text-white/80">Total de la vente</p>
              <p className="relative text-2xl font-extrabold leading-tight">{formatMoney(totalForm)}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation de suppression — le contenu s'adapte selon que le stock a
          déjà été décrémenté ou non (cf. confirmerSuppression). */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette vente ?"
        {...glassModalProps('#dc2626')}
        footer={<>
          <Button variant="outline" onClick={() => setToDelete(null)} disabled={suppression}>Annuler</Button>
          <Button variant="danger" onClick={confirmerSuppression} loading={suppression}>
            <Trash2 size={15} /> Supprimer
          </Button>
        </>}>
        {toDelete && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Supprimer la vente <strong>{toDelete.num}</strong> ({toDelete.clientNom}) : {formatMoney(toDelete.total)}.
                {toDelete.statut !== 'brouillon' && (
                  <> Cette vente est <strong>{(STATUTS[toDelete.statut]?.label || toDelete.statut).toLowerCase()}</strong> : le stock déjà sorti sera <strong>restauré</strong>, et l'autorisation{demandes.some((d) => d.venteId === toDelete.id) || factures.some((f) => f.venteId === toDelete.id) ? '/la facture liée' : ' liée'} sera supprimée avec elle.</>
                )}
              </span>
            </div>
            <p className="text-xs text-gray-500">Action irréversible : tracée dans le Journal.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
