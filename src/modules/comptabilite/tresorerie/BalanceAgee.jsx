// TRÉSORERIE — Balance âgée (aligné FEZIRE /treasury/balance-agee) : ce qui est en retard,
// et depuis combien de temps, par tranche d'ancienneté (configurable dans Paramètres),
// avec le détail par débiteur (au-delà de FEZIRE).
import { Fragment, useMemo, useState } from 'react'
import { Hourglass, Download } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import StatCard from '../../../shared/ui/StatCard'
import { formatMoney, todayStr } from '../../../utils/formatters'
import { exportRapportExcel } from '../../../utils/excelReport'
import BandeauCompta, { BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { balanceAgee, syntheseCreances } from './logic'
import { pourcent } from './ui'
import { LIBELLE_SECTEUR } from '../../../shared/ventes'

export default function BalanceAgee() {
  const { creances, params, loading } = useTresorerie()
  const [secteur, setSecteur] = useState('')
  const [ouverte, setOuverte] = useState(null)
  const liste = useMemo(() => creances.filter((c) => !secteur || c.secteur === secteur), [creances, secteur])
  const ba = useMemo(() => balanceAgee(liste, params.tranches), [liste, params.tranches])
  const synth = useMemo(() => syntheseCreances(liste), [liste])

  // Détail par débiteur : total échu et tranche la plus ancienne.
  const parDebiteur = useMemo(() => {
    const m = new Map()
    for (const l of ba.lignes) for (const c of l.creances) {
      const k = c.client?.nom || '(sans nom)'
      const e = m.get(k) || { nom: k, montant: 0, nb: 0, retardMax: 0 }
      e.montant += c.reste; e.nb += 1; e.retardMax = Math.max(e.retardMax, c.retard); m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.montant - a.montant)
  }, [ba])

  const exporter = () => exportRapportExcel({
    filename: `balance-agee-${todayStr()}.xlsx`,
    sections: [
      { name: 'Balance âgée', title: 'Balance âgée des créances', subtitle: `Au ${todayStr()}`,
        columns: [{ key: 'label', label: 'Tranche', width: 22 }, { key: 'nb', label: 'Créances', width: 10 }, { key: 'montant', label: 'Montant', width: 16 }, { key: 'part', label: 'Part', width: 10 }],
        rows: ba.lignes.map((l) => ({ label: l.label, nb: l.nb, montant: l.montant, part: pourcent(l.part) })), totals: { __label: 'Total échu', nb: ba.nb, montant: ba.total } },
      { name: 'Par débiteur', title: 'Créances échues par débiteur', subtitle: `Au ${todayStr()}`,
        columns: [{ key: 'nom', label: 'Débiteur', width: 30 }, { key: 'nb', label: 'Créances', width: 10 }, { key: 'retardMax', label: 'Retard max (j)', width: 14 }, { key: 'montant', label: 'Montant échu', width: 16 }],
        rows: parDebiteur }
    ]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Hourglass} titre="Balance âgée" sous="Ce qui est en retard, et depuis combien de temps.">
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className="rounded-2xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-bold text-white [&>option]:text-gray-800">
          <option value="">Tous les secteurs</option>{Object.entries(LIBELLE_SECTEUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <BoutonBande icone={Download} plein={false} onClick={exporter}>Excel</BoutonBande>
      </BandeauCompta>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Répartition par ancienneté</p><p className="text-xs text-gray-500">Une ligne par tranche configurée, même sans créance. Touchez une tranche pour voir ses créances.</p></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Tranche</th><th className="px-3 py-2 text-right">Créances</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Part</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {ba.lignes.map((l, i) => (
              <Fragment key={l.label}>
                <tr onClick={() => setOuverte(ouverte === i ? null : i)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{l.label}</td><td className="px-3 py-2 text-right">{l.nb}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(l.montant)}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500" style={{ width: `${Math.round(l.part * 100)}%` }} /></div><span className="text-xs text-gray-500">{pourcent(l.part)}</span></div></td>
                </tr>
                {ouverte === i && l.creances.map((c) => (
                  <tr key={c.cle} className="bg-orange-50/40 text-xs"><td className="px-6 py-1.5 font-mono">{c.numero}</td><td className="px-3 py-1.5" colSpan={1}>{c.client?.nom}</td><td className="px-3 py-1.5 text-right">{formatMoney(c.reste)}</td><td className="px-3 py-1.5 text-red-600">{c.retard} j · {LIBELLE_SECTEUR[c.secteur]}</td></tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr className="bg-gray-50 font-bold"><td className="px-3 py-2">Total échu</td><td className="px-3 py-2 text-right">{ba.nb}</td><td className="px-3 py-2 text-right">{formatMoney(ba.total)}</td><td /></tr></tfoot>
        </table>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card><p className="mb-2 font-bold text-gray-800">Hors balance</p>
          <p className="text-sm"><b>Non échues :</b> {formatMoney(ba.nonEchues.montant)} <span className="text-xs text-gray-500">({ba.nonEchues.nb} créance(s), elles n'ont pas de retard à mesurer)</span></p>
          <p className="mt-1 text-sm"><b>Sans classe :</b> {ba.sansClasse.nb ? `${formatMoney(ba.sansClasse.montant)} (${ba.sansClasse.nb})` : 'aucune, les tranches couvrent tous les âges.'}</p>
        </Card>
        <Card><p className="mb-2 font-bold text-gray-800">Répartition de la créance totale</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span>Totale (restant)</span><b className="text-right">{formatMoney(synth.restant)}</b>
            <span>Exigible</span><b className="text-right">{formatMoney(synth.exigible)}</b>
            <span>Échue</span><b className="text-right">{formatMoney(synth.echue)}</b>
            <span>Recouvrable</span><b className="text-right text-green-700">{formatMoney(synth.recouvrable)}</b>
            <span>Irrécouvrable</span><b className="text-right text-gray-500">{formatMoney(synth.irrecouvrable)}</b>
          </div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Échu par débiteur</p><p className="text-xs text-gray-500">Qui relancer en premier.</p></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Débiteur</th><th className="px-3 py-2 text-right">Créances</th><th className="px-3 py-2 text-right">Retard max</th><th className="px-3 py-2 text-right">Montant échu</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {parDebiteur.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Aucune créance échue.</td></tr>}
            {parDebiteur.slice(0, 100).map((d) => <tr key={d.nom}><td className="px-3 py-2">{d.nom}</td><td className="px-3 py-2 text-right">{d.nb}</td><td className="px-3 py-2 text-right text-red-600">{d.retardMax} j</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(d.montant)}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
