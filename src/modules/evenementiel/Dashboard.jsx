// Dashboard Briqueterie — production, stock, ventes, autorisations.
// Cartes cliquables (détail) + écarts vs mois précédent mis en avant.
import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Link } from 'react-router-dom'
import { StockDonutCard, VueEnsembleCard } from './GraphiquesDashboard'
import { icone3D } from '../../utils/color'
import { ShoppingCart, Factory, Package, Send, AlertTriangle, Wrench, ChevronRight, Trophy } from 'lucide-react'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import EtatVide from '../../shared/ui/EtatVide'
import StatCard from '../../shared/ui/StatCard'
import ObjectifKpi, { libelleObjectif } from '../comptabilite/ObjectifKpi'
import ListeFacturesVerre from '../comptabilite/ListeFacturesVerre'
import FelicitationObjectif from '../comptabilite/FelicitationObjectif'
import { useQuotas, useObjectifPole } from '../comptabilite/quotas'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { AlerteVentesAFacturer } from './RelanceVentes'
import AlerteVentesBrouillon from './AlerteVentesBrouillon'
import { useBriqueterieStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { formatMoney, formatNumber, formatDateShort, addDays, todayStr } from '../../utils/formatters'
import { stockBriqueTotal, coutMatiereBrique, inventairesCompletes } from './logic'
import { STATUTS_DEMANDE, normaliserStatut, estActif } from '../../shared/workflow'

// Podium : médaille + fond dégradé pour les 3 premiers, comme le classement des clients fréquents de MAXI-GYM.
const RANG_PODIUM = [
  { medaille: '🥇', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', bg: 'bg-gradient-to-r from-slate-100 to-gray-50', ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

export default function Dashboard() {
  const { quotas: objectifsPoles } = useQuotas()
  const objBriques = useObjectifPole('briques')
  const briques = useBriqueterieStore((s) => s.briques)
  const prixSacCiment = useBriqueterieStore((s) => s.prixSacCiment)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')
  const { data: materiels } = useCollection('evenementiel_materiels')
  const role = useAuth((s) => s.role)
  const uid = useAuth((s) => s.user?.uid)

  const [detail, setDetail] = useState(null) // { titre, render }
  const { start, end, preset, node: periodNode } = usePeriodSelect('mois')

  // Période sélectionnée + période précédente équivalente (pour les écarts).
  const inPeriode = (d) => (d || '') >= start && (d || '') <= end
  const comparable = preset !== 'all'
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const inPrev = (d) => comparable && (d || '') >= prevStart && (d || '') <= prevEnd

  const dernier = useMemo(() => [...inventairesCompletes(inventaires)].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])

  const stockPret = useMemo(() => {
    if (!dernier?.briques) return 0
    return briques.filter((b) => b.id !== 'caillasses').reduce((s, b) => s + (dernier.briques[b.id]?.pret || 0), 0)
  }, [dernier, briques])

  const stockSechage = useMemo(() => {
    if (!dernier?.briques) return 0
    return briques.filter((b) => b.id !== 'caillasses').reduce((s, b) => s + (dernier.briques[b.id]?.sechage || 0), 0)
  }, [dernier, briques])

  const caillasses = dernier?.briques?.caillasses?.caillasses || 0
  const prodDuMois = productions.filter((p) => inPeriode(p.date))
  const prodMois = prodDuMois.reduce((s, p) => s + (p.totalBriques || 0), 0)
  const prodMoisPrec = productions.filter((p) => inPrev(p.date)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  // CA = factures émises (issues des ventes approuvées).
  const facturesDuMois = factures.filter((f) => inPeriode(f.date))
  const caMois = facturesDuMois.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const caMoisPrec = factures.filter((f) => inPrev(f.date)).reduce((s, f) => s + (f.totalTTC || 0), 0)
  // Ventes de la période — commandes enregistrées, quel que soit leur avancement.
  const ventesDuMois = useMemo(
    () => ventes.filter((v) => inPeriode(v.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [ventes, start, end]
  )
  const ventesMontant = ventesDuMois.reduce((s, v) => s + (v.total || 0), 0)
  const nbVentesPrec = ventes.filter((v) => inPrev(v.date)).length
  const demandesActives = demandes.filter((d) => estActif(d.statut))
  // Meilleurs clients de la période : classés par montant acheté (ventes non annulées).
  const meilleursClients = useMemo(() => {
    const m = {}
    ventesDuMois.filter((v) => v.statut !== 'annulee').forEach((v) => {
      const nom = (v.clientNom || '').trim()
      if (!nom) return
      const e = m[nom.toLowerCase()] || (m[nom.toLowerCase()] = { nom, achats: 0, briques: 0, montant: 0 })
      e.achats += 1
      e.briques += (v.lignes || []).reduce((t, l) => t + (parseInt(l.qte) || 0), 0)
      e.montant += v.total || 0
    })
    return Object.values(m).sort((a, b) => b.montant - a.montant).slice(0, 5)
  }, [ventesDuMois])

  // Total de BRIQUES vendues sur la période (somme des quantités des lignes) +
  // répartition par catégorie de brique (comme « Prêt à vendre »).
  const briquesVendues = useMemo(
    () => ventesDuMois.reduce((s, v) => s + (v.lignes || []).reduce((a, l) => a + (parseInt(l.qte) || 0), 0), 0),
    [ventesDuMois]
  )
  const briquesVenduesPrec = useMemo(
    () => ventes.filter((v) => inPrev(v.date)).reduce((s, v) => s + (v.lignes || []).reduce((a, l) => a + (parseInt(l.qte) || 0), 0), 0),
    [ventes, prevStart, prevEnd]
  )
  const ventesParCategorie = useMemo(() => {
    const map = {}
    ventesDuMois.forEach((v) => (v.lignes || []).forEach((l) => {
      const nom = l.briqueNom || l.briqueId || '—'
      map[nom] = (map[nom] || 0) + (parseInt(l.qte) || 0)
    }))
    return Object.entries(map).map(([nom, qte]) => ({ nom, qte })).sort((a, b) => b.qte - a.qte)
  }, [ventesDuMois])

  const parType = useMemo(() => {
    if (!dernier?.briques) return []
    return briques.filter((b) => b.id !== 'caillasses').map((b) => ({
      nom: b.nom, id: b.id,
      pret: dernier.briques[b.id]?.pret || 0,
      sechage: dernier.briques[b.id]?.sechage || 0,
      stock: stockBriqueTotal(dernier.briques[b.id])
    })).filter((p) => p.stock > 0)
  }, [dernier, briques])

  // Évaluation du stock actuel par catégorie : quantité en stock (intactes =
  // appatam + séchage + prêtes ; caillasses pour la ligne caillasses) × prix unitaire
  // = valeur ; × coût matériel unitaire (prix du sac ÷ rendement) = coût brut de production.
  const parTypeEval = useMemo(() => {
    const br = dernier?.briques || {}
    return briques.map((b) => {
      const d = br[b.id] || {}
      const qte = b.id === 'caillasses' ? (d.caillasses || 0) : ((d.appatam || 0) + (d.sechage || 0) + (d.pret || 0))
      return { id: b.id, nom: b.nom, qte, cout: qte * coutMatiereBrique(b, prixSacCiment), valeur: qte * (parseFloat(b.tarifVente) || 0) }
    }).filter((p) => p.qte > 0)
  }, [dernier, briques, prixSacCiment])
  const valeurStock = parTypeEval.reduce((s, p) => s + p.valeur, 0)
  const coutBrutStock = parTypeEval.reduce((s, p) => s + p.cout, 0)

  // Tableau de détail « valeur & coût du stock » (réutilisé par les deux cartes).
  const tableEvalStock = (
    <div className="overflow-hidden rounded-2xl border border-gray-100">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <tr><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Qté en stock</th><th className="px-4 py-3 text-right">Coût brut prod.</th><th className="px-4 py-3 text-right">Valeur stock</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {parTypeEval.map((p, i) => (
            <tr key={p.id} className={`transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
              <td className="px-4 py-2.5 font-semibold text-gray-800">{p.nom}</td>
              <td className="px-4 py-2.5 text-right font-bold text-gray-700">{formatNumber(p.qte)}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-amber-700">{formatMoney(Math.round(p.cout))}</td>
              <td className="px-4 py-2.5 text-right font-extrabold text-slate-700">{formatMoney(Math.round(p.valeur))}</td>
            </tr>
          ))}
          {!parTypeEval.length && <tr><td colSpan={4} className="bg-white py-8 text-center text-sm text-gray-400">Aucun stock.</td></tr>}
        </tbody>
        {parTypeEval.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-slate-50/60">
              <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500" colSpan={2}>Total</td>
              <td className="px-4 py-3 text-right font-extrabold text-amber-700">{formatMoney(Math.round(coutBrutStock))}</td>
              <td className="px-4 py-3 text-right font-extrabold text-slate-700">{formatMoney(Math.round(valeurStock))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )

  // Couleurs cardinales bien distinctes (rouge, orange, vert, bleu, jaune…) —
  // remplacent l'ancienne palette « tout en violet » où les parts se confondaient.
  const CARDINALES = ['#dc2626', '#ea580c', '#16a34a', '#0284c7', '#ca8a04', '#475569', '#0d9488', '#db2777', '#4f46e5', '#65a30d']
  const repartition = {
    labels: parType.map((p) => p.nom),
    datasets: [{ data: parType.map((p) => p.stock), backgroundColor: parType.map((_, i) => CARDINALES[i % CARDINALES.length]) }]
  }

  const fluxMois = {
    labels: ['Production', 'Prêtes', 'En séchage', 'Caillasses'],
    datasets: [{ data: [prodMois, stockPret, stockSechage, caillasses], backgroundColor: ['#475569', '#16a34a', '#ca8a04', '#64748b'] }]
  }

  // Tableaux de détail réutilisables.
  const tableStock = (champ) => (
    <div className="overflow-hidden rounded-2xl border border-gray-100">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <tr><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Quantité</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {parType.filter((p) => p[champ] > 0).map((p, i) => (
            <tr key={p.id} className={`transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
              <td className="px-4 py-2.5 font-semibold text-gray-800">{p.nom}</td>
              <td className="px-4 py-2.5 text-right text-base font-extrabold text-slate-700">{formatNumber(p[champ])}</td>
            </tr>
          ))}
          {!parType.some((p) => p[champ] > 0) && <tr><td colSpan={2} className="bg-white py-8 text-center text-sm text-gray-400">Aucun stock.</td></tr>}
        </tbody>
      </table>
    </div>
  )

  // Matériel en location : fin prévue = début + durée ; en retard si cette date est passée.
  const aujourdhui = todayStr()
  const locationsEnCours = materiels
    .filter((m) => m.statut === 'loue' && m.locationEnCours)
    .map((m) => {
      const l = m.locationEnCours
      const fin = addDays(l.dateDebut, Math.max(1, Number(l.nombreJours) || 1) - 1)
      const retard = fin < aujourdhui ? Math.round((new Date(aujourdhui) - new Date(fin)) / 86400000) : 0
      return { m, l, fin, retard }
    })
    .sort((a, b) => b.retard - a.retard)
  const nbLocationsRetard = locationsEnCours.filter((x) => x.retard > 0).length
  // Dernières ventes : les 5 plus récentes.
  const STATUTS_VENTE = { brouillon: ['Brouillon', 'neutral'], en_attente: ['Autorisation requise', 'warning'], autorisee: ['Autorisée', 'success'], chargee: ['Chargée / Partie', 'info'], annulee: ['Annulée', 'danger'] }
  const dernieresVentes = [...ventes].sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || ((b.date || '') < (a.date || '') ? -1 : 1)).slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(71,85,105,0.35),0_8px_20px_-8px_rgba(71,85,105,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(138,155,179,0.92) 0%, rgba(100,116,139,0.9) 40%, rgba(51,65,85,0.88) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#475569', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>BR</span>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Briqueterie La Termitière</h2>
          <p className="text-sm text-white/80">Matières premières · Production · Séchage · Ventes · Autorisations (validation à deux niveaux)</p>
        </div>
        <div className="ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:font-semibold [&_.input-base]:text-white [&_label]:font-bold [&_label]:text-white">
          {periodNode}
        </div>
      </div>
      {/* Ventes autorisées à facturer : alerte fermable pour les rôles autres qu'agent (les agents reçoivent une notification). */}
      {/* Agent : seulement ses ventes (ou celles sans agent enregistré) ; les autres rôles voient tout. */}
      <AlerteVentesAFacturer ventes={role === 'agent' ? ventes.filter((v) => !v.agentId || v.agentId === uid) : ventes} factures={factures} />
      {role === 'agent' && <AlerteVentesBrouillon ventes={ventes} uid={uid} />}

      <FelicitationObjectif poleId="briques" secteur="de la Briqueterie" couleur="#475569" />
      {objectifsPoles.transport > 0 && <FelicitationObjectif poleId="transport" secteur="du Transport" couleur="#0891b2" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <ObjectifKpi poleId="briques" couleur="#16a34a" lien={{ to: '/evenementiel/factures', label: 'Aller aux factures' }} seulementAvecObjectif masque={preset === 'mois'} />
        {objectifsPoles.transport > 0 && <ObjectifKpi poleId="transport" titre="Transport : recettes du mois" couleur="#0891b2" />}
        <StatCard title="Production période" value={formatNumber(prodMois)} icon={Factory} accent="#475569"
          variation={comparable ? prodMois - prodMoisPrec : undefined} variationLabel={`période préc. : ${formatNumber(prodMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Production de la période', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Détail par catégorie</th><th className="px-4 py-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...prodDuMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p, i) => (
                    <tr key={p.id} className={`transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-gray-500">{formatDateShort(p.date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {(p.lignes || []).filter((l) => (parseInt(l.qte) || 0) > 0).map((l, k) => (
                            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {l.briqueNom} <span className="font-extrabold">{formatNumber(l.qte)}</span>
                            </span>
                          ))}
                          {(parseInt(p.caillasses) || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                              Caillasses <span className="font-extrabold">{formatNumber(p.caillasses)}</span>
                            </span>
                          )}
                          {!(p.lignes || []).some((l) => (parseInt(l.qte) || 0) > 0) && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right align-top text-base font-extrabold text-slate-700">{formatNumber(p.totalBriques || 0)}</td>
                    </tr>
                  ))}
                  {!prodDuMois.length && <tr><td colSpan={3} className="bg-white py-8 text-center text-sm text-gray-400">Aucune production sur la période.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
        <StatCard title="Prêtes à vendre" value={formatNumber(stockPret)} icon={Package} accent="#16a34a"
          sub="par type : cliquer" onClick={() => setDetail({ titre: 'Briques prêtes à vendre', render: tableStock('pret') })} />
        <StatCard title="Briques vendues" value={formatNumber(briquesVendues)} icon={ShoppingCart} accent="#ca8a04"
          variation={comparable ? briquesVendues - briquesVenduesPrec : undefined}
          variationLabel={`${ventesDuMois.length} vente(s) · ${formatMoney(ventesMontant)} · cliquer`}
          onClick={() => setDetail({ titre: 'Briques vendues : par catégorie', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Catégorie</th><th className="px-4 py-3 text-right">Quantité vendue</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ventesParCategorie.map((c, i) => (
                    <tr key={c.nom} className={`transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{c.nom}</td>
                      <td className="px-4 py-2.5 text-right text-base font-extrabold text-amber-700">{formatNumber(c.qte)}</td>
                    </tr>
                  ))}
                  {!ventesParCategorie.length && <tr><td colSpan={2} className="bg-white py-8 text-center text-sm text-gray-400">Aucune vente sur la période.</td></tr>}
                </tbody>
                {ventesParCategorie.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-slate-50/60">
                      <td className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Total briques</td>
                      <td className="px-4 py-3 text-right text-base font-extrabold text-amber-700">{formatNumber(briquesVendues)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) })} />
        <StatCard title={preset === 'mois' ? 'Recettes du mois' : 'CA période'} value={formatMoney(caMois)} icon={Package} accent="#0284c7"
          chip={comparable ? `${caMois >= caMoisPrec ? '+' : '−'}${formatMoney(Math.abs(caMois - caMoisPrec))}` : undefined} chipGood={caMois >= caMoisPrec}
          variationLabel={preset === 'mois' ? libelleObjectif(objBriques) : `période préc. : ${formatMoney(caMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Chiffre d’affaires : par client & catégorie', render: (
            <ListeFacturesVerre couleur="#0284c7" poleId="briques" avecObjectif={preset === 'mois'} vide="Aucune facture sur la période."
              items={facturesDuMois.map((f) => {
                const lignes = (f.lignes || []).filter((l) => (parseInt(l.qte) || 0) > 0)
                const totalBr = lignes.reduce((t, l) => t + (parseInt(l.qte) || 0), 0)
                return { id: f.id, date: f.date, titre: f.client?.nom || '—', sous: f.numero ? `Facture ${f.numero}` : '', extra: `${formatNumber(totalBr)} brique${totalBr > 1 ? 's' : ''}`, montant: f.totalTTC || 0,
                  pastilles: lignes.map((l) => ({ label: l.article || l.articleId || '—', valeur: formatNumber(l.qte) })) }
              })} />
          ) })} />
        <StatCard title="Autorisations" value={demandesActives.length} sub={`${caillasses} caillasses · cliquer`} icon={Send}
          accent={demandesActives.length ? '#d97706' : '#64748b'}
          onClick={() => setDetail({ titre: 'Autorisations à traiter', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">N°</th><th className="px-4 py-3 text-left">Brique</th><th className="px-4 py-3 text-center">Qté</th><th className="px-4 py-3 text-left">Statut</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {demandesActives.map((d, i) => { const sn = normaliserStatut(d.statut); return (
                    <tr key={d.id} className={`transition-colors hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{d.num}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{d.briqueNom}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-800">{d.qte}</td>
                      <td className="px-4 py-2.5"><Badge tone={STATUTS_DEMANDE[sn]?.tone}>{STATUTS_DEMANDE[sn]?.label}</Badge></td>
                    </tr>
                  )})}
                  {!demandesActives.length && <tr><td colSpan={4} className="bg-white py-8 text-center text-sm text-gray-400">Aucune autorisation en attente.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
        <StatCard title="Valeur du stock" value={formatMoney(valeurStock)} icon={Package} accent="#475569"
          sub="quantité en stock × prix unitaire · cliquer"
          onClick={() => setDetail({ titre: 'Valeur & coût du stock par catégorie', render: tableEvalStock })} />
        <StatCard title="Coût brut de production" value={formatMoney(coutBrutStock)} icon={Factory} accent="#b45309"
          sub="quantité × (prix du sac ÷ rendement) · cliquer"
          onClick={() => setDetail({ titre: 'Valeur & coût du stock par catégorie', render: tableEvalStock })} />
        <StatCard title="Matériel en location" value={locationsEnCours.length} icon={Wrench} accent={nbLocationsRetard ? '#dc2626' : '#0891b2'}
          sub={nbLocationsRetard ? `${nbLocationsRetard} en retard de retour · cliquer` : 'aucun retard · cliquer'}
          onClick={() => setDetail({ titre: 'Matériel en location', render: (
            <div className="space-y-2">
              {locationsEnCours.length === 0 && <EtatVide icone={Wrench} texte="Aucun matériel en location" accent="#0891b2" className="!py-6" />}
              {locationsEnCours.map(({ m, l, fin, retard }) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <AvatarNom nom={l.locataireNom} size={30} accent={retard ? '#dc2626' : '#0891b2'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{m.nom}</p>
                    <p className="truncate text-xs text-gray-500">{l.locataireNom}{l.locataireContact ? ` · ${l.locataireContact}` : ''}</p>
                    <p className="text-[11px] text-gray-400">Du {formatDateShort(l.dateDebut)} au {formatDateShort(fin)} · {l.nombreJours} jour(s)</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <strong className="whitespace-nowrap text-sm">{formatMoney(l.prixTotal || 0)}</strong>
                    {retard > 0
                      ? <Badge tone="danger">{retard} j de retard</Badge>
                      : <Badge tone="success">Dans les délais</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <StockDonutCard parType={parType} couleurs={CARDINALES} />
        <VueEnsembleCard prodMois={prodMois} stockPret={stockPret} stockSechage={stockSechage} caillasses={caillasses} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Dernières ventes" action={<Link to="/evenementiel/ventes" className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:underline">Toutes les ventes <ChevronRight size={13} /></Link>}>
        {dernieresVentes.length === 0 ? (
          <EtatVide icone={ShoppingCart} texte="Aucune vente pour le moment" accent="#475569" className="!py-6" />
        ) : (
          <div className="space-y-1.5">
            {dernieresVentes.map((v) => {
              const [label, tone] = STATUTS_VENTE[v.statut] || [v.statut, 'neutral']
              const nb = (v.lignes || []).reduce((t, l) => t + (parseInt(l.qte) || 0), 0)
              return (
                <Link key={v.id} to="/evenementiel/ventes" className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 hover:bg-white/90">
                  <AvatarNom nom={v.clientNom} size={30} accent="#475569" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-800">{v.clientNom}</span>
                    <span className="block text-[11px] text-gray-400"><NumDoc num={v.num} className="!text-[11px]" /> · {formatNumber(nb)} brique(s) · {formatDateShort(v.date)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <strong className="whitespace-nowrap text-sm">{formatMoney(v.total || 0)}</strong>
                    <Badge tone={tone}>{label}</Badge>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#CA8A04')}><Trophy size={17} /></span>
            <div>
              <h3 className="text-base font-bold leading-tight text-gray-800">Meilleurs clients</h3>
              <p className="text-[11px] text-gray-400">Classés par montant acheté sur la période</p>
            </div>
          </div>
          {meilleursClients.length === 0 ? (
            <EtatVide icone={Trophy} texte="Aucune vente sur cette période" accent="#CA8A04" className="!py-6" />
          ) : (
            <div className="space-y-1.5">
              {meilleursClients.map((c, i) => {
                const podium = RANG_PODIUM[i]
                return (
                  <div key={c.nom} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${podium ? `${podium.bg} ${podium.ring}` : 'border border-white/80 bg-white/65'}`}>
                    <span className="w-8 shrink-0 text-center text-2xl leading-none">{podium ? podium.medaille : <span className="text-sm font-extrabold text-gray-400">{i + 1}</span>}</span>
                    <AvatarNom nom={c.nom} size={28} accent="#475569" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-800">{c.nom}</span>
                      <span className="block text-[11px] text-gray-500">{c.achats} achat{c.achats > 1 ? 's' : ''} · {formatNumber(c.briques)} brique(s)</span>
                    </span>
                    <strong className="whitespace-nowrap text-sm text-gray-900">{formatMoney(c.montant)}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {demandesActives.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} />
          <strong>{demandesActives.length}</strong> autorisation(s) de sortie à traiter (approbation puis certification).
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}
        panelClassName="bg-gradient-to-br from-slate-200/85 via-slate-100/75 to-slate-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="overflow-x-auto">{detail?.render}</div>
      </Modal>
    </div>
  )
}
