// COMPTABILITÉ — Grand Livre & Balance (3 onglets, aligné FEZIRE /accounting/ledger-balance).
import { useMemo, useState } from 'react'
import { Scale, Search, CheckCircle2, AlertTriangle, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { exportRapportExcel } from '../../utils/excelReport'
import { useCompta } from './useCompta'
import { balance, grandLivreCompte } from './logic'
import { getJournal, classeDe } from './data'

const TABS = ['Balance Générale', 'Grand Livre', 'Balance Auxiliaire']

export default function GrandLivre() {
  const { plan, mvtsValides, loading } = useCompta()
  const [tab, setTab] = useState('Balance Générale')
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const bornes = { debut: du || null, fin: au || null }

  const bal = useMemo(() => balance(mvtsValides, plan, bornes), [mvtsValides, plan, du, au])

  const exporter = () => {
    const periode = du || au ? `Période ${du || '…'} → ${au || '…'}` : 'Depuis l\'origine'
    exportRapportExcel({
      filename: `balance-${(du || 'origine')}_${(au || 'a-ce-jour')}.xlsx`,
      sections: [{
        name: 'Balance', title: 'Balance générale des comptes', subtitle: `${periode} · devise XOF`,
        columns: [
          { key: 'compte', label: 'Code', width: 12 },
          { key: 'libelle', label: 'Intitulé du compte', width: 40 },
          { key: 'debit', label: 'Mvt Débit', type: 'money', width: 16 },
          { key: 'credit', label: 'Mvt Crédit', type: 'money', width: 16 },
          { key: 'soldeDebiteur', label: 'Solde Débiteur', type: 'money', width: 16 },
          { key: 'soldeCrediteur', label: 'Solde Créditeur', type: 'money', width: 16 }
        ],
        rows: bal.postes,
        totals: { __label: 'TOTAL GÉNÉRAL', debit: bal.totaux.debit, credit: bal.totaux.credit, soldeDebiteur: bal.totaux.soldeDebiteur, soldeCrediteur: bal.totaux.soldeCrediteur }
      }]
    })
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Scale className="text-orange-600" /> Grand Livre &amp; Balance
          </h1>
          <p className="text-sm text-gray-500">Consultez les balances périodiques de comptes et le grand livre analytique de vos transactions.</p>
        </div>
        <Button variant="outline" onClick={exporter}><FileDown size={15} /> Exporter (Excel)</Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{t}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="text-gray-500">Du</label>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 dark:border-white/10 dark:bg-white/5" />
          <label className="text-gray-500">Au</label>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 dark:border-white/10 dark:bg-white/5" />
        </div>
      </div>

      {tab === 'Balance Générale' && <BalanceGenerale bal={bal} />}
      {tab === 'Grand Livre' && <GrandLivreVue plan={plan} mvts={mvtsValides} bal={bal} bornes={bornes} />}
      {tab === 'Balance Auxiliaire' && <BalanceAuxiliaire bal={bal} />}
    </div>
  )
}

function BalanceGenerale({ bal }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <p className="font-bold text-gray-800 dark:text-gray-100">Balance des Comptes (Symmetric Trial Balance)</p>
          <p className="text-xs text-gray-500">Synthèse comptable des soldes débiteurs et créditeurs.</p>
        </div>
        <Badge tone={bal.equilibree ? 'success' : 'danger'}>
          {bal.equilibree ? <><CheckCircle2 size={13} /> Équilibrée</> : <><AlertTriangle size={13} /> Déséquilibre</>}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Intitulé du compte</th>
              <th className="px-3 py-2.5 text-right">Mouvement Débit</th>
              <th className="px-3 py-2.5 text-right">Mouvement Crédit</th>
              <th className="px-3 py-2.5 text-right">Solde Débiteur</th>
              <th className="px-3 py-2.5 text-right">Solde Créditeur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {bal.postes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun mouvement comptabilisé.</td></tr>}
            {bal.postes.map((p) => (
              <tr key={p.compte} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{p.compte}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{p.libelle}</td>
                <td className="px-3 py-2 text-right">{p.debit ? formatMoney(p.debit) : '-'}</td>
                <td className="px-3 py-2 text-right">{p.credit ? formatMoney(p.credit) : '-'}</td>
                <td className="px-3 py-2 text-right font-medium">{p.soldeDebiteur ? formatMoney(p.soldeDebiteur) : '-'}</td>
                <td className="px-3 py-2 text-right font-medium">{p.soldeCrediteur ? formatMoney(p.soldeCrediteur) : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-100 font-extrabold dark:border-white/20 dark:bg-white/10">
              <td className="px-3 py-3" colSpan={2}>TOTAL GÉNÉRAL</td>
              <td className="px-3 py-3 text-right">{formatMoney(bal.totaux.debit)}</td>
              <td className="px-3 py-3 text-right">{formatMoney(bal.totaux.credit)}</td>
              <td className="px-3 py-3 text-right">{formatMoney(bal.totaux.soldeDebiteur)}</td>
              <td className="px-3 py-3 text-right">{formatMoney(bal.totaux.soldeCrediteur)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function GrandLivreVue({ plan, mvts, bal, bornes }) {
  const [q, setQ] = useState('')
  const [compteSel, setCompteSel] = useState('')
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase()
    return bal.postes.filter((p) => !t || p.compte.includes(t) || (p.libelle || '').toLowerCase().includes(t))
  }, [bal, q])
  const gl = useMemo(() => compteSel ? grandLivreCompte(mvts, compteSel, bornes) : null, [mvts, compteSel, bornes])
  const compteLibelle = plan.find((c) => c.num === compteSel)?.label || ''

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 p-3 dark:border-white/10">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer un compte…"
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-white/10 dark:bg-white/5" />
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {liste.length === 0 && <p className="p-4 text-center text-sm text-gray-400">Aucun compte mouvementé.</p>}
          {liste.map((p) => {
            const solde = p.soldeDebiteur - p.soldeCrediteur
            return (
              <button key={p.compte} onClick={() => setCompteSel(p.compte)}
                className={`flex w-full items-center gap-2 border-b border-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5 ${compteSel === p.compte ? 'bg-orange-50 dark:bg-orange-500/10' : ''}`}>
                <span className="w-14 shrink-0 font-mono text-xs font-bold">{p.compte}</span>
                <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{p.libelle}</span>
                <span className={`shrink-0 text-xs font-semibold ${solde >= 0 ? 'text-gray-700 dark:text-gray-200' : 'text-red-600'}`}>{formatMoney(Math.abs(solde))}</span>
              </button>
            )
          })}
        </div>
      </Card>
      <Card className="!p-0 overflow-hidden">
        {!gl ? <p className="p-12 text-center text-gray-400">Sélectionnez un compte pour afficher son grand livre.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <span className="font-mono text-sm font-bold">{compteSel}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{compteLibelle}</span>
              <span className="ml-auto text-sm">Solde : <span className={`font-bold ${gl.solde >= 0 ? '' : 'text-red-600'}`}>{formatMoney(Math.abs(gl.solde))}</span>
                <Badge tone={gl.solde >= 0 ? 'info' : 'warning'} className="ml-1.5">{gl.solde >= 0 ? 'débiteur' : 'créditeur'}</Badge></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2">Jrnl</th><th className="px-3 py-2">Pièce</th>
                    <th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Débit</th>
                    <th className="px-3 py-2 text-right">Crédit</th><th className="px-3 py-2 text-right">Solde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {gl.lignes.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateShort(m.date)}</td>
                      <td className="px-3 py-2"><Badge tone={getJournal(m.journal)?.tone || 'neutral'}>{m.journal}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-400">{m.piece}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{m.libelle}</td>
                      <td className="px-3 py-2 text-right">{m.debit ? formatMoney(m.debit) : ''}</td>
                      <td className="px-3 py-2 text-right">{m.credit ? formatMoney(m.credit) : ''}</td>
                      <td className={`px-3 py-2 text-right font-medium ${m.soldeProgressif < 0 ? 'text-red-600' : ''}`}>{formatMoney(Math.abs(m.soldeProgressif))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// Balance auxiliaire : soldes des comptes de tiers (clients 41x, fournisseurs 40x).
function BalanceAuxiliaire({ bal }) {
  const aux = bal.postes.filter((p) => classeDe(p.compte) === '4')
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <p className="font-bold text-gray-800 dark:text-gray-100">Balance Auxiliaire (Tiers)</p>
        <p className="text-xs text-gray-500">Soldes des comptes de tiers — clients, fournisseurs, personnel, État.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Code</th><th className="px-3 py-2.5">Intitulé du compte</th>
              <th className="px-3 py-2.5 text-right">Solde Débiteur</th><th className="px-3 py-2.5 text-right">Solde Créditeur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {aux.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">Aucun compte de tiers mouvementé.</td></tr>}
            {aux.map((p) => (
              <tr key={p.compte} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{p.compte}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{p.libelle}</td>
                <td className="px-3 py-2 text-right">{p.soldeDebiteur ? formatMoney(p.soldeDebiteur) : '-'}</td>
                <td className="px-3 py-2 text-right">{p.soldeCrediteur ? formatMoney(p.soldeCrediteur) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
