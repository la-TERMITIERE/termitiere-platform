// Stock briques — appatam → séchage → prêtes · caillasses.
// + Stock des matières premières (ciment, gravier, sable) : arrivages & consommation.
import { useEffect, useRef, useState } from 'react'
import { Save, AlertTriangle, Plus, PackagePlus, PackageMinus, Boxes, History, Sun, CheckCircle2, Hammer, Info } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import HistoriqueBriqueModal from './HistoriqueBriqueModal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { updateAtomic, ts, addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateShort, formatNumber, formatMoney, genId } from '../../utils/formatters'
import { ETATS_BRIQUE, DUREE_SECHAGE_JOURS } from './data'
import { getInventaire, previousInventoryDate, joursDepuis, coutMatiereBrique, inventairesCompletes } from './logic'

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
  const { data: transferts } = useCollection('evenementiel_transferts')
  const briques = useBriqueterieStore((s) => s.briques)
  const matieres = useBriqueterieStore((s) => s.matieres)
  const saveBrique = useBriqueterieStore((s) => s.saveBrique)
  const prixSacCiment = useBriqueterieStore((s) => s.prixSacCiment)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  // État chargé depuis la base (référence) : sert à ne sauvegarder que l'ÉCART
  // saisi par l'agent, sans jamais écraser une décrémentation de vente concurrente.
  const loadedRef = useRef({})
  const [matStock, setMatStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [transferModal, setTransferModal] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [arrivage, setArrivage] = useState(null)   // { matiereId, qte, cout, label }
  const [consoModal, setConsoModal] = useState(null) // { matiereId, qte, label } — consommation saisie à la main
  const [matDetail, setMatDetail] = useState(null) // matière sélectionnée pour l'historique
  const [histBrique, setHistBrique] = useState(null) // catégorie dont on consulte l'historique complet

  // Filtre de période — Jour / Mois / Année / Plage personnalisée — sur l'historique des casses.
  const [modePeriodeCasses, setModePeriodeCasses] = useState('mois')
  const [filtreJourCasses, setFiltreJourCasses] = useState('')
  const [filtreMoisCasses, setFiltreMoisCasses] = useState('')
  const [filtreAnneeCasses, setFiltreAnneeCasses] = useState('')
  const [filtreDebutCasses, setFiltreDebutCasses] = useState('')
  const [filtreFinCasses, setFiltreFinCasses] = useState('')

  const peutSaisir = role === 'agent'

  useEffect(() => {
    // Inventaires complétés : une brique absente d'un jour partiel reprend son dernier état connu (rien ne disparaît).
    const completes = inventairesCompletes(inventaires)
    const inv = getInventaire(completes, date) || { briques: {} }
    const prevDate = previousInventoryDate(completes, date)
    const prevInv = prevDate ? getInventaire(completes, prevDate) : null
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
    loadedRef.current = s
  }, [date, inventaires, briques])

  // Chargement du stock matières : saisie du jour, sinon report du solde de la veille.
  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { matieres: {} }
    // Report par matière : dernier jour d'avant qui contient cette matière (un jour partiel, créé par une production,
    // n'a pas de matières : il ne doit pas remettre les stocks à zéro).
    const avant = inventairesCompletes(inventaires).filter((i) => i.date < date)
    const prevMat = (id) => { for (let k = avant.length - 1; k >= 0; k--) { const m = avant[k].matieres?.[id]; if (m) return m } return null }
    const ms = {}
    matieres.forEach((m) => {
      const saved = inv.matieres?.[m.id]
      if (saved) {
        ms[m.id] = { init: saved.init || 0, entrees: saved.entrees || [], consommations: saved.consommations || [] }
      } else {
        const prev = prevMat(m.id)
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
    toast.success('Arrivage ajouté : n\'oubliez pas d\'enregistrer')
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
    toast.success('Consommation enregistrée : n\'oubliez pas d\'enregistrer')
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
      // Fusion anti-écrasement : on applique l'ÉCART saisi par l'agent SUR l'état
      // le plus frais en base. Ainsi une vente certifiée (qui décrémente `pret`),
      // ou une PRODUCTION enregistrée pendant que cette page est ouverte, n'est
      // jamais annulée par cet enregistrement de stock.
      //
      // ÉCRITURE ATOMIQUE (updateAtomic, pas setItem) : le calcul de l'écart utilise
      // l'instantané local (`stock`/`loadedRef`), mais son APPLICATION se fait dans
      // le callback de la transaction, qui reçoit la valeur RÉELLEMENT en base au
      // moment de l'écriture — jamais un instantané local potentiellement pas encore
      // à jour (cause du bug « une saisie en écrase une autre »).
      const ETATS = ['appatam', 'sechage', 'pret', 'caillasses']
      const baseline = loadedRef.current || {}
      const deltasBriques = {}
      briques.forEach((b) => {
        const local = stock[b.id] || {}
        const base = baseline[b.id] || {}
        const d = {}
        ETATS.forEach((e) => { d[e] = (parseInt(local[e]) || 0) - (parseInt(base[e]) || 0) })
        deltasBriques[b.id] = d
      })
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
      await updateAtomic('evenementiel_inventaires', date, (inv) => {
        inv = inv || {}
        const briquesData = { ...(inv.briques || {}) }
        briques.forEach((b) => {
          const dbCur = briquesData[b.id] || {}
          const base = baseline[b.id] || {}
          const merged = {}
          ETATS.forEach((e) => {
            const dbV = dbCur[e] != null ? (parseInt(dbCur[e]) || 0) : (parseInt(base[e]) || 0)
            merged[e] = Math.max(0, dbV + deltasBriques[b.id][e])
          })
          briquesData[b.id] = merged
        })
        return {
          ...inv, date, briques: briquesData, savedAt: ts(), agentId: user.uid, agentNom: user.nom,
          matieres: matieresData
        }
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
    const { briqueId, from, to, qte, dateSechage, motif } = transferModal
    const q = parseInt(qte) || 0
    if (!q) return toast.error('Quantité requise')
    if (to === 'caillasses' && !(motif || '').trim()) return toast.error('Motif de la casse requis')
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
      // Casse : la quantité s'ajoute AU compteur caillasses DU TYPE concerné
      // (visibilité des cassés par catégorie) ET au stock caillasses vendable
      // global (ligne « caillasses », vendue séparément à son tarif).
      if (to === 'caillasses') {
        const cc = s.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
        return {
          ...s,
          [briqueId]: { ...src, caillasses: (src.caillasses || 0) + q },
          caillasses: { ...cc, caillasses: (cc.caillasses || 0) + q }
        }
      }
      return { ...s, [briqueId]: { ...src, [to]: (s[briqueId][to] || 0) + q } }
    })

    await addItem('evenementiel_transferts', {
      date: todayStr(), briqueId,
      briqueNom: briques.find((b) => b.id === briqueId)?.nom,
      from, to, qte: q, dateSechage: dateSechage || '',
      motif: to === 'caillasses' ? (motif || '').trim() : '',
      agentNom: user.nom
    })

    toast.success('Transfert enregistré : n\'oubliez pas de sauvegarder le stock')
    setTransferModal(null)
  }

  // Évaluation du stock par catégorie : quantité en stock (briques intactes =
  // appatam + séchage + prêtes ; caillasses pour la ligne caillasses) × prix unitaire
  // (tarif de vente) = valeur du stock ; × coût matériel unitaire (prix du sac ÷
  // rendement) = coût brut de production. Totaux affichés en pied de tableau.
  const qteEvaluable = (b, d) => b.id === 'caillasses'
    ? (d?.caillasses || 0)
    : ((d?.appatam || 0) + (d?.sechage || 0) + (d?.pret || 0))
  const evaluations = briques.map((b) => {
    const d = stock[b.id] || {}
    const qte = qteEvaluable(b, d)
    return { id: b.id, qte, cout: qte * coutMatiereBrique(b, prixSacCiment), valeur: qte * (parseFloat(b.tarifVente) || 0) }
  })
  const evalOf = Object.fromEntries(evaluations.map((e) => [e.id, e]))
  const totalCout = evaluations.reduce((s, e) => s + e.cout, 0)
  const totalValeur = evaluations.reduce((s, e) => s + e.valeur, 0)

  // Historique des casses — chaque transfert vers « caillasses » porte déjà le
  // type d'origine (briqueNom) et le motif saisi ; on l'affiche pour garder une
  // trace lisible de ce qui s'est cassé, en combien et pourquoi.
  const toutesCasses = [...transferts]
    .filter((t) => t.to === 'caillasses')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const casses = toutesCasses.filter((c) => {
    if (modePeriodeCasses === 'mois' && filtreMoisCasses) return (c.date || '').startsWith(filtreMoisCasses)
    if (modePeriodeCasses === 'annee' && filtreAnneeCasses) return (c.date || '').startsWith(filtreAnneeCasses)
    if (modePeriodeCasses === 'jour' && filtreJourCasses) return c.date === filtreJourCasses
    if (modePeriodeCasses === 'plage' && (filtreDebutCasses || filtreFinCasses)) {
      return (!filtreDebutCasses || c.date >= filtreDebutCasses) && (!filtreFinCasses || c.date <= filtreFinCasses)
    }
    return true
  })
  const totalCasses = casses.reduce((s, c) => s + (parseInt(c.qte) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(71,85,105,0.35),0_8px_20px_-8px_rgba(71,85,105,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(138,155,179,0.92) 0%, rgba(100,116,139,0.9) 40%, rgba(51,65,85,0.88) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#475569', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Boxes size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Stock briques</h2>
          <p className="text-sm text-white/80">Appatam → séchage → prêtes à vendre · caillasses</p>
        </div>
        {/* Filtre de période de l'historique des casses (plus bas), remonté dans le
            bandeau (glassmorphism) — le sélecteur « Date » ci-dessous reste distinct :
            c'est le jour du stock qu'on édite, pas un filtre de liste. */}
        <FiltrePeriode variant="glass" label="Historique des casses" mode={modePeriodeCasses} onModeChange={setModePeriodeCasses}
          valeurJour={filtreJourCasses} onJourChange={setFiltreJourCasses}
          valeurMois={filtreMoisCasses} onMoisChange={setFiltreMoisCasses}
          avecAnnee valeurAnnee={filtreAnneeCasses} onAnneeChange={setFiltreAnneeCasses}
          avecPlage valeurDebut={filtreDebutCasses} onDebutChange={setFiltreDebutCasses}
          valeurFin={filtreFinCasses} onFinChange={setFiltreFinCasses} />
        <div className="band-filtres">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <input type="date" className="input-base w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          {peutSaisir && <Button variant="outline" onClick={() => setAddModal(true)} className="btn-glass"><Plus size={16} /> Ajouter un type</Button>}
          {peutSaisir && <Button onClick={save} loading={saving} className="btn-glass"><Save size={16} /> Enregistrer</Button>}
        </div>
        </div>
      </div>


      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-white/70 px-4 py-3 text-sm text-amber-900 shadow-[0_10px_22px_-16px_rgba(217,119,6,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#D97706')}><Sun size={16} /></span>
        <span>
          <strong>Séchage :</strong> 5 à 6 jours avant chargement pour limiter les casses. Les <strong>caillasses</strong> (briques cassées) sont vendues séparément.
          <span className="mt-0.5 block text-xs text-amber-700">Cliquez sur une catégorie pour voir tout son historique.</span>
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="table-verre overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Catégorie</th>
                {ETATS_BRIQUE.map((e) => (
                  <th key={e.id} className="px-2 py-2 text-center" style={{ color: e.color }}>{e.label.split(' ')[0]}</th>
                ))}
                <th className="px-2 py-2 text-right text-amber-700">Coût brut prod.</th>
                <th className="px-2 py-2 text-right text-slate-700">Valeur stock</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {briques.map((b) => {
                const d = stock[b.id] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setHistBrique(b)} title="Voir l'historique de cette catégorie"
                        className="group flex items-center gap-2.5 text-left font-semibold transition-transform hover:translate-x-0.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:rotate-6" style={icone3D(b.id === 'caillasses' ? '#4B5563' : '#475569')}>
                          {b.id === 'caillasses' ? <Hammer size={15} /> : <Boxes size={15} />}
                        </span>
                        <span>{b.nom}</span>
                        <History size={13} className="text-gray-300 transition-colors group-hover:text-slate-500" />
                      </button>
                    </td>
                    <EtatCell value={d.appatam} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#0284c7" onChange={(v) => setEtat(b.id, 'appatam', v)} />
                    <EtatCell value={d.sechage} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#b45309" onChange={(v) => setEtat(b.id, 'sechage', v)} />
                    <EtatCell value={d.pret} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#15803d" onChange={(v) => setEtat(b.id, 'pret', v)} />
                    {/* Caillasses : compteur par type en lecture seule (alimenté par la
                        casse) ; la ligne « caillasses » reste éditable (stock vendable). */}
                    <EtatCell value={d.caillasses} editable={peutSaisir && b.id === 'caillasses'} disabled={false} color="#4b5563" onChange={(v) => setEtat(b.id, 'caillasses', v)} />
                    <td className="px-2 py-2 text-right font-semibold text-amber-700">{formatMoney(evalOf[b.id]?.cout || 0)}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-700">{formatMoney(evalOf[b.id]?.valeur || 0)}</td>
                    <td className="px-2 py-2">
                      {b.id !== 'caillasses' && peutSaisir && TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <BoutonEtat key={t.to} couleur={t.to === 'sechage' ? '#B45309' : '#15803D'} icone={t.to === 'sechage' ? Sun : CheckCircle2}
                          titre={`${ETAT_LABEL[t.from]} vers ${ETAT_LABEL[t.to]}`}
                          onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: t.to, qte: 1, dateSechage: '' })}>
                          {ETAT_LABEL[t.to]}
                        </BoutonEtat>
                      ))}
                      {b.id !== 'caillasses' && peutSaisir && CASSE_TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <BoutonEtat key={'casse-' + t.from} couleur="#DC2626" icone={Hammer} titre={`Casse depuis l'état ${ETAT_LABEL[t.from].toLowerCase()}`}
                          onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: 'caillasses', qte: 1, dateSechage: '', motif: '' })}>
                          Casse ({ETAT_LABEL[t.from].toLowerCase()})
                        </BoutonEtat>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-3 py-2" colSpan={1 + ETATS_BRIQUE.length}>TOTAL</td>
                <td className="px-2 py-2 text-right text-amber-700">{formatMoney(totalCout)}</td>
                <td className="px-2 py-2 text-right text-slate-700">{formatMoney(totalValeur)}</td>
                <td className="px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400">
          <strong>Valeur du stock</strong> = quantité en stock × prix unitaire (tarif de vente, réglé dans Paramètres).
          <strong> Coût brut de production</strong> = quantité × (prix du sac de ciment ÷ rendement du type).
        </p>
      </Card>

      {/* ── Historique des casses : d'où viennent les caillasses et pourquoi ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#DC2626')}><Hammer size={14} /></span>
          <h3 className="font-bold text-gray-800">Historique des casses</h3>
          <span className="text-xs text-gray-400">{casses.length} casse(s) · période choisie dans le bandeau ci-dessus</span>
        </div>
        {toutesCasses.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">Aucune casse enregistrée pour l'instant.</p>
        ) : casses.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">Aucune casse sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Brique d'origine</th>
                  <th className="px-2 py-2 text-center">État au moment de la casse</th>
                  <th className="px-2 py-2 text-right">Quantité</th>
                  <th className="px-3 py-2 text-left">Motif</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {casses.map((c, i) => (
                  <tr key={c.id || i}>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateShort(c.date)}</td>
                    <td className="px-3 py-2 font-semibold">{c.briqueNom || '—'}</td>
                    <td className="px-2 py-2 text-center text-gray-500">{c.from}</td>
                    <td className="px-2 py-2 text-right font-semibold text-red-700">{formatNumber(c.qte)}</td>
                    <td className="px-3 py-2 text-gray-600">{c.motif || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.agentNom || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                  <td className="px-2 py-2 text-right text-red-700">{formatNumber(totalCasses)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>


      <HistoriqueBriqueModal brique={histBrique} onClose={() => setHistBrique(null)} />

      <Modal open={!!transferModal} onClose={() => setTransferModal(null)} title={`Transfert : ${transferModal?.briqueNom}`}
        footer={<><Button variant="ghost" onClick={() => setTransferModal(null)}>Annuler</Button><Button onClick={executerTransfert}>Confirmer</Button></>}>
        {transferModal && (
          <div className="space-y-3">
            <p className="text-sm">{transferModal.from} → <strong>{transferModal.to}</strong></p>
            <FormGroup label="Quantité"><Input type="number" min="1" max={stock[transferModal.briqueId]?.[transferModal.from] || 0}
              value={transferModal.qte} onChange={(e) => setTransferModal((m) => ({ ...m, qte: e.target.value }))} /></FormGroup>
            {transferModal.to === 'caillasses' && (
              <FormGroup label="Motif de la casse" required hint="Comment ça s'est cassé (manutention, transport, chargement…)">
                <Input value={transferModal.motif} onChange={(e) => setTransferModal((m) => ({ ...m, motif: e.target.value }))}
                  placeholder="ex : chute pendant le chargement du camion" autoFocus />
              </FormGroup>
            )}
            {transferModal.from === 'sechage' && transferModal.to === 'pret' && (
              <>
                <FormGroup label="Date mise en séchage">
                  <Input type="date" value={transferModal.dateSechage} onChange={(e) => setTransferModal((m) => ({ ...m, dateSechage: e.target.value }))} />
                </FormGroup>
                {transferModal.dateSechage && joursDepuis(transferModal.dateSechage) < DUREE_SECHAGE_JOURS && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle size={14} /> Séchage &lt; {DUREE_SECHAGE_JOURS} jours : risque de casse au chargement
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
                {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.unite}) : dispo : {Math.round(matFin(m.id) * 10) / 10}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Quantité consommée"><Input type="number" min="0" step="0.1" value={consoModal.qte} onChange={(e) => setConsoModal((a) => ({ ...a, qte: e.target.value }))} autoFocus /></FormGroup>
            <FormGroup label="Motif / référence" hint="optionnel"><Input value={consoModal.label} onChange={(e) => setConsoModal((a) => ({ ...a, label: e.target.value }))} placeholder="ex : Production du jour, chantier…" /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Détail des mouvements d'une matière (arrivages + consommations) */}
      <Modal open={!!matDetail} onClose={() => setMatDetail(null)} title={matDetail ? `Mouvements : ${matDetail.nom}` : ''} {...glassModalProps(COULEUR_MODULE.evenementiel)}>
        {matDetail && (() => {
          const c = matStock[matDetail.id] || { init: 0, entrees: [], consommations: [] }
          return (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-4 gap-2">
                <MatMini label="Initial" value={formatNumber(c.init || 0)} />
                <MatMini label="Arrivages" value={'+' + formatNumber(sumQte(c.entrees))} color="#16a34a" />
                <MatMini label="Consommé" value={'−' + formatNumber(Math.round(sumQte(c.consommations) * 10) / 10)} color="#ea580c" />
                <MatMini label="Solde" value={formatNumber(Math.round(matFin(matDetail.id) * 10) / 10)} color="#475569" />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase text-green-700">Arrivages</p>
                {(c.entrees || []).length
                  ? (c.entrees || []).map((e, i) => (
                    <p key={i} className="text-xs text-gray-600">• {formatDateShort(e.date)} : <strong>+{formatNumber(e.qte)}</strong> {matDetail.unite}{e.label ? ` · ${e.label}` : ''}{e.cout ? ` · ${formatNumber(e.cout)} F/u` : ''}</p>
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

const ETAT_LABEL = { appatam: 'Appatam', sechage: 'Séchage', pret: 'Prêtes', caillasses: 'Caillasses' }

// Bouton de transfert d'état : pastille à icône, se remplit en relief au survol, la flèche avance.
function BoutonEtat({ icone: Icone, couleur, titre, children, onClick }) {
  return (
    <button type="button" onClick={onClick} title={titre} className="btn-etat mb-1 mr-1 inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-bold" style={{ '--c': couleur }}>
      <Icone size={12} />
      <span aria-hidden="true" className="btn-etat-fleche">→</span>
      {children}
    </button>
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
