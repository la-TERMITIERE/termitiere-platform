// Dashboard MAXI-AGRO — pilotage par ESPÈCE.
// - Filtre par catégorie (onglets dynamiques) : Toutes, Ovins, Bovins, Caprins,
//   Canards, Dindons, Pintades, Poulets (+ catégories personnalisées).
// - Pour la catégorie sélectionnée : Effectif, Mortalité, Morbidité, Croissance,
//   Ventes (volume) et Chiffre d'affaires (réservé à la hiérarchie).
// - Le CA n'est compté que sur les factures CERTIFIÉES.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, Boxes, HeartPulse, Skull, Stethoscope, Sprout, ShoppingCart, Wallet, Egg, HeartCrack, CheckCircle2, AlertTriangle, AlarmClock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import LoadingSpinner from '../../shared/ui/LoadingSpinner'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { canViewFinance } from '../../core/roles'
import { useAgroStore } from './store/agroStore'
import { CAT_ANIMAUX, catColor, serieColor, factureStatut } from './data'
import { agregerAchatsVentes, previsionSerie, ventesFactureesParEspece } from './logic'
import { formatNumber, formatMoney, todayStr, addDays, formatDateShort, formatDateTime, nowHM } from '../../utils/formatters'

const PRESETS = [
  { v: 'mois', label: 'Mois en cours' },
  { v: 'journalier', label: 'Journalier (aujourd\'hui)' },
  { v: '7', label: 'Hebdomadaire (7 jours)' },
  { v: '30', label: '30 derniers jours' },
  { v: '90', label: '90 derniers jours' },
  { v: '180', label: '180 derniers jours' },
  { v: '365', label: 'Cette année (1 an)' },
  { v: 'custom', label: 'Plage personnalisée…' }
]
const TOUTES = '__TOUTES__'

export default function Dashboard() {
  const { role, user } = useAuth()
  const showFinance = canViewFinance(role)
  const { data: inventaires, loading } = useCollection('agro_inventaires')
  const { data: factures } = useCollection('agro_factures')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)

  // Planning personnel (cf. TachesRoutinieres.jsx) — MES tâches assignées pour
  // aujourd'hui, avec heure prévue, triées chronologiquement. Sert à la petite
  // alarme ci-dessous : « c'est l'heure » dès que l'heure prévue est dépassée et
  // que la tâche n'est pas encore cochée.
  const { data: routineItems } = useCollection('agro_routine_items')
  const { data: routineChecks } = useCollection('agro_routine_checks')
  const mesTachesDuJour = useMemo(() => {
    const today = todayStr()
    const checksAujourdhui = {}
    routineChecks.filter((c) => c.date === today).forEach((c) => { checksAujourdhui[c.itemId] = c })
    const heureActuelle = nowHM()
    return routineItems
      .filter((it) => it.assigneUid === user?.uid)
      .map((it) => {
        const fait = !!checksAujourdhui[it.id]?.fait
        return { ...it, fait, enRetard: !fait && !!it.heure && heureActuelle > it.heure }
      })
      .sort((a, b) => (a.heure || '99:99').localeCompare(b.heure || '99:99'))
  }, [routineItems, routineChecks, user?.uid])

  const [preset, setPreset] = useState('mois')
  const [from, setFrom] = useState(todayStr().slice(0, 7) + '-01')
  const [to, setTo] = useState(todayStr())
  const [scope, setScope] = useState(TOUTES)
  // 'naissances' | 'deces' | 'mortalite' | 'letalite' | 'morbidite' | 'croissance' | 'ventes' | 'ca'
  const [modalKey, setModalKey] = useState(null)

  const isDaily = preset === 'journalier'

  const { start, end } = useMemo(() => {
    if (preset === 'mois') return { start: todayStr().slice(0, 7) + '-01', end: todayStr() }
    if (preset === 'journalier') return { start: todayStr(), end: todayStr() }
    if (preset === 'custom') return { start: from, end: to }
    return { start: addDays(todayStr(), -parseInt(preset)), end: todayStr() }
  }, [preset, from, to])

  const tri = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = tri[0]
  const invPeriode = useMemo(() => tri.filter((i) => i.date >= start && i.date <= end), [tri, start, end])

  // Saisie du jour RÉELLEMENT enregistrée (savedAt) — distincte d'un report auto
  // (qui n'a pas de savedAt). Permet à la GE/au PAU de voir en un coup d'œil si
  // l'enregistrement du jour a été fait ou non.
  const saisieDuJour = useMemo(
    () => inventaires.find((i) => i.date === todayStr() && i.savedAt),
    [inventaires]
  )

  // Catégories présentes (base + personnalisées).
  const cats = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])

  // Espèces du périmètre courant (toutes, ou une catégorie).
  const especesScope = useMemo(
    () => (scope === TOUTES ? especes : especes.filter((e) => e.cat === scope)),
    [especes, scope]
  )

  // Catégorie ACTUELLE d'un article (par id) — pour rattacher le CA des factures
  // à la bonne catégorie même si la ligne porte un ancien `articleCat` (ex. VOLAILLES
  // avant l'éclatement). On résout d'abord par le référentiel, sinon on retombe
  // sur la valeur stockée.
  const catById = useMemo(() => {
    const m = {}
    especes.forEach((e) => { m[e.id] = e.cat })
    aliments.forEach((a) => { m[a.id] = a.cat })
    return m
  }, [especes, aliments])
  const ligneCat = (l) => catById[l.articleId] || l.articleCat

  // Indicateurs du périmètre : effectif, base, malades, naissances, décès, taux.
  const ind = useMemo(() => {
    let effectif = 0, base = 0, malades = 0
    especesScope.forEach((e) => {
      const a = dernier?.animaux?.[e.id]
      effectif += a?.fin || 0; base += a?.init || 0; malades += a?.malades || 0
    })
    let naiss = 0, dec = 0
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]
      if (a) { naiss += a.naiss || 0; dec += a.dec || 0 }
    }))
    const baseSafe = base || 1
    // Cas de maladie sur la période = animaux encore malades + animaux décédés.
    // Le taux de létalité mesure la part de ces cas qui ont abouti au décès
    // (mortalité des animaux TOMBÉS MALADES), à distinguer du taux de mortalité
    // (décès rapportés à tout l'effectif). Borné naturellement à 100 %.
    const casMaladie = malades + dec
    return {
      effectif, base, malades, naiss, dec, casMaladie,
      mortalite: (dec / baseSafe) * 100,
      letalite: casMaladie ? (dec / casMaladie) * 100 : 0,
      croissance: ((naiss - dec) / baseSafe) * 100,
      morbidite: effectif ? (malades / effectif) * 100 : 0
    }
  }, [especesScope, dernier, invPeriode])

  // Naissances / décès de la période PRÉCÉDENTE (même durée) — pour les évolutions.
  const indPrec = useMemo(() => {
    const nbDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -(nbDays - 1))
    let naiss = 0, dec = 0
    tri.filter((i) => i.date >= prevStart && i.date <= prevEnd)
      .forEach((inv) => especesScope.forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (a) { naiss += a.naiss || 0; dec += a.dec || 0 }
      }))
    return { naiss, dec, prevStart, prevEnd }
  }, [tri, start, end, especesScope])

  // Ventes (volume) du périmètre + comparaison période précédente.
  const ventes = useMemo(() => {
    const nbDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -(nbDays - 1))
    const inScope = (v) => scope === TOUTES || v.cat === scope
    const cur = agregerAchatsVentes(invPeriode, especes, aliments).ventes.filter(inScope)
    const prevInv = tri.filter((i) => i.date >= prevStart && i.date <= prevEnd)
    const prev = agregerAchatsVentes(prevInv, especes, aliments).ventes.filter(inScope)
    const sum = (arr) => arr.reduce((s, v) => s + v.qte, 0)
    return { courant: sum(cur), precedent: sum(prev), liste: cur.sort((a, b) => b.date.localeCompare(a.date)), prevStart, prevEnd }
  }, [invPeriode, especes, aliments, tri, start, end, scope])

  // Chiffre d'affaires (factures CERTIFIÉES) du périmètre + comparaison.
  const ca = useMemo(() => {
    const certifs = factures.filter((f) => factureStatut(f) === 'certifiee')
    const montant = (f) => scope === TOUTES
      ? (f.totalTTC || 0)
      : (f.lignes || []).filter((l) => ligneCat(l) === scope).reduce((s, l) => s + (l.total || 0), 0)
    const sumIn = (s, e) => certifs.filter((f) => f.date >= s && f.date <= e).reduce((acc, f) => acc + montant(f), 0)
    const nbDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -(nbDays - 1))
    const liste = certifs.filter((f) => f.date >= start && f.date <= end && montant(f) > 0).sort((a, b) => (a.date < b.date ? 1 : -1))
    return { courant: sumIn(start, end), precedent: sumIn(prevStart, prevEnd), liste, prevStart, prevEnd }
  }, [factures, start, end, scope, catById])

  // Naissances · Décès · Ventes au fil de la période.
  // Barres = têtes nées / mortes (axe gauche), courbe = volume vendu (axe droit).
  // Au-delà de 62 jours, on regroupe par mois pour garder un graphique lisible.
  const ndvChart = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    const spanJours = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
    const parMois = spanJours > 62
    const cle = (d) => (parMois ? d.slice(0, 7) : d)

    const acc = {}
    const bucket = (d) => {
      const k = cle(d)
      if (!acc[k]) acc[k] = { naiss: 0, dec: 0, ventes: 0 }
      return acc[k]
    }
    pts.forEach((inv) => {
      const b = bucket(inv.date)
      especesScope.forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (a) { b.naiss += a.naiss || 0; b.dec += a.dec || 0 }
      })
    })
    ventes.liste.forEach((v) => { bucket(v.date).ventes += v.qte || 0 })

    const cles = Object.keys(acc).sort()
    const labels = cles.map((k) => (parMois ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : k.slice(5)))
    const totalTrace = cles.reduce((s, k) => s + acc[k].naiss + acc[k].dec + acc[k].ventes, 0)

    return {
      vide: !cles.length || totalTrace === 0,
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Naissances', data: cles.map((k) => acc[k].naiss), backgroundColor: '#16a34a', borderRadius: 4, yAxisID: 'y', order: 2 },
          { type: 'bar', label: 'Décès', data: cles.map((k) => acc[k].dec), backgroundColor: '#dc2626', borderRadius: 4, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Ventes (volume)', data: cles.map((k) => acc[k].ventes), borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.12)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: 'y1', order: 1 }
        ]
      }
    }
  }, [invPeriode, especesScope, ventes, start, end])

  // Série de morbidité (scope) + prévision 7 jours.
  const morbiditeSerie = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    return {
      labels: pts.map((i) => i.date?.slice(5)),
      values: pts.map((inv) => {
        let mal = 0, eff = 0
        especesScope.forEach((e) => { const a = inv.animaux?.[e.id]; mal += a?.malades || 0; eff += a?.fin || 0 })
        return eff ? +((mal / eff) * 100).toFixed(2) : 0
      })
    }
  }, [invPeriode, especesScope])
  const morbiditePrevision = useMemo(() => previsionSerie(morbiditeSerie.values, 7), [morbiditeSerie])
  const morbiditeChart = useMemo(() => {
    const hist = morbiditeSerie.values
    const prev = morbiditePrevision.map((v) => +v.toFixed(2))
    const lastHist = hist.length ? hist[hist.length - 1] : 0
    return {
      labels: [...morbiditeSerie.labels, ...prev.map((_, i) => `J+${i + 1}`)],
      datasets: [
        { label: 'Morbidité (%)', data: [...hist, ...new Array(prev.length).fill(null)], borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.12)', fill: true, tension: 0.3, pointRadius: 2 },
        { label: 'Prévision (%)', data: [...new Array(Math.max(0, hist.length - 1)).fill(null), lastHist, ...prev], borderColor: '#9333ea', borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 2 }
      ]
    }
  }, [morbiditeSerie, morbiditePrevision])

  // Courbe de croissance de l'effectif (EF final) au fil des saisies de la période.
  // - Vue « Toutes » : 7 courbes AGRÉGÉES, une par CATÉGORIE (lisible — plus de
  //   fouillis de ~21 lignes par espèce). Couleurs cardinales distinctes.
  // - Vue d'une catégorie : DÉTAIL espèce par espèce des animaux qui la composent.
  const croissanceChart = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    const labels = pts.map((i) => i.date?.slice(5))

    if (scope === TOUTES) {
      // Une courbe par catégorie = somme des effectifs des espèces de la catégorie.
      const datasets = cats.map((c) => {
        const esp = especes.filter((e) => e.cat === c)
        const data = pts.map((inv) => esp.reduce((s, e) => s + (inv.animaux?.[e.id]?.fin || 0), 0))
        return { cat: c, data, has: data.some((v) => v > 0) }
      }).filter((d) => d.has).map((d) => {
        const couleur = catColor(d.cat)
        return {
          label: d.cat, data: d.data,
          borderColor: couleur, backgroundColor: couleur,
          tension: 0.3, pointRadius: 2, borderWidth: 2, spanGaps: true, fill: false
        }
      })
      return { labels, datasets, vide: !datasets.length || !labels.length, parEspece: false }
    }

    // Détail : une ligne par espèce de la catégorie sélectionnée. Une espèce
    // n'apparaît que si elle a au moins un effectif non nul sur la période
    // (évite les lignes plates à zéro pour les espèces non élevées).
    const especesTracees = especesScope.filter((e) => pts.some((inv) => (inv.animaux?.[e.id]?.fin || 0) > 0))
    const datasets = especesTracees.map((e, i) => {
      const couleur = serieColor(i) // teintes cardinales distinctes (pas de dégradé de clarté)
      return {
        label: e.nom,
        data: pts.map((inv) => inv.animaux?.[e.id]?.fin ?? null),
        borderColor: couleur,
        backgroundColor: couleur,
        tension: 0.3, pointRadius: 2, spanGaps: true, fill: false
      }
    })
    return { labels, datasets, vide: !datasets.length || !labels.length, parEspece: true }
  }, [invPeriode, especesScope, especes, cats, scope])

  // Répartition (effectif). « Toutes » → par CATÉGORIE ; une catégorie sélectionnée
  // → par ESPÈCE de cette catégorie (comme le détail par espèce plus bas).
  const repartition = useMemo(() => {
    if (scope === TOUTES) {
      const rows = cats.map((c) => ({
        label: c, color: catColor(c),
        total: especes.filter((e) => e.cat === c).reduce((s, e) => s + (dernier?.animaux?.[e.id]?.fin || 0), 0)
      }))
      return { parEspece: false, rows, data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.total), backgroundColor: rows.map((r) => r.color) }] } }
    }
    // Couleurs cardinales distinctes par espèce (pas de dégradé de clarté d'une
    // même teinte : chaque espèce a une couleur franche différente).
    const rows = especesScope.map((e, i) => ({
      label: e.nom, color: serieColor(i),
      total: dernier?.animaux?.[e.id]?.fin || 0
    }))
    return { parEspece: true, rows, data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.total), backgroundColor: rows.map((r) => r.color) }] } }
  }, [scope, cats, especes, especesScope, dernier])

  // Détail par espèce du périmètre (table + barres).
  const especeRows = useMemo(() => especesScope.map((e) => {
    const a = dernier?.animaux?.[e.id] || {}
    let naiss = 0, dec = 0
    invPeriode.forEach((inv) => { const x = inv.animaux?.[e.id]; if (x) { naiss += x.naiss || 0; dec += x.dec || 0 } })
    return { nom: e.nom, cat: e.cat, init: a.init || 0, fin: a.fin || 0, malades: a.malades || 0, naiss, dec, prix: e.prix }
  }), [especesScope, dernier, invPeriode])

  // Détails décès / naissances (scope) pour les modales.
  const decesDetail = useMemo(() => {
    const out = []
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]; if (!a) return
      const dl = (a.sorties || []).filter((l) => l.type === 'Décès' && (parseInt(l.qte) || 0) > 0)
      if (dl.length) dl.forEach((l) => out.push({ date: inv.date, espece: e.nom, qte: parseInt(l.qte) || 0, motif: l.label || '—', agent: l.agentNom || inv.agentNom || '—' }))
      else if ((a.dec || 0) > 0) out.push({ date: inv.date, espece: e.nom, qte: a.dec, motif: '—', agent: inv.agentNom || '—' })
    }))
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especesScope])

  const naissancesDetail = useMemo(() => {
    const out = []
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]; if (!a) return
      const nl = (a.entrees || []).filter((l) => l.type === 'Naissance' && (parseInt(l.qte) || 0) > 0)
      if (nl.length) nl.forEach((l) => out.push({ date: inv.date, espece: e.nom, qte: parseInt(l.qte) || 0, agent: l.agentNom || inv.agentNom || '—' }))
      else if ((a.naiss || 0) > 0) out.push({ date: inv.date, espece: e.nom, qte: a.naiss, agent: inv.agentNom || '—' })
    }))
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especesScope])

  const scopeLabel = scope === TOUTES ? 'Toutes les catégories' : scope

  // Ventes réalisées par bête (factures certifiées) : bête, quantité, montant. 0 si rien.
  const ventesBetes = useMemo(() => {
    const rows = ventesFactureesParEspece(factures, especes, start, end)
    return scope === TOUTES ? rows : rows.filter((r) => r.cat === scope)
  }, [factures, especes, start, end, scope])
  const totVentesBetes = ventesBetes.reduce((a, r) => ({ qte: a.qte + r.qte, montant: a.montant + r.montant }), { qte: 0, montant: 0 })

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(46,170,63,0.35),0_8px_20px_-8px_rgba(46,170,63,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(46,170,63,0.85) 0%, rgba(26,110,39,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <img src="/maxi-agro-logo.png" alt="Maxi Agro"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              objectFit: 'cover', background: 'white', padding: 4,
              boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55',
              display: 'block'
            }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold drop-shadow">MAXI AGRO</h2>
          <p className="text-sm text-green-50/90">Élevage · Stock · Facturation · Analyses</p>
        </div>
      </div>

      {/* Alarme personnelle — mes tâches du planning routinier assignées aujourd'hui,
          cf. TachesRoutinieres.jsx. Rouge dès qu'une heure prévue est dépassée sans
          être cochée ; un clic amène directement au planning pour la pointer. */}
      {mesTachesDuJour.length > 0 && (
        <Link to="/agro/routine"
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors hover:-translate-y-0.5 ${
            mesTachesDuJour.some((t) => t.enRetard) ? 'border-red-300 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-800'
          }`}>
          <AlarmClock size={18} className="shrink-0" />
          <span className="font-bold">Mes tâches du jour :</span>
          <span className="flex flex-wrap gap-1.5">
            {mesTachesDuJour.map((t) => (
              <span key={t.id} className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                t.fait ? 'bg-green-100 text-green-700 line-through' : t.enRetard ? 'bg-red-100 text-red-700' : 'bg-white text-teal-700'
              }`}>
                {t.heure ? `${t.heure} — ` : ''}{t.titre}
              </span>
            ))}
          </span>
          {mesTachesDuJour.some((t) => t.enRetard) && <strong className="ml-auto shrink-0">🔔 C'est l'heure !</strong>}
        </Link>
      )}

      {/* Statut de la saisie du jour — visible d'un coup d'œil (GE / PAU : « est-ce fait ? ») */}
      {saisieDuJour ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={18} className="shrink-0 text-green-600" />
          <span><strong>Saisie du jour enregistrée</strong> — par {saisieDuJour.agentNom || '—'}{saisieDuJour.savedAt ? ` · ${formatDateTime(saisieDuJour.savedAt)}` : ''}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <span>Saisie du jour <strong>pas encore enregistrée</strong> aujourd'hui ({formatDateShort(todayStr())}).</span>
        </div>
      )}

      {/* Période */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Période</label>
          <select className="input-base w-auto font-semibold" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Du</label><input type="date" className="input-base w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Au</label><input type="date" className="input-base w-auto" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">{formatDateShort(start)} → {formatDateShort(end)} · {invPeriode.length} saisie(s)</span>
      </div>

      {/* Onglets par espèce / catégorie */}
      <div className="flex flex-wrap gap-1.5">
        <ScopeTab active={scope === TOUTES} color="#374151" onClick={() => setScope(TOUTES)}>Toutes</ScopeTab>
        {cats.map((c) => (
          <ScopeTab key={c} active={scope === c} color={catColor(c)} onClick={() => setScope(c)}>{c}</ScopeTab>
        ))}
      </div>

      {/* Indicateurs du périmètre */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Indicateurs — {scopeLabel}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Indic title="Effectif en stock" value={formatNumber(ind.effectif)} icon={Boxes} color="#2563eb" sub={`${especesScope.length} espèce(s)`} />
          <Indic title="Naissances" value={formatNumber(ind.naiss)} icon={Egg} color="#16a34a" sub={`${naissancesDetail.length} enregistrement(s)`} delta={ind.naiss - indPrec.naiss} onClick={() => setModalKey('naissances')} />
          <Indic title="Décès" value={formatNumber(ind.dec)} icon={HeartCrack} color="#dc2626" sub={`${decesDetail.length} enregistrement(s)`} delta={ind.dec - indPrec.dec} invert onClick={() => setModalKey('deces')} />
          <Indic title="Taux de mortalité" value={`${ind.mortalite.toFixed(1)} %`} icon={HeartPulse} color="#dc2626" sub={`${ind.dec} décès`} onClick={() => setModalKey('mortalite')} />
          <Indic title="Taux de létalité" value={`${ind.letalite.toFixed(1)} %`} icon={Skull} color="#991b1b" sub={`${ind.dec} décès / ${ind.casMaladie} cas`} onClick={() => setModalKey('letalite')} />
          <Indic title="Taux de morbidité" value={`${ind.morbidite.toFixed(1)} %`} icon={Stethoscope} color="#d97706" sub={`${ind.malades} malade(s)`} onClick={() => setModalKey('morbidite')} />
          <Indic title="Taux de croissance" value={`${ind.croissance.toFixed(1)} %`} icon={Sprout} color="#16a34a" sub={`${ind.naiss} naissance(s)`} onClick={() => setModalKey('croissance')} />
          <Indic title="Ventes (volume)" value={formatNumber(ventes.courant)} icon={ShoppingCart} color="#0d9488" sub={`${ventes.liste.length} vente(s)`} delta={ventes.courant - ventes.precedent} onClick={() => setModalKey('ventes')} />
          {showFinance && (
            <Indic title="Chiffre d'affaires" value={formatMoney(ca.courant)} icon={Wallet} color="#7c3aed" sub={`${ca.liste.length} facture(s) certifiée(s)`} delta={ca.courant - ca.precedent} money onClick={() => setModalKey('ca')} />
          )}
        </div>
        {!showFinance && (
          <p className="mt-2 text-[11px] text-gray-400">💡 Les montants financiers (chiffre d'affaires) sont réservés à la hiérarchie.</p>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid gap-5 lg:grid-cols-3">
        <button onClick={() => setModalKey('morbidite')} className="card lg:col-span-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Taux de morbidité — {scopeLabel}</p>
              <p className="text-3xl font-extrabold text-amber-600">{ind.morbidite.toFixed(1)} %</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{ind.malades} malade(s) / {formatNumber(ind.effectif)} têtes — courbe & prévision</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Stethoscope size={22} /></div>
          </div>
          <div className="mt-2 h-52">
            {morbiditeSerie.labels.length
              ? <Line data={morbiditeChart} options={{ maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + ' %' } } } }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucune saisie sur la période.</p>}
          </div>
        </button>
        <Card title={repartition.parEspece ? `Répartition par espèce — ${scopeLabel}` : 'Répartition par catégorie'}>
          <div className="h-72">
            {repartition.rows.some((r) => r.total > 0)
              ? <Doughnut data={repartition.data} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucun effectif.</p>}
          </div>
        </Card>
      </div>

      {/* Naissances · Décès · Ventes au fil de la période */}
      <Card title={`Naissances · Décès · Ventes — ${scopeLabel}`}>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span className="font-semibold text-green-600">🐣 {formatNumber(ind.naiss)} naissance(s)</span>
          <span className="font-semibold text-red-600">💀 {formatNumber(ind.dec)} décès</span>
          <span className="font-semibold text-teal-600">🛒 {formatNumber(ventes.courant)} vendue(s)</span>
          {showFinance && <span className="font-semibold text-purple-600">💰 {formatMoney(ca.courant)}</span>}
          <span className="text-gray-400">— barres : têtes (axe gauche) · courbe : volume vendu (axe droit)</span>
        </div>
        <div className="h-72">
          {!ndvChart.vide
            ? <Bar data={ndvChart.data} options={{
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                  legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
                  tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formatNumber(c.parsed.y)}` } }
                },
                scales: {
                  y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Têtes', font: { size: 10 } }, ticks: { precision: 0, callback: (v) => formatNumber(v) } },
                  y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Ventes', color: '#0d9488', font: { size: 10 } }, grid: { drawOnChartArea: false }, ticks: { precision: 0, color: '#0d9488', callback: (v) => formatNumber(v) } }
                }
              }} />
            : <p className="py-16 text-center text-sm text-gray-400">Aucune naissance, aucun décès ni vente enregistré sur la période.</p>}
        </div>
      </Card>

      {/* Courbe de croissance : par catégorie (vue « Toutes ») ou par espèce (catégorie sélectionnée) */}
      <Card title={scope === TOUTES ? 'Courbe de croissance par catégorie' : `Courbe de croissance par espèce — ${scopeLabel}`}>
        <p className="mb-2 text-[11px] text-gray-400">
          {scope === TOUTES
            ? "Évolution de l'effectif total de chaque catégorie au fil des saisies. Cliquez une catégorie ci-dessus pour voir le détail espèce par espèce."
            : "Évolution de l'effectif (EF final) de chaque espèce de la catégorie au fil des saisies de la période."}
        </p>
        <div className="h-72">
          {!croissanceChart.vide
            ? <Line data={croissanceChart} options={{
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formatNumber(c.parsed.y)} têtes` } } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0, callback: (v) => formatNumber(v) } } }
              }} />
            : <p className="py-16 text-center text-sm text-gray-400">Pas assez de saisies sur la période pour tracer une courbe de croissance.</p>}
        </div>
      </Card>

      {/* Ventes — bête vendue & montant (mouvements/flux des animaux). 0 si aucune vente. */}
      <Card title={`Ventes — bête vendue & montant — ${scopeLabel}`}>
        <p className="mb-2 text-[11px] text-gray-400">Ventes certifiées de la période : quelle bête, quelle quantité{showFinance ? ' et pour quel montant' : ''}.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Bête vendue</th>
                {scope === TOUTES && <th className="px-2 py-2 text-left">Catégorie</th>}
                <th className="px-2 py-2 text-center">Quantité vendue</th>
                {showFinance && <th className="px-3 py-2 text-right">Montant</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ventesBetes.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-1.5 font-semibold">{v.nom}</td>
                  {scope === TOUTES && <td className="px-2 py-1.5 font-semibold" style={{ color: catColor(v.cat) }}>{v.cat}</td>}
                  <td className="px-2 py-1.5 text-center font-bold text-green-600">{formatNumber(v.qte)}</td>
                  {showFinance && <td className="px-3 py-1.5 text-right font-bold">{formatMoney(v.montant)}</td>}
                </tr>
              ))}
              {!ventesBetes.length && (
                <tr><td colSpan={2 + (scope === TOUTES ? 1 : 0) + (showFinance ? 1 : 0)} className="px-3 py-6 text-center text-gray-400">Aucune vente sur la période — <strong className="text-gray-600">0</strong></td></tr>
              )}
            </tbody>
            {ventesBetes.length > 0 && (
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="px-3 py-2" colSpan={scope === TOUTES ? 2 : 1}>Total</td>
                  <td className="px-2 py-2 text-center text-green-700">{formatNumber(totVentesBetes.qte)}</td>
                  {showFinance && <td className="px-3 py-2 text-right">{formatMoney(totVentesBetes.montant)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Détail par espèce du périmètre */}
      <Card title={`Détail par espèce — ${scopeLabel}`}>
        {especeRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune espèce.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Espèce</th>
                  {scope === TOUTES && <th className="px-2 py-2 text-left">Catégorie</th>}
                  <th className="px-2 py-2 text-center">Effectif</th>
                  <th className="px-2 py-2 text-center">Naiss.</th>
                  <th className="px-2 py-2 text-center">Décès</th>
                  <th className="px-2 py-2 text-center">Malades</th>
                  {showFinance && <th className="px-2 py-2 text-right">Prix unit.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {especeRows.map((r) => (
                  <tr key={r.nom}>
                    <td className="px-3 py-1.5 font-semibold">{r.nom}</td>
                    {scope === TOUTES && <td className="px-2 py-1.5 text-gray-500" style={{ color: catColor(r.cat) }}>{r.cat}</td>}
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(r.fin)}</td>
                    <td className="px-2 py-1.5 text-center text-green-600">{r.naiss}</td>
                    <td className="px-2 py-1.5 text-center text-red-600">{r.dec}</td>
                    <td className="px-2 py-1.5 text-center text-amber-600">{r.malades}</td>
                    {showFinance && <td className="px-2 py-1.5 text-right text-gray-500">{formatMoney(r.prix)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─────── Modales détaillées (scope courant) ─────── */}
      <Modal open={modalKey === 'naissances'} onClose={() => setModalKey(null)} size="lg" title={`Naissances — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <strong>{formatNumber(ind.naiss)}</strong> naissance(s) sur la période — période préc. : {formatNumber(indPrec.naiss)}
        </p>
        <p className="my-2 text-xs italic text-gray-400">Détail des naissances saisies, de la plus récente à la plus ancienne.</p>
        <DetailTable rows={naissancesDetail} cols={['Date', 'Espèce', 'Nés', 'Agent']} render={(n) => [formatDateShort(n.date), n.espece, n.qte, n.agent]} empty="Aucune naissance sur la période." />
      </Modal>

      <Modal open={modalKey === 'deces'} onClose={() => setModalKey(null)} size="lg" title={`Décès — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>{formatNumber(ind.dec)}</strong> décès sur la période — période préc. : {formatNumber(indPrec.dec)}
        </p>
        <p className="my-2 text-xs italic text-gray-400">Détail des décès saisis, avec leur motif quand il a été renseigné.</p>
        <DetailTable rows={decesDetail} cols={['Date', 'Espèce', 'Qté', 'Motif', 'Agent']} render={(d) => [formatDateShort(d.date), d.espece, d.qte, d.motif, d.agent]} empty="Aucun décès sur la période." />
      </Modal>

      <Modal open={modalKey === 'mortalite'} onClose={() => setModalKey(null)} size="lg" title={`Mortalité — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Taux : <strong>{ind.mortalite.toFixed(1)} %</strong> — {ind.dec} décès / {formatNumber(ind.base)} têtes (effectif initial)</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : (Décès / Effectif initial) × 100</p>
        <DetailTable rows={decesDetail} cols={['Date', 'Espèce', 'Qté', 'Motif', 'Agent']} render={(d) => [formatDateShort(d.date), d.espece, d.qte, d.motif, d.agent]} empty="Aucun décès sur la période." />
      </Modal>

      <Modal open={modalKey === 'letalite'} onClose={() => setModalKey(null)} size="lg" title={`Létalité — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Taux : <strong>{ind.letalite.toFixed(1)} %</strong> — {ind.dec} décès / {ind.casMaladie} cas de maladie (malades + décès)</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : (Décès / Cas de maladie) × 100 — part des animaux tombés malades qui n'ont pas survécu (≠ mortalité, rapportée à tout l'effectif).</p>
        <DetailTable rows={decesDetail} cols={['Date', 'Espèce', 'Qté', 'Motif', 'Agent']} render={(d) => [formatDateShort(d.date), d.espece, d.qte, d.motif, d.agent]} empty="Aucun décès sur la période." />
      </Modal>

      <Modal open={modalKey === 'croissance'} onClose={() => setModalKey(null)} size="lg" title={`Croissance & naissances — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Taux : <strong>{ind.croissance.toFixed(1)} %</strong> — {ind.naiss} naissance(s)</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : ((Naissances − Décès) / Effectif initial) × 100</p>
        <DetailTable rows={naissancesDetail} cols={['Date', 'Espèce', 'Nés', 'Agent']} render={(n) => [formatDateShort(n.date), n.espece, n.qte, n.agent]} empty="Aucune naissance sur la période." />
      </Modal>

      <Modal open={modalKey === 'morbidite'} onClose={() => setModalKey(null)} size="lg" title={`Morbidité — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Taux : <strong>{ind.morbidite.toFixed(1)} %</strong> — {ind.malades} malade(s) / {formatNumber(ind.effectif)} têtes</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : (Malades / Effectif) × 100 — prévision : tendance + moyenne mobile (7 jours)</p>
        {morbiditePrevision.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {morbiditePrevision.map((v, i) => <span key={i} className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">J+{i + 1} : {v.toFixed(1)} %</span>)}
          </div>
        )}
      </Modal>

      <Modal open={modalKey === 'ventes'} onClose={() => setModalKey(null)} size="lg" title={`Ventes (volume) — ${scopeLabel}`}
        panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{formatNumber(ventes.courant)} unité(s) vendue(s) — période préc. : {formatNumber(ventes.precedent)}</p>
        <DetailTable rows={ventes.liste} cols={['Date', 'Article', 'Catégorie', 'Qté', 'Source']} render={(v) => [formatDateShort(v.date), v.article, v.cat, v.qte, v.source === 'demande' ? 'Demande/Facture' : 'Saisie']} empty="Aucune vente sur la période." />
      </Modal>

      {showFinance && (
        <Modal open={modalKey === 'ca'} onClose={() => setModalKey(null)} size="lg" title={`Chiffre d'affaires — ${scopeLabel}`}
          panelClassName="bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
          <p className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-800">{formatMoney(ca.courant)} — période préc. : {formatMoney(ca.precedent)}</p>
          <p className="my-2 text-xs italic text-gray-400">CA = factures <strong>certifiées</strong> uniquement{scope !== TOUTES ? ' (montant des lignes de cette catégorie)' : ''}.</p>
          <DetailTable rows={ca.liste} cols={['Date', 'N°', 'Client', 'Montant']} render={(f) => [formatDateShort(f.date), f.numero || '—', f.client?.nom || '—', formatMoney(scope === TOUTES ? (f.totalTTC || 0) : (f.lignes || []).filter((l) => ligneCat(l) === scope).reduce((s, l) => s + (l.total || 0), 0))]} empty="Aucune facture certifiée sur la période." />
        </Modal>
      )}
    </div>
  )
}

function ScopeTab({ active, color, onClick, children }) {
  return (
    <button onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors"
      style={active ? { background: color, color: '#fff' } : { background: '#f1f5f9', color: '#475569' }}>
      {children}
    </button>
  )
}

// `invert` : une hausse est une MAUVAISE nouvelle (décès) — on inverse le code couleur.
function Indic({ title, value, icon: Icon, color, sub, delta, money, invert, onClick }) {
  const favorable = invert ? delta < 0 : delta > 0
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`card p-3 text-left transition-all ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: color + '1a', color }}><Icon size={15} /></span>
      </div>
      <div className="flex items-baseline gap-1">
        <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-xs font-bold ${favorable ? 'text-green-600' : 'text-red-600'}`}>
            {delta > 0 ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}
            {money ? formatMoney(Math.abs(delta)) : Math.abs(delta)}
          </span>
        )}
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}{onClick ? ' — détails' : ''}</p>}
    </button>
  )
}

function DetailTable({ rows, cols, render, empty }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-400">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
              {render(r).map((cell, j) => <td key={j} className="px-3 py-1.5">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
