// Facturation logistique — émission obligatoire avant demande d'autorisation de sortie.
import { useMemo, useState } from 'react'
import { FileText, Plus, Trash2, Eye } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { logistiqueVoitMontants } from '../../core/roles'
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
  // La secrétaire consulte les factures (suivi administratif) sans en voir la valeur.
  const voitMontants = logistiqueVoitMontants(role)
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
  const liste = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])

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
      statut: 'brouillon', agentNom: user.nom
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
                  {r.statut === 'approuvee' && r.approuveePar && (
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
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
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
                { label: 'Approuvée par', value: detail.approuveePar ? `${detail.approuveePar}${detail.approuveeLe ? ' · ' + detail.approuveeLe : ''}` : null }
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
