// Saisie magasin — EF Initial · Achats · Sorties (autorisées) · Retours · EF Final.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save, Send, CheckCircle2, Plus, Trash2, Lock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { useLogistiqueStore } from './store/referentielStore'
import { setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateTime, genId } from '../../utils/formatters'
import { CAT_MATERIEL, catColor } from './data'
import { useSite, matchSite } from './site/useSite'
import {
  previousInventoryDate, getInventaire, autoSorties, agregerMateriel, sommeMouvements,
  mouvementsDepuisSaisie, mergeMouvementsUtilisateur, peutModifierLigne, annoterLignesAgent,
  ENTREE_TYPES, SORTIE_TYPES_SAISIE, RETOUR_TYPES, sommeType
} from './logic'

export default function SaisieMagasin() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allInventaires } = useCollection('logistique_inventaires')
  const { data: allDemandes } = useCollection('logistique_demandes')
  const { data: allRetoursCol } = useCollection('logistique_retours')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const saveMateriel = useLogistiqueStore((s) => s.saveMateriel)
  const referentielReady = useLogistiqueStore((s) => s.ready)

  // Cloisonnement par site : chaque magasin (Lomé / Kara) a son propre stock.
  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])
  const demandes = useMemo(() => allDemandes.filter((d) => matchSite(d, site)), [allDemandes, site])
  const retoursCol = useMemo(() => allRetoursCol.filter((r) => matchSite(r, site)), [allRetoursCol, site])

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [mvtModal, setMvtModal] = useState(null) // { id, dir, nom, unite } — entrées/sorties (éditable)
  const [retourDetail, setRetourDetail] = useState(null) // { nom, lignes } — retours (lecture seule)
  const [addModal, setAddModal] = useState(false)

  // Retours du jour pour un matériel (source = page « Retour matériel », lecture seule ici).
  const retoursDuJour = (matId) => (retoursCol || [])
    .filter((r) => r.date === date && r.materielId === matId)
    .map((r) => ({ type: r.type, qte: parseInt(r.qte) || 0, motif: r.motif, prestationNum: r.prestationNum, agentNom: r.agentNom }))
  const [seedInit, setSeedInit] = useState({}) // stock initial des articles fraîchement créés : { date: { id } }

  const peutSaisir = role === 'agent'
  // L'ADMINISTRATEUR (accès total) peut renseigner les STOCKS INITIAUX de départ
  // (mise en route de l'app / recalage sur le stock physique) et enregistrer.
  const peutEditerInit = isFullAccessRole(role)
  const peutEnregistrer = peutSaisir || peutEditerInit
  // Brouillon anti-perte (auto-enregistrement) : passe à true dès qu'on modifie.
  const dirtyRef = useRef(false)
  const draftRef = useRef({})
  const lastSaveRef = useRef(0)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const markDirty = () => { dirtyRef.current = true }

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { materiels: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
    const seeds = seedInit[date] || {}

    const s = {}
    materiel.forEach((m) => {
      const saved = inv.materiels?.[m.id]
      const { entrees, sorties } = mouvementsDepuisSaisie(saved)
      const init = saved?.init !== undefined ? saved.init : prevInv?.materiels?.[m.id]?.fin ?? seeds[m.id] ?? 0
      // Les retours ne sont PLUS saisis ici : ils proviennent de la page « Retour
      // matériel » (collection logistique_retours), affichés en lecture seule.
      s[m.id] = { init, entrees, sorties, retours: retoursDuJour(m.id) }
    })
    setStock(s)
  }, [date, inventaires, materiel, seedInit, retoursCol])

  // Création d'un nouveau matériel (+ éventuelle nouvelle catégorie) depuis la saisie.
  function handleAddMateriel({ nom, cat, unite, coutAchat, initial }) {
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'materiel') + '_' + genId().slice(0, 3).toLowerCase()
    saveMateriel({ id, nom: nom.trim(), cat: cat.trim().toUpperCase(), unite: unite || 'unités', coutAchat: parseFloat(coutAchat) || 0, tarifLocation: 0 })
    setSeedInit((s) => ({ ...s, [date]: { ...(s[date] || {}), [id]: Math.max(0, parseInt(initial) || 0) } }))
    setAddModal(false)
    toast.success(`${nom.trim()} ajouté ✓ — pensez à enregistrer la saisie`)
  }

  const existing = getInventaire(inventaires, date)
  const dejaSaisi = existing?.savedAt
  const autoSorOf = (id) => autoSorties(demandes, id, date)

  const cats = useMemo(() => {
    const custom = [...new Set(materiel.map((m) => m.cat))].filter((c) => !CAT_MATERIEL.includes(c))
    return [...CAT_MATERIEL, ...custom].filter((c) => materiel.some((m) => m.cat === c))
  }, [materiel])

  const setInit = (id, val) => {
    markDirty()
    setStock((s) => ({ ...s, [id]: { ...s[id], init: Math.max(0, parseInt(val) || 0) } }))
  }

  const setLignes = (id, dir, lignes) => {
    if (!user) return
    markDirty()
    const field = dir === 'entree' ? 'entrees' : dir === 'sortie' ? 'sorties' : 'retours'
    setStock((s) => {
      const prev = s[id]?.[field] || []
      const merged = mergeMouvementsUtilisateur(prev, lignes, user.uid, user.nom)
      return { ...s, [id]: { ...s[id], [field]: merged } }
    })
  }

  // Mémorise l'état courant pour l'auto-enregistrement (lu dans le timeout).
  draftRef.current = { materiel, stock, autoSorOf, user, inventaires, date, site, referentielReady, peutEnregistrer }
  // Repart « propre » au changement de jour.
  useEffect(() => { dirtyRef.current = false }, [date])

  // AUTO-ENREGISTREMENT DU BROUILLON (anti-perte). Au plus une fois par heure tant
  // qu'il y a des modifications, MAIS forcé en fin de journée (≥ 23:58) pour capturer
  // la saisie AVANT le changement de jour. Marqué brouillon (autoDraft), sans notifier.
  useEffect(() => {
    if (!peutEnregistrer) return
    const UNE_HEURE = 60 * 60 * 1000
    const tick = async () => {
      if (!dirtyRef.current) return
      const now = new Date()
      const finDeJournee = now.getHours() === 23 && now.getMinutes() >= 58
      if (!finDeJournee && Date.now() - (lastSaveRef.current || 0) < UNE_HEURE) return
      const d = draftRef.current
      if (!d.user || !d.referentielReady) return
      const aDuContenu = d.materiel.some((m) => {
        const x = d.stock[m.id]
        return x && (x.entrees?.length || x.sorties?.length || x.retours?.length)
      })
      if (!aDuContenu) return
      try {
        const materiels = {}
        d.materiel.forEach((m) => {
          const x = d.stock[m.id] || { init: 0, entrees: [], sorties: [], retours: [] }
          const autoSor = d.autoSorOf(m.id)
          const agg = agregerMateriel(x, autoSor)
          materiels[m.id] = {
            ...agg,
            entrees: annoterLignesAgent(x.entrees || [], d.user.uid, d.user.nom),
            sorties: annoterLignesAgent(x.sorties || [], d.user.uid, d.user.nom),
            retours: annoterLignesAgent(x.retours || [], d.user.uid, d.user.nom),
            autoSor
          }
        })
        const dejaEnregistre = !!getInventaire(d.inventaires, d.date)?.savedAt
        await setItem('logistique_inventaires', `${d.site}__${d.date}`, {
          date: d.date, site: d.site, agentId: d.user.uid, agentNom: d.user.nom,
          autoSavedAt: ts(), autoDraft: !dejaEnregistre, materiels
        })
        dirtyRef.current = false
        lastSaveRef.current = Date.now()
        setDraftSavedAt(Date.now())
      } catch (e) { /* brouillon best-effort */ }
    }
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [peutEnregistrer]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!user) return toast.error('Session expirée')
    if (!referentielReady) return toast.error('Référentiel en cours de chargement — patientez puis réessayez')
    setSaving(true)
    try {
      const materiels = {}
      materiel.forEach((m) => {
        const d = stock[m.id] || { init: 0, entrees: [], sorties: [], retours: [] }
        const autoSor = autoSorOf(m.id)
        const agg = agregerMateriel(d, autoSor)
        materiels[m.id] = {
          ...agg,
          entrees: annoterLignesAgent(d.entrees || [], user.uid, user.nom),
          sorties: annoterLignesAgent(d.sorties || [], user.uid, user.nom),
          retours: annoterLignesAgent(d.retours || [], user.uid, user.nom),
          autoSor
        }
      })
      await setItem('logistique_inventaires', `${site}__${date}`, {
        date, site, agentId: user.uid, agentNom: user.nom, savedAt: ts(), materiels
      })
      dirtyRef.current = false
      await audit('logistique', 'SAISIE_MAGASIN', `${site === 'lome' ? 'Lomé' : 'Kara'} — saisie magasin du ${date}${peutEditerInit && !peutSaisir ? ' (stocks initiaux — admin)' : ''}`)
      toast.success('Saisie enregistrée ✓')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {!peutEnregistrer && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          👁️ Mode consultation — seuls les agents peuvent effectuer des saisies magasin
        </div>
      )}
      {peutEditerInit && !peutSaisir && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          🛠️ Mode administrateur — vous pouvez renseigner les <strong>stocks initiaux de départ</strong> (colonne « Stock Initial ») pour caler l'appli sur le stock physique, puis <strong>Enregistrer</strong>.
        </div>
      )}
      {!peutSaisir && peutEditerInit && (
        <p className="text-xs text-gray-400">Les mouvements (achats / sorties / retours) restent gérés par les agents et les workflows ; en tant qu'administrateur vous ajustez les données de départ.</p>
      )}
      {draftSavedAt && !dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          💾 Brouillon enregistré automatiquement à {formatDateTime(draftSavedAt)} — vos données sont en sécurité même sans clic sur « Enregistrer ».
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <input type="date" className="input-base w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Agent</label>
          <input className="input-base w-auto bg-gray-100" value={user?.nom || ''} readOnly />
        </div>
        <div className="ml-auto flex gap-2">
          {peutEnregistrer && <Button variant="outline" onClick={() => setAddModal(true)}><Plus size={16} /> Ajouter un matériel</Button>}
          <Link to={`/logistique/${site}/demandes`}><Button variant="outline"><Send size={16} /> Demander une sortie</Button></Link>
          {peutEnregistrer && <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      {dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 size={16} />
          Saisie du {formatDateTime(existing.savedAt)} — chaque agent modifie uniquement ses mouvements
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[calc(100vh-14rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
              <tr>
                <th className="bg-gray-50 px-3 py-2 text-left">Matériel</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Stock Initial 🔒</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Achats</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Sorties</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Retours</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Stock Final 🔒</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cats.map((cat) => (
                <Fragment key={cat}>
                  <tr>
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase text-white" style={{ background: catColor(cat) }}>{cat}</td>
                  </tr>
                  {materiel.filter((m) => m.cat === cat).map((m) => {
                    const d = stock[m.id] || { init: 0, entrees: [], sorties: [], retours: [] }
                    const autoSor = autoSorOf(m.id)
                    const totEnt = sommeMouvements(d.entrees)
                    const totSor = sommeMouvements(d.sorties) + autoSor
                    const totRet = sommeMouvements(d.retours)
                    const fin = Math.max(0, (d.init || 0) + totEnt - totSor + sommeType(d.retours, 'OK'))
                    return (
                      <tr key={m.id}>
                        <td className="px-3 py-1.5 font-semibold">{m.nom} <span className="text-[10px] text-gray-400">({m.unite})</span></td>
                        <td className="px-2 py-1.5 text-center">
                          <input type="number" min="0" value={d.init ?? 0} readOnly={!peutEditerInit}
                            onChange={(e) => setInit(m.id, e.target.value)}
                            className={`w-16 rounded border px-1 py-1 text-center text-sm ${peutEditerInit ? '' : 'num-readonly cursor-not-allowed'}`} />
                        </td>
                        <MvtCell total={totEnt} tone="green" onClick={() => setMvtModal({ id: m.id, dir: 'entree', nom: m.nom, unite: m.unite })} />
                        <MvtCell total={sommeMouvements(d.sorties)} tone="amber" sub={autoSor > 0 ? `+${autoSor} auto` : null}
                          onClick={() => setMvtModal({ id: m.id, dir: 'sortie', nom: m.nom, unite: m.unite })} />
                        <MvtCell total={totRet} tone="sky" sub="🔒 via Retour matériel"
                          onClick={() => setRetourDetail({ nom: m.nom, lignes: d.retours || [] })} />
                        <td className="px-2 py-1.5 text-center font-bold text-secondary">{fin}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MouvementModal
        modal={mvtModal}
        stock={stock}
        autoSor={mvtModal ? autoSorOf(mvtModal.id) : 0}
        user={user}
        peutSaisir={peutSaisir}
        onClose={() => setMvtModal(null)}
        onChange={(lignes) => setLignes(mvtModal.id, mvtModal.dir, lignes)}
      />

      {/* Retours — LECTURE SEULE (saisis via la page « Retour matériel ») */}
      <Modal open={!!retourDetail} onClose={() => setRetourDetail(null)} title={`Retours — ${retourDetail?.nom || ''}`}>
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          🔒 Les retours s'enregistrent depuis la page <strong>Retour matériel</strong> (pour la traçabilité). Ils sont en lecture seule ici.
        </p>
        {(!retourDetail?.lignes?.length) ? (
          <p className="py-4 text-center text-sm text-gray-400">Aucun retour ce jour pour ce matériel.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-2 text-left">État</th><th className="p-2 text-center">Qté</th><th className="p-2 text-left">Prestation</th><th className="p-2 text-left">Motif</th></tr></thead>
            <tbody>
              {retourDetail.lignes.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className={`p-2 font-semibold ${l.type === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{l.type}</td>
                  <td className="p-2 text-center">{l.qte}</td>
                  <td className="p-2 text-xs text-gray-500">{l.prestationNum || '—'}</td>
                  <td className="p-2 text-gray-600">{l.motif || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <AddMaterielModal
        open={addModal}
        existingCats={[...new Set([...CAT_MATERIEL, ...materiel.map((m) => m.cat)])]}
        onClose={() => setAddModal(false)}
        onSave={handleAddMateriel}
      />
    </div>
  )
}

// Fenêtre de création d'un matériel : nom, catégorie (existante ou nouvelle), unité, coût, stock initial.
function AddMaterielModal({ open, existingCats = [], onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [catChoice, setCatChoice] = useState('')
  const [catNew, setCatNew] = useState('')
  const [unite, setUnite] = useState('unités')
  const [coutAchat, setCoutAchat] = useState('')
  const [initial, setInitial] = useState('')

  useEffect(() => {
    if (open) { setNom(''); setCatChoice(existingCats[0] || ''); setCatNew(''); setUnite('unités'); setCoutAchat(''); setInitial('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = catChoice === '__new__' ? catNew : catChoice

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    if (!cat.trim()) return toast.error('Catégorie requise')
    onSave({ nom, cat, unite, coutAchat, initial })
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un matériel"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit}>Ajouter</Button></>}>
      <FormGroup label="Nom du matériel" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : Bâche 4×6 m" autoFocus />
      </FormGroup>
      <div className="grid grid-cols-2 gap-3">
        <FormGroup label="Catégorie" required>
          <Select value={catChoice} onChange={(e) => setCatChoice(e.target.value)}>
            {existingCats.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">➕ Nouvelle catégorie…</option>
          </Select>
        </FormGroup>
        {catChoice === '__new__' && (
          <FormGroup label="Nom de la catégorie" required>
            <Input value={catNew} onChange={(e) => setCatNew(e.target.value)} placeholder="ex : LOGISTIQUE" />
          </FormGroup>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormGroup label="Unité">
          <Select value={unite} onChange={(e) => setUnite(e.target.value)}>
            {['unités', 'lots', 'm', 'm²', 'kg'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Coût d'achat" hint="FCFA">
          <Input type="number" min="0" value={coutAchat} onChange={(e) => setCoutAchat(e.target.value)} placeholder="0" />
        </FormGroup>
        <FormGroup label="Stock initial" hint="À cette date">
          <Input type="number" min="0" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
        </FormGroup>
      </div>
    </Modal>
  )
}

function MvtCell({ total, tone, onClick, sub }) {
  const colors = { green: 'text-green-700', amber: 'text-amber-700', sky: 'text-sky-700' }
  return (
    <td className="px-2 py-1.5 text-center">
      <button type="button" onClick={onClick}
        className="mx-auto flex min-w-[4rem] flex-col items-center rounded-lg border border-gray-200 px-2 py-1 hover:border-secondary hover:bg-sky-50">
        <span className={`font-bold ${colors[tone]}`}>{total}</span>
        {sub && <span className="text-[9px] text-gray-400">{sub}</span>}
      </button>
    </td>
  )
}

function MouvementModal({ modal, stock, autoSor, user, peutSaisir, onClose, onChange }) {
  if (!modal) return null
  const { id, dir, nom, unite } = modal
  const field = dir === 'entree' ? 'entrees' : dir === 'sortie' ? 'sorties' : 'retours'
  const lignes = stock[id]?.[field] || []
  const types = dir === 'entree' ? ENTREE_TYPES : dir === 'sortie' ? SORTIE_TYPES_SAISIE : RETOUR_TYPES
  const peutEditer = (l) => peutSaisir && user && peutModifierLigne(l, user.uid)

  const titles = { entree: '⬇️ Achats', sortie: '⬆️ Sorties', retour: '🔄 Retours' }

  const addLigne = () => {
    const base = { type: types[0], qte: 1, label: '' }
    if (dir === 'entree') base.cout = 0
    onChange([...lignes, { ...base, agentId: user?.uid, agentNom: user?.nom }])
  }
  const setLigne = (i, patch) => { if (peutEditer(lignes[i])) onChange(lignes.map((l, k) => (k === i ? { ...l, ...patch } : l))) }
  const delLigne = (i) => { if (peutEditer(lignes[i])) onChange(lignes.filter((_, k) => k !== i)) }

  return (
    <Modal open onClose={onClose} title={`${titles[dir]} — ${nom}`} footer={<Button onClick={onClose}>Terminer</Button>}>
      <p className="mb-3 text-sm text-gray-500">Unité : <strong>{unite}</strong></p>
      {dir === 'sortie' && (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Les sorties de <strong>location</strong> passent par facture + autorisation hiérarchique. Seuls les ajustements manuels sont saisis ici.
          {autoSor > 0 && <span className="mt-1 block">{autoSor} sortie(s) auto (demandes approuvées).</span>}
        </p>
      )}
      {dir === 'retour' && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>OK</strong> = réintègre le stock · <strong>Cassé</strong> / <strong>Perdu</strong> = ne réintègre pas (suivi des pertes)
        </p>
      )}
      <div className="space-y-2">
        {lignes.map((l, i) => {
          const locked = !peutEditer(l)
          return (
            <div key={i} className={`rounded-lg border p-2 ${locked ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
              {locked && l.agentNom && <p className="mb-1 text-[10px] font-semibold text-amber-700"><Lock size={10} /> {l.agentNom}</p>}
              <div className="flex gap-2">
                <Select className="flex-1" value={l.type} disabled={locked} onChange={(e) => setLigne(i, { type: e.target.value })}>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input type="number" min="0" className="w-20" value={l.qte} readOnly={locked} onChange={(e) => setLigne(i, { qte: parseInt(e.target.value) || 0 })} />
                {!locked && <button onClick={() => delLigne(i)} className="text-red-500"><Trash2 size={16} /></button>}
              </div>
              {dir === 'entree' && (
                <Input className="mt-2" type="number" min="0" placeholder="Coût unitaire (FCFA)" value={l.cout || ''} readOnly={locked}
                  onChange={(e) => setLigne(i, { cout: parseFloat(e.target.value) || 0 })} />
              )}
              <Input className="mt-2" placeholder="Motif / référence" value={l.label || ''} readOnly={locked} onChange={(e) => setLigne(i, { label: e.target.value })} />
            </div>
          )
        })}
      </div>
      {peutSaisir && <Button variant="outline" size="sm" className="mt-3" onClick={addLigne}><Plus size={15} /> Ajouter</Button>}
    </Modal>
  )
}
