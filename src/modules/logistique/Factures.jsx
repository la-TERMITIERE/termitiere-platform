// Facturation logistique — émission obligatoire avant demande d'autorisation de sortie.
import { useMemo, useState } from 'react'
import { FileText, Plus, Trash2, Eye, Wallet } from 'lucide-react'
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
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { logistiqueVoitMontants, logistiqueVoitValidateur, canViewFinance } from '../../core/roles'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
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
  const [detail, setDetail] = useState(null)   // facture consultée

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
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreClient, setFiltreClient] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour
  const liste = useMemo(() => {
    let rows = [...factures]
    if (modePeriode === 'mois' && filtreMois) {
      rows = rows.filter((f) => (f.date || '').startsWith(filtreMois))
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
  }, [factures, modePeriode, filtreJour, filtreMois, filtreDebut, filtreFin, filtreStatut, filtreClient])

  // Cumul de facturation — somme de la liste actuellement filtrée (période, statut,
  // client ci-dessus) : par défaut (aucun filtre de statut) il mélange brouillon +
  // approuvée, comme le total facturé sur la période ; pour voir uniquement le CA
  // réellement reconnu (ou uniquement l'en-cours), on filtre par statut avec les
  // pastilles ci-dessous — le KPI se recalcule alors sur ce sous-ensemble.
  // Scopé au SITE courant (Lomé ou Kara, cf. `factures`) — c'est pourquoi ce cumul
  // ne correspond pas au total « MAXI LOGISTIQUE » d'E-DÉPENSES, qui additionne les
  // deux sites : ce n'est pas une incohérence, mais deux périmètres différents.
  const cumulFacturation = useMemo(() => liste.reduce((s, f) => s + (Number(f.totalTTC) || 0), 0), [liste])

  async function emettre() {
    const p = prestations.find((x) => x.id === prestId)
    if (!p) return toast.error('Sélectionnez une prestation')
    const num = genNumero(`FAC-LOG-${site.toUpperCase()}`, factures.length)
    const factureId = await addItem('logistique_factures', {
      num, date: todayStr(), site,
      prestationId: p.id, prestationNum: p.num,
      clientNom: p.clientNom, evenement: p.evenement || '',
      dateDebut: p.dateDebut || '', dateFin: p.dateFin || '',
      lignes: p.lignes, frais: p.frais || [], totalHT: p.total, totalTTC: p.total,
      statut: 'brouillon', agentNom: user.nom, agentId: user.uid
    })
    await updateItem('logistique_prestations', p.id, { statut: 'facturee', factureId, factureNum: num })
    await audit('logistique', 'FACTURE', `${siteLabel(site)} — ${num} — ${formatMoney(p.total)} (brouillon)`)
    toast.success(`Facture ${num} émise en brouillon ✓ — émettez l'autorisation de sortie liée`)
    setOpen(false)
  }

  // Une facture BROUILLON sans autorisation de sortie peut être retirée : la
  // prestation qu'elle portait redevient facturable.
  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.num} (${f.clientNom}) ?\nLa prestation ${f.prestationNum || ''} redevient facturable.`)) return
    await removeItem('logistique_factures', f.id)
    if (f.prestationId) await updateItem('logistique_prestations', f.prestationId, { statut: 'brouillon', factureId: null, factureNum: null })
    await audit('logistique', 'FACTURE_DELETE', `${siteLabel(site)} — ${f.num}`)
    toast.success('Facture supprimée — la prestation redevient facturable')
  }

  return (
    <div className="space-y-4">
      {!peutFacturer && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          👁️ Mode consultation — seuls les agents peuvent émettre des factures
        </div>
      )}
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Workflow :</strong> Prestation (brouillon) → <strong>Facture (brouillon)</strong> → Autorisation de sortie → <strong>facture approuvée &amp; CA + stock décrémenté</strong>
      </div>
      {peutFacturer && !aFacturer.length && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune prestation à facturer. Créez d'abord une prestation (onglet Prestations) — elle est facturable dès qu'elle est en brouillon.
        </div>
      )}
      {peutFacturer && (
        <div className="flex justify-end">
          <Button onClick={() => { setPrestId(aFacturer[0]?.id || ''); setOpen(true) }} disabled={!aFacturer.length}>
            <Plus size={16} /> Émettre une facture
          </Button>
        </div>
      )}
      {/* Cumul de facturation — réservé à l'administration, recalculé selon les filtres
          ci-dessous (période, statut, client). Scopé au site courant : voir la note
          dans le code (`cumulFacturation`) pour la différence avec le total combiné
          d'E-DÉPENSES. */}
      {estAdministration && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title={`Cumul facturation${filtreStatut ? ` (${F_STATUTS[filtreStatut]?.label.toLowerCase()})` : ''}`}
            value={formatMoney(cumulFacturation)}
            sub={`${liste.length} facture${liste.length > 1 ? 's' : ''} · site ${siteLabel(site)}${filtrePeriodeActif ? ' · période filtrée' : ''}${filtreClient.trim() ? ' · client filtré' : ''}`}
            icon={Wallet} accent={COULEUR_MODULE.logistique} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Client</label>
          <input value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)} placeholder="Rechercher un client…"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[['', 'Tous'], ...Object.entries(F_STATUTS).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
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
                {peutFacturer && r.statut === 'brouillon' && !facturesEngagees.has(r.id) && (
                  <button onClick={() => supprimer(r)} title="Supprimer le brouillon" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune facture."
        />
      </Card>

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
            {aFacturer.map((p) => <option key={p.id} value={p.id}>{p.num} — {p.clientNom}{voitMontants ? ` (${formatMoney(p.total)})` : ''}</option>)}
          </Select>
        </FormGroup>
        {voitMontants && prestId && (() => {
          const p = prestations.find((x) => x.id === prestId)
          return p ? <p className="mt-2 text-sm text-gray-600">Montant TTC : <strong>{formatMoney(p.total)}</strong></p> : null
        })()}
      </Modal>
    </div>
  )
}
