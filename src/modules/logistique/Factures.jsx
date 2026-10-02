// Facturation logistique — émission obligatoire avant demande d'autorisation de sortie.
import { useMemo, useState } from 'react'
import { FileText, FileSpreadsheet, Plus, Trash2, Pencil, Eye, Wallet, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { logistiqueVoitMontants, logistiqueVoitValidateur, canViewFinance, canExportExcel, isFullAccessRole } from '../../core/roles'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { useSite, matchSite, siteLabel } from './site/useSite'

// Une facture logistique naît en BROUILLON. Elle n'est APPROUVÉE (et ne compte
// dans le chiffre d'affaires) qu'une fois l'autorisation de sortie liée certifiée.
const F_STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  approuvee: { label: 'Approuvée', tone: 'success' }
}

export default function Factures() {
  const { user, role } = useAuth()
  const site = useSite()
  const peutFacturer = role === 'agent'
  // Modification (corriger un doublon, une date erronée…) : l'agent (auteur), la secrétaire ET le
  // reste du personnel d'administration peuvent agir. Suppression : réservée à
  // l'administration (admin/PAU/GE/direction/Info) — jamais à l'agent seul, pour
  // éviter qu'une facture ne disparaisse sans supervision.
  const peutModifierFacture = role === 'agent' || role === 'secretaire' || isFullAccessRole(role)
  const peutSupprimerFacture = isFullAccessRole(role)
  // La secrétaire voit désormais les montants de facturation (accès explicitement
  // accordé) mais pas qui a approuvé la facture (cf. `voitValidateur`).
  const voitMontants = logistiqueVoitMontants(role)
  const voitValidateur = logistiqueVoitValidateur(role)
  // Le cumul de facturation (KPI) suit le même groupe que les autres KPI/Pilotage
  // de la plateforme (FINANCE_VIEW_ROLES, qui inclut désormais la secrétaire).
  const estAdministration = canViewFinance(role)
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: allDemandes } = useCollection('logistique_demandes')
  const [open, setOpen] = useState(false)
  const [prestId, setPrestId] = useState('')
  // Date de la facture — modifiable à l'émission (par défaut aujourd'hui) : permet de
  // saisir en retard une facture pour une prestation antérieure, sans qu'elle ne se
  // retrouve datée du jour de la SAISIE au lieu du jour réel de l'émission.
  const [factureDate, setFactureDate] = useState(todayStr())
  const [detail, setDetail] = useState(null)   // facture consultée
  const [edit, setEdit] = useState(null)       // facture en cours de modification
  const [editDate, setEditDate] = useState('')
  const [editMontant, setEditMontant] = useState('')
  const [editMotif, setEditMotif] = useState('')
  const [toAnnuler, setToAnnuler] = useState(null) // facture APPROUVÉE à annuler (doublon, erreur)
  const [annulSaving, setAnnulSaving] = useState(false)

  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  // Factures déjà engagées dans une autorisation de sortie : plus supprimables ici.
  const facturesEngagees = useMemo(
    () => new Set(allDemandes.map((d) => d.factureId).filter(Boolean)),
    [allDemandes]
  )

  // L'agent garde la main : il facture une prestation dès qu'elle est en brouillon
  // (pas besoin d'approbation préalable). L'approbation viendra via l'autorisation de sortie.
  const aFacturer = prestations.filter((p) => p.statut === 'brouillon')
  // Filtre de période fusionné (Jour / Mois / Plage personnalisée) — même composant
  // et même comportement que Sources de revenus (E-DÉPENSES), pour que les deux
  // écrans soient directement comparables sur exactement la même période.
  const [modePeriode, setModePeriode] = useState('jour')
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  // Par défaut sur « Approuvée » (pas « Tous ») : c'est la seule valeur qui
  // représente le CA réellement acquis (facture passée par le circuit demande de
  // sortie → certification) — « Tous » mélange brouillon (pas encore autorisé)
  // et approuvée, ce qui gonflait le Cumul facturation affiché à l'ouverture.
  const [filtreStatut, setFiltreStatut] = useState('approuvee')
  const [filtreClient, setFiltreClient] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour
  const liste = useMemo(() => {
    let rows = [...factures]
    if (modePeriode === 'mois' && filtreMois) {
      rows = rows.filter((f) => (f.date || '').startsWith(filtreMois))
    } else if (modePeriode === 'annee' && filtreAnnee) {
      rows = rows.filter((f) => (f.date || '').startsWith(filtreAnnee))
    } else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      rows = rows.filter((f) => (!filtreDebut || f.date >= filtreDebut) && (!filtreFin || f.date <= filtreFin))
    } else if (modePeriode === 'jour' && filtreJour) {
      rows = rows.filter((f) => f.date === filtreJour)
    }
    if (filtreStatut) rows = rows.filter((f) => f.statut === filtreStatut)
    if (filtreClient.trim()) {
      const q = filtreClient.trim().toLowerCase()
      rows = rows.filter((f) => (f.clientNom || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [factures, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtreStatut, filtreClient])

  // Cumul de facturation — somme de la liste actuellement filtrée (période, statut,
  // client ci-dessus) : par défaut (aucun filtre de statut) il mélange brouillon +
  // approuvée, comme le total facturé sur la période ; pour voir uniquement le CA
  // réellement reconnu (ou uniquement l'en-cours), on filtre par statut avec les
  // pastilles ci-dessous — le KPI se recalcule alors sur ce sous-ensemble.
  // Scopé au SITE courant (Lomé ou Kara, cf. `factures`) — c'est pourquoi ce cumul
  // ne correspond pas au total « MAXI LOGISTIQUE » d'E-DÉPENSES, qui additionne les
  // deux sites : ce n'est pas une incohérence, mais deux périmètres différents.
  const cumulFacturation = useMemo(() => liste.reduce((s, f) => s + (Number(f.totalTTC) || 0), 0), [liste])

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les factures actuellement affichées (période, statut, client, tri déjà
  // appliqués à `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((f) => ({
      'N° facture': f.num,
      'Date': formatDateShort(f.date),
      'Client': f.clientNom || '—',
      'Prestation': f.prestationNum || '—',
      'Montant TTC': Number(f.totalTTC) || 0,
      'Statut': (F_STATUTS[f.statut] || F_STATUTS.brouillon).label
    }))
    exportRapportExcel({
      filename: `factures-logistique-${siteLabel(site)}-${todayStr()}.xlsx`,
      sections: [{
        name: 'Factures Logistique',
        title: `Factures : MAXI LOGISTIQUE (${siteLabel(site)})`,
        subtitle: `${liste.length} facture(s)${filtreStatut ? ` : ${F_STATUTS[filtreStatut]?.label}` : ''}${filtreClient.trim() ? ` : client : « ${filtreClient} »` : ''}`,
        columns: [
          { key: 'N° facture', label: 'N° facture', width: 16 },
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 22 },
          { key: 'Prestation', label: 'Prestation', width: 16 },
          { key: 'Montant TTC', label: 'Montant TTC', width: 16, type: 'money' },
          { key: 'Statut', label: 'Statut', width: 14 }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Montant TTC': rows.reduce((s, r) => s + r['Montant TTC'], 0) }
      }]
    })
  }

  async function emettre() {
    const p = prestations.find((x) => x.id === prestId)
    if (!p) return toast.error('Sélectionnez une prestation')
    if (!factureDate) return toast.error('Date requise')
    const num = genNumero(`FAC-LOG-${site.toUpperCase()}`, factures.length)
    const factureId = await addItem('logistique_factures', {
      num, date: factureDate, site,
      prestationId: p.id, prestationNum: p.num,
      clientNom: p.clientNom, evenement: p.evenement || '',
      dateDebut: p.dateDebut || '', dateFin: p.dateFin || '',
      lignes: p.lignes, frais: p.frais || [], totalHT: p.total, totalTTC: p.total,
      statut: 'brouillon', agentNom: user.nom, agentId: user.uid
    })
    await updateItem('logistique_prestations', p.id, { statut: 'facturee', factureId, factureNum: num })
    await audit('logistique', 'FACTURE', `${siteLabel(site)} : ${num} : ${formatMoney(p.total)} (brouillon)`)
    toast.success(`Facture ${num} émise en brouillon ✓ : émettez l'autorisation de sortie liée`)
    setOpen(false)
  }

  // Une facture BROUILLON sans autorisation de sortie peut être retirée : la
  // prestation qu'elle portait redevient facturable.
  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.num} (${f.clientNom}) ?\nLa prestation ${f.prestationNum || ''} redevient facturable.`)) return
    await removeItem('logistique_factures', f.id)
    if (f.prestationId) await updateItem('logistique_prestations', f.prestationId, { statut: 'brouillon', factureId: null, factureNum: null })
    await audit('logistique', 'FACTURE_DELETE', `${siteLabel(site)} : ${f.num}`)
    toast.success('Facture supprimée : la prestation redevient facturable')
  }

  function ouvrirEdition(f) {
    setEdit(f)
    setEditDate(f.date || todayStr())
    setEditMontant(String(f.totalTTC ?? f.totalHT ?? 0))
    setEditMotif('')
  }

  // Une facture BROUILLON reste modifiable (date uniquement — les lignes/montants
  // sont un reflet de la prestation liée, à corriger via la prestation elle-même) ;
  // même restriction que la suppression (non engagée dans une autorisation de sortie).
  // Date ET montant corrigeables (doublon, erreur de saisie). Une correction de
  // montant est tracée : montant d'origine conservé (`totalInitial`), auteur, date et
  // motif obligatoire — le CA se recalcule seul (somme des totalTTC approuvés).
  const montantEdit = Number(editMontant)
  const montantValide = editMontant !== '' && Number.isFinite(montantEdit) && montantEdit >= 0
  const montantActuel = edit ? Number(edit.totalTTC ?? edit.totalHT ?? 0) : 0
  const montantChange = !!edit && voitMontants && montantValide && montantEdit !== montantActuel
  async function modifier() {
    if (!editDate) return toast.error('Date requise')
    if (voitMontants && !montantValide) return toast.error('Montant invalide')
    if (montantChange && !editMotif.trim()) return toast.error('Indiquez le motif de la correction du montant')
    const patch = { date: editDate }
    if (montantChange) {
      Object.assign(patch, {
        totalTTC: montantEdit, totalHT: montantEdit,
        totalInitial: edit.totalInitial ?? montantActuel,
        montantCorrigeLe: Date.now(), montantCorrigePar: user.nom, motifCorrection: editMotif.trim()
      })
    }
    await updateItem('logistique_factures', edit.id, patch)
    await audit('logistique', 'FACTURE_MODIFIEE',
      `${siteLabel(site)} : ${edit.num} : date → ${formatDateShort(editDate)}${montantChange ? ` · montant ${formatMoney(montantActuel)} → ${formatMoney(montantEdit)} (${editMotif.trim()})` : ''}`)
    toast.success(`Facture ${edit.num} modifiée ✓`)
    setEdit(null)
  }

  // Facture déjà APPROUVÉE (doublon, erreur de saisie…) — réservé à l'administration
  // (peutSupprimerFacture). Annule proprement les 3 effets de la certification :
  //  1. Facture retirée → son montant sort automatiquement du CA (somme des
  //     factures approuvées).
  //  2. Autorisation de sortie liée passée en « Annulée » → le stock est recalculé
  //     EN DIRECT à partir des demandes certifiées (cf. logic.autoSorties), donc
  //     l'annuler suffit à réintégrer les pièces sorties, sans toucher l'inventaire.
  //  3. Prestation remise en brouillon → reste facturable si la correction l'exige.
  async function annulerFactureApprouvee() {
    if (!toAnnuler) return
    setAnnulSaving(true)
    try {
      const demandeLiee = allDemandes.find((d) => d.factureId === toAnnuler.id)
      if (demandeLiee) {
        await updateItem('logistique_demandes', demandeLiee.id, {
          statut: 'annulee', annuleeLe: Date.now(), annuleePar: user.nom,
          motifAnnulation: `Facture ${toAnnuler.num} supprimée (doublon/erreur)`
        })
      }
      await removeItem('logistique_factures', toAnnuler.id)
      if (toAnnuler.prestationId) {
        await updateItem('logistique_prestations', toAnnuler.prestationId, { statut: 'brouillon', factureId: null, factureNum: null })
      }
      await audit('logistique', 'FACTURE_ANNULATION',
        `${siteLabel(site)} : ${toAnnuler.num} (approuvée) : ${formatMoney(toAnnuler.totalTTC)} retiré du CA, autorisation de sortie annulée${demandeLiee ? ` (${demandeLiee.num})` : ''}, stock réintégré`)
      toast.success(`Facture ${toAnnuler.num} annulée ✓ : CA et stock corrigés, autorisation de sortie annulée`)
      setToAnnuler(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAnnulSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau héro — même recette que les autres volets (logo rond, titre, filtre
          de période et export directement en glassmorphism sur la bande). */}
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <FileText size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Facturation</h2>
          <p className="text-sm text-white/80">{liste.length} facture(s) · {siteLabel(site)}</p>
        </div>
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <input value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)} placeholder="🔍 Client…"
          className="min-w-0 flex-1 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white placeholder-white/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50 sm:w-36 sm:flex-none" />
        <div className="flex flex-wrap gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
          {[['', 'Tous'], ...Object.entries(F_STATUTS).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${filtreStatut === v ? 'bg-white text-red-700' : 'text-white/80 hover:bg-white/20'}`}>
              {l}
            </button>
          ))}
        </div>
        {canExportExcel(role) && (
          <button onClick={exportXLSX}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <FileSpreadsheet size={14} /> Excel
          </button>
        )}
      </div>

      {peutFacturer && !aFacturer.length && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune prestation à facturer. Créez d'abord une prestation (onglet Prestations) : elle est facturable dès qu'elle est en brouillon.
        </div>
      )}
      {peutFacturer && (
        <div className="flex justify-end">
          <Button onClick={() => { setPrestId(aFacturer[0]?.id || ''); setFactureDate(todayStr()); setOpen(true) }} disabled={!aFacturer.length}>
            <Plus size={16} /> Émettre une facture
          </Button>
        </div>
      )}
      {/* Cumul de facturation — réservé à l'administration, recalculé selon les filtres
          ci-dessous (période, statut, client). Scopé au site courant : voir la note
          dans le code (`cumulFacturation`) pour la différence avec le total combiné
          d'E-DÉPENSES. */}
      {estAdministration && (
        <div className="order-2 grid gap-3 sm:order-none sm:grid-cols-2 lg:grid-cols-3">
          <StatCard glass
            title={`Cumul facturation${filtreStatut ? ` (${F_STATUTS[filtreStatut]?.label.toLowerCase()})` : ''}`}
            value={formatMoney(cumulFacturation)}
            sub={`${liste.length} facture${liste.length > 1 ? 's' : ''} · site ${siteLabel(site)}${filtrePeriodeActif ? ' · période filtrée' : ''}${filtreClient.trim() ? ' · client filtré' : ''}`}
            icon={Wallet} accent={COULEUR_MODULE.logistique} />
        </div>
      )}

      <Card className="p-0">
        <Table
          stickyHeader
          columns={[
            { key: 'num', label: 'N° facture', sticky: true, width: '120px' },
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'prestationNum', label: 'Prestation' },
            // Colonne « Montant » retirée pour la secrétaire (cf. voitMontants).
            ...(voitMontants ? [{ key: 'totalTTC', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.totalTTC)}</strong> }] : []),
            { key: 'statut', label: 'Statut', render: (r) => {
              const s = F_STATUTS[r.statut] || F_STATUTS.brouillon
              const auto = /syst/i.test(r.approuveePar || '')
              return (
                <div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {voitValidateur && r.statut === 'approuvee' && r.approuveePar && (
                    <p className="mt-0.5 text-[10px] text-gray-500">{auto ? '🤖' : '✅'} {r.approuveePar}{r.approuveeLe ? ` · ${formatDateShort(r.approuveeLe)}` : ''}</p>
                  )}
                </div>
              )
            } },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setDetail(r)} title="Voir le détail" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                {r.statut === 'brouillon' && !facturesEngagees.has(r.id) && (
                  <>
                    {peutModifierFacture && (
                      <button onClick={() => ouvrirEdition(r)} title="Modifier le brouillon" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                    )}
                    {peutSupprimerFacture && (
                      <button onClick={() => supprimer(r)} title="Supprimer le brouillon" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    )}
                  </>
                )}
                {r.statut === 'approuvee' && peutModifierFacture && (
                  <button onClick={() => ouvrirEdition(r)} title="Modifier la date de la facture" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                )}
                {r.statut === 'approuvee' && peutSupprimerFacture && (
                  <button onClick={() => setToAnnuler(r)} title="Annuler cette facture approuvée (doublon, erreur)" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty={filtreStatut || filtrePeriodeActif || filtreClient.trim() ? 'Aucune facture pour ces filtres.' : 'Aucune facture.'}
        />
      </Card>

      {/* Rappel du circuit : placé SOUS la liste pour que le résultat du filtre
          soit visible tout de suite (sur téléphone, il passait sous la ligne de flottaison). */}
      <p className="order-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800 sm:order-none">
        {!peutFacturer && <>👁️ Mode consultation (agents uniquement) · </>}
        Prestation → <strong>Facture (brouillon)</strong> → Autorisation de sortie → <strong>Approuvée (CA + stock décrémenté)</strong>
      </p>

      {/* Consultation d'une facture — lecture seule */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.logistique)}
        title={detail ? `Facture ${detail.num}` : ''}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (() => {
          const totalLignes = (detail.lignes || []).reduce((s, l) => s + (l.montant || 0), 0)
          const totalFrais = (detail.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)
          return (
            <FicheDetail
              entetes={[
                { label: 'Client', value: detail.clientNom || '—' },
                { label: 'Statut', value: (F_STATUTS[detail.statut] || F_STATUTS.brouillon).label },
                { label: 'Prestation', value: detail.prestationNum },
                { label: 'Événement', value: detail.evenement },
                { label: 'Date de facture', value: formatDateShort(detail.date) },
                { label: 'Période', value: detail.dateDebut ? `${formatDateShort(detail.dateDebut)} → ${formatDateShort(detail.dateFin)}` : null },
                { label: 'Site', value: siteLabel(detail.site || site) },
                { label: 'Émise par', value: detail.agentNom },
                // Montant corrigé après émission : l'origine reste visible (traçabilité).
                { label: 'Montant corrigé', value: voitMontants && detail.totalInitial != null
                  ? `${formatMoney(detail.totalInitial)} → ${formatMoney(detail.totalTTC)}${detail.motifCorrection ? ` (${detail.motifCorrection})` : ''}`
                  : null },
                // L'identité du validateur reste réservée à l'administration/direction.
                { label: 'Approuvée par', value: voitValidateur && detail.approuveePar ? `${detail.approuveePar}${detail.approuveeLe ? ' · ' + detail.approuveeLe : ''}` : null }
              ]}
              colonnes={[
                { label: 'Prestation', render: (l) => l.materielNom || 'Élément' },
                { label: 'Qté', align: 'center', render: (l) => formatNumber(l.qte || 0) },
                { label: 'Jours', align: 'center', render: (l) => formatNumber(l.nbJours || 1) },
                // Colonnes et pied de tableau financiers : masqués à la secrétaire.
                ...(voitMontants ? [
                  { label: 'Tarif / jour', align: 'right', render: (l) => formatMoney(l.tarifUnitaire || 0) },
                  { label: 'Montant', align: 'right', render: (l) => formatMoney(l.montant || 0) }
                ] : [])
              ]}
              lignes={detail.lignes || []}
              vide="Aucune ligne sur cette facture."
              pied={voitMontants ? [
                { label: 'Sous-total matériel', value: totalLignes },
                { label: 'Frais supplémentaires', value: totalFrais || null },
                { label: 'Total', value: detail.totalTTC ?? detail.totalHT ?? 0, fort: true }
              ] : []}
            >
              {voitMontants && (detail.frais || []).length > 0 && (
                <div className="rounded-lg bg-amber-50/60 px-3 py-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Frais supplémentaires</p>
                  {(detail.frais || []).map((x, i) => (
                    <div key={i} className="flex justify-between gap-3 text-xs text-amber-900">
                      <span>{x.label}</span><span className="font-semibold">{formatMoney(x.montant || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </FicheDetail>
          )
        })()}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="Émettre une facture (brouillon)"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={emettre}><FileText size={16} /> Émettre</Button></>}>
        <FormGroup label="Prestation à facturer" required>
          <Select value={prestId} onChange={(e) => setPrestId(e.target.value)}>
            {aFacturer.map((p) => <option key={p.id} value={p.id}>{p.num} : {p.clientNom}{voitMontants ? ` (${formatMoney(p.total)})` : ''}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Date de la facture" required hint="Modifiable : pour rattraper une facture oubliée d'un jour antérieur, sans qu'elle prenne la date du jour de la saisie.">
          <Input type="date" value={factureDate} onChange={(e) => setFactureDate(e.target.value)} />
        </FormGroup>
        {voitMontants && prestId && (() => {
          const p = prestations.find((x) => x.id === prestId)
          return p ? <p className="mt-2 text-sm text-gray-600">Montant TTC : <strong>{formatMoney(p.total)}</strong></p> : null
        })()}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Modifier la facture ${edit.num}` : ''}
        {...glassModalProps(COULEUR_MODULE.logistique)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Annuler</Button><Button onClick={modifier}><Pencil size={16} /> Enregistrer</Button></>}>
        {edit && (
          <div className="space-y-4">
            {/* Bandeau d'identité — même recette que les autres fenêtres du module */}
            <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.92) 0%, rgba(26,26,26,0.85) 100%)' }}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 4px 10px -2px rgba(0,0,0,0.4)' }}>
                <FileText size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold leading-tight">{edit.clientNom || 'Client'}</p>
                <p className="truncate text-xs text-white/80">{edit.prestationNum} · {edit.num}</p>
              </div>
              <Badge tone={(F_STATUTS[edit.statut] || F_STATUTS.brouillon).tone}>{(F_STATUTS[edit.statut] || F_STATUTS.brouillon).label}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/60 bg-white/60 p-3 shadow-sm backdrop-blur-md">
                <FormGroup label="Date de la facture" required>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </FormGroup>
              </div>
              {voitMontants && (
                <div className="rounded-2xl border border-white/60 bg-white/60 p-3 shadow-sm backdrop-blur-md">
                  <FormGroup label="Montant TTC (FCFA)" required>
                    <Input type="number" min="0" step="1" value={editMontant} onChange={(e) => setEditMontant(e.target.value)} />
                  </FormGroup>
                </div>
              )}
            </div>

            {/* Aperçu de l'écart + motif obligatoire dès que le montant change */}
            {montantChange && (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-500 line-through">{formatMoney(montantActuel)}</span>
                  <span className="text-gray-400">→</span>
                  <strong className="text-gray-900">{formatMoney(montantEdit)}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${montantEdit - montantActuel >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {montantEdit - montantActuel >= 0 ? '+' : ''}{formatMoney(montantEdit - montantActuel)}
                  </span>
                </div>
                <FormGroup label="Motif de la correction" required hint="Conservé dans l'historique avec le montant d'origine.">
                  <Input value={editMotif} onChange={(e) => setEditMotif(e.target.value)} placeholder="ex : doublon, erreur de tarif, remise accordée…" />
                </FormGroup>
              </div>
            )}

            <p className="flex items-start gap-1.5 text-xs text-gray-500">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
              Le chiffre d'affaires se met à jour automatiquement. Les lignes de la facture restent celles de la prestation {edit.prestationNum || 'liée'}.
            </p>
          </div>
        )}
      </Modal>

      {/* Annulation d'une facture déjà APPROUVÉE (doublon, erreur) — action sensible,
          confirmation explicite listant les 3 effets de bord avant d'agir. */}
      <Modal open={!!toAnnuler} onClose={() => !annulSaving && setToAnnuler(null)} title={toAnnuler ? `Annuler la facture ${toAnnuler.num}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setToAnnuler(null)} disabled={annulSaving}>Fermer</Button>
          <Button variant="danger" onClick={annulerFactureApprouvee} loading={annulSaving}><Trash2 size={16} /> Confirmer l'annulation</Button>
        </>}>
        {toAnnuler && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>Cette facture est <strong>déjà approuvée</strong> ({toAnnuler.clientNom} : {formatMoney(toAnnuler.totalTTC)}). L'annuler déclenche automatiquement :</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>le montant sort du <strong>chiffre d'affaires</strong> ;</li>
              <li>l'<strong>autorisation de sortie</strong> liée est annulée et le <strong>stock sorti est réintégré</strong> ;</li>
              <li>la <strong>prestation</strong> {toAnnuler.prestationNum} redevient facturable (brouillon).</li>
            </ul>
            <p className="text-xs text-gray-500">Action réservée à l'administration, irréversible : à utiliser pour corriger un doublon ou une erreur de facturation.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
