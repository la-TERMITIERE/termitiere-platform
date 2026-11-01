// COMPTABILITÉ — Factures fournisseurs (achats à crédit) : la dette fournisseur, la TVA
// déductible et les échéances de paiement. Une facture VALIDÉE passe au journal des achats
// (D charges + D 445660 / C 401100) ; ses règlements sortent d'un compte de trésorerie
// (D 401100 / C 5xxxxx) et apparaissent dans la Trésorerie, les Prévisions et FEZIRE.
// À utiliser pour les achats facturés à payer plus tard : un achat payé comptant reste
// une dépense d'E-DÉPENSES (ne pas saisir les deux).
import { useMemo, useState } from 'react'
import { FileInput, Plus, Pencil, Trash2, CheckCircle2, Banknote, Ban } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { formatMoney, formatDateShort, todayStr, genId } from '../../utils/formatters'
import { useAuth } from '../../hooks/useAuth'
import { useCompta } from './useCompta'
import { COL } from './data'
import BandeauCompta, { OngletsBande, BoutonBande } from './BandeauCompta'
import { totauxFactureFournisseur, ajouterJours, compteAffecte } from './tresorerie/logic'
import { ChoixCompte } from './tresorerie/ui'
import { estVerrouillee } from './EcrituresOnglets'
import { LIBELLE_SECTEUR } from '../../shared/ventes'

const ligneVide = () => ({ compte: '605000', libelle: '', montantHT: '', tauxTva: 0 })
const FILTRES = [{ id: 'a_payer', label: 'À payer' }, { id: 'echues', label: 'Échues' }, { id: 'payees', label: 'Payées' }, { id: 'brouillons', label: 'Brouillons' }, { id: 'toutes', label: 'Toutes' }]

export default function FacturesFournisseurs() {
  const user = useAuth((s) => s.user)
  const { plan, exercices, treso, loading } = useCompta()
  const [filtre, setFiltre] = useState('a_payer')
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null)
  const [regler, setRegler] = useState(null)
  const factures = treso.facturesFournisseurs
  const parId = useMemo(() => new Map(treso.dettes.map((d) => [d.id, d])), [treso.dettes])
  const ajd = todayStr()

  const liste = useMemo(() => factures.map((f) => ({ ...f, ...(parId.get(f.id) || { ...totauxFactureFournisseur(f), echeance: f.echeance || f.date, retard: 0 }) }))
    .filter((f) => filtre === 'toutes' ? f.statut !== 'annulee'
      : filtre === 'brouillons' ? f.statut === 'brouillon'
      : filtre === 'payees' ? f.statut === 'validee' && f.reste === 0
      : filtre === 'echues' ? f.statut === 'validee' && f.reste > 0 && f.echeance < ajd
      : f.statut === 'validee' && f.reste > 0)
    .filter((f) => correspond(recherche, f.numero, f.fournisseur))
    .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance))), [factures, parId, filtre, recherche, ajd])

  const aPayer = treso.dettes.reduce((s, f) => s + f.reste, 0)
  const echu = treso.dettes.filter((f) => f.reste > 0 && f.echeance < ajd).reduce((s, f) => s + f.reste, 0)
  const tvaDed = treso.dettes.filter((f) => String(f.date).slice(0, 4) === ajd.slice(0, 4)).reduce((s, f) => s + f.tva, 0)
  const fournisseursConnus = useMemo(() => [...new Set(factures.map((f) => f.fournisseur).filter(Boolean))], [factures])

  const enregistrer = async (statut) => {
    const lignes = (modal.lignes || []).filter((l) => Number(l.montantHT) > 0).map((l) => ({ compte: String(l.compte || '605000'), libelle: l.libelle || '', montantHT: Number(l.montantHT), tauxTva: Number(l.tauxTva) || 0 }))
    if (!modal.fournisseur?.trim() || !lignes.length) { alert('Fournisseur et au moins une ligne avec un montant.'); return }
    if (estVerrouillee(modal.date, exercices)) { alert('Cette date tombe dans un exercice clôturé.'); return }
    const t = totauxFactureFournisseur({ lignes })
    const doc = { fournisseur: modal.fournisseur.trim(), numero: modal.numero || '', date: modal.date, echeance: modal.echeance || ajouterJours(modal.date, 30), secteur: modal.secteur || '', lignes, totalHT: t.ht, totalTva: t.tva, totalTTC: t.ttc, statut, note: modal.note || '' }
    if (modal.id) await updateItem(COL.facturesFournisseurs, modal.id, doc)
    else await addItem(COL.facturesFournisseurs, { ...doc, reglements: [], creePar: user?.nom || '' })
    await audit('comptabilite', 'FACTURE_FOURNISSEUR', `${doc.numero || doc.fournisseur} : ${formatMoney(t.ttc)} (${statut})`)
    setModal(null)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={FileInput} titre="Factures fournisseurs" sous="Achats facturés à payer plus tard : dettes fournisseurs, TVA déductible et échéances. Un achat payé comptant reste une dépense d'E-DÉPENSES.">
        <OngletsBande options={FILTRES} valeur={filtre} onChange={setFiltre} taille="sm" />
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Numéro, fournisseur…" />
        <BoutonBande icone={Plus} anime onClick={() => setModal({ fournisseur: '', numero: '', date: ajd, echeance: ajouterJours(ajd, 30), secteur: '', lignes: [ligneVide()], note: '' })}>Nouvelle facture</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Dettes fournisseurs à payer" value={formatMoney(aPayer)} accent="#dc2626" icon={FileInput} />
        <StatCard title="Dont échues" value={formatMoney(echu)} accent="#b91c1c" icon={FileInput} />
        <StatCard title={`TVA déductible ${ajd.slice(0, 4)}`} value={formatMoney(tvaDed)} accent="#0ea5e9" icon={FileInput} />
        <StatCard title="Factures validées" value={treso.dettes.length} accent="#0d9488" icon={FileInput} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Fournisseur</th><th className="px-3 py-2">N° / date</th><th className="px-3 py-2">Échéance</th><th className="px-3 py-2 text-right">HT</th><th className="px-3 py-2 text-right">TVA</th><th className="px-3 py-2 text-right">TTC</th><th className="px-3 py-2 text-right">Reste</th><th className="px-3 py-2">Statut</th><th className="w-28"></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {liste.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Aucune facture pour ce filtre.</td></tr>}
              {liste.map((f) => {
                const verrou = estVerrouillee(f.date, exercices)
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{f.fournisseur}{f.secteur ? <span className="block text-[11px] text-gray-400">{LIBELLE_SECTEUR[f.secteur]}</span> : null}</td>
                    <td className="px-3 py-2"><p className="font-mono text-xs">{f.numero || '—'}</p><p className="text-[11px] text-gray-400">{formatDateShort(f.date)}</p></td>
                    <td className={`px-3 py-2 font-mono text-xs ${f.retard > 0 ? 'font-bold text-red-600' : ''}`}>{formatDateShort(f.echeance)}{f.retard > 0 ? ` (+${f.retard} j)` : ''}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(f.ht)}</td><td className="px-3 py-2 text-right text-gray-500">{formatMoney(f.tva)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(f.ttc)}</td><td className={`px-3 py-2 text-right font-bold ${f.reste ? 'text-red-600' : 'text-green-700'}`}>{formatMoney(f.reste)}</td>
                    <td className="px-3 py-2">{f.statut === 'brouillon' ? <Badge tone="warning">Brouillon</Badge> : f.reste === 0 ? <Badge tone="success">Payée</Badge> : f.regle > 0 ? <Badge tone="info">Partielle</Badge> : <Badge tone="danger">À payer</Badge>}</td>
                    <td className="px-2 py-2"><div className="flex justify-end gap-1">
                      {f.statut === 'validee' && f.reste > 0 && <button title="Régler" onClick={() => setRegler(f)} className="rounded p-1.5 text-green-600 hover:bg-green-50"><Banknote size={15} /></button>}
                      {f.statut === 'brouillon' && !verrou && <>
                        <button title="Valider (passe au journal des achats)" onClick={async () => { await updateItem(COL.facturesFournisseurs, f.id, { statut: 'validee' }); await audit('comptabilite', 'FACTURE_FOURNISSEUR', `${f.numero || f.fournisseur} validée`) }} className="rounded p-1.5 text-green-600 hover:bg-green-50"><CheckCircle2 size={15} /></button>
                        <button title="Modifier" onClick={() => setModal({ ...f, lignes: f.lignes.map((l) => ({ ...l })) })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>
                        <button title="Supprimer" onClick={async () => { if (confirm('Supprimer ce brouillon ?')) await removeItem(COL.facturesFournisseurs, f.id) }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                      </>}
                      {f.statut === 'validee' && !f.regle && !verrou && <button title="Annuler la facture" onClick={async () => { if (confirm('Annuler cette facture ? Elle sort de la comptabilité.')) { await updateItem(COL.facturesFournisseurs, f.id, { statut: 'annulee', annuleePar: user?.nom || '' }); await audit('comptabilite', 'FACTURE_FOURNISSEUR', `${f.numero || f.fournisseur} annulée`) } }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Ban size={14} /></button>}
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="xl" title={modal?.id ? 'Modifier la facture fournisseur' : 'Nouvelle facture fournisseur'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button variant="ghost" onClick={() => enregistrer('brouillon')}>Enregistrer (brouillon)</Button><Button onClick={() => enregistrer('validee')}>Valider</Button></>}>
        {modal && (() => {
          const t = totauxFactureFournisseur({ lignes: modal.lignes })
          const majL = (i, p) => setModal({ ...modal, lignes: modal.lignes.map((l, k) => (k === i ? { ...l, ...p } : l)) })
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <label className="col-span-2 block text-xs font-semibold uppercase text-gray-500">Fournisseur<input list="ff-fournisseurs" value={modal.fournisseur} onChange={(e) => setModal({ ...modal, fournisseur: e.target.value })} className="input-base mt-1" /></label>
                <label className="block text-xs font-semibold uppercase text-gray-500">N° facture<input value={modal.numero} onChange={(e) => setModal({ ...modal, numero: e.target.value })} className="input-base mt-1" /></label>
                <label className="block text-xs font-semibold uppercase text-gray-500">Date<input type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} className="input-base mt-1" /></label>
                <label className="block text-xs font-semibold uppercase text-gray-500">Échéance<input type="date" value={modal.echeance} onChange={(e) => setModal({ ...modal, echeance: e.target.value })} className="input-base mt-1" /></label>
              </div>
              <datalist id="ff-fournisseurs">{fournisseursConnus.map((n) => <option key={n} value={n} />)}</datalist>
              <label className="block text-xs font-semibold uppercase text-gray-500">Secteur (facultatif)<select value={modal.secteur} onChange={(e) => setModal({ ...modal, secteur: e.target.value })} className="input-base mt-1"><option value="">—</option>{Object.entries(LIBELLE_SECTEUR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <div className="space-y-2">
                {modal.lignes.map((l, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <input list="ff-comptes" value={l.compte} onChange={(e) => majL(i, { compte: e.target.value.replace(/[^0-9]/g, '') })} className="input-base !w-28 font-mono" placeholder="Compte" title="Compte de charge (classe 6) ou d'immobilisation (classe 2)" />
                    <input value={l.libelle} onChange={(e) => majL(i, { libelle: e.target.value })} className="input-base min-w-[10rem] flex-1" placeholder="Désignation" />
                    <input type="number" min="0" value={l.montantHT} onChange={(e) => majL(i, { montantHT: e.target.value })} className="input-base !w-32" placeholder="Montant HT" />
                    <select value={l.tauxTva} onChange={(e) => majL(i, { tauxTva: e.target.value })} className="input-base !w-28"><option value={0}>TVA 0 %</option><option value={18}>TVA 18 %</option></select>
                    <button type="button" onClick={() => setModal({ ...modal, lignes: modal.lignes.filter((_, k) => k !== i) })} className="px-1 text-gray-400 hover:text-red-600">×</button>
                  </div>
                ))}
                <datalist id="ff-comptes">{plan.filter((c) => /^[26]/.test(c.num)).map((c) => <option key={c.num} value={c.num}>{c.label}</option>)}</datalist>
                <button type="button" className="text-xs font-semibold text-orange-600" onClick={() => setModal({ ...modal, lignes: [...modal.lignes, ligneVide()] })}>+ Ajouter une ligne</button>
              </div>
              <div className="flex justify-end gap-6 rounded-xl bg-gray-50 px-4 py-2 text-sm"><span>HT <b>{formatMoney(t.ht)}</b></span><span>TVA <b>{formatMoney(t.tva)}</b></span><span>TTC <b>{formatMoney(t.ttc)}</b></span></div>
            </div>
          )
        })()}
      </Modal>

      <ReglerModal facture={regler} onClose={() => setRegler(null)} comptes={treso.soldes} compteDefaut={compteAffecte(treso.params, treso.comptes, 'depense')} user={user} />
    </div>
  )
}

function ReglerModal({ facture, onClose, comptes, compteDefaut, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__id === facture?.id ? v : (facture ? { __id: facture.id, montant: facture.reste, date: todayStr(), compteId: compteDefaut, mode: 'espece', reference: '' } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const montant = Number(cur?.montant) || 0
  const erreur = !cur ? '' : montant <= 0 ? 'Montant invalide.' : montant > facture.reste ? `Dépasse le reste à payer (${formatMoney(facture.reste)}).` : !cur.compteId ? 'Choisissez le compte qui paie.' : ''
  const enregistrer = async () => {
    if (erreur) return
    const reglements = [...(facture.reglements || []), { id: genId(), montant, date: cur.date, compteId: cur.compteId, mode: cur.mode, reference: cur.reference || '', par: user?.nom || '' }]
    await updateItem(COL.facturesFournisseurs, facture.id, { reglements })
    await audit('comptabilite', 'REGLEMENT_FOURNISSEUR', `${facture.numero || facture.fournisseur} : ${formatMoney(montant)}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title={facture ? `Régler : ${facture.fournisseur}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer} disabled={!!erreur}>Régler</Button></>}>
      {cur && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{facture.numero || 'Facture'} · reste à payer <b>{formatMoney(facture.reste)}</b></p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold uppercase text-gray-500">Montant<input type="number" min="0" value={cur.montant} onChange={(e) => maj({ montant: e.target.value })} className="input-base mt-1" /></label>
            <label className="block text-xs font-semibold uppercase text-gray-500">Date<input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base mt-1" /></label>
            <label className="block text-xs font-semibold uppercase text-gray-500">Mode<select value={cur.mode} onChange={(e) => maj({ mode: e.target.value })} className="input-base mt-1"><option value="espece">Espèces</option><option value="mobile">Mobile Money</option><option value="virement">Virement</option><option value="cheque">Chèque</option></select></label>
            <label className="block text-xs font-semibold uppercase text-gray-500">Référence<input value={cur.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base mt-1" /></label>
          </div>
          <label className="block text-xs font-semibold uppercase text-gray-500">Payé depuis<div className="mt-1"><ChoixCompte comptes={comptes} value={cur.compteId} onChange={(id) => maj({ compteId: id })} /></div></label>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        </div>
      )}
    </Modal>
  )
}
