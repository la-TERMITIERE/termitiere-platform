// Stock briques — appatam → séchage → prêtes · caillasses.
// + Stock des matières premières (ciment, gravier, sable) : arrivages & consommation.
import { useEffect, useState } from 'react'
import { Save, AlertTriangle, Plus, PackagePlus, PackageMinus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { setItem, ts, addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateShort, formatNumber, genId } from '../../utils/formatters'
import { ETATS_BRIQUE, DUREE_SECHAGE_JOURS } from './data'
import { getInventaire, previousInventoryDate, joursDepuis } from './logic'

const sumQte = (arr) => (arr || []).reduce((s, l) => s + (parseFloat(l.qte) || 0), 0)

const TRANSITIONS = [
  { from: 'appatam', to: 'sechage', label: 'Vers séchage (extérieur)' },
  { from: 'sechage', to: 'pret', label: 'Prêtes à vendre' }
]

// Casse pendant la manutention : les briques cassées quittent leur état et
// s'ajoutent au total caillasses (vendues séparément).
const CASSE_TRANSITIONS = [
  { from: 'appatam', to: 'caillasses' },
  { from: 'sechage', to: 'caillasses' },
  { from: 'pret', to: 'caillasses' }
]

export default function StockBriques() {
  const { user, role } = useAuth()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)
  const matieres = useBriqueterieStore((s) => s.matieres)
  const saveBrique = useBriqueterieStore((s) => s.saveBrique)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [matStock, setMatStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [transferModal, setTransferModal] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [arrivage, setArrivage] = useState(null)   // { matiereId, qte, cout, label }
  const [consoModal, setConsoModal] = useState(null) // { matiereId, qte, label } — consommation saisie à la main
  const [matDetail, setMatDetail] = useState(null) // matière sélectionnée pour l'historique

  const peutSaisir = role === 'agent'

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { briques: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
    const s = {}
    briques.forEach((b) => {
      // Stock du jour si saisi, sinon report de la veille (solde d'ouverture si rien).
      const saved = inv.briques?.[b.id] || prevInv?.briques?.[b.id]
      s[b.id] = {
        appatam: saved?.appatam || 0,
        sechage: saved?.sechage || 0,
        pret: saved?.pret || 0,
        caillasses: saved?.caillasses || 0
      }
    })
    setStock(s)
  }, [date, inventaires, briques])

  // Chargement du stock matières : saisie du jour, sinon report du solde de la veille.
  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { matieres: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
    const ms = {}
    matieres.forEach((m) => {
      const saved = inv.matieres?.[m.id]
      if (saved) {
        ms[m.id] = { init: saved.init || 0, entrees: saved.entrees || [], consommations: saved.consommations || [] }
      } else {
        const prev = prevInv?.matieres?.[m.id]
        const prevFin = prev ? (prev.fin != null ? prev.fin : Math.max(0, (prev.init || 0) + sumQte(prev.entrees) - sumQte(prev.consommations))) : 0
        ms[m.id] = { init: prevFin, entrees: [], consommations: [] }
      }
    })
    setMatStock(ms)
  }, [date, inventaires, matieres])

  // Édition directe d'un état (solde existant / ouverture).
  const setEtat = (briqueId, etat, val) => {
    setStock((s) => ({ ...s, [briqueId]: { ...s[briqueId], [etat]: Math.max(0, parseInt(val) || 0) } }))
  }

  // Solde matière = stock initial + arrivages − consommations (saisies à la main).
  const matFin = (id) => {
    const c = matStock[id] || {}
    return Math.max(0, (parseFloat(c.init) || 0) + sumQte(c.entrees) - sumQte(c.consommations))
  }

  const setMatInit = (id, val) => setMatStock((s) => ({ ...s, [id]: { ...s[id], init: Math.max(0, parseFloat(val) || 0) } }))

  // Enregistre un arrivage (entrée de matière) dans le stock local — sauvegardé
  // avec le bouton Enregistrer.
  function ajouterArrivage() {
    const { matiereId, qte, cout, label } = arrivage
    const q = parseFloat(qte) || 0
    if (!q) return toast.error('Quantité requise')
    setMatStock((s) => {
      const cur = s[matiereId] || { init: 0, entrees: [], consommations: [] }
      const entrees = [...(cur.entrees || []), {
        qte: q, cout: parseFloat(cout) || 0, label: (label || 'Arrivage').trim(),
        date: date, agentId: user.uid, agentNom: user.nom
      }]
      return { ...s, [matiereId]: { ...cur, entrees } }
    })
    toast.success('Arrivage ajouté — n\'oubliez pas d\'enregistrer')
    setArrivage(null)
  }

  // Enregistre une consommation SAISIE À LA MAIN (l'utilisateur indique combien
  // a été consommé — pas de déduction automatique via les recettes).
  function ajouterConsommation() {
    const { matiereId, qte, label } = consoModal
    const q = parseFloat(qte) || 0
    if (!q) return toast.error('Quantité requise')
    const dispo = matFin(matiereId)
    if (q > dispo) return toast.error(`Consommation (${q}) supérieure au stock disponible (${Math.round(dispo * 10) / 10})`)
    setMatStock((s) => {
      const cur = s[matiereId] || { init: 0, entrees: [], consommations: [] }
      const consommations = [...(cur.consommations || []), {
        qte: q, label: (label || 'Consommation').trim(),
        date, agentId: user.uid, agentNom: user.nom, manuel: true
      }]
      return { ...s, [matiereId]: { ...cur, consommations } }
    })
    toast.success('Consommation enregistrée — n\'oubliez pas d\'enregistrer')
    setConsoModal(null)
  }

  // Création d'un nouveau type de brique depuis le stock.
  function handleAddBrique({ nom, tarifVente }) {
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'brique') + '_' + genId().slice(0, 3).toLowerCase()
    saveBrique({ id, nom: nom.trim(), tarifVente: parseFloat(tarifVente) || 0 })
    setAddModal(false)
    toast.success(`${nom.trim()} ajouté ✓`)
  }

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      const inv = getInventaire(inventaires, date) || {}
      // Recompose le stock matières (init + arrivages − consommations production).
      const matieresData = {}
      matieres.forEach((m) => {
        const cur = matStock[m.id] || { init: 0, entrees: [], consommations: [] }
        const ent = sumQte(cur.entrees)
        const conso = sumQte(cur.consommations)
        matieresData[m.id] = {
          init: parseFloat(cur.init) || 0,
          entrees: cur.entrees || [],
          consommations: cur.consommations || [],
          ent, conso,
          fin: Math.max(0, (parseFloat(cur.init) || 0) + ent - conso),
          coutEntrees: (cur.entrees || []).reduce((s, l) => s + (parseFloat(l.qte) || 0) * (parseFloat(l.cout) || 0), 0)
        }
      })
      await setItem('evenementiel_inventaires', date, {
        ...inv, date, briques: stock, savedAt: ts(), agentId: user.uid, agentNom: user.nom,
        matieres: matieresData
      })
      await audit('evenementiel', 'STOCK_BRIQUES', `Stock briques du ${date}`)
      toast.success('Stock enregistré ✓')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function executerTransfert() {
    const { briqueId, from, to, qte, dateSechage } = transferModal
    const q = parseInt(qte) || 0
    if (!q) return toast.error('Quantité requise')
    const cur = stock[briqueId] || {}
    if ((cur[from] || 0) < q) return toast.error(`Stock ${from} insuffisant`)

    if (from === 'sechage' && to === 'pret' && dateSechage) {
      const jours = joursDepuis(dateSechage)
      if (jours < DUREE_SECHAGE_JOURS) {
        toast.warning(`Attention : seulement ${jours} jour(s) de séchage (recommandé : ${DUREE_SECHAGE_JOURS}–6 jours)`)
      }
    }

    setStock((s) => {
      const src = { ...s[briqueId], [from]: (s[briqueId][from] || 0) - q }
      // Casse : la quantité s'ajoute au total caillasses (ligne « caillasses »).
      if (to === 'caillasses') {
        const cc = s.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
        return { ...s, [briqueId]: src, caillasses: { ...cc, caillasses: (cc.caillasses || 0) + q } }
      }
      return { ...s, [briqueId]: { ...src, [to]: (s[briqueId][to] || 0) + q } }
    })

    await addItem('evenementiel_transferts', {
      date: todayStr(), briqueId,
      briqueNom: briques.find((b) => b.id === briqueId)?.nom,
      from, to, qte: q, dateSechage: dateSechage || '',
      agentNom: user.nom
    })

    toast.success('Transfert enregistré — n\'oubliez pas de sauvegarder le stock')
    setTransferModal(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <input type="date" className="input-base w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          {peutSaisir && <Button variant="outline" onClick={() => setAddModal(true)}><Plus size={16} /> Ajouter un type</Button>}
          {peutSaisir && <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Séchage :</strong> 5 à 6 jours recommandés avant chargement pour limiter les casses.
        Les <strong>caillasses</strong> (briques cassées) sont vendues séparément.
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Catégorie</th>
                {ETATS_BRIQUE.map((e) => (
                  <th key={e.id} className="px-2 py-2 text-center" style={{ color: e.color }}>{e.label.split(' ')[0]}</th>
                ))}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {briques.map((b) => {
                const d = stock[b.id] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-semibold">{b.nom}</td>
                    <EtatCell value={d.appatam} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#7c3aed" onChange={(v) => setEtat(b.id, 'appatam', v)} />
                    <EtatCell value={d.sechage} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#b45309" onChange={(v) => setEtat(b.id, 'sechage', v)} />
                    <EtatCell value={d.pret} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#15803d" onChange={(v) => setEtat(b.id, 'pret', v)} />
                    <EtatCell value={d.caillasses} editable={peutSaisir && b.id === 'caillasses'} disabled={b.id !== 'caillasses'} color="#4b5563" onChange={(v) => setEtat(b.id, 'caillasses', v)} />
                    <td className="px-2 py-2">
                      {b.id !== 'caillasses' && peutSaisir && TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <button key={t.to} onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: t.to, qte: 1, dateSechage: '' })}
                          className="mr-1 mb-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold hover:bg-violet-100">
                          {t.from}→{t.to}
                        </button>
                      ))}
                      {b.id !== 'caillasses' && peutSaisir && CASSE_TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <button key={'casse-' + t.from} onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: 'caillasses', qte: 1, dateSechage: '' })}
                          className="mr-1 mb-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-amber-100">
                          {t.from}→caillasses
                        </button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Stock des matières premières (ciment, gravier, sable) ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="font-bold text-gray-800">Stock matières premières</h3>
            <p className="text-xs text-gray-500">Arrivages à la livraison · consommation saisie à la main</p>
          </div>
          {peutSaisir && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConsoModal({ matiereId: matieres[0]?.id || '', qte: '', label: '' })}>
                <PackageMinus size={15} /> Consommation
              </Button>
              <Button size="sm" variant="outline" onClick={() => setArrivage({ matiereId: matieres[0]?.id || '', qte: '', cout: '', label: '' })}>
                <PackagePlus size={15} /> Arrivage
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Matière</th>
                <th className="px-3 py-2 text-center">Stock initial</th>
                <th className="px-3 py-2 text-center text-green-700">Arrivages (+)</th>
                <th className="px-3 py-2 text-center text-orange-700">Consommé (−)</th>
                <th className="px-3 py-2 text-center">Stock actuel</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matieres.map((m) => {
                const c = matStock[m.id] || { init: 0, entrees: [], consommations: [] }
                const ent = sumQte(c.entrees)
                const conso = sumQte(c.consommations)
                const fin = matFin(m.id)
                return (
                  <tr key={m.id}>
                    <td className="px-3 py-2 font-semibold">{m.nom} <span className="text-[10px] font-normal text-gray-400">({m.unite})</span></td>
                    <td className="px-3 py-2 text-center">
                      {peutSaisir
                        ? <input type="number" min="0" step="0.1" value={c.init || 0} onChange={(e) => setMatInit(m.id, e.target.value)}
                            className="w-20 rounded border border-gray-200 px-1 py-1 text-center text-sm font-bold focus:border-secondary focus:outline-none" />
                        : <span className="font-bold">{formatNumber(c.init || 0)}</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-green-700">{ent ? '+' + formatNumber(ent) : '—'}</td>
                    <td className="px-3 py-2 text-center font-bold text-orange-700">{conso ? '−' + formatNumber(Math.round(conso * 10) / 10) : '—'}</td>
                    <td className="px-3 py-2 text-center text-base font-extrabold" style={{ color: fin > 0 ? '#7c3aed' : '#9ca3af' }}>{formatNumber(Math.round(fin * 10) / 10)}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setMatDetail(m)} className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 hover:bg-violet-100">détail</button>
                    </td>
                  </tr>
                )
              })}
              {!matieres.length && <tr><td colSpan={6} className="py-4 text-center text-gray-400">Aucune matière définie.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400">Le stock initial se reporte automatiquement du solde de la veille. Pensez à <strong>Enregistrer</strong> après un arrivage ou une correction.</p>
      </Card>

      <Modal open={!!transferModal} onClose={() => setTransferModal(null)} title={`Transfert — ${transferModal?.briqueNom}`}
        footer={<><Button variant="ghost" onClick={() => setTransferModal(null)}>Annuler</Button><Button onClick={executerTransfert}>Confirmer</Button></>}>
        {transferModal && (
          <div className="space-y-3">
            <p className="text-sm">{transferModal.from} → <strong>{transferModal.to}</strong></p>
            <FormGroup label="Quantité"><Input type="number" min="1" max={stock[transferModal.briqueId]?.[transferModal.from] || 0}
              value={transferModal.qte} onChange={(e) => setTransferModal((m) => ({ ...m, qte: e.target.value }))} /></FormGroup>
            {transferModal.from === 'sechage' && transferModal.to === 'pret' && (
              <>
                <FormGroup label="Date mise en séchage">
                  <Input type="date" value={transferModal.dateSechage} onChange={(e) => setTransferModal((m) => ({ ...m, dateSechage: e.target.value }))} />
                </FormGroup>
                {transferModal.dateSechage && joursDepuis(transferModal.dateSechage) < DUREE_SECHAGE_JOURS && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle size={14} /> Séchage &lt; {DUREE_SECHAGE_JOURS} jours — risque de casse au chargement
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <AddBriqueModal open={addModal} onClose={() => setAddModal(false)} onSave={handleAddBrique} />

      {/* Arrivage de matière première */}
      <Modal open={!!arrivage} onClose={() => setArrivage(null)} title="Arrivage de matière première"
        footer={<><Button variant="ghost" onClick={() => setArrivage(null)}>Annuler</Button><Button onClick={ajouterArrivage}><PackagePlus size={16} /> Ajouter</Button></>}>
        {arrivage && (
          <div className="space-y-3">
            <FormGroup label="Matière">
              <Select value={arrivage.matiereId} onChange={(e) => setArrivage((a) => ({ ...a, matiereId: e.target.value }))}>
                {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.unite})</option>)}
              </Select>
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Quantité reçue"><Input type="number" min="0" step="0.1" value={arrivage.qte} onChange={(e) => setArrivage((a) => ({ ...a, qte: e.target.value }))} autoFocus /></FormGroup>
              <FormGroup label="Coût unitaire (FCFA)" hint="optionnel"><Input type="number" min="0" value={arrivage.cout} onChange={(e) => setArrivage((a) => ({ ...a, cout: e.target.value }))} /></FormGroup>
            </div>
            <FormGroup label="Fournisseur / référence" hint="optionnel"><Input value={arrivage.label} onChange={(e) => setArrivage((a) => ({ ...a, label: e.target.value }))} placeholder="ex : Livraison CIMTOGO" /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Consommation de matière première (saisie manuelle) */}
      <Modal open={!!consoModal} onClose={() => setConsoModal(null)} title="Consommation de matière première"
        footer={<><Button variant="ghost" onClick={() => setConsoModal(null)}>Annuler</Button><Button onClick={ajouterConsommation}><PackageMinus size={16} /> Enregistrer</Button></>}>
        {consoModal && (
          <div className="space-y-3">
            <FormGroup label="Matière">
              <Select value={consoModal.matiereId} onChange={(e) => setConsoModal((a) => ({ ...a, matiereId: e.target.value }))}>
                {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.unite}) — dispo : {Math.round(matFin(m.id) * 10) / 10}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Quantité consommée"><Input type="number" min="0" step="0.1" value={consoModal.qte} onChange={(e) => setConsoModal((a) => ({ ...a, qte: e.target.value }))} autoFocus /></FormGroup>
            <FormGroup label="Motif / référence" hint="optionnel"><Input value={consoModal.label} onChange={(e) => setConsoModal((a) => ({ ...a, label: e.target.value }))} placeholder="ex : Production du jour, chantier…" /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Détail des mouvements d'une matière (arrivages + consommations) */}
      <Modal open={!!matDetail} onClose={() => setMatDetail(null)} title={matDetail ? `Mouvements — ${matDetail.nom}` : ''}>
        {matDetail && (() => {
          const c = matStock[matDetail.id] || { init: 0, entrees: [], consommations: [] }
          return (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-4 gap-2">
                <MatMini label="Initial" value={formatNumber(c.init || 0)} />
                <MatMini label="Arrivages" value={'+' + formatNumber(sumQte(c.entrees))} color="#16a34a" />
                <MatMini label="Consommé" value={'−' + formatNumber(Math.round(sumQte(c.consommations) * 10) / 10)} color="#ea580c" />
                <MatMini label="Solde" value={formatNumber(Math.round(matFin(matDetail.id) * 10) / 10)} color="#7c3aed" />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-green-700">Arrivages</p>
                {(c.entrees || []).length
                  ? (c.entrees || []).map((e, i) => (
                    <p key={i} className="text-xs text-gray-600">• {formatDateShort(e.date)} — <strong>+{formatNumber(e.qte)}</strong> {matDetail.unite}{e.label ? ` · ${e.label}` : ''}{e.cout ? ` · ${formatNumber(e.cout)} F/u` : ''}</p>
                  ))
                  : <p className="text-xs text-gray-400">Aucun arrivage saisi ce jour.</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-orange-700">Consommations (production)</p>
                {(c.consommations || []).length
                  ? (c.consommations || []).map((e, i) => (
                    <p key={i} className="text-xs text-gray-600">• <strong>−{formatNumber(Math.round((e.qte || 0) * 10) / 10)}</strong> {matDetail.unite}{e.label ? ` · ${e.label}` : ''}</p>
                  ))
                  : <p className="text-xs text-gray-400">Aucune consommation ce jour.</p>}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

function MatMini({ label, value, color = '#374151' }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <p className="text-[10px] font-bold uppercase text-gray-400">{label}</p>
      <p className="text-sm font-extrabold" style={{ color }}>{value}</p>
    </div>
  )
}

// Cellule d'état du stock : éditable (input) ou en lecture seule selon les droits.
function EtatCell({ value = 0, editable, disabled, color, onChange }) {
  if (disabled) return <td className="px-2 py-2 text-center font-bold text-gray-300">—</td>
  if (!editable) return <td className="px-2 py-2 text-center font-bold" style={{ color }}>{value || 0}</td>
  return (
    <td className="px-2 py-2 text-center">
      <input type="number" min="0" value={value || 0} onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded border border-gray-200 px-1 py-1 text-center text-sm font-bold focus:border-secondary focus:outline-none"
        style={{ color }} />
    </td>
  )
}

// Fenêtre de création d'un type de brique.
function AddBriqueModal({ open, onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [tarifVente, setTarifVente] = useState('')

  useEffect(() => { if (open) { setNom(''); setTarifVente('') } }, [open])

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    onSave({ nom, tarifVente })
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un type de brique"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit}>Ajouter</Button></>}>
      <FormGroup label="Nom du type" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : 20 creux" autoFocus />
      </FormGroup>
      <FormGroup label="Tarif de vente unitaire" hint="FCFA">
        <Input type="number" min="0" value={tarifVente} onChange={(e) => setTarifVente(e.target.value)} placeholder="0" />
      </FormGroup>
    </Modal>
  )
}
