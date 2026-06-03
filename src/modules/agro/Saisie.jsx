// Saisie journalière MAXI-AGRO.
// Logique métier (fidèle à l'app d'origine) :
//  - EF Initial = valeur enregistrée OU EF Final de la veille (report automatique).
//    → colonne VERROUILLÉE/grisée pour l'agent (modifiable admin/contrôleur).
//  - Naissances / Entrées : saisis librement par l'utilisateur.
//  - Sorties (animaux) = somme des demandes APPROUVÉES pour cette date (lecture seule).
//  - Décès : saisi + MOTIF obligatoire pour chaque décès.
//  - EF Final = init + naiss + ent − sorties − décès (≥ 0) — colonne grisée (calculée).
//  - L'EF Final du jour devient l'EF Initial du jour suivant.
//
// Ajout d'articles : l'utilisateur peut créer de nouveaux animaux/aliments ET de
// nouvelles catégories (avec prix unitaire + effectif initial). Les nouvelles
// catégories se synchronisent automatiquement avec le Dashboard (même référentiel).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save, Send, CheckCircle2, Plus } from 'lucide-react'
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
import { previousInventoryDate, getInventaire, autoSorties, finAnimal, finAliment } from './logic'

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
  const [anim, setAnim] = useState({}) // { id: { init, naiss, ent, dec, decMotif } }
  const [alim, setAlim] = useState({}) // { id: { init, ent, sor } }
  const [seedInit, setSeedInit] = useState({}) // effectifs initiaux des articles fraîchement créés : { date: { id: valeur } }
  const [saving, setSaving] = useState(false)
  const [decesModal, setDecesModal] = useState(null) // { id, nom }
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
      a[e.id] = {
        init: initOf(saved, prevInv?.animaux?.[e.id]?.fin, e.id),
        naiss: saved?.naiss || 0,
        ent: saved?.ent || 0,
        dec: saved?.dec || 0,
        decMotif: saved?.decMotif || ''
      }
    })
    setAnim(a)

    const al = {}
    aliments.forEach((x) => {
      const saved = inv.aliments?.[x.id]
      al[x.id] = {
        init: initOf(saved, prevInv?.aliments?.[x.id]?.fin, x.id),
        ent: saved?.ent || 0,
        sor: saved?.sor || 0
      }
    })
    setAlim(al)
  }, [date, inventaires, especes, aliments, seedInit])

  const existing = getInventaire(inventaires, date)
  const dejaSaisi = existing && existing.savedAt

  const setA = (id, field, val) => {
    const v = Math.max(0, parseInt(val) || 0)
    // Tout décès doit être motivé → ouvre la fenêtre de motif.
    if (field === 'dec' && v > 0) setDecesModal({ id, nom: especes.find((e) => e.id === id)?.nom })
    setAnim((s) => ({ ...s, [id]: { ...s[id], [field]: v } }))
  }
  const setAl = (id, field, val) =>
    setAlim((s) => ({ ...s, [id]: { ...s[id], [field]: Math.max(0, parseFloat(val) || 0) } }))

  // Catégories présentes (base + personnalisées)
  const catsAnim = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])
  const catsAlim = useMemo(() => {
    const custom = [...new Set(aliments.map((a) => a.cat))].filter((c) => !CAT_ALIMENTS.includes(c))
    return [...CAT_ALIMENTS, ...custom].filter((c) => aliments.some((a) => a.cat === c))
  }, [aliments])

  const sorOf = (id) => autoSorties(demandes, id, date)

  // Création d'un nouvel article (+ éventuelle nouvelle catégorie).
  function handleAddArticle({ nom, cat, prix, initial }) {
    const kind = addModal.kind
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'article') + '_' + genId().slice(0, 3).toLowerCase()
    const article = { id, nom: nom.trim(), cat: cat.trim().toUpperCase(), prix: parseInt(prix) || 0 }
    if (kind === 'animal') saveEspece(article)
    else saveAliment(article)
    // Mémorise l'effectif initial pour ce nouvel article à cette date.
    setSeedInit((s) => ({ ...s, [date]: { ...(s[date] || {}), [id]: Math.max(0, parseInt(initial) || 0) } }))
    setTab(kind === 'animal' ? 'animaux' : 'aliments')
    setAddModal(null)
    toast.success(`${article.nom} ajouté ✓ — pensez à enregistrer la saisie`)
  }

  async function save() {
    if (!date) return toast.error('Choisissez une date')
    if (!user) return toast.error('Session expirée — reconnectez-vous')

    // Motif de décès obligatoire
    const sansMotif = especes.find((e) => (anim[e.id]?.dec || 0) > 0 && !(anim[e.id]?.decMotif || '').trim())
    if (sansMotif) {
      setDecesModal({ id: sansMotif.id, nom: sansMotif.nom })
      return toast.error(`Indiquez le motif du décès — ${sansMotif.nom}`)
    }

    setSaving(true)
    try {
      const animaux = {}
      especes.forEach((e) => {
        const d = anim[e.id] || {}
        const sor = sorOf(e.id)
        animaux[e.id] = {
          init: d.init || 0, naiss: d.naiss || 0, ent: d.ent || 0,
          sor, dec: d.dec || 0, fin: finAnimal({ ...d, sor }), decMotif: d.decMotif || ''
        }
      })
      const alimentsOut = {}
      aliments.forEach((x) => {
        const d = alim[x.id] || {}
        alimentsOut[x.id] = { init: d.init || 0, ent: d.ent || 0, sor: d.sor || 0, fin: finAliment(d) }
      })

      await setItem('agro_inventaires', date, {
        date, agentId: user.uid, agentNom: user.nom, savedAt: ts(), animaux, aliments: alimentsOut
      })
      await audit('agro', 'SAISIE', `Saisie enregistrée pour le ${date}`)
      toast.success('Saisie enregistrée ✓')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally {
      setSaving(false)
    }
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

      {tab === 'animaux' ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Espèce</th>
                <th className="px-2 py-2" title="Reporté automatiquement de la veille — verrouillé">EF Initial 🔒</th>
                <th className="px-2 py-2">Naissances</th>
                <th className="px-2 py-2">Entrées</th>
                <th className="px-2 py-2" title="Auto depuis demandes approuvées">Sorties 🔄</th>
                <th className="px-2 py-2">Décès</th>
                <th className="px-2 py-2" title="Calculé automatiquement">EF Final 🔒</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {catsAnim.map((cat) => (
                <FragmentCat key={cat} cat={cat} color={catColor(cat)} span={7}>
                  {especes.filter((e) => e.cat === cat).map((e) => {
                    const d = anim[e.id] || {}
                    const sor = sorOf(e.id)
                    const fin = finAnimal({ ...d, sor })
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-1.5 font-semibold">{e.nom}</td>
                        <NumCell value={d.init} readOnly={!peutEditerInit} onChange={(v) => setA(e.id, 'init', v)} />
                        <NumCell value={d.naiss} onChange={(v) => setA(e.id, 'naiss', v)} />
                        <NumCell value={d.ent} onChange={(v) => setA(e.id, 'ent', v)} />
                        <NumCell value={sor} readOnly />
                        <NumCell value={d.dec} onChange={(v) => setA(e.id, 'dec', v)} />
                        <td className="px-2 py-1.5 text-center font-bold text-primary-dark">{fin}</td>
                      </tr>
                    )
                  })}
                </FragmentCat>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Article</th>
                <th className="px-2 py-2" title="Reporté automatiquement de la veille — verrouillé">EF Initial 🔒</th>
                <th className="px-2 py-2">Entrées</th>
                <th className="px-2 py-2">Sorties</th>
                <th className="px-2 py-2" title="Calculé automatiquement">EF Final 🔒</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {catsAlim.map((cat) => (
                <FragmentCat key={cat} cat={cat} color={catColor(cat)} span={5}>
                  {aliments.filter((a) => a.cat === cat).map((x) => {
                    const d = alim[x.id] || {}
                    return (
                      <tr key={x.id}>
                        <td className="px-3 py-1.5 font-semibold">{x.nom}</td>
                        <NumCell value={d.init} readOnly={!peutEditerInit} onChange={(v) => setAl(x.id, 'init', v)} />
                        <NumCell value={d.ent} onChange={(v) => setAl(x.id, 'ent', v)} />
                        <NumCell value={d.sor} onChange={(v) => setAl(x.id, 'sor', v)} />
                        <td className="px-2 py-1.5 text-center font-bold text-secondary-dark">{finAliment(d)}</td>
                      </tr>
                    )
                  })}
                </FragmentCat>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal motif décès */}
      <Modal
        open={!!decesModal}
        onClose={() => setDecesModal(null)}
        title={`Motif du décès — ${decesModal?.nom || ''}`}
        footer={<Button onClick={() => setDecesModal(null)}>Valider</Button>}
      >
        <p className="mb-2 text-xs text-gray-500">Le motif est obligatoire pour chaque décès enregistré.</p>
        <textarea
          className="input-base"
          rows={3}
          autoFocus
          placeholder="Cause du décès (maladie, accident, prédateur…)"
          value={decesModal ? anim[decesModal.id]?.decMotif || '' : ''}
          onChange={(e) => setAnim((s) => ({ ...s, [decesModal.id]: { ...s[decesModal.id], decMotif: e.target.value } }))}
        />
      </Modal>

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

function NumCell({ value, onChange, readOnly }) {
  return (
    <td className="px-2 py-1.5 text-center">
      <input
        type="number"
        min="0"
        value={value ?? 0}
        readOnly={readOnly}
        title={readOnly ? 'Champ verrouillé (calculé / reporté automatiquement)' : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onFocus={(e) => !readOnly && e.target.select()}
        className={`w-16 rounded border px-1 py-1 text-center text-sm focus:outline-none ${
          readOnly ? 'num-readonly cursor-not-allowed border-gray-200' : 'border-gray-200 focus:border-primary'
        }`}
      />
    </td>
  )
}

// Fenêtre de création d'un article : nom, catégorie (existante ou nouvelle), prix, effectif initial.
function AddArticleModal({ open, kind, existingCats = [], onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [catChoice, setCatChoice] = useState('')
  const [catNew, setCatNew] = useState('')
  const [prix, setPrix] = useState('')
  const [initial, setInitial] = useState('')

  // Réinitialise à l'ouverture
  useEffect(() => {
    if (open) { setNom(''); setCatChoice(existingCats[0] || ''); setCatNew(''); setPrix(''); setInitial('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = catChoice === '__new__' ? catNew : catChoice

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    if (!cat.trim()) return toast.error('Catégorie requise')
    onSave({ nom, cat, prix, initial })
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
      <div className="grid grid-cols-2 gap-3">
        <FormGroup label="Prix unitaire (FCFA)">
          <Input type="number" min="0" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="0" />
        </FormGroup>
        <FormGroup label="Effectif initial" hint="Stock de départ à cette date">
          <Input type="number" min="0" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
        </FormGroup>
      </div>
      {catChoice === '__new__' && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          La nouvelle catégorie « {(catNew || '…').toUpperCase()} » apparaîtra automatiquement dans le Dashboard et les analyses.
        </p>
      )}
    </Modal>
  )
}
