import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { TrendingUp, Wallet, CheckSquare, Clock, FileDown, Loader2, Table2 } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'

const Titre = ({ label, formule, description }) => (
  <div>
    <span className="flex items-center gap-1">{label} <InfoBulle texte={formule} /></span>
    {description && <p className="mt-0.5 text-[11px] font-normal text-gray-400">{description}</p>}
  </div>
)
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatNumber } from '../../utils/formatters'
import { avancementProjet, tachesEnRetard } from './logic'
import { STATUTS_PROJET, PRIORITES } from './data'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { fr } from 'date-fns/locale'

const TEAL   = '#0d9488'
const TEAL2  = '#0f766e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const GREEN  = '#16a34a'
const GRAY   = '#94a3b8'

// ─── Options Chart.js communes ─────────────────────────────────────────────

const baseOpts = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
    title: { display: !!title, text: title, font: { size: 13, weight: '600' }, color: '#374151' }
  }
})

const barOpts = (title, stacked = false) => ({
  ...baseOpts(title),
  scales: {
    x: { stacked, grid: { display: false } },
    y: { stacked, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }
  }
})

// ───────────────────────────────────────────────────────────────────────────

async function exporterExcel(projets, taches, depenses) {
  const XLSX = await import('xlsx')
  const { formatDateShort } = await import('../../utils/formatters')
  const { avancementProjet } = await import('./logic')
  const { STATUTS_PROJET, PRIORITES, STATUTS_TACHE } = await import('./data')

  const wb = XLSX.utils.book_new()

  // Feuille 1 — Projets
  const lignesProjets = projets.map((p) => {
    const tp = taches.filter((t) => t.projetId === p.id)
    return {
      'Numéro':        p.num || '',
      'Nom':           p.nom || '',
      'Statut':        STATUTS_PROJET[p.statut]?.label || p.statut || '',
      'Priorité':      PRIORITES[p.priorite]?.label || p.priorite || '',
      'Responsable':   p.responsable || '',
      'Date début':    p.dateDebut ? formatDateShort(p.dateDebut) : '',
      'Date fin':      p.dureeIndeterminee ? 'Durée indéterminée' : (p.dateFin ? formatDateShort(p.dateFin) : ''),
      'Budget (FCFA)': Number(p.budget)   || 0,
      'Dépenses (FCFA)': Number(p.depenses) || 0,
      'Écart (FCFA)':  (Number(p.budget) || 0) - (Number(p.depenses) || 0),
      'Avancement (%)': avancementProjet(tp, p),
      'Nb tâches':     tp.length,
      'Tâches terminées': tp.filter((t) => t.statut === 'terminee').length,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesProjets), 'Projets')

  // Feuille 2 — Tâches
  const lignesTaches = taches.map((t) => {
    const p = projets.find((x) => x.id === t.projetId)
    return {
      'Projet':      p?.nom || t.projetId || '',
      'Titre':       t.titre || '',
      'Statut':      STATUTS_TACHE[t.statut]?.label || t.statut || '',
      'Priorité':    PRIORITES[t.priorite]?.label || t.priorite || '',
      'Assigné à':   t.assignee || '',
      'Échéance':    t.echeance ? formatDateShort(t.echeance) : '',
      'En retard':   t.echeance && t.statut !== 'terminee' && t.echeance < Date.now() ? 'Oui' : 'Non',
      'Note':        t.note || '',
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesTaches), 'Tâches')

  // Feuille 3 — Dépenses
  const lignesDepenses = depenses.map((d) => {
    const p = projets.find((x) => x.id === d.projetId)
    return {
      'Projet':      p?.nom || d.projetId || '',
      'Date':        d.date ? formatDateShort(d.date) : '',
      'Catégorie':   d.categorie || '',
      'Description': d.description || '',
      'Fournisseur': d.fournisseur || '',
      'Montant (FCFA)': Number(d.montant) || 0,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesDepenses), 'Dépenses')

  XLSX.writeFile(wb, `rapport_projet_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function telechargerPDF(projets, taches, depenses, commentaires, checklists) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { formatMoney: fmtM, formatDateShort: fmtD } = await import('../../utils/formatters')
  const { avancementProjet: avPct, tachesEnRetard: tRetard, projetEnRetard: pRetard } = await import('./logic')
  const { STATUTS_PROJET: SP, PRIORITES: PR, STATUTS_TACHE: ST } = await import('./data')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const TEAL_C = [13, 148, 136], GRAY_C = [100, 116, 139], W = 210, M = 14
  let y = M

  doc.setFillColor(...TEAL_C)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text('RAPPORT GLOBAL — E-G.Pro', M, 12)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, M, 20)
  y = 36

  projets.filter((p) => p.statut !== 'annule').forEach((projet, pi) => {
    if (pi > 0) { doc.addPage(); y = M }
    const tp = taches.filter((t) => t.projetId === projet.id)
    const dp = depenses.filter((d) => d.projetId === projet.id)
    const cp = commentaires.filter((c) => c.projetId === projet.id)
    const ch = checklists.filter((c) => c.projetId === projet.id)
    const av = avPct(tp)
    const budget = Number(projet.budget) || 0
    const totalDep = dp.reduce((s,d) => s+(Number(d.montant)||0), 0)

    doc.setFillColor(...TEAL_C)
    doc.roundedRect(M, y, W-M*2, 14, 2, 2, 'F')
    doc.setTextColor(255,255,255); doc.setFontSize(12); doc.setFont('helvetica','bold')
    doc.text(projet.nom || 'Sans nom', M+3, y+9)
    y += 18

    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...GRAY_C)
    const finTexte = projet.dureeIndeterminee ? 'Durée indéterminée' : fmtD(projet.dateFin)
    doc.text(`Statut : ${SP[projet.statut]?.label||projet.statut||'—'}  |  Responsable : ${projet.responsable||'—'}  |  Fin : ${finTexte}${pRetard(projet)?' ⚠ EN RETARD':''}`, M, y)
    y += 5

    // Barre
    const barW = W-M*2
    doc.setFillColor(226,232,240); doc.roundedRect(M, y, barW, 4, 1, 1, 'F')
    doc.setFillColor(...TEAL_C); doc.roundedRect(M, y, barW*(av/100), 4, 1, 1, 'F')
    doc.setTextColor(...TEAL_C); doc.text(`${av}%`, M+barW+2, y+3.5)
    y += 9

    if (tp.length) {
      autoTable(doc, {
        startY: y,
        head: [['Tâche','Assignée','Statut','Échéance']],
        body: tp.map((t) => [t.titre||'—', t.assignee||'—', ST[t.statut]?.label||t.statut||'—', fmtD(t.echeance)]),
        styles:{ fontSize:7, cellPadding:1.5 },
        headStyles:{ fillColor:TEAL_C, textColor:255, fontSize:7 },
        margin:{ left:M, right:M }
      })
      y = doc.lastAutoTable.finalY + 4
    }

    if (dp.length) {
      if (y>240){doc.addPage();y=M}
      autoTable(doc, {
        startY: y,
        head: [['Date','Catégorie','Description','Montant (FCFA)']],
        body: [...dp.map((d) => [fmtD(d.date), d.categorie||'—', d.description||'—', Number(d.montant||0).toLocaleString('fr-FR')]),
               ['','','TOTAL', totalDep.toLocaleString('fr-FR')]],
        styles:{ fontSize:7, cellPadding:1.5 },
        headStyles:{ fillColor:TEAL_C, textColor:255, fontSize:7 },
        margin:{ left:M, right:M }
      })
      y = doc.lastAutoTable.finalY + 4
      if (budget>0) {
        doc.setFontSize(7); doc.setTextColor(...GRAY_C)
        doc.text(`Budget : ${fmtM(budget)}  |  Dépenses : ${fmtM(totalDep)}  |  Consommé : ${Math.round((totalDep/budget)*100)}%`, M, y)
        y += 5
      }
    }
  })

  const pages = doc.getNumberOfPages()
  for (let i=1;i<=pages;i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...GRAY_C)
    doc.text(`Page ${i}/${pages}`, W/2, 290, {align:'center'})
  }
  doc.save(`rapport_global_${new Date().toISOString().slice(0,10)}.pdf`)
}

export default function Rapports() {
  const { data: projets }      = useCollection('projets')
  const { data: taches }       = useCollection('projet_taches')
  const { data: depenses }     = useCollection('projet_depenses')
  const { data: commentaires } = useCollection('projet_commentaires')
  const { data: checklists }   = useCollection('projet_checklists')
  const [periode, setPeriode]      = useState('6')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [xlsLoading, setXlsLoading] = useState(false)

  const handlePDF = async () => {
    setPdfLoading(true)
    try { await telechargerPDF(projets, taches, depenses, commentaires, checklists) }
    catch(e) { console.error(e); alert('Erreur lors de la génération du PDF.') }
    finally { setPdfLoading(false) }
  }

  const handleExcel = async () => {
    setXlsLoading(true)
    try { await exporterExcel(projets, taches, depenses) }
    catch(e) { console.error(e); alert('Erreur lors de l\'export Excel.') }
    finally { setXlsLoading(false) }
  }

  // ── KPIs globaux ──────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const actifs    = projets.filter((p) => p.statut === 'en_cours')
    const termines  = projets.filter((p) => p.statut === 'termine')
    const budgetTotal    = projets.reduce((s, p) => s + (Number(p.budget) || 0), 0)
    const tachesTerminees = taches.filter((t) => t.statut === 'terminee').length
    const tauxGlobal = taches.length ? Math.round((tachesTerminees / taches.length) * 100) : 0
    const enRetard   = tachesEnRetard(taches).length
    return { actifs: actifs.length, termines: termines.length, budgetTotal, tauxGlobal, enRetard }
  }, [projets, taches])

  // ── Avancement par projet (barre horizontale) ─────────────────────────────

  const avancementData = useMemo(() => {
    const ps = projets.filter((p) => p.statut !== 'annule').slice(0, 10)
    return {
      labels: ps.map((p) => p.nom.length > 22 ? p.nom.slice(0, 22) + '…' : p.nom),
      datasets: [{
        label: 'Avancement (%)',
        data: ps.map((p) => avancementProjet(taches.filter((t) => t.projetId === p.id), p)),
        backgroundColor: ps.map((p) => {
          const pct = avancementProjet(taches.filter((t) => t.projetId === p.id), p)
          return pct >= 100 ? GREEN : pct >= 50 ? TEAL : AMBER
        }),
        borderRadius: 6,
        borderSkipped: false
      }]
    }
  }, [projets, taches])

  // ── Répartition statuts (donut) ───────────────────────────────────────────

  const statutData = useMemo(() => {
    const counts = {}
    projets.forEach((p) => { counts[p.statut] = (counts[p.statut] || 0) + 1 })
    const entries = Object.entries(counts)
    const COULEURS = { planification: GRAY, en_cours: TEAL, en_pause: AMBER, termine: GREEN, annule: RED }
    return {
      labels: entries.map(([k]) => STATUTS_PROJET[k]?.label || k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => COULEURS[k] || GRAY), borderWidth: 2, borderColor: '#fff' }]
    }
  }, [projets])

  // ── Tâches par priorité (donut) ───────────────────────────────────────────

  const prioriteData = useMemo(() => {
    const counts = {}
    taches.forEach((t) => { counts[t.priorite] = (counts[t.priorite] || 0) + 1 })
    const COULEURS = { basse: GRAY, normale: TEAL, haute: AMBER, urgente: RED }
    const entries = Object.entries(counts)
    return {
      labels: entries.map(([k]) => PRIORITES[k]?.label || k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => COULEURS[k] || GRAY), borderWidth: 2, borderColor: '#fff' }]
    }
  }, [taches])

  // ── Activité mensuelle : projets créés + terminés ─────────────────────────

  const n = parseInt(periode, 10)
  const moisLabels = useMemo(() => {
    return Array.from({ length: n }, (_, i) => {
      const m = subMonths(new Date(), n - 1 - i)
      return format(m, 'MMM yy', { locale: fr })
    })
  }, [n])

  const activiteData = useMemo(() => {
    const crees    = Array(n).fill(0)
    const termines = Array(n).fill(0)
    projets.forEach((p) => {
      for (let i = 0; i < n; i++) {
        const m = subMonths(new Date(), n - 1 - i)
        const s = startOfMonth(m).getTime()
        const e = endOfMonth(m).getTime()
        if (p.createdAt >= s && p.createdAt <= e) crees[i]++
        if (p.statut === 'termine' && p.updatedAt >= s && p.updatedAt <= e) termines[i]++
      }
    })
    return {
      labels: moisLabels,
      datasets: [
        { label: 'Projets créés',    data: crees,    backgroundColor: TEAL + 'bb',  borderColor: TEAL,  borderWidth: 2, borderRadius: 4 },
        { label: 'Projets terminés', data: termines, backgroundColor: GREEN + 'bb', borderColor: GREEN, borderWidth: 2, borderRadius: 4 }
      ]
    }
  }, [projets, n, moisLabels])

  // ── Suivi budget : prévu vs réel par projet ───────────────────────────────

  const budgetData = useMemo(() => {
    const ps = projets.filter((p) => p.budget && p.budget > 0).slice(0, 8)
    return {
      labels: ps.map((p) => p.nom.length > 18 ? p.nom.slice(0, 18) + '…' : p.nom),
      datasets: [
        {
          label: 'Budget prévu (FCFA)',
          data: ps.map((p) => Number(p.budget) || 0),
          backgroundColor: TEAL + 'cc',
          borderColor: TEAL,
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Dépenses réelles (FCFA)',
          data: ps.map((p) => Number(p.depenses) || 0),
          backgroundColor: AMBER + 'cc',
          borderColor: AMBER,
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    }
  }, [projets])

  // ── Productivité tâches : terminées par mois ──────────────────────────────

  const productiviteData = useMemo(() => {
    const terminées  = Array(n).fill(0)
    const creees     = Array(n).fill(0)
    taches.forEach((t) => {
      for (let i = 0; i < n; i++) {
        const m = subMonths(new Date(), n - 1 - i)
        const s = startOfMonth(m).getTime()
        const e = endOfMonth(m).getTime()
        if (t.createdAt >= s && t.createdAt <= e) creees[i]++
        if (t.statut === 'terminee' && t.updatedAt >= s && t.updatedAt <= e) terminées[i]++
      }
    })
    return {
      labels: moisLabels,
      datasets: [
        { label: 'Tâches créées',    data: creees,    borderColor: GRAY,  backgroundColor: GRAY + '22',  fill: true,  tension: 0.4, pointRadius: 4 },
        { label: 'Tâches terminées', data: terminées, borderColor: TEAL,  backgroundColor: TEAL + '22',  fill: true,  tension: 0.4, pointRadius: 4 },
      ]
    }
  }, [taches, n, moisLabels])

  // ── Tableau récapitulatif budget ──────────────────────────────────────────

  const budgetTableau = useMemo(() =>
    projets
      .filter((p) => p.budget)
      .sort((a, b) => (b.budget || 0) - (a.budget || 0))
      .map((p) => {
        const budget   = Number(p.budget) || 0
        const depenses = Number(p.depenses) || 0
        const ecart    = budget - depenses
        const taux     = budget > 0 ? Math.round((depenses / budget) * 100) : 0
        return { ...p, budget, depenses, ecart, taux }
      }),
  [projets])

  const lineOpts = (title) => ({
    ...baseOpts(title),
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } } }
  })

  return (
    <div className="space-y-5">

      {/* Barre outils */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Période :</span>
          {['3', '6', '12'].map((v) => (
            <button key={v} onClick={() => setPeriode(v)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${periode === v ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {v} mois
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handleExcel} disabled={xlsLoading}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
            {xlsLoading ? <Loader2 size={13} className="animate-spin" /> : <Table2 size={13} />}
            {xlsLoading ? 'Export…' : 'Export Excel'}
          </button>
          <button onClick={handlePDF} disabled={pdfLoading}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            {pdfLoading ? 'Génération…' : 'Télécharger PDF'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title={<span className="flex items-center gap-1">Projets actifs <InfoBulle texte="Projets dont le statut est 'En cours'." /></span>}
          value={kpis.actifs} icon={TrendingUp} accent={TEAL} />
        <StatCard title={<span className="flex items-center gap-1">Projets terminés <InfoBulle texte="Projets dont le statut est 'Terminé'." /></span>}
          value={kpis.termines} icon={CheckSquare} accent={GREEN} />
        <StatCard title={<span className="flex items-center gap-1">Avancement global <InfoBulle texte="Tâches terminées ÷ total tâches × 100, sur l'ensemble du module." /></span>}
          value={`${kpis.tauxGlobal}%`} icon={TrendingUp} accent={TEAL2} />
        <StatCard title={<span className="flex items-center gap-1">Tâches en retard <InfoBulle texte="Tâches non terminées dont l'échéance est dépassée." /></span>}
          value={kpis.enRetard} icon={Clock} accent={RED} />
      </div>

      {/* Budget total */}
      {kpis.budgetTotal > 0 && (
        <Card>
          <div className="flex items-center gap-3 py-1">
            <Wallet size={20} className="text-teal-600" />
            <div>
              <p className="text-xs text-gray-500">Budget total engagé (tous projets)</p>
              <p className="text-xl font-extrabold text-teal-700">{formatMoney(kpis.budgetTotal)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Ligne 1 : Avancement + Statuts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={<Titre label="Avancement par projet (%)" formule="Pour chaque projet : Tâches terminées ÷ Total tâches × 100. Vert = 100%, Teal ≥ 50%, Orange < 50%." description="Voir où en est chaque projet — identifier ceux qui avancent bien et ceux qui stagnent." />}>
            {!projets.length ? (
              <p className="py-8 text-center text-sm text-gray-400">Aucun projet</p>
            ) : (
              <div style={{ height: 260 }}>
                <Bar data={avancementData} options={{
                  ...barOpts(),
                  indexAxis: 'y',
                  scales: { x: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false } } }
                }} />
              </div>
            )}
          </Card>
        </div>
        <Card title={<Titre label="Répartition des statuts" formule="Nombre de projets par statut (Planification, En cours, Terminé, Annulé). Chaque part = Projets du statut ÷ Total projets × 100." description="Voir la distribution globale du portefeuille de projets par statut." />}>
          {!projets.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun projet</p>
          ) : (
            <div style={{ height: 260 }}>
              <Doughnut data={statutData} options={{ ...baseOpts(), cutout: '65%' }} />
            </div>
          )}
        </Card>
      </div>

      {/* Ligne 2 : Activité + Priorités */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={<Titre label="Activité mensuelle (projets)" formule="Créés : projets dont la date de création est dans le mois. Terminés : projets dont le statut est passé à 'Terminé' dans le mois." description="Voir le rythme de création et de clôture des projets mois par mois." />}>
            <div style={{ height: 220 }}>
              <Bar data={activiteData} options={barOpts()} />
            </div>
          </Card>
        </div>
        <Card title={<Titre label="Tâches par priorité" formule="Nombre de tâches par niveau de priorité (Basse, Normale, Haute, Urgente). Chaque part = Tâches du niveau ÷ Total tâches × 100." description="Voir si la charge de travail est bien répartie ou si trop de tâches urgentes s'accumulent." />}>
          {!taches.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune tâche</p>
          ) : (
            <div style={{ height: 220 }}>
              <Doughnut data={prioriteData} options={{ ...baseOpts(), cutout: '65%' }} />
            </div>
          )}
        </Card>
      </div>

      {/* Ligne 3 : Productivité tâches */}
      <Card title={<Titre label="Productivité — tâches créées vs terminées" formule="Créées : tâches dont la date de création est dans le mois. Terminées : tâches dont le statut est passé à 'Terminée' dans le mois. Un écart croissant indique un retard d'exécution." description="Voir si les équipes terminent les tâches au même rythme qu'elles en reçoivent — un écart qui se creuse est un signal d'alerte." />}>
        <div style={{ height: 220 }}>
          <Line data={productiviteData} options={lineOpts()} />
        </div>
      </Card>

      {/* Ligne 4 : Budget prévu vs réel */}
      {budgetData.labels.length > 0 && (
        <Card title={<Titre label="Suivi budgétaire — prévu vs dépenses réelles" formule="Budget prévu : valeur saisie dans le projet. Dépenses réelles : somme des dépenses enregistrées dans le module Dépenses. Écart = Budget − Dépenses." description="Comparer ce qui était prévu avec ce qui a été réellement dépensé — détecter les projets qui dépassent leur enveloppe." />}>
          <div style={{ height: 260 }}>
            <Bar data={budgetData} options={barOpts()} />
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-400">
            Renseignez le champ "Dépenses réelles" dans chaque projet pour activer le suivi.
          </p>
        </Card>
      )}

      {/* Tableau détail budgets */}
      {budgetTableau.length > 0 && (
        <Card title={<Titre label="Détail budgets par projet" formule="Écart = Budget prévu − Dépenses réelles (vert si positif, rouge si négatif). Consommé = Dépenses ÷ Budget × 100." description="Vue détaillée projet par projet — voir d'un coup d'œil quels projets sont sous contrôle et lesquels ont dépassé." />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-3">Projet</th>
                  <th className="py-2 pr-3 text-right">Budget prévu</th>
                  <th className="py-2 pr-3 text-right">Dépenses</th>
                  <th className="py-2 pr-3 text-right">Écart</th>
                  <th className="py-2 text-right">Consommé</th>
                </tr>
              </thead>
              <tbody>
                {budgetTableau.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-gray-700">{p.nom}</p>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-600">{formatMoney(p.budget)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-600">{formatMoney(p.depenses)}</td>
                    <td className={`py-2 pr-3 text-right font-mono font-semibold ${p.ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {p.ecart >= 0 ? '+' : ''}{formatMoney(p.ecart)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(p.taux, 100)}%`, background: p.taux > 100 ? RED : p.taux > 80 ? AMBER : TEAL }} />
                        </div>
                        <span className={`text-xs font-bold ${p.taux > 100 ? 'text-red-600' : p.taux > 80 ? 'text-amber-600' : 'text-teal-700'}`}>{p.taux}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
