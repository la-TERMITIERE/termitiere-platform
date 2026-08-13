// Marge & Bénéfice — BRIQUETERIE.
// Reproduit le suivi « RECETTE » : pour chaque vente facturée, on calcule
//   Recette (PU × quantité) − Valeur du matériel (quantité × prix du sac ÷ rendement)
//   = Bénéfice.
// Le coût matériel repose sur le prix d'UN sac de ciment (paramétrable ici) et le
// rendement de chaque type de brique (nombre de briques par sac, réglé dans les
// Paramètres). Vue filtrable par période (mois en cours par défaut).
import { useMemo, useState, useEffect } from 'react'
import { Scale, BadgeDollarSign, Package, TrendingUp, FileSpreadsheet, Save, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { rendementBrique, coutMatiereBrique } from './logic'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'

export default function Marge() {
  const briques = useBriqueterieStore((s) => s.briques)
  const prixSacCiment = useBriqueterieStore((s) => s.prixSacCiment)
  const saveMarge = useBriqueterieStore((s) => s.saveMarge)
  const { data: factures } = useCollection('evenementiel_factures')
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  const [prixLocal, setPrixLocal] = useState(prixSacCiment)
  const [savingPrix, setSavingPrix] = useState(false)
  useEffect(() => { setPrixLocal(prixSacCiment) }, [prixSacCiment])

  // Résolution d'une ligne de facture vers un type de brique (par id, sinon par nom).
  const idSet = useMemo(() => new Set(briques.map((b) => b.id)), [briques])
  const byName = useMemo(() => {
    const m = {}; briques.forEach((b) => { m[(b.nom || '').trim().toLowerCase()] = b.id }); return m
  }, [briques])
  const briqueDe = (l) => {
    const id = (l.articleId && idSet.has(l.articleId)) ? l.articleId : byName[(l.article || l.briqueNom || '').trim().toLowerCase()]
    return briques.find((b) => b.id === id) || null
  }

  const inPeriode = (d) => (d || '') >= start && (d || '') <= end

  // Lignes de marge : une par ligne de facture rattachée à un type de brique.
  const lignes = useMemo(() => {
    const out = []
    factures.filter((f) => inPeriode(f.date)).forEach((f) => {
      (f.lignes || []).forEach((l) => {
        const b = briqueDe(l)
        if (!b) return // ligne « Autre » / frais : pas de matériel → hors marge
        const qte = parseInt(l.qte) || 0
        if (qte <= 0) return
        const recette = l.total != null ? (parseFloat(l.total) || 0) : qte * (parseFloat(l.prixUnit) || 0)
        const pu = qte ? recette / qte : (parseFloat(l.prixUnit) || 0)
        const rendement = rendementBrique(b)
        const coutU = coutMatiereBrique(b, prixSacCiment)
        const valeurMateriel = qte * coutU
        return out.push({
          date: f.date, briqueId: b.id, nom: b.nom, pu, qte,
          recette, valeurMateriel, benefice: recette - valeurMateriel,
          rendement, client: f.client?.nom || '—', num: f.numero || f.num || ''
        })
      })
    })
    return out.sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [factures, briques, prixSacCiment, start, end])

  const totaux = useMemo(() => lignes.reduce((t, l) => ({
    recette: t.recette + l.recette,
    valeurMateriel: t.valeurMateriel + l.valeurMateriel,
    benefice: t.benefice + l.benefice,
    qte: t.qte + l.qte
  }), { recette: 0, valeurMateriel: 0, benefice: 0, qte: 0 }), [lignes])

  // Récapitulatif par type de brique (comme le bas du tableau Excel).
  const parType = useMemo(() => {
    const map = {}
    lignes.forEach((l) => {
      const c = map[l.briqueId] || { id: l.briqueId, nom: l.nom, qte: 0, recette: 0, valeurMateriel: 0, benefice: 0 }
      c.qte += l.qte; c.recette += l.recette; c.valeurMateriel += l.valeurMateriel; c.benefice += l.benefice
      map[l.briqueId] = c
    })
    return Object.values(map).sort((a, b) => b.benefice - a.benefice)
  }, [lignes])

  // Types vendus sans rendement défini : marge non calculable → à régler en Paramètres.
  const typesSansRendement = useMemo(
    () => [...new Set(lignes.filter((l) => l.rendement <= 0).map((l) => l.nom))],
    [lignes]
  )
  const margePct = totaux.recette > 0 ? (totaux.benefice / totaux.recette) * 100 : 0

  async function enregistrerPrix() {
    setSavingPrix(true)
    try {
      await saveMarge(prixLocal)
      toast.success('Prix du sac de ciment enregistré ✓')
    } finally { setSavingPrix(false) }
  }

  function exportExcel() {
    if (!lignes.length) return toast.error('Aucune vente sur la période')
    exportRapportExcel({
      filename: `marge-briqueterie-${start}_${end}.xlsx`,
      sections: [
        {
          id: 'marge', name: 'Recette-Bénéfice', title: 'Marge bénéficiaire — Briqueterie',
          subtitle: `Période : ${formatDateShort(start)} → ${formatDateShort(end)} · Sac de ciment : ${formatMoney(prixSacCiment)}`,
          columns: [
            { key: 'date', label: 'Date', width: 12 },
            { key: 'nom', label: 'Qualité de brique', width: 20 },
            { key: 'pu', label: 'PU', width: 10, type: 'number' },
            { key: 'qte', label: 'Quantité vendue', width: 14, type: 'number' },
            { key: 'recette', label: 'Recette', width: 14, type: 'money' },
            { key: 'valeurMateriel', label: 'Valeur du matériel', width: 16, type: 'money' },
            { key: 'benefice', label: 'Bénéfice', width: 14, type: 'money' },
            { key: 'client', label: 'Client', width: 20 }
          ],
          rows: lignes.map((l) => ({ ...l, date: formatDateShort(l.date), pu: Math.round(l.pu), recette: Math.round(l.recette), valeurMateriel: Math.round(l.valeurMateriel), benefice: Math.round(l.benefice) })),
          totals: { __label: 'TOTAL GÉNÉRAL', recette: Math.round(totaux.recette), valeurMateriel: Math.round(totaux.valeurMateriel), benefice: Math.round(totaux.benefice) }
        },
        {
          id: 'parType', name: 'Par type', title: 'Total vendu & bénéfice par type',
          columns: [
            { key: 'nom', label: 'Type de brique', width: 22 },
            { key: 'qte', label: 'Total vendu', width: 14, type: 'number' },
            { key: 'recette', label: 'Recette', width: 14, type: 'money' },
            { key: 'benefice', label: 'Bénéfice', width: 14, type: 'money' }
          ],
          rows: parType.map((t) => ({ nom: t.nom, qte: t.qte, recette: Math.round(t.recette), benefice: Math.round(t.benefice) })),
          totals: { __label: 'TOTAL', qte: totaux.qte, recette: Math.round(totaux.recette), benefice: Math.round(totaux.benefice) }
        }
      ]
    })
    toast.success('Export Excel généré ✓')
  }

  const kpis = [
    { title: 'Recette totale', value: formatMoney(totaux.recette), icon: BadgeDollarSign, color: '#7c3aed' },
    { title: 'Valeur du matériel', value: formatMoney(totaux.valeurMateriel), icon: Package, color: '#ca8a04' },
    { title: 'Bénéfice', value: formatMoney(totaux.benefice), icon: TrendingUp, color: '#16a34a' },
    { title: 'Marge', value: `${margePct.toFixed(1)} %`, icon: Scale, color: '#0891b2' }
  ]

  return (
    <div className="space-y-5">
      {/* En-tête + période */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-violet-700 to-violet-900 p-4 text-white shadow-lg">
        <Scale size={22} />
        <div>
          <h2 className="text-base font-extrabold">Marge &amp; Bénéfice — Briqueterie</h2>
          <p className="text-xs text-white/80">Recette − valeur du matériel (prix du sac ÷ rendement) = bénéfice</p>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      {/* Prix du sac de ciment (base du coût matériel) */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Prix d'un sac de ciment (FCFA)</label>
            <Input type="number" min="0" className="w-40" value={prixLocal} onChange={(e) => setPrixLocal(e.target.value)} />
          </div>
          <Button variant="outline" onClick={enregistrerPrix} loading={savingPrix} disabled={String(prixLocal) === String(prixSacCiment)}>
            <Save size={15} /> Enregistrer le prix
          </Button>
          <p className="text-xs text-gray-400">
            Le coût matériel d'une brique = <strong>{formatMoney(prixSacCiment)}</strong> ÷ rendement du type.
            Réglez le rendement de chaque type dans <strong>Paramètres</strong>.
          </p>
        </div>
      </Card>

      {typesSansRendement.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>Rendement manquant pour : <strong>{typesSansRendement.join(', ')}</strong>. Leur coût matériel est compté à 0 (bénéfice = recette) tant que le rendement n'est pas renseigné dans les Paramètres.</p>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.title} className="card p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: k.color + '18', color: k.color }}><k.icon size={18} /></div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{k.title}</p>
            <p className="truncate text-xl font-extrabold text-gray-900" title={String(k.value)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={exportExcel} disabled={!lignes.length}><FileSpreadsheet size={16} /> Exporter Excel</Button>
      </div>

      {/* Détail par vente */}
      <Card title="Détail des ventes — recette, matériel, bénéfice" className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Qualité</th>
              <th className="px-2 py-2 text-right">PU</th>
              <th className="px-2 py-2 text-center">Qté</th>
              <th className="px-3 py-2 text-right">Recette</th>
              <th className="px-3 py-2 text-right">Valeur matériel</th>
              <th className="px-3 py-2 text-right">Bénéfice</th>
              <th className="px-3 py-2 text-left">Client</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l, i) => (
              <tr key={i} className="hover:bg-violet-50/40">
                <td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(l.date)}</td>
                <td className="px-3 py-1.5 font-semibold">{l.nom}</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(Math.round(l.pu))}</td>
                <td className="px-2 py-1.5 text-center">{formatNumber(l.qte)}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-violet-700">{formatMoney(Math.round(l.recette))}</td>
                <td className="px-3 py-1.5 text-right text-amber-700">{formatMoney(Math.round(l.valeurMateriel))}</td>
                <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(Math.round(l.benefice))}</td>
                <td className="px-3 py-1.5 text-xs text-gray-500">{l.client}</td>
              </tr>
            ))}
            {!lignes.length && <tr><td colSpan={8} className="py-10 text-center text-gray-400">Aucune vente facturée sur la période.</td></tr>}
          </tbody>
          {lignes.length > 0 && (
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-3 py-2" colSpan={3}>TOTAL GÉNÉRAL</td>
                <td className="px-2 py-2 text-center">{formatNumber(totaux.qte)}</td>
                <td className="px-3 py-2 text-right text-violet-700">{formatMoney(Math.round(totaux.recette))}</td>
                <td className="px-3 py-2 text-right text-amber-700">{formatMoney(Math.round(totaux.valeurMateriel))}</td>
                <td className="px-3 py-2 text-right text-green-700">{formatMoney(Math.round(totaux.benefice))}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {/* Récapitulatif par type */}
      <Card title="Total vendu & bénéfice par type de brique" className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-center">Total vendu</th>
              <th className="px-3 py-2 text-right">Recette</th>
              <th className="px-3 py-2 text-right">Valeur matériel</th>
              <th className="px-3 py-2 text-right">Bénéfice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {parType.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-1.5 font-semibold">{t.nom}</td>
                <td className="px-3 py-1.5 text-center">{formatNumber(t.qte)}</td>
                <td className="px-3 py-1.5 text-right text-violet-700">{formatMoney(Math.round(t.recette))}</td>
                <td className="px-3 py-1.5 text-right text-amber-700">{formatMoney(Math.round(t.valeurMateriel))}</td>
                <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(Math.round(t.benefice))}</td>
              </tr>
            ))}
            {!parType.length && <tr><td colSpan={5} className="py-8 text-center text-gray-400">Aucune donnée.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
