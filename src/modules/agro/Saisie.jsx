// Saisie journalière MAXI-AGRO — 4 colonnes : EF Initial · Entrées · Sorties · EF Final.
// Logique métier (fidèle à l'app d'origine, simplifiée) :
//  - EF Initial = valeur enregistrée OU EF Final de la veille (report automatique).
//    → colonne VERROUILLÉE/grisée pour l'agent (modifiable admin/contrôleur).
//  - Entrées : liste de mouvements TYPÉS (Achat / Naissance / Mutation / Dons / Autres).
//  - Sorties : liste de mouvements TYPÉS (Ventes / Décès / Mutation / Perte / Dons / Autres)
//    + les sorties issues des demandes APPROUVÉES (lecture seule, type Ventes).
//  - Le type « Autres » ouvre un champ libre (personne / motif personnalisé).
//  - Le type « Décès » exige un motif.
//  - EF Final = EF Initial + Σ Entrées − Σ Sorties (≥ 0) — colonne calculée.
//  - L'EF Final du jour devient l'EF Initial du jour suivant.
import { useEffect, useMemo, useState } from 'react'
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
import { useAgroStore } from './store/agroStore'
import { setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateTime, genId } from '../../utils/formatters'
import { CAT_ANIMAUX, CAT_ALIMENTS, catColor } from './data'
import {
  previousInventoryDate, getInventaire, autoSorties,
  agregerAnimal, agregerAliment, sommeMouvements, mouvementsDepuisSaisie,
  mutationsEntrantes, mutationsEntrantesDetail,
  ENTREE_TYPES_ANIMAL, SORTIE_TYPES_ANIMAL, ENTREE_TYPES_ALIMENT, SORTIE_TYPES_ALIMENT, labelRequis
} from './logic'

export default function Saisie() {
  const { user, role } = useAuth()
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: demandes } = useCollection('agro_demandes')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const saveEspece = useAgroStore((s) => s.saveEspece)
  const saveAliment = useAgroStore((s) => s.saveAliment)

  const [date, setDate] = useState(todayStr())
  const [tab, setTab] = useState('animaux')
  const [anim, setAnim] = useState({}) // { id: { init, entrees:[], sorties:[] } }
  const [alim, setAlim] = useState({}) // { id: { init, entrees:[], sorties:[] } }
  const [seedInit, setSeedInit] = useState({}) // effectifs initiaux des articles fraîchement créés : { date: { id } }
  const [saving, setSaving] = useState(false)
  const [mvtModal, setMvtModal] = useState(null) // { id, kind, dir, nom }
  const [addModal, setAddModal] = useState(null) // { kind: 'animal' | 'aliment' }

  // EF Initial éditable uniquement par admin / contrôleur (sinon grisé/auto).
  const peutEditerInit = role === 'admin' || role === 'controleur'

  // (Re)construit l'état du formulaire quand la date / les données / le référentiel changent.
  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { animaux: {}, aliments: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
    const seeds = seedInit[date] || {}

    // EF Initial = sauvegardé, sinon EF Final de la veille, sinon effectif initial d'un nouvel article.
    const initOf = (saved, prevFin, id) =>
      saved?.init !== undefined ? saved.init : prevFin !== undefined ? prevFin : seeds[id] ?? 0

    const a = {}
    especes.forEach((e) => {
      const saved = inv.animaux?.[e.id]
      const { entrees, sorties } = mouvementsDepuisSaisie(saved, 'animaux')
      a[e.id] = { init: initOf(saved, prevInv?.animaux?.[e.id]?.fin, e.id), entrees, sorties }
    })
    setAnim(a)

    const al = {}
    aliments.forEach((x) => {
      const saved = inv.aliments?.[x.id]
      const { entrees, sorties } = mouvementsDepuisSaisie(saved, 'aliments')
      al[x.id] = { init: initOf(saved, prevInv?.aliments?.[x.id]?.fin, x.id), entrees, sorties }
    })
    setAlim(al)
  }, [date, inventaires, especes, aliments, seedInit])

  const existing = getInventaire(inventaires, date)
  const dejaSaisi = existing && existing.savedAt

  const setInit = (kind, id, val) => {
    const v = Math.max(0, parseFloat(val) || 0)
    const setter = kind === 'animaux' ? setAnim : setAlim
    setter((s) => ({ ...s, [id]: { ...s[id], init: v } }))
  }

  // Remplace la liste de mouvements (entrées/sorties) d'un article.
  const setLignes = (kind, id, dir, lignes) => {
    const field = dir === 'entree' ? 'entrees' : 'sorties'
    const setter = kind === 'animaux' ? setAnim : setAlim
    setter((s) => ({ ...s, [id]: { ...s[id], [field]: lignes } }))
  }

  // Catégories présentes (base + personnalisées)
  const catsAnim = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])
  const catsAlim = useMemo(() => {
    const custom = [...new Set(aliments.map((a) => a.cat))].filter((c) => !CAT_ALIMENTS.includes(c))
    return [...CAT_ALIMENTS, ...custom].filter((c) => aliments.some((a) => a.cat === c))
  }, [aliments])

  const autoSorOf = (id) => autoSorties(demandes, id, date)
  // Mutations entrantes par espèce de destination (générées par les mutations
  // sortantes des autres espèces : −1 à l'origine, +1 à la destination).
  const mutIn = useMemo(() => mutationsEntrantes(anim), [anim])

  // Création d'un nouvel article (+ éventuelle nouvelle catégorie).
  function handleAddArticle({ nom, cat, initial }) {
    const kind = addModal.kind
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'article') + '_' + genId().slice(0, 3).toLowerCase()
    const article = { id, nom: nom.trim(), cat: cat.trim().toUpperCase(), prix: 0 }
    if (kind === 'animal') saveEspece(article)
    else saveAliment(article)
    setSeedInit((s) => ({ ...s, [date]: { ...(s[date] || {}), [id]: Math.max(0, parseInt(initial) || 0) } }))
    setTab(kind === 'animal' ? 'animaux' : 'aliments')
    setAddModal(null)
    toast.success(`${article.nom} ajouté ✓ — pensez à enregistrer la saisie`)
  }

  async function save() {
    if (!date) return toast.error('Choisissez une date')
    if (!user) return toast.error('Session expirée — reconnectez-vous')

    // Validation : tout mouvement « Autres » ou « Décès » doit être précisé.
    const articleManquant = (coll, src) => {
      for (const e of coll) {
        for (const dir of ['entrees', 'sorties']) {
          const lignes = src[e.id]?.[dir] || []
          const ko = lignes.find((l) => (parseInt(l.qte) || 0) > 0 && labelRequis(l.type) && !(l.label || '').trim())
          if (ko) return { nom: e.nom, type: ko.type }
        }
      }
      return null
    }
    const ko = articleManquant(especes, anim) || articleManquant(aliments, alim)
    if (ko) return toast.error(`Précisez le motif « ${ko.type} » — ${ko.nom}`)

    // Validation : toute mutation sortante doit désigner une espèce de destination.
    const mutSansCible = especes.find((e) =>
      (anim[e.id]?.sorties || []).some((l) => l.type === 'Mutation' && (parseInt(l.qte) || 0) > 0 && !l.cible)
    )
    if (mutSansCible) return toast.error(`Choisissez l'espèce de destination de la mutation — ${mutSansCible.nom}`)

    setSaving(true)
    try {
      let totEnt = 0, totSor = 0
      const animaux = {}
      especes.forEach((e) => {
        const d = anim[e.id] || { init: 0, entrees: [], sorties: [] }
        const autoSor = autoSorOf(e.id)
        const mIn = mutIn[e.id] || 0
        const agg = agregerAnimal(d, autoSor, mIn)
        animaux[e.id] = { ...agg, entrees: d.entrees || [], sorties: d.sorties || [], autoSor }
        totEnt += sommeMouvements(d.entrees) + mIn
        totSor += sommeMouvements(d.sorties) + autoSor
      })
      const alimentsOut = {}
      aliments.forEach((x) => {
        const d = alim[x.id] || { init: 0, entrees: [], sorties: [] }
        const agg = agregerAliment(d)
        alimentsOut[x.id] = { ...agg, entrees: d.entrees || [], sorties: d.sorties || [] }
      })

      await setItem('agro_inventaires', date, {
        date, agentId: user.uid, agentNom: user.nom, savedAt: ts(), animaux, aliments: alimentsOut
      })
      const totalTetes = Object.values(animaux).reduce((s, a) => s + (a.fin || 0), 0)
      await audit('agro', 'SAISIE', `Saisie du ${date} : ${totEnt} entrée(s), ${totSor} sortie(s) — ${totalTetes} têtes au total`, {
        date, totalEntrees: totEnt, totalSorties: totSor, totalTetes,
        détail: detailMouvements(especes, anim, autoSorOf)
      })
      toast.success('Saisie enregistrée ✓')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const renderTable = (kind) => {
    const cats = kind === 'animaux' ? catsAnim : catsAlim
    const articles = kind === 'animaux' ? especes : aliments
    const src = kind === 'animaux' ? anim : alim
    return (
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">{kind === 'animaux' ? 'Espèce' : 'Article'}</th>
              <th className="px-2 py-2" title="Reporté automatiquement de la veille — verrouillé">EF Initial 🔒</th>
              <th className="px-2 py-2 text-center">Entrées</th>
              <th className="px-2 py-2 text-center">Sorties</th>
              <th className="px-2 py-2" title="Calculé automatiquement">EF Final 🔒</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cats.map((cat) => (
              <FragmentCat key={cat} cat={cat} color={catColor(cat)} span={5}>
                {articles.filter((a) => a.cat === cat).map((a) => {
                  const d = src[a.id] || { init: 0, entrees: [], sorties: [] }
                  const autoSor = kind === 'animaux' ? autoSorOf(a.id) : 0
                  const mIn = kind === 'animaux' ? (mutIn[a.id] || 0) : 0
                  const totEnt = sommeMouvements(d.entrees) + mIn
                  const totSor = sommeMouvements(d.sorties) + autoSor
                  const fin = Math.max(0, (d.init || 0) + totEnt - totSor)
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-1.5 font-semibold">{a.nom}</td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="number" min="0" value={d.init ?? 0} readOnly={!peutEditerInit}
                          title={peutEditerInit ? undefined : 'Reporté automatiquement de la veille'}
                          onChange={(e) => setInit(kind, a.id, e.target.value)}
                          onFocus={(e) => peutEditerInit && e.target.select()}
                          className={`w-16 rounded border px-1 py-1 text-center text-sm focus:outline-none ${
                            peutEditerInit ? 'border-gray-200 focus:border-primary' : 'num-readonly cursor-not-allowed border-gray-200'
                          }`}
                        />
                      </td>
                      <MvtCell total={totEnt} dir="entree"
                        onClick={() => setMvtModal({ id: a.id, kind, dir: 'entree', nom: a.nom })} />
                      <MvtCell total={totSor} dir="sortie"
                        onClick={() => setMvtModal({ id: a.id, kind, dir: 'sortie', nom: a.nom })} />
                      <td className="px-2 py-1.5 text-center font-bold text-primary-dark">{fin}</td>
                    </tr>
                  )
                })}
              </FragmentCat>
            ))}
          </tbody>
        </table>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barre d'en-tête */}
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
          <Link to="/agro/demandes"><Button variant="outline"><Send size={16} /> Demander une sortie</Button></Link>
          <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>
        </div>
      </div>

      {dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 size={16} />
          Saisie déjà enregistrée le {formatDateTime(existing.savedAt)} —{' '}
          <strong>{Object.values(existing.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)} têtes</strong>
        </div>
      )}

      {/* Onglets + ajout d'article */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200">
        {[['animaux', 'Animaux'], ['aliments', 'Aliments & Divers']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === v ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto mb-1"
          onClick={() => setAddModal({ kind: tab === 'animaux' ? 'animal' : 'aliment' })}
        >
          <Plus size={15} /> Ajouter un {tab === 'animaux' ? 'animal' : 'aliment'}
        </Button>
      </div>

      {renderTable(tab)}

      {/* Modal mouvements typés */}
      <MouvementModal
        modal={mvtModal}
        anim={anim}
        alim={alim}
        especes={especes}
        autoSor={mvtModal && mvtModal.kind === 'animaux' && mvtModal.dir === 'sortie' ? autoSorOf(mvtModal.id) : 0}
        mutIn={mvtModal && mvtModal.kind === 'animaux' ? (mutIn[mvtModal.id] || 0) : 0}
        mutInDetail={mvtModal && mvtModal.kind === 'animaux' && mvtModal.dir === 'entree'
          ? mutationsEntrantesDetail(anim, especes, mvtModal.id) : []}
        demandes={demandes}
        date={date}
        onClose={() => setMvtModal(null)}
        onChange={(lignes) => setLignes(mvtModal.kind, mvtModal.id, mvtModal.dir, lignes)}
      />

      {/* Modal ajout d'article */}
      <AddArticleModal
        open={!!addModal}
        kind={addModal?.kind}
        existingCats={addModal?.kind === 'animal'
          ? [...new Set([...CAT_ANIMAUX, ...especes.map((e) => e.cat)])]
          : [...new Set([...CAT_ALIMENTS, ...aliments.map((a) => a.cat)])]}
        onClose={() => setAddModal(null)}
        onSave={handleAddArticle}
      />
    </div>
  )
}

// Détail lisible des mouvements (pour le journal d'activité).
function detailMouvements(especes, anim, autoSorOf) {
  const nomDe = (id) => especes.find((e) => e.id === id)?.nom || id
  const mIn = mutationsEntrantes(anim)
  const out = {}
  especes.forEach((e) => {
    const d = anim[e.id]
    if (!d) return
    const parts = []
    ;(d.entrees || []).forEach((l) => l.qte && parts.push(`+${l.qte} ${l.type}${l.label ? ` (${l.label})` : ''}`))
    if (mIn[e.id]) parts.push(`+${mIn[e.id]} Mutation (entrantes)`)
    ;(d.sorties || []).forEach((l) => {
      if (!l.qte) return
      if (l.type === 'Mutation') parts.push(`−${l.qte} Mutation (→ ${nomDe(l.cible)})`)
      else parts.push(`−${l.qte} ${l.type}${l.label ? ` (${l.label})` : ''}`)
    })
    const auto = autoSorOf(e.id)
    if (auto) parts.push(`−${auto} Ventes (demandes approuvées)`)
    if (parts.length) out[e.nom] = parts.join(', ')
  })
  return out
}

// ─────────── Sous-composants ───────────

function FragmentCat({ cat, color, span, children }) {
  return (
    <>
      <tr>
        <td colSpan={span} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white" style={{ background: color }}>
          {cat}
        </td>
      </tr>
      {children}
    </>
  )
}

// Cellule Entrées / Sorties : bouton affichant uniquement le total (cliquer = détail).
function MvtCell({ total, dir, onClick }) {
  const tone = dir === 'entree' ? 'text-green-700' : 'text-amber-700'
  return (
    <td className="px-2 py-1.5 text-center">
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex w-16 items-center justify-center rounded-lg border border-gray-200 px-2 py-1 hover:border-primary hover:bg-primary/5"
        title="Cliquer pour détailler les mouvements par type"
      >
        <span className={`font-bold ${tone}`}>{total}</span>
      </button>
    </td>
  )
}

// Fenêtre d'édition des mouvements typés d'un article (entrées ou sorties).
function MouvementModal({ modal, anim, alim, especes = [], autoSor, mutIn = 0, mutInDetail = [], demandes, date, onClose, onChange }) {
  if (!modal) return null
  const { id, kind, dir, nom } = modal
  const src = kind === 'animaux' ? anim : alim
  const lignes = (dir === 'entree' ? src[id]?.entrees : src[id]?.sorties) || []

  const types = kind === 'animaux'
    ? (dir === 'entree' ? ENTREE_TYPES_ANIMAL : SORTIE_TYPES_ANIMAL)
    : (dir === 'entree' ? ENTREE_TYPES_ALIMENT : SORTIE_TYPES_ALIMENT)

  const addLigne = () => onChange([...lignes, { type: types[0], qte: 1, label: '', cible: '' }])
  const setLigne = (i, patch) => onChange(lignes.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const delLigne = (i) => onChange(lignes.filter((_, k) => k !== i))

  // Sorties auto issues des demandes approuvées (lecture seule).
  const autoLignes = dir === 'sortie' && kind === 'animaux'
    ? (demandes || []).filter((dm) => dm.statut === 'approuve' && dm.typeArticle === 'animal' && dm.articleId === id && dm.dateSortie === date)
    : []

  // Destinations possibles d'une mutation (toutes les espèces sauf l'origine).
  const ciblesPossibles = especes.filter((e) => e.id !== id)

  const total = sommeMouvements(lignes) + (dir === 'sortie' ? (autoSor || 0) : (mutIn || 0))

  return (
    <Modal
      open
      onClose={onClose}
      title={`${dir === 'entree' ? '⬇️ Entrées' : '⬆️ Sorties'} — ${nom}`}
      footer={<Button onClick={onClose}>Terminer</Button>}
    >
      <p className="mb-3 text-sm text-gray-500">
        Total {dir === 'entree' ? 'des entrées' : 'des sorties'} : <strong className="text-gray-800">{total}</strong>
      </p>

      {autoLignes.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg bg-amber-50 p-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-amber-700"><Lock size={12} /> Sorties automatiques (demandes approuvées)</p>
          {autoLignes.map((dm) => (
            <p key={dm.id} className="text-xs text-amber-800">🔄 {dm.qte} × Ventes — {dm.num} ({dm.motif})</p>
          ))}
        </div>
      )}

      {/* Mutations entrantes (générées par les mutations d'autres espèces) — lecture seule */}
      {dir === 'entree' && mutInDetail.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg bg-sky-50 p-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-sky-700"><Lock size={12} /> Mutations entrantes (animaux ayant grandi)</p>
          {mutInDetail.map((m, k) => (
            <p key={k} className="text-xs text-sky-800">🔁 +{m.qte} depuis {m.depuis}</p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {lignes.length === 0 && <p className="text-sm text-gray-400">Aucun mouvement saisi. Ajoutez une ligne ci-dessous.</p>}
        {lignes.map((l, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-2">
            <div className="flex items-center gap-2">
              <Select className="flex-1" value={l.type} onChange={(e) => setLigne(i, { type: e.target.value })}>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input type="number" min="0" className="w-20" value={l.qte}
                onChange={(e) => setLigne(i, { qte: Math.max(0, parseInt(e.target.value) || 0) })} />
              <button onClick={() => delLigne(i)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 size={16} /></button>
            </div>
            {/* Mutation (sortie animale) : choisir l'espèce de destination → +1 auto là-bas */}
            {kind === 'animaux' && dir === 'sortie' && l.type === 'Mutation' && (
              <div className="mt-2">
                <Select value={l.cible || ''} onChange={(e) => setLigne(i, { cible: e.target.value })}>
                  <option value="">— Espèce de destination (où va l'animal) —</option>
                  {ciblesPossibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </Select>
                <p className="mt-1 text-[11px] text-sky-600">↪︎ +{l.qte || 0} sera ajouté automatiquement à l'espèce de destination.</p>
              </div>
            )}
            {labelRequis(l.type) && (
              <Input
                className="mt-2"
                value={l.label || ''}
                onChange={(e) => setLigne(i, { label: e.target.value })}
                placeholder={l.type === 'Décès' ? 'Motif du décès (maladie, accident, prédateur…)' : 'Précisez (personne, motif…)'}
                autoFocus
              />
            )}
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" className="mt-3" onClick={addLigne}><Plus size={15} /> Ajouter une ligne</Button>
    </Modal>
  )
}

// Fenêtre de création d'un article : nom, catégorie (existante ou nouvelle), prix, effectif initial.
function AddArticleModal({ open, kind, existingCats = [], onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [catChoice, setCatChoice] = useState('')
  const [catNew, setCatNew] = useState('')
  const [initial, setInitial] = useState('')

  useEffect(() => {
    if (open) { setNom(''); setCatChoice(existingCats[0] || ''); setCatNew(''); setInitial('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = catChoice === '__new__' ? catNew : catChoice

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    if (!cat.trim()) return toast.error('Catégorie requise')
    onSave({ nom, cat, initial })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ajouter un ${kind === 'animal' ? 'animal' : 'aliment / divers'}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit}>Ajouter</Button></>}
    >
      <FormGroup label="Nom de l'article" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={kind === 'animal' ? 'ex : Lapins' : 'ex : Maïs concassé'} autoFocus />
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
            <Input value={catNew} onChange={(e) => setCatNew(e.target.value)} placeholder="ex : LAPINS" />
          </FormGroup>
        )}
      </div>
      <FormGroup label="Effectif initial" hint="Stock de départ à cette date">
        <Input type="number" min="0" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
      </FormGroup>
      {catChoice === '__new__' && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          La nouvelle catégorie « {(catNew || '…').toUpperCase()} » apparaîtra automatiquement dans le Dashboard et les analyses.
        </p>
      )}
    </Modal>
  )
}
