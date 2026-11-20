// TRÉSORERIE — Tableau de bord & caisses (aligné FEZIRE /treasury) : soldes par type de
// compte, comptes de trésorerie, grand livre des flux, virements internes. Les banques
// viennent des « Mouvements bancaires » ; les ventes, dépenses et rentrées des autres
// modules arrivent d'elles-mêmes dans les soldes.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Landmark, Smartphone, Store, Coins, Plus, ArrowLeftRight, PlusCircle, Pencil, Ban, Download, AlertTriangle } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import StatCard from '../../../shared/ui/StatCard'
import Button from '../../../shared/ui/Button'
import Badge from '../../../shared/ui/Badge'
import Modal from '../../../shared/ui/Modal'
import ChampRecherche, { correspond } from '../../../shared/ui/ChampRecherche'
import { addItem, updateItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { formatMoney, formatDateShort, todayStr } from '../../../utils/formatters'
import { exportRapportExcel } from '../../../utils/excelReport'
import { useAuth } from '../../../hooks/useAuth'
import BandeauCompta, { OngletsBande, BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO, TYPES_COMPTE_TRESO, NATURES, libelleNature, soldesComptes } from './logic'
import { Champ, ChoixCompte, PastilleType, MontantSigne, PERIODES, periodeRapide } from './ui'
import { LIBELLE_SECTEUR } from '../../../shared/ventes'

const ONGLETS = [{ id: 'comptes', label: 'Comptes de trésorerie' }, { id: 'historique', label: 'Grand livre / Historique' }, { id: 'virements', label: 'Virements internes' }]
const MODES = [{ id: 'CASH', label: 'Espèces' }, { id: 'MOBILE_MONEY', label: 'Mobile Money' }, { id: 'BANK_TRANSFER', label: 'Virement' }, { id: 'CHEQUE', label: 'Chèque' }, { id: 'CARD', label: 'Carte' }]

export default function TresoDashboard() {
  const user = useAuth((s) => s.user)
  const { comptes, soldes, totaux, flux, virements, loading } = useTresorerie()
  const [onglet, setOnglet] = useState('comptes')
  const [periodeId, setPeriodeId] = useState('mois')
  const [recherche, setRecherche] = useState('')
  const [filtreCompte, setFiltreCompte] = useState('')
  const [filtreSens, setFiltreSens] = useState('')
  const [modalCompte, setModalCompte] = useState(null)
  const [modalVirement, setModalVirement] = useState(null)
  const [modalMvt, setModalMvt] = useState(null)

  const { debut, fin } = periodeRapide(periodeId)
  const dansPeriode = (d) => (!debut || d >= debut) && (!fin || d <= fin)
  const fluxPeriode = useMemo(() => flux.filter((f) => dansPeriode(f.date)), [flux, debut, fin]) // eslint-disable-line react-hooks/exhaustive-deps
  const soldesFin = useMemo(() => (fin ? soldesComptes(comptes, flux, { jusqua: fin }) : soldes), [comptes, flux, fin, soldes])
  const nomCompte = (id) => soldes.find((c) => c.id === id)?.nom || id
  const alertes = soldes.filter((c) => c.seuilAlerte > 0 && c.solde < c.seuilAlerte)

  const historique = useMemo(() => fluxPeriode
    .filter((f) => (!filtreCompte || f.compteId === filtreCompte) && (!filtreSens || f.sens === filtreSens))
    .filter((f) => correspond(recherche, f.libelle, f.reference, f.tiers, nomCompte(f.compteId)))
    .slice().reverse(), [fluxPeriode, filtreCompte, filtreSens, recherche]) // eslint-disable-line react-hooks/exhaustive-deps

  const exporter = () => exportRapportExcel({
    filename: `tresorerie-grand-livre-${debut || 'debut'}-${fin || 'fin'}.xlsx`,
    sections: [{
      name: 'Grand livre trésorerie', title: 'Grand livre de trésorerie', subtitle: `Du ${debut || '…'} au ${fin || '…'}`,
      columns: [{ key: 'date', label: 'Date', width: 12 }, { key: 'compte', label: 'Compte', width: 26 }, { key: 'nature', label: 'Nature', width: 22 }, { key: 'libelle', label: 'Libellé', width: 44 }, { key: 'reference', label: 'Pièce', width: 18 }, { key: 'entree', label: 'Entrée', width: 14 }, { key: 'sortie', label: 'Sortie', width: 14 }],
      rows: historique.slice().reverse().map((f) => ({ date: f.date, compte: nomCompte(f.compteId), nature: libelleNature(f.nature), libelle: f.libelle, reference: f.reference, entree: f.sens === 'IN' ? f.montant : '', sortie: f.sens === 'OUT' ? f.montant : '' })),
      totals: { __label: 'TOTAL', entree: historique.filter((f) => f.sens === 'IN').reduce((s, f) => s + f.montant, 0), sortie: historique.filter((f) => f.sens === 'OUT').reduce((s, f) => s + f.montant, 0) }
    }]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={Coins} titre="Trésorerie & Caisse Centrale" sous="Soldes des caisses, banques et comptes Mobile Money à ce jour ; grand livre et virements sur la période choisie.">
        <OngletsBande options={PERIODES} valeur={periodeId} onChange={setPeriodeId} taille="sm" />
        <BoutonBande icone={Plus} plein={false} onClick={() => setModalCompte({ nom: '', type: 'CAISSE_SECTEUR', numero: '', soldeInitial: 0, dateSoldeInitial: todayStr(), seuilAlerte: 0, actif: true })}>Nouveau compte</BoutonBande>
        <BoutonBande icone={ArrowLeftRight} plein={false} onClick={() => setModalVirement({ de: '', vers: '', montant: '', date: todayStr(), libelle: '', reference: '' })}>Virer des fonds</BoutonBande>
        <BoutonBande icone={PlusCircle} anime onClick={() => setModalMvt({ compteId: '', sens: 'OUT', nature: 'ACHAT', montant: '', date: todayStr(), libelle: '', tiers: '', reference: '', mode: 'CASH', secteur: '' })}>Nouveau mouvement</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard title="Caisse centrale" value={formatMoney(totaux.CAISSE_CENTRALE)} accent={TYPES_COMPTE_TRESO.CAISSE_CENTRALE.couleur} icon={Wallet} />
        <StatCard title="Caisses de secteur" value={formatMoney(totaux.CAISSE_SECTEUR)} accent={TYPES_COMPTE_TRESO.CAISSE_SECTEUR.couleur} icon={Store} />
        <StatCard title="Comptes bancaires" value={formatMoney(totaux.BANQUE)} accent={TYPES_COMPTE_TRESO.BANQUE.couleur} icon={Landmark} />
        <StatCard title="Mobile Money" value={formatMoney(totaux.MOBILE_MONEY)} accent={TYPES_COMPTE_TRESO.MOBILE_MONEY.couleur} icon={Smartphone} />
        <StatCard title="Liquidités totales" value={formatMoney(totaux.total)} accent="#0f766e" icon={Coins} />
      </div>

      {alertes.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Sous le seuil d'alerte : {alertes.map((c) => `${c.nom} (${formatMoney(c.solde)} < ${formatMoney(c.seuilAlerte)})`).join(' · ')}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)} className={`rounded-full px-4 py-1.5 text-xs font-bold ${onglet === o.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}>{o.label}</button>
        ))}
      </div>

      {onglet === 'comptes' && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">État des caisses et comptes financiers</p>
            <p className="text-xs text-gray-500">Solde actuel, et entrées / sorties sur la période. Les banques se gèrent dans <Link to="/comptabilite/mouvements-bancaires" className="font-semibold text-orange-600 hover:underline">Mouvements bancaires</Link>.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2.5">Nom du compte / caisse</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Compte</th><th className="px-3 py-2.5" title="Code d'intégration à renseigner sur le compte FEZIRE correspondant (Trésorerie → Comptes)">Code FEZIRE</th>
                <th className="px-3 py-2.5 text-right">Entrées période</th><th className="px-3 py-2.5 text-right">Sorties période</th>
                <th className="px-3 py-2.5 text-right">Solde {fin ? `au ${formatDateShort(fin)}` : 'actuel'}</th><th className="px-3 py-2.5">Statut</th><th className="w-20"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {soldesFin.map((c) => {
                  const fp = fluxPeriode.filter((f) => f.compteId === c.id)
                  const e = fp.filter((f) => f.sens === 'IN').reduce((s, f) => s + f.montant, 0)
                  const s = fp.filter((f) => f.sens === 'OUT').reduce((t, f) => t + f.montant, 0)
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{c.nom}{c.numero ? <span className="ml-1 font-mono text-[11px] text-gray-400">••{String(c.numero).slice(-4)}</span> : null}
                        {c.source === 'virtuel' && <span className="ml-1 text-[11px] text-gray-400">(par défaut)</span>}</td>
                      <td className="px-3 py-2"><PastilleType type={c.type} /></td>
                      <td className="px-3 py-2 font-mono text-xs">{c.compteComptable}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500 select-all">{c.codeFezire || c.id}</td>
                      <td className="px-3 py-2 text-right text-green-700">{e ? formatMoney(e) : '—'}</td>
                      <td className="px-3 py-2 text-right text-red-600">{s ? formatMoney(s) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-bold ${c.solde < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatMoney(c.solde)}</td>
                      <td className="px-3 py-2">{c.actif === false ? <Badge tone="neutral">Inactif</Badge> : <Badge tone="success">Actif</Badge>}</td>
                      <td className="px-2 py-2 text-right">
                        {c.source === 'treso' && <button onClick={() => setModalCompte({ ...c })} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>}
                        {c.source === 'banque' && <Link to={`/comptabilite/mouvements-bancaires/${c.banqueId}`} className="text-xs font-semibold text-orange-600 hover:underline">Ouvrir</Link>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="bg-gray-50 font-bold"><td className="px-3 py-2" colSpan={6}>Liquidités totales</td><td className="px-3 py-2 text-right">{formatMoney(soldesFin.reduce((t, c) => t + c.solde, 0))}</td><td colSpan={2}></td></tr></tfoot>
            </table>
          </div>
        </Card>
      )}

      {onglet === 'historique' && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
            <p className="mr-auto font-bold text-gray-800">Grand livre de trésorerie <span className="text-xs font-normal text-gray-500">({historique.length} mouvement(s))</span></p>
            <select value={filtreCompte} onChange={(e) => setFiltreCompte(e.target.value)} className="input-base !w-auto !py-1.5 text-xs"><option value="">Tous les comptes</option>{soldes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
            <select value={filtreSens} onChange={(e) => setFiltreSens(e.target.value)} className="input-base !w-auto !py-1.5 text-xs"><option value="">Entrées et sorties</option><option value="IN">Entrées</option><option value="OUT">Sorties</option></select>
            <div className="w-56"><ChampRecherche value={recherche} onChange={setRecherche} placeholder="Libellé, pièce, tiers…" /></div>
            <Button size="sm" variant="ghost" onClick={exporter}><Download size={14} /> Excel</Button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Nature</th><th className="px-3 py-2">Libellé</th><th className="px-3 py-2">Pièce</th><th className="px-3 py-2 text-right">Montant</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {historique.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun mouvement sur la période.</td></tr>}
                {historique.slice(0, 500).map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{formatDateShort(f.date)}</td>
                    <td className="px-3 py-1.5 text-xs">{nomCompte(f.compteId)}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{libelleNature(f.nature)}{f.secteur ? ` · ${LIBELLE_SECTEUR[f.secteur] || f.secteur}` : ''}</td>
                    <td className="px-3 py-1.5">{f.libelle}{f.tiers && !String(f.libelle).includes(f.tiers) ? <span className="text-xs text-gray-400"> · {f.tiers}</span> : ''}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{f.reference || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><MontantSigne sens={f.sens} montant={f.montant} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historique.length > 500 && <p className="px-4 py-2 text-center text-xs text-gray-400">500 premiers mouvements affichés : affinez la période ou exportez en Excel.</p>}
          </div>
        </Card>
      )}

      {onglet === 'virements' && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Virements internes</p><p className="text-xs text-gray-500">Transferts de fonds entre vos caisses et comptes : ils ne changent pas les liquidités totales.</p></div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">De</th><th className="px-3 py-2">Vers</th><th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Statut</th><th className="w-10"></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {virements.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun virement interne.</td></tr>}
              {virements.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((v) => (
                <tr key={v.id} className={v.statut === 'annule' ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(v.date)}</td><td className="px-3 py-2">{nomCompte(v.de)}</td><td className="px-3 py-2">{nomCompte(v.vers)}</td>
                  <td className="px-3 py-2 text-gray-600">{v.libelle || '—'}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(v.montant)}</td>
                  <td className="px-3 py-2">{v.statut === 'annule' ? <Badge tone="neutral">Annulé</Badge> : <Badge tone="success">Effectué</Badge>}</td>
                  <td className="px-2 py-2">{v.statut !== 'annule' && <button title="Annuler le virement" onClick={async () => { if (confirm('Annuler ce virement ?')) { await updateItem(COL_TRESO.virements, v.id, { statut: 'annule', annulePar: user?.nom || '' }); await audit('comptabilite', 'VIREMENT', `Annulé : ${formatMoney(v.montant)} ${nomCompte(v.de)} → ${nomCompte(v.vers)}`) } }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Ban size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CompteModal valeur={modalCompte} onClose={() => setModalCompte(null)} user={user} />
      <VirementModal valeur={modalVirement} onClose={() => setModalVirement(null)} comptes={soldes} user={user} />
      <MouvementModal valeur={modalMvt} onClose={() => setModalMvt(null)} comptes={soldes} user={user} />
    </div>
  )
}

function CompteModal({ valeur, onClose, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__src === valeur ? v : (valeur ? { ...valeur, __src: valeur } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const enregistrer = async () => {
    if (!cur.nom?.trim()) return
    const doc = {
      nom: cur.nom.trim(), type: cur.type, numero: cur.numero || '', compteComptable: cur.compteComptable || TYPES_COMPTE_TRESO[cur.type]?.compte,
      codeFezire: (cur.codeFezire || '').trim() || null,
      soldeInitial: Number(cur.soldeInitial) || 0, dateSoldeInitial: cur.dateSoldeInitial || todayStr(), seuilAlerte: Number(cur.seuilAlerte) || 0, actif: cur.actif !== false
    }
    if (cur.id && cur.source === 'treso') await updateItem(COL_TRESO.comptes, cur.id, doc)
    else await addItem(COL_TRESO.comptes, { ...doc, creePar: user?.nom || '' })
    await audit('comptabilite', 'TRESORERIE', `${cur.id ? 'Compte modifié' : 'Compte créé'} : ${doc.nom}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title={cur?.id ? 'Modifier le compte' : 'Nouveau compte de trésorerie'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
      {cur && (
        <div className="space-y-3">
          <Champ label="Nom"><input value={cur.nom} onChange={(e) => maj({ nom: e.target.value })} className="input-base" placeholder="ex. Caisse Maxi Agro, Flooz 9x xx xx xx" /></Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Type"><select value={cur.type} onChange={(e) => maj({ type: e.target.value, compteComptable: TYPES_COMPTE_TRESO[e.target.value].compte })} className="input-base">
              {Object.entries(TYPES_COMPTE_TRESO).filter(([k]) => k !== 'BANQUE').map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select></Champ>
            <Champ label="Compte comptable"><input value={cur.compteComptable || TYPES_COMPTE_TRESO[cur.type]?.compte} onChange={(e) => maj({ compteComptable: e.target.value.replace(/[^0-9]/g, '') })} className="input-base font-mono" /></Champ>
            <Champ label="Code FEZIRE" aide="Code d'intégration du compte FEZIRE qui reçoit ces mouvements. Vide : identifiant interne."><input value={cur.codeFezire && cur.codeFezire !== cur.id ? cur.codeFezire : ''} onChange={(e) => maj({ codeFezire: e.target.value.replace(/\s/g, '') })} className="input-base font-mono" placeholder={cur.id || 'ex. CAISSE-AGRO'} /></Champ>
            <Champ label="Numéro (facultatif)"><input value={cur.numero || ''} onChange={(e) => maj({ numero: e.target.value })} className="input-base" /></Champ>
            <Champ label="Seuil d'alerte" aide="Alerte si le solde passe dessous."><input type="number" min="0" value={cur.seuilAlerte || 0} onChange={(e) => maj({ seuilAlerte: e.target.value })} className="input-base" /></Champ>
            <Champ label="Solde initial"><input type="number" value={cur.soldeInitial || 0} onChange={(e) => maj({ soldeInitial: e.target.value })} className="input-base" /></Champ>
            <Champ label="Au"><input type="date" value={cur.dateSoldeInitial || todayStr()} onChange={(e) => maj({ dateSoldeInitial: e.target.value })} className="input-base" /></Champ>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.actif !== false} onChange={(e) => maj({ actif: e.target.checked })} /> Compte actif</label>
          <p className="text-xs text-gray-400">Les banques ne se créent pas ici : elles viennent des Mouvements bancaires.</p>
        </div>
      )}
    </Modal>
  )
}

function VirementModal({ valeur, onClose, comptes, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__src === valeur ? v : (valeur ? { ...valeur, __src: valeur } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const source = comptes.find((c) => c.id === cur?.de)
  const montant = Number(cur?.montant) || 0
  const erreur = !cur ? '' : (!cur.de || !cur.vers) ? 'Choisissez les deux comptes.' : cur.de === cur.vers ? 'Les deux comptes doivent être différents.' : montant <= 0 ? 'Montant invalide.' : ''
  const enregistrer = async () => {
    if (erreur) return
    await addItem(COL_TRESO.virements, { de: cur.de, vers: cur.vers, montant, date: cur.date, libelle: cur.libelle || 'Virement interne', reference: cur.reference || '', statut: 'effectue', creePar: user?.nom || '' })
    await audit('comptabilite', 'VIREMENT', `${formatMoney(montant)} : ${source?.nom} → ${comptes.find((c) => c.id === cur.vers)?.nom}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title="Virer des fonds"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer} disabled={!!erreur}>Effectuer le virement</Button></>}>
      {cur && (
        <div className="space-y-3">
          <Champ label="Depuis"><ChoixCompte comptes={comptes} value={cur.de} onChange={(id) => maj({ de: id })} /></Champ>
          {source && <p className="-mt-2 text-xs text-gray-500">Solde disponible : <b>{formatMoney(source.solde)}</b>{montant > source.solde ? <span className="text-red-600"> : le virement dépasse le solde.</span> : ''}</p>}
          <Champ label="Vers"><ChoixCompte comptes={comptes} value={cur.vers} onChange={(id) => maj({ vers: id })} exclure={cur.de} /></Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Montant (XOF)"><input type="number" min="0" value={cur.montant} onChange={(e) => maj({ montant: e.target.value })} className="input-base" /></Champ>
            <Champ label="Date"><input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base" /></Champ>
          </div>
          <Champ label="Libellé"><input value={cur.libelle} onChange={(e) => maj({ libelle: e.target.value })} className="input-base" placeholder="ex. Versement de la recette du jour" /></Champ>
          <Champ label="Pièce / référence"><input value={cur.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base" /></Champ>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}
    </Modal>
  )
}

export function MouvementModal({ valeur, onClose, comptes, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__src === valeur ? v : (valeur ? { ...valeur, __src: valeur } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const natures = NATURES[cur?.sens] || []
  const nature = natures.find((x) => x.id === cur?.nature)
  const montant = Number(cur?.montant) || 0
  const erreur = !cur ? '' : !cur.compteId ? 'Choisissez le compte.' : montant <= 0 ? 'Montant invalide.' : !nature ? 'Choisissez la nature.' : ''
  const enregistrer = async () => {
    if (erreur) return
    const doc = { compteId: cur.compteId, sens: cur.sens, nature: cur.nature, montant, date: cur.date, libelle: cur.libelle || nature.label, tiers: cur.tiers || '', reference: cur.reference || '', mode: cur.mode, secteur: cur.secteur || '', contrepartie: cur.contrepartie || nature.compte, statut: 'valide' }
    if (cur.id) await updateItem(COL_TRESO.mouvements, cur.id, doc)
    else await addItem(COL_TRESO.mouvements, { ...doc, creePar: user?.nom || '' })
    await audit('comptabilite', 'TRESORERIE', `${cur.sens === 'IN' ? 'Encaissement' : 'Décaissement'} ${formatMoney(montant)} : ${doc.libelle}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title={cur?.id ? 'Modifier le mouvement' : 'Nouveau mouvement de trésorerie'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer} disabled={!!erreur}>Enregistrer</Button></>}>
      {cur && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {[{ id: 'IN', label: 'Encaissement' }, { id: 'OUT', label: 'Décaissement' }].map((s) => (
              <button key={s.id} type="button" onClick={() => maj({ sens: s.id, nature: NATURES[s.id][0].id, contrepartie: '' })} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${cur.sens === s.id ? (s.id === 'IN' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-100 text-gray-600'}`}>{s.label}</button>
            ))}
          </div>
          <Champ label="Compte"><ChoixCompte comptes={comptes} value={cur.compteId} onChange={(id) => maj({ compteId: id })} /></Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Nature" aide={nature ? `Contrepartie : compte ${cur.contrepartie || nature.compte}` : ''}><select value={cur.nature} onChange={(e) => maj({ nature: e.target.value, contrepartie: '' })} className="input-base">{natures.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Champ>
            <Champ label="Montant (XOF)"><input type="number" min="0" value={cur.montant} onChange={(e) => maj({ montant: e.target.value })} className="input-base" /></Champ>
            <Champ label="Date"><input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base" /></Champ>
            <Champ label="Mode"><select value={cur.mode} onChange={(e) => maj({ mode: e.target.value })} className="input-base">{MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Champ>
            <Champ label="Tiers"><input value={cur.tiers} onChange={(e) => maj({ tiers: e.target.value })} className="input-base" placeholder="Fournisseur, salarié, client…" /></Champ>
            <Champ label="Pièce / référence"><input value={cur.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base" /></Champ>
            <Champ label="Secteur (facultatif)"><select value={cur.secteur} onChange={(e) => maj({ secteur: e.target.value })} className="input-base"><option value="">—</option>{Object.entries(LIBELLE_SECTEUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
            <Champ label="Compte de contrepartie"><input value={cur.contrepartie || nature?.compte || ''} onChange={(e) => maj({ contrepartie: e.target.value.replace(/[^0-9]/g, '') })} className="input-base font-mono" /></Champ>
          </div>
          <Champ label="Libellé"><input value={cur.libelle} onChange={(e) => maj({ libelle: e.target.value })} className="input-base" placeholder={nature?.label} /></Champ>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}
    </Modal>
  )
}
