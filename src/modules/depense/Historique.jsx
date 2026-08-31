// Historique — récapitulatif complet de toutes les dépenses (prévues comptées
// directement + imprévues passées par l'autorisation de décaissement), avec pour chacune
// la frise chronologique complète : création → approbation → certification →
// confirmation du bénéficiaire, ou refus.
import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, FileSpreadsheet, MessageSquare, CheckCircle2, Clock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Select from '../../shared/forms/Select'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort, formatDateTime } from '../../utils/formatters'
import { SECTEURS, STATUTS_DECAISSEMENT } from './data'
import { coutsMatieresBriqueterie } from './logic'

export default function Historique() {
  const { data: depensesReelles } = useCollection('depense_depenses')
  // Coût matières Briqueterie, repris en lecture seule. Tout ce qui vient d'E-G.Pro
  // (repérable à son `projetId`) n'apparaît plus ici — ça ne se consulte que depuis
  // E-G.Pro lui-même.
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const depenses = useMemo(
    () => [
      ...depensesReelles.filter((d) => !d.projetId),
      ...coutsMatieresBriqueterie(inventairesBriq)
    ],
    [depensesReelles, inventairesBriq]
  )

  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreType, setFiltreType] = useState('')
  const [recherche, setRecherche] = useState('')
  const [openRow, setOpenRow] = useState(null)
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  const lignes = useMemo(() => {
    return depenses
      .filter((d) => (d.date || '') >= start && (d.date || '') <= end)
      .filter((d) => !filtreSecteur || d.secteurId === filtreSecteur)
      .filter((d) => !filtreStatut || (d.statut || 'decaissee') === filtreStatut)
      .filter((d) => !filtreType || (filtreType === 'imprevue' ? !!d.imprevue : !d.imprevue))
      .filter((d) => {
        const q = recherche.trim().toLowerCase()
        if (!q) return true
        return (d.description || '').toLowerCase().includes(q)
          || (d.categorie || '').toLowerCase().includes(q)
          || (d.beneficiaireNom || '').toLowerCase().includes(q)
          || (d.beneficiaireFonction || '').toLowerCase().includes(q)
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0))
  }, [depenses, start, end, filtreSecteur, filtreStatut, filtreType, recherche])

  const stats = useMemo(() => {
    const decaissees = lignes.filter((d) => (d.statut || 'decaissee') === 'decaissee')
    const enCircuit  = lignes.filter((d) => d.statut === 'en_attente' || d.statut === 'approuvee')
    const refusees   = lignes.filter((d) => d.statut === 'refusee')
    return {
      totalDecaisse: decaissees.reduce((s, d) => s + (Number(d.montant) || 0), 0),
      totalEnCircuit: enCircuit.reduce((s, d) => s + (Number(d.montant) || 0), 0),
      nbRefusees: refusees.length,
      nb: lignes.length
    }
  }, [lignes])

  function exportXLSX() {
    const rows = lignes.map((d) => {
      const secteur = SECTEURS.find((s) => s.id === d.secteurId)
      const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
      return {
        Date: formatDateShort(d.date),
        Secteur: secteur?.label || d.secteurId,
        Catégorie: d.categorie || '—',
        Description: d.description || '—',
        'Montant (FCFA)': Number(d.montant) || 0,
        Type: d.imprevue ? 'Imprévue' : 'Prévue',
        Statut: statut.label,
        'Créée par': d.enregistrePar || '—',
        'Approuvée par': d.approuveePar || '—',
        'Certifiée par': d.certifieePar || '—',
        'Bénéficiaire': d.beneficiaireNom || '—',
        'Profession / poste': d.beneficiaireFonction || '—',
        'Réception confirmée': !d.beneficiaireNom ? '—' : (!d.beneficiaireUid ? 'Externe (N/A)' : (d.recuConfirme ? 'Oui' : 'Non'))
      }
    })
    exportRapportExcel({
      filename: `historique-depenses-${start}_${end}.xlsx`,
      sections: [
        {
          id: 'historique', name: 'Historique',
          title: 'Historique des dépenses',
          subtitle: `Période : du ${formatDateShort(start)} au ${formatDateShort(end)} · ${lignes.length} dépense(s)`,
          columns: [
            { key: 'Date', label: 'Date', width: 14 },
            { key: 'Secteur', label: 'Secteur', width: 20 },
            { key: 'Catégorie', label: 'Catégorie', width: 20 },
            { key: 'Description', label: 'Description', width: 30 },
            { key: 'Montant (FCFA)', label: 'Montant (FCFA)', width: 16 },
            { key: 'Type', label: 'Type', width: 12 },
            { key: 'Statut', label: 'Statut', width: 20 },
            { key: 'Créée par', label: 'Créée par', width: 18 },
            { key: 'Approuvée par', label: 'Approuvée par', width: 18 },
            { key: 'Certifiée par', label: 'Certifiée par', width: 18 },
            { key: 'Bénéficiaire', label: 'Bénéficiaire', width: 18 },
            { key: 'Profession / poste', label: 'Profession / poste', width: 20 },
            { key: 'Réception confirmée', label: 'Réception confirmée', width: 16 }
          ],
          rows
        }
      ]
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        Récapitule <strong>toutes</strong> les dépenses de la période : prévues comptées directement et imprévues passées par l'<strong>autorisation de décaissement</strong> (envoyées, approuvées, certifiées ou refusées). Cliquez sur une ligne pour voir sa frise chronologique complète.
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total décaissé</p>
          <p className="mt-1 text-xl font-extrabold text-green-700">{stats.totalDecaisse.toLocaleString('fr-FR')} FCFA</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">En circuit d'autorisation</p>
          <p className="mt-1 text-xl font-extrabold text-amber-600">{stats.totalEnCircuit.toLocaleString('fr-FR')} FCFA</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Demandes refusées</p>
          <p className="mt-1 text-xl font-extrabold text-red-600">{stats.nbRefusees}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total dépenses</p>
          <p className="mt-1 text-xl font-extrabold text-gray-800">{stats.nb}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {periodNode}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Secteur</label>
          <Select className="w-auto" value={filtreSecteur} onChange={(e) => setFiltreSecteur(e.target.value)}>
            <option value="">Tous les secteurs</option>
            {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select className="w-auto" value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS_DECAISSEMENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Type</label>
          <Select className="w-auto" value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
            <option value="">Prévue + Imprévue</option>
            <option value="prevue">Prévue</option>
            <option value="imprevue">Imprévue</option>
          </Select>
        </div>
        <div className="relative">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Recherche</label>
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Description, catégorie, bénéficiaire…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{lignes.length} résultat(s)</span>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-6 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Secteur</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucune dépense sur cette période.</td></tr>
            )}
            {lignes.map((d) => {
              const secteur = SECTEURS.find((s) => s.id === d.secteurId)
              const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
              const isOpen = openRow === d.id
              return (
                <Fragment key={d.id}>
                  <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpenRow(isOpen ? null : d.id)}>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{formatDateShort(d.date)}</td>
                    <td className="px-3 py-2"><Badge tone="neutral">{secteur?.label || d.secteurId}</Badge></td>
                    <td className="px-3 py-2 text-gray-600">
                      {d.description || d.categorie || '—'}
                      {/* Traçabilité visible directement : qui a effectué la dépense → qui la reçoit */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                        <span>✍️ Par <span className="font-semibold text-gray-500">{d.enregistrePar || '—'}</span></span>
                        {d.beneficiaireNom && (
                          <span>→ 👤 <span className="font-semibold text-gray-500">{d.beneficiaireNom}</span>{d.beneficiaireFonction ? ` (${d.beneficiaireFonction})` : ''}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{Number(d.montant).toLocaleString('fr-FR')} FCFA</td>
                    <td className="px-3 py-2">
                      <Badge tone={d.imprevue ? 'warning' : 'primary'}>{d.imprevue ? 'Imprévue' : 'Prévue'}</Badge>
                    </td>
                    <td className="px-3 py-2"><Badge tone={statut.tone}>{statut.label}</Badge></td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={6} className="px-3 py-3">
                        <FriseHistorique d={d} secteur={secteur} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Etape({ actif, titre, sousTitre, commentaire, tone = 'gray' }) {
  const couleurs = {
    gray:   'border-gray-200/60 bg-white/50 text-gray-400',
    green:  'border-green-300/60 bg-green-50/60 text-green-700',
    amber:  'border-amber-300/60 bg-amber-50/60 text-amber-700',
    red:    'border-red-300/60 bg-red-50/60 text-red-700',
    indigo: 'border-indigo-300/60 bg-indigo-50/60 text-indigo-700'
  }
  if (!actif) return null
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs shadow-[0_8px_20px_-14px_rgba(26,26,26,0.12)] backdrop-blur-md backdrop-saturate-150 ${couleurs[tone]}`}>
      <p className="font-bold">{titre}</p>
      {sousTitre && <p className="mt-0.5 opacity-80">{sousTitre}</p>}
      {commentaire && (
        <p className="mt-1 flex items-start gap-1 italic">
          <MessageSquare size={11} className="mt-0.5 shrink-0" /> « {commentaire} »
        </p>
      )}
    </div>
  )
}

function FriseHistorique({ d, secteur }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Etape actif titre="1. Créée" tone="gray"
        sousTitre={`Par ${d.enregistrePar || '—'} le ${formatDateTime(d.createdAt)}${d.recurrente ? ' · 🔁 récurrente' : ''}`} />

      {!d.imprevue ? (
        <Etape actif tone="green" titre="2. Comptée directement" sousTitre="Dépense prévue/budgétée — aucune autorisation requise" />
      ) : (
        <>
          <Etape actif={d.statut !== undefined} tone={d.statut === 'en_attente' ? 'amber' : 'gray'}
            titre="2. Envoyée pour autorisation"
            sousTitre={d.statut === 'en_attente' ? 'En attente d\'un responsable' : 'Demande soumise'} />
          {(d.approuveePar || d.statut === 'refusee') && (
            d.approuveePar
              ? <Etape actif tone="green" titre="3. Approuvée (1er niveau)" sousTitre={`Par ${d.approuveePar} le ${formatDateTime(d.approuveeLe)}`} commentaire={d.approbationCommentaire} />
              : null
          )}
          {d.statut === 'refusee' && (
            <Etape actif tone="red" titre="Refusée" sousTitre={`Par ${d.refuseePar || '—'} le ${formatDateTime(d.refuseeLe)}`} commentaire={d.refusMotif} />
          )}
          {d.certifieePar && (
            <Etape actif tone="green" titre="4. Certifiée (décaissée)" sousTitre={`Par ${d.certifieePar} le ${formatDateTime(d.certifieeLe)}`} commentaire={d.certificationCommentaire} />
          )}
        </>
      )}

      {d.beneficiaireNom && (
        <Etape actif tone={!d.beneficiaireUid ? 'gray' : d.recuConfirme ? 'green' : 'indigo'}
          titre={!d.beneficiaireUid ? 'Bénéficiaire externe' : d.recuConfirme ? '✅ Réception confirmée' : '💸 En attente de confirmation'}
          sousTitre={
            `${d.beneficiaireNom}${d.beneficiaireFonction ? ` (${d.beneficiaireFonction})` : ''}` +
            (d.beneficiaireUid ? (d.recuConfirme ? ` — a confirmé le ${formatDateTime(d.recuConfirmeLe)}` : '') : ' — pas de notification (aucun compte)')
          } />
      )}
    </div>
  )
}
