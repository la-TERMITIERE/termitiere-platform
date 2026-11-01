// TRÉSORERIE — Portefeuille de créances (aligné FEZIRE /treasury/creances) : ce qui a été
// vendu et pas encore encaissé, avec ses états (échue, en litige, sous échéancier,
// irrécouvrable). Par défaut une vente est payée à sa date (règle historique) ; on la
// déclare ici « à crédit » pour suivre son recouvrement.
import { useMemo, useState } from 'react'
import { HandCoins, Download, Settings2, Banknote } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import StatCard from '../../../shared/ui/StatCard'
import Badge from '../../../shared/ui/Badge'
import Button from '../../../shared/ui/Button'
import Modal from '../../../shared/ui/Modal'
import ChampRecherche, { correspond } from '../../../shared/ui/ChampRecherche'
import { addItem, setItem, removeItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { formatMoney, formatDateShort, todayStr } from '../../../utils/formatters'
import { exportRapportExcel } from '../../../utils/excelReport'
import { useAuth } from '../../../hooks/useAuth'
import BandeauCompta, { OngletsBande, BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO, ETATS_CREANCE, syntheseCreances, compteAffecte } from './logic'
import { Champ, ChoixCompte } from './ui'
import { LIBELLE_SECTEUR } from '../../../shared/ventes'

const FILTRES = [
  { id: 'tout', label: 'Tout' }, { id: 'a_recouvrer', label: 'À recouvrer' }, { id: 'echue', label: 'Échues' },
  { id: 'contestee', label: 'En litige' }, { id: 'echeancier', label: 'Sous échéancier' }, { id: 'closes', label: 'Closes' }
]
const filtrer = (c, f) => f === 'tout' ? true : f === 'a_recouvrer' ? c.reste > 0 && c.etat !== 'irrecouvrable'
  : f === 'closes' ? c.reste === 0 || c.etat === 'irrecouvrable' : c.etat === f

export default function Creances() {
  const { creances, comptes, soldes, params, loading } = useTresorerie()
  const [filtre, setFiltre] = useState('a_recouvrer')
  const [secteur, setSecteur] = useState('')
  const [recherche, setRecherche] = useState('')
  const [gerer, setGerer] = useState(null)
  const [encaisser, setEncaisser] = useState(null)

  // Le portefeuille ne montre que les ventes qui ont été, à un moment, des créances
  // (à crédit, partiellement payées, ou portant une surcouche), plus « Tout » pour le reste.
  const portefeuille = useMemo(() => creances.filter((c) => filtre === 'tout' || c.surcouche || c.payeImmediat < c.total), [creances, filtre])
  const liste = useMemo(() => portefeuille
    .filter((c) => filtrer(c, filtre) && (!secteur || c.secteur === secteur))
    .filter((c) => correspond(recherche, c.numero, c.client?.nom, c.libelle))
    .sort((a, b) => b.retard - a.retard || b.reste - a.reste), [portefeuille, filtre, secteur, recherche])
  const synth = useMemo(() => syntheseCreances(portefeuille.filter((c) => !secteur || c.secteur === secteur)), [portefeuille, secteur])

  const exporter = () => exportRapportExcel({
    filename: `creances-${todayStr()}.xlsx`,
    sections: [{ name: 'Créances', title: 'Portefeuille de créances', subtitle: `Au ${todayStr()} : filtre ${FILTRES.find((f) => f.id === filtre)?.label}`,
      columns: [{ key: 'numero', label: 'Numéro', width: 22 }, { key: 'secteur', label: 'Secteur', width: 14 }, { key: 'client', label: 'Débiteur', width: 28 }, { key: 'date', label: 'Date', width: 12 }, { key: 'echeance', label: 'Échéance', width: 12 }, { key: 'etat', label: 'État', width: 16 }, { key: 'retard', label: 'Retard (j)', width: 10 }, { key: 'total', label: 'Initial', width: 14 }, { key: 'reste', label: 'Restant', width: 14 }, { key: 'recouvrable', label: 'Recouvrable', width: 14 }],
      rows: liste.map((c) => ({ numero: c.numero, secteur: LIBELLE_SECTEUR[c.secteur], client: c.client?.nom, date: c.date, echeance: c.echeance, etat: ETATS_CREANCE[c.etat]?.label, retard: c.retard, total: c.total, reste: c.reste, recouvrable: c.recouvrable })),
      totals: { __label: 'TOTAL', total: liste.reduce((s, c) => s + c.total, 0), reste: liste.reduce((s, c) => s + c.reste, 0), recouvrable: liste.reduce((s, c) => s + c.recouvrable, 0) } }]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={HandCoins} titre="Portefeuille de créances" sous="Ce que l'organisation a facturé et n'a pas encore encaissé, avec l'état de chaque créance.">
        <OngletsBande options={FILTRES} valeur={filtre} onChange={setFiltre} taille="sm" />
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className="rounded-2xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-bold text-white [&>option]:text-gray-800">
          <option value="">Tous les secteurs</option>{Object.entries(LIBELLE_SECTEUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Numéro, débiteur…" />
        <BoutonBande icone={Download} plein={false} onClick={exporter}>Excel</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Créance totale (restant)" value={formatMoney(synth.restant)} accent="#0ea5e9" icon={HandCoins} />
        <StatCard title="Échue" value={formatMoney(synth.echue)} accent="#dc2626" icon={HandCoins} />
        <StatCard title="Recouvrable" value={formatMoney(synth.recouvrable)} sub="Le restant, moins ce qu'une contestation ou une perte suspend." accent="#16a34a" icon={HandCoins} />
        <StatCard title="Irrécouvrable" value={formatMoney(synth.irrecouvrable)} accent="#64748b" icon={HandCoins} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Créances</p><p className="text-xs text-gray-500">{liste.length} créance(s) correspondent à ce filtre. Une vente se déclare « à crédit » depuis le filtre « Tout ».</p></div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">Numéro</th><th className="px-3 py-2">Débiteur</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Échéance</th>
              <th className="px-3 py-2 text-right">Initial</th><th className="px-3 py-2 text-right">Restant</th><th className="px-3 py-2 text-right">Recouvrable</th><th className="w-28"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {liste.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Aucune créance pour ce filtre.</td></tr>}
              {liste.slice(0, 400).map((c) => (
                <tr key={c.cle} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><p className="font-mono text-xs font-semibold">{c.numero}</p><p className="text-[11px] text-gray-400">{LIBELLE_SECTEUR[c.secteur]} · {formatDateShort(c.date)}</p></td>
                  <td className="px-3 py-2">{c.client?.nom || '—'}</td>
                  <td className="px-3 py-2"><Badge tone={ETATS_CREANCE[c.etat]?.tone}>{ETATS_CREANCE[c.etat]?.label}</Badge>{c.retard > 0 && <span className="ml-1 text-[11px] font-semibold text-red-600">{c.retard} j</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatDateShort(c.echeance)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(c.total)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(c.reste)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{formatMoney(c.recouvrable)}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1">
                    {c.reste > 0 && <button title="Encaisser un règlement" onClick={() => setEncaisser(c)} className="rounded p-1.5 text-green-600 hover:bg-green-50"><Banknote size={15} /></button>}
                    <button title="Gérer la créance" onClick={() => setGerer(c)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Settings2 size={15} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <GererCreanceModal creance={gerer} onClose={() => setGerer(null)} />
      <ReglementModal creance={encaisser} onClose={() => setEncaisser(null)} comptes={soldes.length ? soldes : comptes} compteDefaut={encaisser ? compteAffecte(params, comptes, encaisser.secteur, encaisser.site) : ''} />
    </div>
  )
}

// Surcouche d'une vente (doc treso_creances/<cle>) : à crédit, échéance, état, échéancier, promesse, relances.
export function GererCreanceModal({ creance, onClose }) {
  const user = useAuth((s) => s.user)
  const [v, setV] = useState(null)
  const base = creance ? { aCredit: false, echeance: '', statut: '', motif: '', echeancier: [], promesse: null, relances: [], ...(creance.surcouche || {}) } : null
  const cur = v && v.__cle === creance?.cle ? v : (base ? { ...base, __cle: creance.cle } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const [relance, setRelance] = useState({ canal: 'appel', note: '' })

  const enregistrer = async () => {
    const { __cle, id, ...doc } = cur
    const totalEch = (doc.echeancier || []).reduce((s, t) => s + (Number(t.montant) || 0), 0)
    if (doc.echeancier?.length && totalEch < creance.reste) { if (!confirm(`L'échéancier (${formatMoney(totalEch)}) ne couvre pas tout le restant (${formatMoney(creance.reste)}). Enregistrer quand même ?`)) return }
    await setItem(COL_TRESO.creances, creance.cle, {
      ...doc, cle: creance.cle, secteur: creance.secteur, numero: creance.numero,
      dateIrrecouvrable: doc.statut === 'irrecouvrable' ? (doc.dateIrrecouvrable || todayStr()) : null,
      majLe: todayStr(), majPar: user?.nom || ''
    })
    await audit('comptabilite', 'CREANCE', `${creance.numero} : ${doc.aCredit ? 'à crédit' : 'comptant'}${doc.statut ? `, ${doc.statut}` : ''}`)
    onClose()
  }
  const reinitialiser = async () => {
    if (!confirm('Retirer le suivi de cette créance ? La vente redevient payée à sa date (sauf règlements saisis).')) return
    await removeItem(COL_TRESO.creances, creance.cle)
    onClose()
  }
  const ajouterRelance = () => { maj({ relances: [...(cur.relances || []), { date: todayStr(), canal: relance.canal, note: relance.note, par: user?.nom || '' }] }); setRelance({ canal: 'appel', note: '' }) }

  return (
    <Modal open={!!cur} onClose={onClose} size="lg" title={creance ? `Créance ${creance.numero} : ${creance.client?.nom || ''}` : ''}
      footer={<>{creance?.surcouche && <Button variant="ghost" onClick={reinitialiser}>Retirer le suivi</Button>}<Button variant="ghost" onClick={onClose}>Fermer</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
      {cur && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-500">Facturé</p><p className="font-bold">{formatMoney(creance.total)}</p></div>
            <div className="rounded-xl bg-green-50 p-2"><p className="text-gray-500">Encaissé</p><p className="font-bold text-green-700">{formatMoney(creance.encaisse)}</p></div>
            <div className="rounded-xl bg-red-50 p-2"><p className="text-gray-500">Restant</p><p className="font-bold text-red-600">{formatMoney(creance.reste)}</p></div>
          </div>
          {creance.payeImmediat < creance.total && creance.secteur === 'garderie'
            ? <p className="text-xs text-gray-500">Paiement garderie partiel : le restant est une créance d'office.</p>
            : <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={!!cur.aCredit} onChange={(e) => maj({ aCredit: e.target.checked })} />
              <span><b>Vente à crédit</b><br /><span className="text-xs text-gray-500">Décoché, la vente est encaissée à sa date (règle habituelle). Coché, seuls les règlements saisis la soldent.</span></span></label>}
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Échéance" aide={cur.echeance ? '' : `Vide : délai de paiement par défaut (actuellement le ${formatDateShort(creance.echeance)} pour cette vente).`}><input type="date" value={cur.echeance || ''} onChange={(e) => maj({ echeance: e.target.value })} className="input-base" /></Champ>
            <Champ label="État"><select value={cur.statut || ''} onChange={(e) => maj({ statut: e.target.value })} className="input-base">
              <option value="">Normal</option><option value="contestee">En litige (contestée)</option><option value="irrecouvrable">Irrécouvrable (passée en perte)</option>
            </select></Champ>
          </div>
          {cur.statut && <Champ label="Motif"><input value={cur.motif || ''} onChange={(e) => maj({ motif: e.target.value })} className="input-base" /></Champ>}
          {cur.statut === 'irrecouvrable' && <p className="text-xs text-amber-700">La perte est comptabilisée automatiquement : D 651000 Pertes sur créances / C 411100 Clients.</p>}

          <div>
            <div className="mb-1 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Échéancier</p>
              <button type="button" className="text-xs font-semibold text-orange-600" onClick={() => maj({ echeancier: [...(cur.echeancier || []), { date: todayStr(), montant: '' }] })}>+ Ajouter un terme</button></div>
            {(cur.echeancier || []).length === 0 && <p className="text-xs text-gray-400">Aucun échéancier.</p>}
            {(cur.echeancier || []).map((t, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <input type="date" value={t.date} onChange={(e) => maj({ echeancier: cur.echeancier.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)) })} className="input-base" />
                <input type="number" min="0" placeholder="Montant" value={t.montant} onChange={(e) => maj({ echeancier: cur.echeancier.map((x, k) => (k === i ? { ...x, montant: e.target.value } : x)) })} className="input-base" />
                <button type="button" className="px-2 text-gray-400 hover:text-red-600" onClick={() => maj({ echeancier: cur.echeancier.filter((_, k) => k !== i) })}>×</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Champ label="Promesse de paiement : date"><input type="date" value={cur.promesse?.date || ''} onChange={(e) => maj({ promesse: e.target.value ? { ...(cur.promesse || {}), date: e.target.value } : null })} className="input-base" /></Champ>
            <Champ label="Montant promis"><input type="number" min="0" value={cur.promesse?.montant || ''} onChange={(e) => maj({ promesse: { ...(cur.promesse || {}), montant: e.target.value } })} className="input-base" disabled={!cur.promesse?.date} /></Champ>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Relances ({(cur.relances || []).length})</p>
            {(cur.relances || []).map((r, i) => <p key={i} className="text-xs text-gray-600">{formatDateShort(r.date)} · {r.canal} · {r.note || '—'} <span className="text-gray-400">({r.par})</span></p>)}
            <div className="mt-1 flex gap-2">
              <select value={relance.canal} onChange={(e) => setRelance({ ...relance, canal: e.target.value })} className="input-base !w-32"><option value="appel">Appel</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="visite">Visite</option><option value="courrier">Courrier</option></select>
              <input value={relance.note} onChange={(e) => setRelance({ ...relance, note: e.target.value })} placeholder="Note (réponse du client…)" className="input-base" />
              <Button size="sm" variant="ghost" onClick={ajouterRelance}>Noter</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Encaisser un règlement sur une créance (doc treso_reglements).
export function ReglementModal({ creance, onClose, comptes, compteDefaut }) {
  const user = useAuth((s) => s.user)
  const [v, setV] = useState(null)
  const base = creance ? { montant: creance.reste, date: todayStr(), compteId: compteDefaut, mode: 'espece', reference: '' } : null
  const cur = v && v.__cle === creance?.cle ? v : (base ? { ...base, __cle: creance.cle } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const montant = Number(cur?.montant) || 0
  const erreur = !cur ? '' : montant <= 0 ? 'Montant invalide.' : montant > creance.reste ? `Le règlement dépasse le restant (${formatMoney(creance.reste)}).` : !cur.compteId ? 'Choisissez le compte qui reçoit.' : ''
  const enregistrer = async () => {
    if (erreur) return
    await addItem(COL_TRESO.reglements, { cle: creance.cle, secteur: creance.secteur, numero: creance.numero, client: creance.client?.nom || '', montant, date: cur.date, compteId: cur.compteId, mode: cur.mode, reference: cur.reference || '', creePar: user?.nom || '' })
    // Un règlement sur une vente « payée à sa date » la fait passer à crédit : sinon elle serait comptée deux fois.
    if (!creance.surcouche?.aCredit && creance.secteur !== 'garderie' && creance.payeImmediat >= creance.total) {
      await setItem(COL_TRESO.creances, creance.cle, { ...(creance.surcouche || {}), cle: creance.cle, secteur: creance.secteur, numero: creance.numero, aCredit: true, majLe: todayStr(), majPar: user?.nom || '' })
    }
    await audit('comptabilite', 'REGLEMENT', `${creance.numero} : ${formatMoney(montant)} encaissé`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title={creance ? `Encaisser : ${creance.numero}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer} disabled={!!erreur}>Encaisser</Button></>}>
      {cur && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{creance.client?.nom || 'Client'} · restant dû <b>{formatMoney(creance.reste)}</b></p>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Montant (XOF)"><input type="number" min="0" value={cur.montant} onChange={(e) => maj({ montant: e.target.value })} className="input-base" /></Champ>
            <Champ label="Date"><input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base" /></Champ>
            <Champ label="Mode"><select value={cur.mode} onChange={(e) => maj({ mode: e.target.value })} className="input-base"><option value="espece">Espèces</option><option value="mobile">Mobile Money</option><option value="virement">Virement</option><option value="cheque">Chèque</option></select></Champ>
            <Champ label="Pièce / référence"><input value={cur.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base" /></Champ>
          </div>
          <Champ label="Compte qui reçoit"><ChoixCompte comptes={comptes} value={cur.compteId} onChange={(id) => maj({ compteId: id })} /></Champ>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}
    </Modal>
  )
}
