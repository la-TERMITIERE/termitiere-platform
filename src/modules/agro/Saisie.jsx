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
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, formatDateTime, genId } from '../../utils/formatters'
import { CAT_ANIMAUX, CAT_ALIMENTS, catColor } from './data'
import {
  previousInventoryDate, getInventaire, autoSorties,
  agregerAnimal, agregerAliment, sommeMouvements, mouvementsDepuisSaisie,
  mutationsEntrantes, mutationsEntrantesDetail,
  ENTREE_TYPES_ANIMAL, SORTIE_TYPES_SAISIE_ANIMAL, ENTREE_TYPES_ALIMENT, SORTIE_TYPES_SAISIE_ALIMENT,
  labelRequis, nouvellesSortiesNotifiable, mergeMouvementsUtilisateur, peutModifierLigne, annoterLignesAgent
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

  // Seuls les agents peuvent saisir ; admins et contrôleurs sont en lecture seule.
  const peutSaisir = role === 'agent'
  // EF Initial : lecture seule pour tout le monde (reporté automatiquement de la veille).
  const peutEditerInit = false

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

  // Remplace les mouvements de l'utilisateur courant ; conserve ceux des autres agents.
  const setLignes = (kind, id, dir, lignes) => {
    if (!user) return
    const field = dir === 'entree' ? 'entrees' : 'sorties'
    const setter = kind === 'animaux' ? setAnim : setAlim
    setter((s) => {
      const prev = s[id]?.[field] || []
      const merged = mergeMouvementsUtilisateur(prev, lignes, user.uid, user.nom)
      return { ...s, [id]: { ...s[id], [field]: merged } }
    })
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

  const autoSorOf = (id, kind = 'animaux') => autoSorties(demandes, id, date, kind === 'aliments' ? 'aliment' : 'animal')
  // Mutations entrantes par espèce de destination (générées par les mutations
  // sortantes des autres espèces : −1 à l'origine, +1 à la destination).
  const mutIn = useMemo(() => mutationsEntrantes(anim), [anim])

  // Création d'un nouvel article (+ éventuelle nouvelle catégorie).
  function handleAddArticle({ nom, cat, initial, unite }) {
    const kind = addModal.kind
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'article') + '_' + genId().slice(0, 3).toLowerCase()
    const article = kind === 'animal'
      ? { id, nom: nom.trim(), cat: cat.trim().toUpperCase(), prix: 0 }
      : { id, nom: nom.trim(), cat: cat.trim().toUpperCase(), prix: 0, unite: initial.unite || 'kg' }
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
        animaux[e.id] = {
          ...agg,
          entrees: annoterLignesAgent(d.entrees || [], user.uid, user.nom),
          sorties: annoterLignesAgent(d.sorties || [], user.uid, user.nom),
          autoSor
        }
        totEnt += sommeMouvements(d.entrees) + mIn
        totSor += sommeMouvements(d.sorties) + autoSor
      })
      const alimentsOut = {}
      aliments.forEach((x) => {
        const d = alim[x.id] || { init: 0, entrees: [], sorties: [] }
        const autoSor = autoSorOf(x.id, 'aliments')
        const agg = agregerAliment(d, autoSor)
        alimentsOut[x.id] = {
          ...agg,
          entrees: annoterLignesAgent(d.entrees || [], user.uid, user.nom),
          sorties: annoterLignesAgent(d.sorties || [], user.uid, user.nom),
          autoSor
        }
        totSor += sommeMouvements(d.sorties) + autoSor
      })

      await setItem('agro_inventaires', date, {
        date, agentId: user.uid, agentNom: user.nom, savedAt: ts(), animaux, aliments: alimentsOut
      })
      const totalTetes = Object.values(animaux).reduce((s, a) => s + (a.fin || 0), 0)
      await audit('agro', 'SAISIE', `Saisie du ${date} : ${totEnt} entrée(s), ${totSor} sortie(s) — ${totalTetes} têtes au total`, {
        date, totalEntrees: totEnt, totalSorties: totSor, totalTetes,
        détail: detailMouvements(especes, anim, autoSorOf)
      })

      const sortiesNotif = nouvellesSortiesNotifiable(especes, aliments, anim, alim, existing)
      if (sortiesNotif.length) {
        const body = sortiesNotif
          .map((l) => `• ${l.qte} × ${l.article} — ${l.type}${l.motif ? ` (${l.motif})` : ''}`)
          .join('\n')
        await notify({
          type: 'info',
          title: `Sorties saisies — ${user.nom}`,
          body: `Date ${date} :\n${body}`,
          module: 'agro',
          forRoles: ['admin', 'controleur'],
          excludeUid: user.uid,
          link: '/agro/saisie'
        })
      }

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
      <Card className="overflow-hidden p-0">
        <div className="max-h-[calc(100vh-14rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
            <tr>
              <th className="bg-gray-50 px-3 py-2 text-left">{kind === 'animaux' ? 'Espèce' : 'Article'}</th>
              <th className="bg-gray-50 px-2 py-2" title="Reporté automatiquement de la veille — verrouillé">EF Initial 🔒</th>
              <th className="bg-gray-50 px-2 py-2 text-center">Entrées</th>
              <th className="bg-gray-50 px-2 py-2 text-center">Sorties</th>
              <th className="bg-gray-50 px-2 py-2" title="Calculé automatiquement">EF Final 🔒</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cats.map((cat) => (
              <FragmentCat key={cat} cat={cat} color={catColor(cat)} span={5}>
                {articles.filter((a) => a.cat === cat).map((a) => {
                  const d = src[a.id] || { init: 0, entrees: [], sorties: [] }
                  const autoSor = autoSorOf(a.id, kind)
                  const mIn = kind === 'animaux' ? (mutIn[a.id] || 0) : 0
                  const totEnt = sommeMouvements(d.entrees) + mIn
                  const totSor = sommeMouvements(d.sorties) + autoSor
                  const fin = Math.max(0, (d.init || 0) + totEnt - totSor)
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-1.5 font-semibold">
                        {a.nom}
                        {kind === 'aliments' && a.unite && (
                          <span className="ml-1 text-[10px] font-normal text-gray-400">({a.unite})</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="number" min="0" value={d.init ?? 0}                           readOnly={!peutEditerInit}
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
                      <MvtCell total={sommeMouvements(d.sorties)} dir="sortie"
                        sub={autoSor > 0 ? `+${autoSor} ventes (demandes)` : null}
                        onClick={() => setMvtModal({ id: a.id, kind, dir: 'sortie', nom: a.nom })} />
                      <td className="px-2 py-1.5 text-center font-bold text-primary-dark">
                        {fin}{kind === 'aliments' && a.unite ? <span className="ml-0.5 text-[10px] font-normal text-gray-400">{a.unite}</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </FragmentCat>
            ))}
          </tbody>
        </table>
        </div>
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
          {peutSaisir && <Link to="/agro/demandes"><Button variant="outline"><Send size={16} /> Demander une sortie</Button></Link>}
          {peutSaisir && <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      {!peutSaisir && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 font-semibold">
          👁️ Mode consultation — seuls les agents peuvent saisir et enregistrer des données.
        </div>
      )}
      {dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 size={16} />
          Saisie du {formatDateTime(existing.savedAt)} —{' '}
          <strong>{Object.values(existing.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)} têtes</strong>
          {peutSaisir && <span className="text-green-600">· Chaque agent ne peut modifier que ses propres mouvements</span>}
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
        {peutSaisir && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto mb-1"
            onClick={() => setAddModal({ kind: tab === 'animaux' ? 'animal' : 'aliment' })}
          >
            <Plus size={15} /> Ajouter un {tab === 'animaux' ? 'animal' : 'aliment'}
          </Button>
        )}
      </div>

      {renderTable(tab)}

      {/* Modal mouvements typés */}
      <MouvementModal
        modal={mvtModal}
        anim={anim}
        alim={alim}
        especes={especes}
        autoSor={mvtModal && mvtModal.dir === 'sortie' ? autoSorOf(mvtModal.id, mvtModal.kind) : 0}
        mutIn={mvtModal && mvtModal.kind === 'animaux' ? (mutIn[mvtModal.id] || 0) : 0}
        mutInDetail={mvtModal && mvtModal.kind === 'animaux' && mvtModal.dir === 'entree'
          ? mutationsEntrantesDetail(anim, especes, mvtModal.id) : []}
        date={date}
        onClose={() => setMvtModal(null)}
        user={user}
        peutSaisir={peutSaisir}
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
function MvtCell({ total, dir, onClick, sub }) {
  const tone = dir === 'entree' ? 'text-green-700' : 'text-amber-700'
  return (
    <td className="px-2 py-1.5 text-center">
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex min-w-[4rem] flex-col items-center justify-center rounded-lg border border-gray-200 px-2 py-1 hover:border-primary hover:bg-primary/5"
        title="Cliquer pour détailler les mouvements par type"
      >
        <span className={`font-bold ${tone}`}>{total}</span>
        {sub && <span className="text-[9px] leading-tight text-gray-400">{sub}</span>}
      </button>
    </td>
  )
}

// Fenêtre d'édition des mouvements typés d'un article (entrées ou sorties).
function MouvementModal({ modal, anim, alim, especes = [], autoSor, mutIn = 0, mutInDetail = [], date, onClose, onChange, user, peutSaisir }) {
  if (!modal) return null
  const { id, kind, dir, nom } = modal
  const src = kind === 'animaux' ? anim : alim
  const lignes = (dir === 'entree' ? src[id]?.entrees : src[id]?.sorties) || []

  const types = kind === 'animaux'
    ? (dir === 'entree' ? ENTREE_TYPES_ANIMAL : SORTIE_TYPES_SAISIE_ANIMAL)
    : (dir === 'entree' ? ENTREE_TYPES_ALIMENT : SORTIE_TYPES_SAISIE_ALIMENT)

  const peutEditer = (l) => peutSaisir && user && peutModifierLigne(l, user.uid)
  const addLigne = () => onChange([...lignes, { type: types[0], qte: 1, label: '', cible: '', agentId: user?.uid, agentNom: user?.nom }])
  const setLigne = (i, patch) => {
    if (!peutEditer(lignes[i])) return
    onChange(lignes.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  }
  const delLigne = (i) => {
    if (!peutEditer(lignes[i])) return
    onChange(lignes.filter((_, k) => k !== i))
  }

  // Destinations possibles d'une mutation (toutes les espèces sauf l'origine).
  const ciblesPossibles = especes.filter((e) => e.id !== id)

  // Ventes/Dons et demandes approuvées sont hors de cette fenêtre (workflow Demande).
  const total = sommeMouvements(lignes) + (dir === 'entree' ? (mutIn || 0) : 0)

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

      {dir === 'sortie' && (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Les sorties <strong>Ventes</strong> et <strong>Dons</strong> passent par une demande à approuver — bouton « Demander une sortie ».
        </p>
      )}

      {dir === 'sortie' && (autoSor || 0) > 0 && (
        <p className="mb-3 text-xs text-gray-400">
          {autoSor} vente(s) issue(s) de demandes approuvées — consultez l'onglet Demandes (non modifiable ici).
        </p>
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
        {lignes.map((l, i) => {
          const locked = !peutEditer(l)
          return (
          <div key={i} className={`rounded-lg border p-2 ${locked ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
            {locked && l.agentNom && (
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                <Lock size={10} /> Saisi par {l.agentNom} — lecture seule
              </p>
            )}
            <div className="flex items-center gap-2">
              <Select className="flex-1" value={l.type} disabled={locked} onChange={(e) => setLigne(i, { type: e.target.value })}>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input type="number" min="0" className="w-20" value={l.qte} readOnly={locked}
                onChange={(e) => setLigne(i, { qte: Math.max(0, parseInt(e.target.value) || 0) })} />
              {!locked && (
                <button onClick={() => delLigne(i)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 size={16} /></button>
              )}
            </div>
            {/* Mutation (sortie animale) : choisir l'espèce de destination → +1 auto là-bas */}
            {kind === 'animaux' && dir === 'sortie' && l.type === 'Mutation' && (
              <div className="mt-2">
                <Select value={l.cible || ''} disabled={locked} onChange={(e) => setLigne(i, { cible: e.target.value })}>
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
                readOnly={locked}
                onChange={(e) => setLigne(i, { label: e.target.value })}
                placeholder={l.type === 'Décès' ? 'Motif du décès (maladie, accident, prédateur…)' : 'Précisez (personne, motif…)'}
                autoFocus
              />
            )}
          </div>
        )})}
      </div>

      {peutSaisir && <Button variant="outline" size="sm" className="mt-3" onClick={addLigne}><Plus size={15} /> Ajouter une ligne</Button>}
    </Modal>
  )
}

// Fenêtre de création d'un article : nom, catégorie (existante ou nouvelle), prix, effectif initial.
function AddArticleModal({ open, kind, existingCats = [], onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [catChoice, setCatChoice] = useState('')
  const [catNew, setCatNew] = useState('')
  const [initial, setInitial] = useState('')
  const [unite, setUnite] = useState('kg')

  useEffect(() => {
    if (open) { setNom(''); setCatChoice(existingCats[0] || ''); setCatNew(''); setInitial(''); setUnite('kg') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = catChoice === '__new__' ? catNew : catChoice

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    if (!cat.trim()) return toast.error('Catégorie requise')
    onSave({ nom, cat, initial, unite: kind === 'aliment' ? unite : undefined })
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
        <FormGroup label={kind === 'animal' ? 'Effectif initial' : 'Stock initial'} hint="À cette date">
          <Input type="number" min="0" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
        </FormGroup>
        {kind === 'aliment' && (
          <FormGroup label="Unité">
            <Select value={unite} onChange={(e) => setUnite(e.target.value)}>
              {['kg', 'sacs', 'litres', 'unités', 'tonnes', 'balles'].map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormGroup>
        )}
      </div>
      {catChoice === '__new__' && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          La nouvelle catégorie « {(catNew || '…').toUpperCase()} » apparaîtra automatiquement dans le Dashboard et les analyses.
        </p>
      )}
    </Modal>
  )
}
