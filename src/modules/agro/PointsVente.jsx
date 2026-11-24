// MAXI-AGRO : POINTS DE VENTE. Les animaux sortis de la ferme par « Transfert Lomé » ou « Transfert autre localité » (Saisie journalière) y sont
// stockés puis vendus par des factures dont le lieu de vente est Lomé ou la localité choisie. Deux onglets : Lomé, et les autres localités.
// Tout est calculé (voir stockLome.js) ; seules les pertes constatées sur place se déclarent ici.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, Truck, ShoppingBag, Skull, Package, Plus, Trash2, ClipboardList, MapPin } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ModalAgro from './ModalAgro'
import BandeAgro, { COULEUR_AGRO } from './BandeAgro'
import { BoutonBande, OngletsBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { todayStr, formatNumber, formatDateShort } from '../../utils/formatters'
import { stockLome, localitesAutres, lieuDeFacture, filtreAutres, CLE_LOME, COL_AJUSTEMENTS_LOME, MOTIFS_PERTE_LOME } from './stockLome'
import { factureStatut } from './data'

const ENGAGES = ['sortie_approuvee', 'modif_demandee', 'certifiee']
const ONGLETS = [{ id: 'lome', label: 'Lomé' }, { id: 'autres', label: 'Autres localités' }]
const VIDE = { date: todayStr(), articleId: '', qte: 1, motif: 'Décès', note: '', lieu: CLE_LOME }
// Lieu d'une déclaration de perte (les plus anciennes n'ont pas de lieu : c'était Lomé).
const lieuPerte = (p) => p.lieu || CLE_LOME
const nomLieu = (p) => (lieuPerte(p) === CLE_LOME ? 'Lomé' : p.localite || lieuPerte(p).replace(/^autre:/, ''))

export default function PointsVente() {
  const { user, role } = useAuth()
  const peutSupprimer = isFullAccessRole(role)
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: factures } = useCollection('agro_factures')
  const { data: pertes } = useCollection(COL_AJUSTEMENTS_LOME)
  const especes = useAgroStore((s) => s.especes)
  const [onglet, setOnglet] = useState('lome')
  const [sel, setSel] = useState('toutes') // onglet « Autres localités » : 'toutes' ou la clé d'une localité
  const [modal, setModal] = useState(null)

  const localites = useMemo(() => localitesAutres({ inventaires, factures, ajustements: pertes }), [inventaires, factures, pertes])
  const enLome = onglet === 'lome'
  const filtre = useMemo(() => (enLome ? (c) => c === CLE_LOME : sel === 'toutes' ? filtreAutres : (c) => c === sel), [enLome, sel])
  const donnees = { inventaires, factures, ajustements: pertes, especes }
  const { lignes, total, transferts } = useMemo(() => stockLome({ ...donnees, filtre }), [inventaires, factures, pertes, especes, filtre]) // eslint-disable-line react-hooks/exhaustive-deps
  const parLocalite = useMemo(() => localites.map((l) => ({ ...l, ...stockLome({ ...donnees, filtre: (c) => c === l.cle }).total })), [localites, inventaires, factures, pertes, especes]) // eslint-disable-line react-hooks/exhaustive-deps
  const nomSel = enLome ? 'Lomé' : sel === 'toutes' ? 'les autres localités' : localites.find((l) => l.cle === sel)?.nom || ''

  const ventes = useMemo(() => factures
    .filter((f) => { const l = lieuDeFacture(f); return l && filtre(l.cle) && ENGAGES.includes(factureStatut(f)) })
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15), [factures, filtre])
  const pertesVisibles = useMemo(() => pertes.filter((p) => filtre(lieuPerte(p))).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15), [pertes, filtre])

  function ouvrirPerte() {
    const lieu = enLome ? CLE_LOME : sel !== 'toutes' ? sel : localites[0]?.cle || ''
    setModal({ ...VIDE, lieu })
  }
  const stockDuLieu = (cle) => stockLome({ ...donnees, filtre: (c) => c === cle }).lignes

  async function declarer() {
    const qte = parseInt(modal.qte) || 0
    const art = especes.find((e) => e.id === modal.articleId)
    if (!modal.lieu) return toast.error('Choisissez la localité')
    if (!art) return toast.error('Choisissez l\'espèce')
    if (qte <= 0) return toast.error('Indiquez une quantité')
    const lieuNom = modal.lieu === CLE_LOME ? 'Lomé' : localites.find((l) => l.cle === modal.lieu)?.nom || ''
    const dispo = stockDuLieu(modal.lieu).find((l) => l.id === art.id)?.stock || 0
    if (qte > dispo) return toast.error(`${lieuNom} n'a que ${dispo} ${art.nom} en stock`)
    try {
      await addItem(COL_AJUSTEMENTS_LOME, { date: modal.date, articleId: art.id, articleNom: art.nom, qte, motif: modal.motif, note: (modal.note || '').trim(), par: user?.nom || '', lieu: modal.lieu, localite: lieuNom })
      await audit('agro', 'LOME_PERTE', `${lieuNom} : ${qte} ${art.nom} : ${modal.motif}${modal.note ? ` (${modal.note})` : ''}`)
      toast.success('Perte déclarée ✓')
      setModal(null)
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function supprimer(p) {
    if (!confirm(`Supprimer cette déclaration (${p.qte} ${p.articleNom}) ? Le stock remontera d'autant.`)) return
    await removeItem(COL_AJUSTEMENTS_LOME, p.id)
    await audit('agro', 'LOME_PERTE_SUPPR', `${nomLieu(p)} : ${p.qte} ${p.articleNom}`)
  }

  const disponiblesModal = modal ? stockDuLieu(modal.lieu).filter((l) => l.stock > 0) : []
  const aucunPoint = !enLome && localites.length === 0

  return (
    <div className="space-y-5">
      <BandeAgro icone={Warehouse} titre="Points de vente" sous="Lomé et autres localités : animaux envoyés de la ferme, stockés et vendus sur place">
        <OngletsBande options={ONGLETS} valeur={onglet} onChange={setOnglet} />
        {(enLome || localites.length > 0) && <BoutonBande icone={Skull} onClick={ouvrirPerte}>Déclarer une perte</BoutonBande>}
      </BandeAgro>

      {!enLome && localites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Localités">
          {[{ cle: 'toutes', nom: 'Toutes' }, ...localites].map((l) => {
            const actif = sel === l.cle
            return (
              <button key={l.cle} type="button" aria-pressed={actif} data-actif={actif} onClick={() => setSel(l.cle)}
                className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ '--puce': COULEUR_AGRO }}>
                {l.cle !== 'toutes' && <MapPin size={12} aria-hidden="true" />}{l.nom}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={`En stock : ${nomSel}`} value={formatNumber(total.stock)} sub="animaux disponibles à la vente" icon={Warehouse} accent={COULEUR_AGRO} />
        <StatCard title="Envoyés" value={formatNumber(total.transfere)} sub="depuis la ferme, au total" icon={Truck} accent="#0284c7" />
        <StatCard title="Vendus sur place" value={formatNumber(total.vendu)} sub="factures du point de vente" icon={ShoppingBag} accent="#7c3aed" />
        <StatCard title="Pertes" value={formatNumber(total.mort + total.perdu)} sub="décès et pertes" icon={Skull} accent="#dc2626" />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-white/80 bg-white/60 px-4 py-2.5 text-xs text-gray-600 backdrop-blur-md">
        <ClipboardList size={14} className="text-green-700" aria-hidden="true" />
        <span><strong>Envoi :</strong> dans la <Link to="/agro/saisie" className="font-bold text-green-700 underline">Saisie journalière</Link>, ouvrez les sorties de l'espèce et ajoutez une ligne « Transfert Lomé », ou « Transfert autre localité » en tapant la localité. <strong>Vente :</strong> dans la <Link to="/agro/factures" className="font-bold text-green-700 underline">Facturation</Link>, choisissez le lieu de vente.</span>
      </p>

      {!enLome && sel === 'toutes' && parLocalite.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><MapPin size={15} className="text-green-700" />Récapitulatif par localité</span>} className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Localité</th><th className="px-3 py-2 text-center">Envoyés</th><th className="px-3 py-2 text-center">Vendus</th><th className="px-3 py-2 text-center">Pertes</th><th className="px-3 py-2 text-center">En stock</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parLocalite.map((l) => (
                  <tr key={l.cle} className="cursor-pointer hover:bg-gray-50" onClick={() => setSel(l.cle)}>
                    <td className="px-3 py-2 font-semibold text-gray-800">{l.nom}</td>
                    <td className="px-3 py-2 text-center">{formatNumber(l.transfere)}</td>
                    <td className="px-3 py-2 text-center">{formatNumber(l.vendu)}</td>
                    <td className="px-3 py-2 text-center">{formatNumber(l.mort + l.perdu)}</td>
                    <td className={`px-3 py-2 text-center font-extrabold ${l.stock < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatNumber(l.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={<span className="flex items-center gap-2"><Package size={15} className="text-green-700" />Stock par espèce : {nomSel}</span>} className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2 text-left">Espèce</th><th className="px-3 py-2 text-center">Envoyés</th><th className="px-3 py-2 text-center">Vendus</th><th className="px-3 py-2 text-center">Pertes</th><th className="px-3 py-2 text-center">En stock</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">{aucunPoint ? 'Aucun envoi vers une autre localité pour le moment.' : 'Aucun envoi pour le moment.'}</td></tr>}
              {lignes.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2"><span className="font-semibold text-gray-800">{l.nom}</span> <span className="text-xs text-gray-400">{l.cat}</span></td>
                  <td className="px-3 py-2 text-center">{formatNumber(l.transfere)}</td>
                  <td className="px-3 py-2 text-center">{formatNumber(l.vendu)}</td>
                  <td className="px-3 py-2 text-center">{formatNumber(l.mort + l.perdu)}</td>
                  <td className={`px-3 py-2 text-center font-extrabold ${l.stock < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatNumber(l.stock)}{l.stock < 0 && <span className="ml-1 text-[10px] font-bold">(vérifier)</span>}</td>
                </tr>
              ))}
            </tbody>
            {lignes.length > 0 && (
              <tfoot className="bg-gray-50 font-bold"><tr><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-center">{formatNumber(total.transfere)}</td><td className="px-3 py-2 text-center">{formatNumber(total.vendu)}</td><td className="px-3 py-2 text-center">{formatNumber(total.mort + total.perdu)}</td><td className="px-3 py-2 text-center text-green-700">{formatNumber(total.stock)}</td></tr></tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Truck size={15} className="text-sky-600" />Derniers envois</span>} className="p-0">
          <ul className="divide-y divide-gray-100 text-sm">
            {transferts.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Aucun envoi saisi.</li>}
            {transferts.slice(0, 15).map((t, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><strong>{t.qte}</strong> {t.nom}{!enLome && <span className="text-xs text-gray-500"> vers <strong>{t.localite}</strong></span>}</span>
                <span className="text-xs text-gray-500">{formatDateShort(t.date)}{t.agent ? ` · ${t.agent}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShoppingBag size={15} className="text-violet-600" />Dernières ventes sur place</span>} className="p-0">
          <ul className="divide-y divide-gray-100 text-sm">
            {ventes.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Aucune vente approuvée.</li>}
            {ventes.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><span className="font-mono text-xs text-gray-500">{f.numero}</span> {f.client?.nom || ''}{!enLome && <span className="text-xs text-gray-500"> : {lieuDeFacture(f)?.nom}</span>}</span>
                <span className="text-xs text-gray-500">{formatDateShort(f.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {pertesVisibles.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><Skull size={15} className="text-red-600" />Pertes déclarées</span>} className="p-0">
          <ul className="divide-y divide-gray-100 text-sm">
            {pertesVisibles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><strong>{p.qte}</strong> {p.articleNom} : {p.motif}{!enLome && <span className="text-xs text-gray-500"> à {nomLieu(p)}</span>}{p.note ? <span className="text-xs text-gray-400"> ({p.note})</span> : null}</span>
                <span className="flex items-center gap-2 text-xs text-gray-500">{formatDateShort(p.date)}{p.par ? ` · ${p.par}` : ''}
                  {peutSupprimer && <button type="button" onClick={() => supprimer(p)} aria-label="Supprimer la déclaration" title="Supprimer la déclaration" className="icone-verre icone-verre--danger rounded-xl p-1.5"><Trash2 size={14} /></button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ModalAgro open={!!modal} onClose={() => setModal(null)} title="Déclarer une perte sur place" intro="Décès ou perte constaté sur des animaux stockés dans un point de vente : son stock baisse d'autant."
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={declarer}><Plus size={15} className="mr-1" />Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-x-3">
            <FormGroup label="Lieu" className="col-span-2">
              <Select value={modal.lieu} onChange={(e) => setModal((m) => ({ ...m, lieu: e.target.value, articleId: '' }))}>
                <option value={CLE_LOME}>Lomé</option>
                {localites.map((l) => <option key={l.cle} value={l.cle}>{l.nom}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Date" className="col-span-2 md:col-span-1"><Input type="date" value={modal.date} onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))} /></FormGroup>
            <FormGroup label="Espèce" className="col-span-2 md:col-span-1">
              <Select value={modal.articleId} onChange={(e) => setModal((m) => ({ ...m, articleId: e.target.value }))}>
                <option value="">Choisir</option>
                {disponiblesModal.map((l) => <option key={l.id} value={l.id}>{l.nom} ({l.stock} en stock)</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Quantité"><Input type="number" min="1" value={modal.qte} onChange={(e) => setModal((m) => ({ ...m, qte: e.target.value }))} /></FormGroup>
            <FormGroup label="Motif">
              <Select value={modal.motif} onChange={(e) => setModal((m) => ({ ...m, motif: e.target.value }))}>{MOTIFS_PERTE_LOME.map((x) => <option key={x}>{x}</option>)}</Select>
            </FormGroup>
            <FormGroup label="Précision (facultatif)" className="col-span-2"><Input value={modal.note} onChange={(e) => setModal((m) => ({ ...m, note: e.target.value }))} placeholder="ex : chaleur, maladie, vol…" /></FormGroup>
          </div>
        )}
      </ModalAgro>
    </div>
  )
}

