// TRÉSORERIE — Prévisions (au-delà de FEZIRE) : solde projeté semaine par semaine à partir
// des liquidités d'aujourd'hui, des encaissements attendus (échéances, échéanciers,
// promesses) et des dépenses approuvées pas encore décaissées.
import { Fragment, useMemo, useState } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import StatCard from '../../../shared/ui/StatCard'
import { formatMoney, formatDateShort } from '../../../utils/formatters'
import BandeauCompta, { OngletsBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { prevision } from './logic'

export default function Previsions() {
  const { creances, depenses, dettes, totaux, params, loading } = useTresorerie()
  const [semaines, setSemaines] = useState('12')
  const aVenir = useMemo(() => depenses.filter((d) => d.statut === 'approuvee'), [depenses])
  const p = useMemo(() => prevision({ soldeDepart: totaux.total, creancesListe: creances, depensesAVenir: aVenir, dettesFournisseurs: dettes, semaines: Number(semaines) }), [totaux.total, creances, aVenir, dettes, semaines])
  const minimum = p.semaines.reduce((m, s) => (s.solde < m.solde ? s : m), p.semaines[0] || { solde: 0 })
  const seuil = Number(params.seuilAlerte) || 0
  const max = Math.max(1, ...p.semaines.map((s) => Math.abs(s.solde)), Math.abs(totaux.total))
  const [ouverte, setOuverte] = useState(null)

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={TrendingUp} titre="Prévisions de trésorerie" sous="Solde projeté à partir des liquidités du jour, des créances attendues, des factures fournisseurs à payer et des dépenses approuvées non décaissées.">
        <OngletsBande options={[{ id: '4', label: '1 mois' }, { id: '12', label: '3 mois' }, { id: '26', label: '6 mois' }]} valeur={semaines} onChange={setSemaines} taille="sm" />
      </BandeauCompta>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Liquidités aujourd'hui" value={formatMoney(totaux.total)} accent="#0f766e" icon={TrendingUp} />
        <StatCard title="Encaissements attendus" value={formatMoney(p.semaines.reduce((s, x) => s + x.entrees, 0))} accent="#16a34a" icon={TrendingUp} />
        <StatCard title="Décaissements attendus" value={formatMoney(p.semaines.reduce((s, x) => s + x.sorties, 0))} accent="#dc2626" icon={TrendingUp} />
        <StatCard title="Point bas" value={formatMoney(minimum?.solde || 0)} sub={minimum?.debut ? `semaine du ${formatDateShort(minimum.debut)}` : ''} accent={minimum?.solde < seuil ? '#dc2626' : '#2563eb'} icon={TrendingUp} />
      </div>

      {minimum && minimum.solde < seuil && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Le solde projeté passe sous {seuil ? `le seuil d'alerte (${formatMoney(seuil)})` : 'zéro'} la semaine du {formatDateShort(minimum.debut)} : relancez les créances ou décalez des dépenses.
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Solde projeté par semaine</p><p className="text-xs text-gray-500">Touchez une semaine pour voir ce qui la compose. Les créances en litige ne sont pas comptées.</p></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Semaine</th><th className="px-3 py-2 text-right">Entrées</th><th className="px-3 py-2 text-right">Sorties</th><th className="px-3 py-2 text-right">Solde fin</th><th className="px-3 py-2 w-1/3"></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {p.semaines.map((s, i) => (
              <Fragment key={s.debut}>
                <tr onClick={() => setOuverte(ouverte === i ? null : i)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(s.debut)} → {formatDateShort(s.fin)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{s.entrees ? formatMoney(s.entrees) : '—'}</td>
                  <td className="px-3 py-2 text-right text-red-600">{s.sorties ? formatMoney(s.sorties) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-bold ${s.solde < seuil ? 'text-red-600' : ''}`}>{formatMoney(s.solde)}</td>
                  <td className="px-3 py-2"><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${s.solde < 0 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(100, Math.abs(s.solde) / max * 100)}%` }} /></div></td>
                </tr>
                {ouverte === i && s.details.map((d, k) => <tr key={`${s.debut}-${k}`} className="bg-gray-50/60 text-xs"><td className="px-6 py-1" colSpan={3}>{formatDateShort(d.date)} · {d.libelle}</td><td className={`px-3 py-1 text-right ${d.sens === 'IN' ? 'text-green-700' : 'text-red-600'}`}>{d.sens === 'IN' ? '+' : '−'} {formatMoney(d.montant)}</td><td /></tr>)}
              </Fragment>
            ))}
          </tbody>
        </table>
        {(p.auDela.entrees > 0 || p.auDela.sorties > 0) && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">Au-delà de l'horizon : {formatMoney(p.auDela.entrees)} attendus, {formatMoney(p.auDela.sorties)} à décaisser.</p>}
      </Card>
    </div>
  )
}
