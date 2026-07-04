import { useMemo, useState } from 'react'
import { Plus, FileSpreadsheet, Printer, CheckCircle2 } from 'lucide-react'
import { genererRecuPaiement } from './recuPDF'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { formatMoney } from '../../utils/formatters'
import { TYPES_PAIEMENT, MODES_PAIEMENT, STATUTS_PAIEMENT, MOIS } from './data'
import { tarifSuggere } from './logic'
import { useGarderieStore } from './store/garderieStore'
import { exportRapportExcel } from '../../utils/excelReport'

const now = new Date()
// Types de paiement pour lesquels les frais de cuisine (payés à part par les parents) s'appliquent.
const TYPES_AVEC_CUISINE = ['inscription', 'mensuel']
const empty = () => ({
  enfantId: '', enfantNom: '',
  type: 'mensuel', mois: now.getMonth() + 1, annee: now.getFullYear(),
  montantDu: '', montantPaye: '', montantCuisine: '', modePaiement: 'espece',
  statut: 'paye', date: todayStr(), notes: ''
})

export default function Paiements() {
  const { user } = useAuth()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: paiements }   = useCollection('garderie_paiements')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const params = useGarderieStore((s) => s.params)

  const [onglet, setOnglet]             = useState('inscrits')
  const [modal, setModal]               = useState(null)
  const [soldeModal, setSoldeModal]     = useState(null)
  const [soldeSaving, setSoldeSaving]   = useState(false)
  const [filtreEnfant, setFiltreEnfant] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreMois, setFiltreMois]     = useState(now.getMonth() + 1)
  const [filtreAnnee, setFiltreAnnee]   = useState(now.getFullYear())
  const [filtreJoMois, setFiltreJoMois]   = useState(now.getMonth() + 1)
  const [filtreJoAnnee, setFiltreJoAnnee] = useState(now.getFullYear())
  const [joPayModal, setJoPayModal]       = useState(null) // { journalier }
  const [joPaySaving, setJoPaySaving]     = useState(false)

  const deletedEnfantIds = useGarderieStore((s) => s.deletedEnfantIds)
  const GRILLE_TARIFAIRE = useGarderieStore((s) => s.grilleTarifaire)
  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif' && !deletedEnfantIds.has(e.id)),
    [enfants, deletedEnfantIds]
  )

  // Enfants qui n'ont PAS encore payé pour le mois/année du modal en cours
  const enfantsSansPaiement = useMemo(() => {
    if (!modal) return enfantsActifs
    const m = Number(modal.data.mois)
    const a = Number(modal.data.annee)
    const prefixe = `${a}-${String(m).padStart(2, '0')}`
    return enfantsActifs.filter((e) => {
      // Exclure l'enfant déjà sélectionné (pour pouvoir modifier son paiement)
      if (!modal.isNew && modal.data.enfantId === e.id) return true
      return !paiements.some(
        (p) => p.enfantId === e.id &&
               p.type !== 'journalier' &&
               p.statut !== 'impaye' &&
               (
                 (Number(p.mois) === m && Number(p.annee) === a) ||
                 ((p.date || '').startsWith(prefixe))
               )
      )
    })
  }, [enfantsActifs, paiements, modal])

  const liste = useMemo(() => {
    let rows = [...paiements]
    if (filtreEnfant) rows = rows.filter((p) => p.enfantId === filtreEnfant)
    if (filtreStatut) rows = rows.filter((p) => p.statut === filtreStatut)
    if (filtreMois)  rows = rows.filter((p) => Number(p.mois) === Number(filtreMois))
    if (filtreAnnee) rows = rows.filter((p) => Number(p.annee) === Number(filtreAnnee))
    return rows.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
  }, [paiements, filtreEnfant, filtreStatut, filtreMois, filtreAnnee])

  const totalPaye   = useMemo(() => liste.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0), [liste])
  const totalDu     = useMemo(() => liste.reduce((s, p) => s + (Number(p.montantDu) || 0), 0), [liste])
  const totalReste  = useMemo(() => liste.reduce((s, p) => {
    const r = (Number(p.montantDu) || 0) - (Number(p.montantPaye) || 0)
    return s + (r > 0 ? r : 0)
  }, 0), [liste])

  function openCreate() {
    setModal({ data: { ...empty(), montantDu: params.tarifMensuel, montantCuisine: params.fraisCuisine || '' }, isNew: true })
  }

  async function handleSave() {
    const d = modal.data
    if (!d.enfantId) return toast.error('Sélectionnez un enfant')
    if (!d.montantDu || !d.montantPaye) return toast.error('Montants requis')
    const avecCuisine = TYPES_AVEC_CUISINE.includes(d.type)
    const montantCuisine = avecCuisine ? (Number(d.montantCuisine) || 0) : 0
    const montantDu = Number(d.montantDu) + montantCuisine
    const statut = Number(d.montantPaye) >= montantDu ? 'paye'
                 : Number(d.montantPaye) > 0 ? 'partiel' : 'impaye'
    const payload = { ...d, statut, montantDu, montantCuisine, montantPaye: Number(d.montantPaye) }
    if (modal.isNew) {
      const id = genId()
      await setItem('garderie_paiements', id, { ...payload, id })
      audit('garderie', 'PAIEMENT_CREATE', d.enfantNom, { mois: d.mois, annee: d.annee, montant: d.montantPaye })
      notify({ type: 'info', title: `💰 Paiement reçu — ${d.enfantNom}`, body: `${Number(d.montantPaye).toLocaleString('fr-FR')} FCFA — ${statut === 'paye' ? 'Soldé' : statut === 'partiel' ? 'Partiel' : 'Impayé'}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/paiements' })
      toast.success('Paiement enregistré ✓')
    } else {
      const id = modal.id
      await setItem('garderie_paiements', id, { ...payload, id })
      audit('garderie', 'PAIEMENT_EDIT', d.enfantNom)
      toast.success('Paiement mis à jour ✓')
    }
    setModal(null)
  }

  function onEnfantChange(id) {
    const e = enfantsActifs.find((x) => x.id === id)
    const tarif = e?.dateNaissance ? tarifSuggere(e.dateNaissance, GRILLE_TARIFAIRE) : null
    setModal((m) => ({
      ...m,
      data: {
        ...m.data,
        enfantId: id,
        enfantNom: e ? `${e.prenom} ${e.nom}` : '',
        montantDu: tarif ? String(tarif.tarif) : m.data.montantDu,
        montantCuisine: m.data.montantCuisine || (TYPES_AVEC_CUISINE.includes(m.data.type) ? String(params.fraisCuisine || '') : '')
      }
    }))
  }

  // Bascule le type de paiement — pré-remplit les frais de cuisine s'ils s'appliquent.
  function onTypeChange(type) {
    setModal((m) => ({
      ...m,
      data: {
        ...m.data,
        type,
        montantCuisine: m.data.montantCuisine || (TYPES_AVEC_CUISINE.includes(type) ? String(params.fraisCuisine || '') : '')
      }
    }))
  }

  // ── Paiements journaliers depuis garderie_paiements ──
  const listeJournaliers = useMemo(() => {
    const prefix = `${filtreJoAnnee}-${String(filtreJoMois).padStart(2, '0')}`
    return paiements
      .filter((p) => p.type === 'journalier' && (p.date || '').startsWith(prefix))
      .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
  }, [paiements, filtreJoMois, filtreJoAnnee])

  const totalJo = useMemo(
    () => listeJournaliers.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0),
    [listeJournaliers]
  )

  async function handlePayJournalier() {
    if (joPaySaving || !joPayModal) return
    const d = joPayModal
    if (!d.journalierId) return toast.error('Sélectionnez un enfant journalier')
    if (!d.montantPaye || Number(d.montantPaye) <= 0) return toast.error('Montant requis')
    if (!d.date) return toast.error('Date requise')
    setJoPaySaving(true)
    try {
      const id = genId()
      await setItem('garderie_paiements', id, {
        id,
        type: 'journalier',
        enfantNom: d.enfantNom.trim(),
        parentNom: d.parentNom.trim(),
        date: d.date,
        nombreJours: Number(d.nombreJours) || 1,
        montantPaye: Number(d.montantPaye),
        montantDu: Number(d.montantPaye),
        modePaiement: d.modePaiement,
        statut: 'paye',
        notes: ''
      })
      audit('garderie', 'JOURNALIER_PAIEMENT', d.enfantNom, { montant: Number(d.montantPaye) })
      notify({ type: 'info', title: `💰 Paiement journalier — ${d.enfantNom}`, body: `${Number(d.montantPaye).toLocaleString('fr-FR')} FCFA`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/paiements' })
      toast.success('Paiement enregistré ✓')
      setJoPayModal(null)
    } finally {
      setJoPaySaving(false)
    }
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handleSolde() {
    if (soldeSaving || !soldeModal) return
    const { paiement, montantComplement, modePaiement } = soldeModal
    const complement = Number(montantComplement)
    if (!complement || complement <= 0) return toast.error('Montant du complément requis')
    const reste = (Number(paiement.montantDu) || 0) - (Number(paiement.montantPaye) || 0)
    if (complement > reste) return toast.error(`Le complément ne peut pas dépasser le reste (${formatMoney(reste)} FCFA)`)
    setSoldeSaving(true)
    try {
      const nouveauMontantPaye = Number(paiement.montantPaye) + complement
      const statut = nouveauMontantPaye >= Number(paiement.montantDu) ? 'paye' : 'partiel'
      await setItem('garderie_paiements', paiement.id, {
        ...paiement,
        montantPaye: nouveauMontantPaye,
        modePaiement,
        statut,
        dateSolde: todayStr(),
        id: paiement.id
      })
      audit('garderie', 'PAIEMENT_SOLDE', paiement.enfantNom, { complement, statut })
      notify({ type: 'info', title: `💰 Paiement soldé — ${paiement.enfantNom}`, body: `Complément de ${complement.toLocaleString('fr-FR')} FCFA — ${statut === 'paye' ? 'Soldé ✓' : 'Partiel'}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/paiements' })
      toast.success(statut === 'paye' ? 'Paiement soldé ✓' : `Complément enregistré — reste ${formatMoney(reste - complement)} FCFA`)
      setSoldeModal(null)
    } finally {
      setSoldeSaving(false)
    }
  }

  function exportXLSX() {
    const rows = liste.map((p) => ({
      Enfant: p.enfantNom || '—',
      Type: TYPES_PAIEMENT.find((t) => t.id === p.type)?.label || p.type,
      Période: `${MOIS[(p.mois || 1) - 1]} ${p.annee}`,
      'Montant dû': p.montantDu,
      'Dont cuisine': p.montantCuisine || 0,
      'Montant payé': p.montantPaye,
      'Reste à payer': Math.max(0, (Number(p.montantDu) || 0) - (Number(p.montantPaye) || 0)),
      Mode: MODES_PAIEMENT.find((m) => m.id === p.modePaiement)?.label || p.modePaiement,
      Statut: STATUTS_PAIEMENT[p.statut]?.label || p.statut,
      Date: formatDateShort(p.date),
      Notes: p.notes || ''
    }))
    exportRapportExcel({ theme: 'garderie',
      filename: `paiements-garderie-${filtreAnnee}-${filtreMois}.xlsx`,
      sections: [{
        id: 'paiements', name: 'Paiements',
        title: 'Suivi des paiements — Garderie',
        subtitle: `${MOIS[(filtreMois || 1) - 1]} ${filtreAnnee} · ${liste.length} enregistrement(s)`,
        columns: [
          { key: 'Enfant', label: 'Enfant', width: 22 },
          { key: 'Type', label: 'Type', width: 20 },
          { key: 'Période', label: 'Période', width: 16 },
          { key: 'Montant dû', label: 'Montant dû (FCFA)', width: 18 },
          { key: 'Dont cuisine', label: 'Dont cuisine (FCFA)', width: 16 },
          { key: 'Montant payé', label: 'Montant payé (FCFA)', width: 18 },
          { key: 'Reste à payer', label: 'Reste à payer (FCFA)', width: 18 },
          { key: 'Mode', label: 'Mode paiement', width: 16 },
          { key: 'Statut', label: 'Statut', width: 12 },
          { key: 'Date', label: 'Date', width: 14 },
          { key: 'Notes', label: 'Notes', width: 30 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-5">

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'inscrits',    label: '🍼 Enfants inscrits' },
          { id: 'journaliers', label: '🚪 Journaliers' }
        ].map((t) => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              onglet === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ ONGLET JOURNALIERS ══ */}
      {onglet === 'journaliers' && (
        <div className="space-y-4">
          {/* Filtres + bouton ajouter */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Mois</label>
              <Select value={filtreJoMois} onChange={(e) => setFiltreJoMois(Number(e.target.value))}>
                {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Année</label>
              <Input type="number" value={filtreJoAnnee} onChange={(e) => setFiltreJoAnnee(Number(e.target.value))} style={{ width: 90 }} />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right text-sm">
                <p className="font-semibold text-green-600">{formatMoney(totalJo)} encaissés</p>
                <p className="text-xs text-gray-400">{listeJournaliers.length} paiement(s)</p>
              </div>
              <Button onClick={() => setJoPayModal({ journalierId: '', enfantNom: '', parentNom: '', nombreJours: '1', montantPaye: '', modePaiement: 'espece', date: todayStr() })}>
                <Plus size={16} /> Ajouter un paiement
              </Button>
            </div>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Enfant</th>
                  <th className="px-3 py-2 text-left">Parent</th>
                  <th className="px-3 py-2 text-center">Nb jours</th>
                  <th className="px-3 py-2 text-right">Montant payé</th>
                  <th className="px-3 py-2 text-left">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listeJournaliers.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                    Aucun paiement journalier pour {MOIS[filtreJoMois - 1]} {filtreJoAnnee}.
                  </td></tr>
                )}
                {listeJournaliers.map((p) => (
                  <tr key={p.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(p.date)}</td>
                    <td className="px-3 py-2 font-semibold">{p.enfantNom || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.parentNom || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                        {p.nombreJours || 1} jour{Number(p.nombreJours) > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">
                      {formatMoney(p.montantPaye)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {MODES_PAIEMENT.find((m) => m.id === p.modePaiement)?.label || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {listeJournaliers.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-3 py-2 text-xs font-bold text-gray-600 uppercase">
                      Total {MOIS[filtreJoMois - 1]} {filtreJoAnnee}
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-green-700">
                      {formatMoney(totalJo)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
        </div>
      )}

      {/* ══ ONGLET INSCRITS ══ */}
      {onglet === 'inscrits' && <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Mois</label>
          <Select value={filtreMois} onChange={(e) => setFiltreMois(Number(e.target.value))}>
            {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Année</label>
          <Input type="number" value={filtreAnnee} onChange={(e) => setFiltreAnnee(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Enfant</label>
          <Select value={filtreEnfant} onChange={(e) => setFiltreEnfant(e.target.value)}>
            <option value="">Tous</option>
            {enfantsActifs.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right text-sm space-y-0.5">
            <p className="font-semibold text-green-600">{formatMoney(totalPaye)} payés</p>
            <p className="text-xs text-gray-400">{formatMoney(totalDu)} attendus</p>
            {totalReste > 0 && (
              <p className="font-semibold text-red-600">{formatMoney(totalReste)} restants</p>
            )}
          </div>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export</Button>
          <Button onClick={openCreate}><Plus size={16} /> Nouveau paiement</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Période</th>
              <th className="px-3 py-2 text-right">Dû</th>
              <th className="px-3 py-2 text-right">Payé</th>
              <th className="px-3 py-2 text-right">Reste</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-sm text-gray-400">Aucun paiement sur la période.</td></tr>
            )}
            {liste.map((p) => {
              const reste = (Number(p.montantDu) || 0) - (Number(p.montantPaye) || 0)
              return (
              <tr key={p.id} className="hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">{p.enfantNom || '—'}</td>
                <td className="px-3 py-2">{TYPES_PAIEMENT.find((t) => t.id === p.type)?.label || p.type}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{MOIS[(p.mois || 1) - 1]} {p.annee}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatMoney(p.montantDu)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-green-700">{formatMoney(p.montantPaye)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                  {reste > 0
                    ? <span className="text-red-600">{formatMoney(reste)}</span>
                    : <span className="text-green-500">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">{MODES_PAIEMENT.find((m) => m.id === p.modePaiement)?.label || p.modePaiement}</td>
                <td className="px-3 py-2"><Badge tone={STATUTS_PAIEMENT[p.statut]?.tone}>{STATUTS_PAIEMENT[p.statut]?.label}</Badge></td>
                <td className="px-3 py-2 text-xs text-gray-400">{formatDateShort(p.date)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {p.statut === 'partiel' && reste > 0 && (
                      <button
                        onClick={() => setSoldeModal({ paiement: p, montantComplement: String(reste), modePaiement: p.modePaiement || 'espece' })}
                        className="flex items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-bold text-green-700 hover:bg-green-200">
                        <CheckCircle2 size={12} /> Solder
                      </button>
                    )}
                    <div className="flex gap-1">
                  <button onClick={() => setModal({
                    data: {
                      ...empty(), ...p,
                      montantCuisine: p.montantCuisine || '',
                      montantDu: Number(p.montantDu || 0) - Number(p.montantCuisine || 0)
                    },
                    isNew: false, id: p.id
                  })}
                    className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">Éditer</button>
                  <button
                    onClick={() => {
                      const enfant = enfantsActifs.find((e) => e.id === p.enfantId)
                      genererRecuPaiement(p, enfant)
                    }}
                    title="Télécharger le reçu PDF"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 font-semibold">
                    <Printer size={12} /> Reçu
                  </button>
                    </div>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
          {liste.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={5} className="px-3 py-2 text-xs font-bold text-gray-600 uppercase">
                  Total {MOIS[filtreMois - 1]} {filtreAnnee}
                </td>
                <td className="px-3 py-2 text-right font-extrabold text-green-700">
                  {formatMoney(totalPaye)}
                </td>
                <td className="px-3 py-2 text-right font-extrabold text-red-600">
                  {totalReste > 0 ? formatMoney(totalReste) : '—'}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      </> }

      {/* ── Modal : Ajouter un paiement journalier ── */}
      <Modal
        open={!!joPayModal}
        onClose={() => setJoPayModal(null)}
        size="md"
        title="🚪 Paiement — Enfant journalier"
        footer={
          <>
            <Button variant="outline" onClick={() => setJoPayModal(null)} disabled={joPaySaving}>Annuler</Button>
            <Button onClick={handlePayJournalier} loading={joPaySaving}>Enregistrer</Button>
          </>
        }
      >
        {joPayModal && (
          <div className="space-y-3">
            {/* Sélecteur journalier */}
            <FormGroup label="Enfant journalier *">
              <Select
                value={joPayModal.journalierId || ''}
                onChange={(e) => {
                  const jo = journaliers.find((j) => j.id === e.target.value)
                  if (jo) {
                    setJoPayModal((m) => ({
                      ...m,
                      journalierId: jo.id,
                      enfantNom: `${jo.prenom} ${jo.nom}`,
                      parentNom: jo.parentNom || '',
                      date: jo.date || m.date,
                      nombreJours: jo.nombreJours || '1'
                    }))
                  }
                }}
              >
                <option value="">— Choisir un journalier enregistré —</option>
                {[...journaliers]
                  .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.prenom} {j.nom} — {j.date ? new Date(j.date).toLocaleDateString('fr-FR') : ''} ({j.nombreJours || 1} jour{Number(j.nombreJours) > 1 ? 's' : ''})
                    </option>
                  ))}
              </Select>
            </FormGroup>

            {/* Infos auto-remplies */}
            {joPayModal.journalierId && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Enfant</span>
                  <span className="font-semibold">{joPayModal.enfantNom}</span>
                </div>
                <div className="flex justify-between">
                  <span>Parent</span>
                  <span className="font-semibold">{joPayModal.parentNom || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Période</span>
                  <span className="font-semibold">{joPayModal.date ? new Date(joPayModal.date).toLocaleDateString('fr-FR') : '—'} · {joPayModal.nombreJours || 1} jour(s)</span>
                </div>
              </div>
            )}

            {/* Paiement */}
            <div className="rounded-lg border border-green-100 bg-green-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-green-700">💰 Paiement</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Montant payé (FCFA) *">
                  <Input type="number" min="0" value={joPayModal.montantPaye}
                    onChange={(e) => setJoPayModal((m) => ({ ...m, montantPaye: e.target.value }))}
                    placeholder="ex: 5000" autoFocus={!!joPayModal.journalierId} />
                </FormGroup>
                <FormGroup label="Mode de paiement">
                  <Select value={joPayModal.modePaiement}
                    onChange={(e) => setJoPayModal((m) => ({ ...m, modePaiement: e.target.value }))}>
                    {MODES_PAIEMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </Select>
                </FormGroup>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal : Solder un paiement partiel ── */}
      <Modal
        open={!!soldeModal}
        onClose={() => setSoldeModal(null)}
        size="sm"
        title={soldeModal ? `💰 Solder — ${soldeModal.paiement.enfantNom}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setSoldeModal(null)} disabled={soldeSaving}>Annuler</Button>
            <Button onClick={handleSolde} loading={soldeSaving} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 size={15} /> Confirmer le paiement
            </Button>
          </>
        }
      >
        {soldeModal && (() => {
          const reste = (Number(soldeModal.paiement.montantDu) || 0) - (Number(soldeModal.paiement.montantPaye) || 0)
          return (
            <div className="space-y-3">
              {/* Récapitulatif */}
              <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Montant dû</span>
                  <span className="font-semibold">{formatMoney(soldeModal.paiement.montantDu)} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Déjà payé</span>
                  <span className="font-semibold text-green-600">{formatMoney(soldeModal.paiement.montantPaye)} FCFA</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="font-bold text-red-600">Reste à payer</span>
                  <span className="font-extrabold text-red-600">{formatMoney(reste)} FCFA</span>
                </div>
              </div>

              <FormGroup label="Montant du complément (FCFA) *">
                <Input
                  type="number" min="1" max={reste}
                  value={soldeModal.montantComplement}
                  onChange={(e) => setSoldeModal((m) => ({ ...m, montantComplement: e.target.value }))}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-400">
                  {Number(soldeModal.montantComplement) >= reste
                    ? '✅ Paiement totalement soldé après ce versement'
                    : `Reste après ce versement : ${formatMoney(reste - Number(soldeModal.montantComplement || 0))} FCFA`}
                </p>
              </FormGroup>

              <FormGroup label="Mode de paiement">
                <Select value={soldeModal.modePaiement} onChange={(e) => setSoldeModal((m) => ({ ...m, modePaiement: e.target.value }))}>
                  {MODES_PAIEMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </FormGroup>
            </div>
          )
        })()}
      </Modal>

      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Enregistrer un paiement' : 'Modifier le paiement'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Enfant *">
              <Select value={modal.data.enfantId} onChange={(e) => onEnfantChange(e.target.value)}>
                <option value="">— Choisir un enfant sans paiement ce mois —</option>
                {enfantsSansPaiement.length === 0 ? (
                  <option disabled>✅ Tous les enfants ont payé ce mois</option>
                ) : (
                  enfantsSansPaiement.map((e) => (
                    <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
                  ))
                )}
              </Select>
              {enfantsSansPaiement.length === 0 && (
                <p className="mt-1 rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700 font-semibold">
                  ✅ Tous les enfants ont déjà payé pour {MOIS[(modal.data.mois || 1) - 1]} {modal.data.annee}
                </p>
              )}
              {modal.data.enfantId && (() => {
                const e = enfantsActifs.find((x) => x.id === modal.data.enfantId)
                const t = e?.dateNaissance ? tarifSuggere(e.dateNaissance, GRILLE_TARIFAIRE) : null
                return t ? (
                  <p className="mt-1 rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700 font-semibold">
                    💰 Tarif suggéré ({t.label}) : {t.tarif.toLocaleString('fr-FR')} FCFA / mois
                  </p>
                ) : null
              })()}
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type de paiement">
                <Select value={modal.data.type} onChange={(e) => onTypeChange(e.target.value)}>
                  {TYPES_PAIEMENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Mode de paiement">
                <Select value={modal.data.modePaiement} onChange={(e) => set('modePaiement', e.target.value)}>
                  {MODES_PAIEMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Mois concerné *">
                <Select value={modal.data.mois} onChange={(e) => set('mois', Number(e.target.value))}>
                  {MOIS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m} {i + 1 === now.getMonth() + 1 ? '← mois actuel' : ''}
                    </option>
                  ))}
                </Select>
                {modal.data.mois !== now.getMonth() + 1 && (
                  <p className="mt-1 text-xs text-orange-600 font-semibold">
                    ⚠️ Ce paiement n'est pas pour le mois en cours ({MOIS[now.getMonth()]})
                  </p>
                )}
              </FormGroup>
              <FormGroup label="Année">
                <Input type="number" value={modal.data.annee} onChange={(e) => set('annee', Number(e.target.value))} />
              </FormGroup>
              <FormGroup label="Montant dû (FCFA) *">
                <Input type="number" value={modal.data.montantDu} onChange={(e) => set('montantDu', e.target.value)} />
              </FormGroup>
              {TYPES_AVEC_CUISINE.includes(modal.data.type) && (
                <FormGroup label="Frais de cuisine (FCFA)">
                  <Input type="number" min="0" value={modal.data.montantCuisine} onChange={(e) => set('montantCuisine', e.target.value)} placeholder="0" />
                  <p className="mt-1 text-xs text-gray-400">Payés à part par les parents — ajoutés au montant dû</p>
                </FormGroup>
              )}
              <FormGroup label="Montant payé (FCFA) *">
                <Input type="number" value={modal.data.montantPaye} onChange={(e) => set('montantPaye', e.target.value)} />
              </FormGroup>
              <FormGroup label="Date de paiement">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
            </div>
            {TYPES_AVEC_CUISINE.includes(modal.data.type) && Number(modal.data.montantCuisine) > 0 && (
              <p className="rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                💰 Total dû (dont {formatMoney(Number(modal.data.montantCuisine))} de cuisine) : {formatMoney(Number(modal.data.montantDu || 0) + Number(modal.data.montantCuisine || 0))}
              </p>
            )}
            <FormGroup label="Notes">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)} />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
