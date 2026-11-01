// TRÉSORERIE — Recouvrements & Crédits (aligné FEZIRE /treasury/collections) : les ventes
// à crédit actives ou partiellement payées, à encaisser, avec le journal des règlements.
import { useMemo, useState } from 'react'
import { Receipt, Download, Banknote, Settings2, Trash2 } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import StatCard from '../../../shared/ui/StatCard'
import Badge from '../../../shared/ui/Badge'
import ChampRecherche, { correspond } from '../../../shared/ui/ChampRecherche'
import { removeItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { formatMoney, formatDateShort, todayStr } from '../../../utils/formatters'
import { exportRapportExcel } from '../../../utils/excelReport'
import BandeauCompta, { OngletsBande, BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO, compteAffecte } from './logic'
import { GererCreanceModal, ReglementModal } from './Creances'
import { LIBELLE_SECTEUR } from '../../../shared/ventes'
import { useCollection } from '../../../hooks/useFirestore'

export default function Recouvrements() {
  const { creances, comptes, soldes, params, loading } = useTresorerie()
  const { data: reglements } = useCollection(COL_TRESO.reglements)
  const [vue, setVue] = useState('credits')
  const [secteur, setSecteur] = useState('')
  const [recherche, setRecherche] = useState('')
  const [gerer, setGerer] = useState(null)
  const [encaisser, setEncaisser] = useState(null)

  const credits = useMemo(() => creances
    .filter((c) => (c.surcouche?.aCredit || c.payeImmediat < c.total) && (!secteur || c.secteur === secteur))
    .filter((c) => correspond(recherche, c.numero, c.client?.nom))
    .sort((a, b) => b.date.localeCompare(a.date)), [creances, secteur, recherche])
  const enCours = credits.filter((c) => c.reste > 0)
  const nomCompte = (id) => soldes.find((c) => c.id === id)?.nom || id || '—'
  const journal = useMemo(() => reglements.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .filter((r) => (!secteur || r.secteur === secteur) && correspond(recherche, r.numero, r.client)), [reglements, secteur, recherche])

  const exporter = () => exportRapportExcel({
    filename: `recouvrements-${todayStr()}.xlsx`,
    sections: [{ name: 'Crédits', title: 'Suivi des ventes à crédit', subtitle: `Au ${todayStr()}`,
      columns: [{ key: 'numero', label: 'N° pièce', width: 22 }, { key: 'secteur', label: 'Secteur', width: 14 }, { key: 'client', label: 'Client', width: 28 }, { key: 'date', label: 'Date', width: 12 }, { key: 'total', label: 'Total TTC', width: 14 }, { key: 'encaisse', label: 'Réglé', width: 14 }, { key: 'reste', label: 'Reste à payer', width: 14 }, { key: 'statut', label: 'Statut', width: 14 }],
      rows: credits.map((c) => ({ numero: c.numero, secteur: LIBELLE_SECTEUR[c.secteur], client: c.client?.nom, date: c.date, total: c.total, encaisse: c.encaisse, reste: c.reste, statut: c.reste === 0 ? 'Payé' : c.encaisse > 0 ? 'Partiel' : 'Non payé' })),
      totals: { __label: 'TOTAL', total: credits.reduce((s, c) => s + c.total, 0), encaisse: credits.reduce((s, c) => s + c.encaisse, 0), reste: credits.reduce((s, c) => s + c.reste, 0) } },
    { name: 'Règlements', title: 'Journal des règlements', subtitle: `Au ${todayStr()}`,
      columns: [{ key: 'date', label: 'Date', width: 12 }, { key: 'numero', label: 'Pièce', width: 22 }, { key: 'client', label: 'Client', width: 26 }, { key: 'compte', label: 'Compte', width: 22 }, { key: 'mode', label: 'Mode', width: 12 }, { key: 'montant', label: 'Montant', width: 14 }],
      rows: journal.map((r) => ({ date: r.date, numero: r.numero, client: r.client, compte: nomCompte(r.compteId), mode: r.mode, montant: Number(r.montant) || 0 })) }]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Receipt} titre="Recouvrements & Crédits" sous="Suivi des ventes à crédit : encaissez les créances et suivez les règlements.">
        <OngletsBande options={[{ id: 'credits', label: 'Suivi des crédits' }, { id: 'journal', label: 'Journal des règlements' }]} valeur={vue} onChange={setVue} taille="sm" />
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className="rounded-2xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-bold text-white [&>option]:text-gray-800">
          <option value="">Tous les secteurs</option>{Object.entries(LIBELLE_SECTEUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Pièce, client…" />
        <BoutonBande icone={Download} plein={false} onClick={exporter}>Exporter Excel</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Crédits en cours (créances)" value={formatMoney(enCours.reduce((s, c) => s + c.reste, 0))} accent="#dc2626" icon={Receipt} />
        <StatCard title="Déjà recouvré" value={formatMoney(credits.reduce((s, c) => s + c.encaisse, 0))} accent="#16a34a" icon={Banknote} />
        <StatCard title="Dossiers en attente" value={`${enCours.length} vente(s)`} accent="#f59e0b" icon={Receipt} />
      </div>

      {vue === 'credits' ? (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Suivi des crédits</p><p className="text-xs text-gray-500">Toutes les ventes à crédit actives ou partiellement payées. Une vente passe à crédit depuis le Portefeuille de créances.</p></div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">N° pièce</th><th className="px-3 py-2">Secteur</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Réglé</th><th className="px-3 py-2 text-right">Reste</th><th className="px-3 py-2">Statut</th><th className="w-20"></th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {credits.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Aucune vente à crédit.</td></tr>}
                {credits.slice(0, 400).map((c) => (
                  <tr key={c.cle} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{c.numero}</td><td className="px-3 py-2 text-xs">{LIBELLE_SECTEUR[c.secteur]}</td><td className="px-3 py-2">{c.client?.nom || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatDateShort(c.date)}</td><td className="px-3 py-2 text-right">{formatMoney(c.total)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatMoney(c.encaisse)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(c.reste)}</td>
                    <td className="px-3 py-2">{c.reste === 0 ? <Badge tone="success">Payé</Badge> : c.encaisse > 0 ? <Badge tone="warning">Partiel</Badge> : <Badge tone="danger">Non payé</Badge>}</td>
                    <td className="px-2 py-2"><div className="flex justify-end gap-1">
                      {c.reste > 0 && <button title="Encaisser" onClick={() => setEncaisser(c)} className="rounded p-1.5 text-green-600 hover:bg-green-50"><Banknote size={15} /></button>}
                      <button title="Gérer" onClick={() => setGerer(c)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Settings2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Journal des règlements</p><p className="text-xs text-gray-500">Chaque règlement imputé à une vente à crédit. Supprimer un règlement le retire aussi de la comptabilité.</p></div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Pièce</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2 text-right">Montant</th><th className="w-10"></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {journal.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun règlement.</td></tr>}
              {journal.map((r) => (
                <tr key={r.id}><td className="px-3 py-2 font-mono text-xs">{formatDateShort(r.date)}</td><td className="px-3 py-2 font-mono text-xs">{r.numero}</td><td className="px-3 py-2">{r.client}</td><td className="px-3 py-2 text-xs">{nomCompte(r.compteId)}</td><td className="px-3 py-2 text-xs">{r.mode}</td><td className="px-3 py-2 text-right font-semibold text-green-700">{formatMoney(r.montant)}</td>
                  <td className="px-2 py-2"><button title="Supprimer" onClick={async () => { if (confirm('Supprimer ce règlement ?')) { await removeItem(COL_TRESO.reglements, r.id); await audit('comptabilite', 'REGLEMENT', `Supprimé : ${r.numero} ${formatMoney(r.montant)}`) } }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <GererCreanceModal creance={gerer} onClose={() => setGerer(null)} />
      <ReglementModal creance={encaisser} onClose={() => setEncaisser(null)} comptes={soldes.length ? soldes : comptes} compteDefaut={encaisser ? compteAffecte(params, comptes, encaisser.secteur, encaisser.site) : ''} />
    </div>
  )
}
