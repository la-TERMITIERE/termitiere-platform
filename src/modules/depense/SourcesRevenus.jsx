// Sources de revenus — liste à plat de CHAQUE entrée d'argent réelle (factures
// certifiées/approuvées des modules, versements clients E-G.Pro, revenus saisis
// manuellement), tous secteurs confondus (hors GARDERIE, dont les données actuelles
// ne sont que des essais), filtrable par secteur — même présentation que l'écran
// « Dépenses » (tableau, filtres, clic sur une ligne pour le détail).
import { useMemo, useState, useEffect } from 'react'
import { TrendingUp, Search, Eye, Building2, FileSpreadsheet, Receipt, HandCoins, PenLine, CalendarDays, Layers, UserRound, Coins, PieChart } from 'lucide-react'
import Compteur from '../../shared/ui/Compteur'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import BandeauVolet, { ChampBande, CLASSE_CHAMP_BANDE, BoutonBande } from '../../shared/ui/BandeauVolet'
import ChampRecherche from '../../shared/ui/ChampRecherche'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { formatDateShort, formatMoney, todayStr } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { getModule } from '../../shared/modules'
import { canExportExcel } from '../../core/roles'
import { exportRapportExcel } from '../../utils/excelReport'
import { SECTEURS, MOIS_LABELS } from './data'

// Logo/icône de chaque secteur — reprend celui de son module métier (agro, logistique…)
// pour que la carte KPI soit reconnaissable au premier coup d'œil, pas un pictogramme
// générique. « Caisse commune » (divers) et « MAXI BAT » n'ont pas de module dédié.
const iconeSecteur = (id) => getModule(id)?.icon || Building2
import { versementsClientVersSecteurs, siteLogistiqueDe } from './logic'
import { marquerVoletVu } from '../../shared/nouveautes'

// MAXI BAT n'a pas de revenu suivi ici — géré depuis le volet BTP d'E-G.Pro (même
// exclusion que « Revenus & Budget » standalone, cf. RecettesDepenses.jsx). GARDERIE
// exclue à la demande : ses données de paiement actuelles ne sont que des essais, pas
// des revenus réels — à réintégrer une fois la saisie garderie fiabilisée.
const SECTEURS_AFFICHES = SECTEURS

// Lieux où une entrée d'argent peut être rattachée (salles de gym, sites de Logistique).
const LIEUX = [{ id: 'lome', label: 'Lomé' }, { id: 'kara', label: 'Kara' }]
const libelleLieu = (id) => LIEUX.find((x) => x.id === id)?.label || ''

const SOURCES = {
  facture:  { label: 'Facture',           tone: 'success', icone: Receipt,   couleur: '#16a34a' },
  client:   { label: 'Versement client',  tone: 'info',    icone: HandCoins, couleur: '#0ea5e9' },
  manuel:   { label: 'Saisie manuelle',   tone: 'neutral', icone: PenLine,   couleur: '#7c3aed' }
}

// Style du tableau, le même que dans Dépenses et la Caisse.
const TH = 'sticky top-0 z-10 bg-amber-50 shadow-[0_1px_0_rgba(180,83,9,0.25)] dark:bg-gray-800 px-3 py-2.5'
const TF = 'sticky bottom-0 z-10 bg-amber-50 px-3 py-2.5 shadow-[0_-1px_0_rgba(180,83,9,0.25)] dark:bg-gray-800'

export default function SourcesRevenus() {
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')
  const { data: facturesGym }         = useCollection('gym_factures')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: projetsTous }         = useCollection('projets')
  const { data: versementsClientTous }= useCollection('projet_versements_client')
  const { data: revenusManuelsTous }  = useCollection('depense_revenus_manuels')
  const { user, role } = useAuth()
  useEffect(() => { marquerVoletVu(user?.uid, 'depenseRevenus') }, [user?.uid])

  const versementsClientRoutes = useMemo(
    () => versementsClientVersSecteurs(versementsClientTous, projetsTous),
    [versementsClientTous, projetsTous]
  )

  // ── Fusion de toutes les sources en une liste unique de lignes de revenu ──
  const lignes = useMemo(() => {
    const out = []
    facturesAgro.filter((f) => f.statut === 'certifiee').forEach((f) => out.push({
      id: `agro_${f.id}`, secteurId: 'agro', date: f.date, montant: Number(f.totalTTC) || 0,
      type: 'facture', libelle: `Facture ${f.numero || ''}`, tiers: f.client?.nom || '', raw: f
    }))
    facturesLogistique.filter((f) => f.statut === 'approuvee').forEach((f) => out.push({
      id: `log_${f.id}`, secteurId: 'logistique', date: f.date, montant: Number(f.totalTTC) || 0,
      type: 'facture', libelle: `Facture ${f.num || ''}`, tiers: f.clientNom || '', site: f.site || 'lome', raw: f
    }))
    facturesEvenementiel.forEach((f) => out.push({
      id: `evt_${f.id}`, secteurId: 'evenementiel', date: f.date, montant: Number(f.totalTTC) || 0,
      type: 'facture', libelle: `Facture ${f.numero || ''}`, tiers: f.client?.nom || '', raw: f
    }))
    // MAXI-GYM : factures de ses salles (Lomé, Kara), comme dans le volet Recettes de la Comptabilité.
    facturesGym.forEach((f) => out.push({
      id: `gym_${f.id}`, secteurId: 'gym', date: f.date, montant: Number(f.montant) || 0,
      type: 'facture', libelle: f.description || 'Facture MAXI-GYM',
      tiers: f.clientNom || '', site: f.site || 'lome', raw: f
    }))
    // GARDERIE : paiements réellement encaissés (mensuels et journaliers).
    paiementsGarderie.filter((p) => Number(p.montantPaye) > 0).forEach((p) => out.push({
      id: `gard_${p.id}`, secteurId: 'garderie', date: p.date || (p.annee && p.mois ? `${p.annee}-${String(p.mois).padStart(2, '0')}-01` : ''), montant: Number(p.montantPaye) || 0,
      type: 'client', libelle: p.type === 'journalier' ? 'Garderie journalière' : `Paiement garderie ${p.mois ? MOIS_LABELS[Number(p.mois) - 1] || '' : ''} ${p.annee || ''}`.trim(),
      tiers: p.enfantNom || '', site: null, raw: p
    }))
    versementsClientRoutes.forEach((v) => {
      const projet = projetsTous.find((p) => p.id === v.projetId)
      out.push({
        id: `vers_${v.id}`, secteurId: v.secteurId, date: v.date, montant: Number(v.montant) || 0,
        type: 'client', libelle: projet?.nom || 'Versement client', tiers: v.enregistrePar || '', site: v.secteurId === 'logistique' ? siteLogistiqueDe(v) : null, raw: v
      })
    })
    revenusManuelsTous.forEach((r) => out.push({
      id: `man_${r.id}`, secteurId: r.secteurId, date: r.date, montant: Number(r.montant) || 0,
      type: 'manuel', libelle: r.description || 'Revenu saisi manuellement', tiers: r.enregistrePar || '', site: r.secteurId === 'logistique' ? siteLogistiqueDe(r) : (r.site || null), raw: r
    }))
    return out.filter((l) => l.date).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, paiementsGarderie, versementsClientRoutes, projetsTous, revenusManuelsTous])

  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [filtreType, setFiltreType]       = useState('')
  const [filtreLieu, setFiltreLieu]       = useState('')
  // Filtre de PÉRIODE fusionné dans un seul bloc « Période » : un sélecteur de
  // granularité (Jour / Mois) suivi d'UN SEUL champ de saisie, dont le TYPE change
  // selon le mode choisi (calendrier jour, ou sélecteur mois/année natif) — plutôt
  // que deux champs distincts à remplir/effacer chacun de son côté.
  const [modePeriode, setModePeriode] = useState('jour') // 'jour' | 'mois' | 'annee' | 'plage'
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour
  const [recherche, setRecherche]         = useState('')
  const [detail, setDetail]               = useState(null)

  // Base commune (secteur/source/recherche) SANS période — sert de socle pour les KPI
  // "Aujourd'hui"/"Jour"/"Mois" ci-dessous, qui ont chacun leur propre période plutôt
  // que de dépendre du filtre choisi pour le tableau.
  const baseFiltree = useMemo(() => {
    let rows = [...lignes]
    if (filtreSecteur) rows = rows.filter((l) => l.secteurId === filtreSecteur)
    if (filtreType)    rows = rows.filter((l) => l.type === filtreType)
    if (filtreLieu)    rows = rows.filter((l) => l.site === filtreLieu)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((l) => l.libelle.toLowerCase().includes(q) || (l.tiers || '').toLowerCase().includes(q))
    }
    return rows
  }, [lignes, filtreSecteur, filtreType, filtreLieu, recherche])

  const liste = useMemo(() => {
    if (!filtrePeriodeActif) return baseFiltree
    if (modePeriode === 'mois') return baseFiltree.filter((l) => (l.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee') return baseFiltree.filter((l) => (l.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage') return baseFiltree.filter((l) => (!filtreDebut || l.date >= filtreDebut) && (!filtreFin || l.date <= filtreFin))
    return baseFiltree.filter((l) => l.date === filtreJour)
  }, [baseFiltree, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtrePeriodeActif])

  const total = liste.reduce((s, l) => s + l.montant, 0)

  // KPI par secteur — un par secteur RÉELLEMENT présent dans les données (pas une
  // liste figée : un nouveau secteur générateur de revenu ajoute automatiquement sa
  // propre carte). Somme du JOUR courant par défaut ; dès qu'une période est choisie
  // dans le filtre, la même carte bascule sur la somme de ce jour précis ou de ce mois
  // entier (selon `modePeriode`) — pas besoin de plusieurs jeux de KPI.
  const aujourdhui = todayStr()
  const periodeLabel = !filtrePeriodeActif
    ? "Aujourd'hui"
    : modePeriode === 'mois'
      ? `${MOIS_LABELS[Number(filtreMois.slice(5, 7)) - 1]} ${filtreMois.slice(0, 4)}`
      : modePeriode === 'annee'
        ? filtreAnnee
        : modePeriode === 'plage'
          ? `${filtreDebut ? formatDateShort(filtreDebut) : '…'} → ${filtreFin ? formatDateShort(filtreFin) : '…'}`
          : formatDateShort(filtreJour)
  const kpiParSecteur = useMemo(() => {
    // La carte existe pour tout secteur ayant DÉJÀ eu du revenu (peu importe quand) —
    // sinon un secteur sans rien aujourd'hui disparaissait complètement de la vue au
    // lieu d'afficher simplement 0 FCFA. Seule la SOMME affichée est bornée à la période.
    const periode = !filtrePeriodeActif
      ? baseFiltree.filter((l) => l.date === aujourdhui)
      : modePeriode === 'mois'
        ? baseFiltree.filter((l) => (l.date || '').startsWith(filtreMois))
        : modePeriode === 'annee'
          ? baseFiltree.filter((l) => (l.date || '').startsWith(filtreAnnee))
          : modePeriode === 'plage'
            ? baseFiltree.filter((l) => (!filtreDebut || l.date >= filtreDebut) && (!filtreFin || l.date <= filtreFin))
            : baseFiltree.filter((l) => l.date === filtreJour)
    // Une entrée par secteur ET par lieu : MAXI-GYM Lomé et MAXI-GYM Kara (ou Logistique Lomé et Kara) restent distincts.
    const cle = (l) => `${l.secteurId}|${l.site || ''}`
    const sommesPeriode = new Map()
    periode.forEach((l) => sommesPeriode.set(cle(l), (sommesPeriode.get(cle(l)) || 0) + l.montant))
    const connus = new Map()
    baseFiltree.forEach((l) => connus.set(cle(l), { id: l.secteurId, site: l.site || '' }))
    return [...connus.entries()]
      .map(([k, { id, site }]) => {
        const base = SECTEURS.find((x) => x.id === id) || { id, label: id, color: '#64748b' }
        return { secteur: { ...base, label: site ? `${base.label} · ${libelleLieu(site)}` : base.label, id: k }, montant: sommesPeriode.get(k) || 0 }
      })
      .sort((a, b) => b.montant - a.montant || a.secteur.label.localeCompare(b.secteur.label))
  }, [baseFiltree, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtrePeriodeActif, aujourdhui])
  const secteurDetail = detail ? SECTEURS.find((s) => s.id === detail.secteurId) : null
  const couleurDetail = secteurDetail?.color || COULEUR_MODULE.depense

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les lignes actuellement affichées (secteur, source, recherche, période déjà
  // appliqués à `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((l) => {
      const secteur = SECTEURS.find((s) => s.id === l.secteurId)
      return {
        'Date': formatDateShort(l.date),
        'Secteur': secteur?.label || l.secteurId,
        'Revenu': l.libelle,
        'Tiers': l.tiers || '',
        'Source': SOURCES[l.type]?.label || l.type,
        'Montant': l.montant
      }
    })
    exportRapportExcel({
      filename: `sources-revenus-${todayStr()}.xlsx`,
      sections: [{
        name: 'Sources de revenus',
        title: 'Sources de revenus',
        subtitle: `${liste.length} entrée(s)${filtreSecteur ? ` : secteur : ${SECTEURS.find((s) => s.id === filtreSecteur)?.label}` : ''}${filtreType ? ` : source : ${SOURCES[filtreType]?.label}` : ''}${filtrePeriodeActif ? ` : période : ${periodeLabel}` : ''}`,
        columns: [
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Secteur', label: 'Secteur', width: 18 },
          { key: 'Revenu', label: 'Revenu', width: 30 },
          { key: 'Tiers', label: 'Tiers', width: 22 },
          { key: 'Source', label: 'Source', width: 16 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Montant': rows.reduce((s, r) => s + r['Montant'], 0) }
      }]
    })
  }

  return (
    <div className="space-y-4">
      <BandeauVolet couleur="#B45309" icone={TrendingUp} titre="Sources de revenus"
        sous={`${liste.length} entrée(s) · ${formatMoney(total)} : factures, versements clients et saisies manuelles.`}>
        <ChampRecherche variant="glass" className="!w-52" value={recherche} onChange={setRecherche} placeholder="Libellé, client…" />
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <ChampBande label="Secteur">
          <select value={filtreSecteur} onChange={(e) => setFiltreSecteur(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-36`}>
            <option value="">Tous les secteurs</option>
            {SECTEURS_AFFICHES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </ChampBande>
        <ChampBande label="Lieu">
          <select value={filtreLieu} onChange={(e) => setFiltreLieu(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-28`}>
            <option value="">Tous les lieux</option>
            {LIEUX.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </ChampBande>
        <ChampBande label="Source">
          <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-32`}>
            <option value="">Toutes</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </ChampBande>
        {canExportExcel(role) && <BoutonBande icone={FileSpreadsheet} onClick={exportXLSX}>Export Excel</BoutonBande>}
      </BandeauVolet>

      {/* Total de la période et part de chaque secteur, puis une tuile par secteur générateur de revenu. */}
      {kpiParSecteur.length > 0 && (() => {
        const totalKpi = kpiParSecteur.reduce((t, k) => t + k.montant, 0)
        return (
          <div className="space-y-3">
            <div className="ed-entree relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <div className="relative flex items-center gap-3">
                <span className="ed-flotte flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]"><Coins size={24} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-white/80">Entrées d'argent : {periodeLabel}</p>
                  <p className="text-3xl font-black leading-tight">+<Compteur valeur={totalKpi} format={(v) => Number(v).toLocaleString('fr-FR')} /> <span className="text-sm font-bold text-white/75">FCFA</span></p>
                </div>
              </div>
              {totalKpi > 0 && (
                <div className="relative mt-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-white/25">
                    {kpiParSecteur.filter((k) => k.montant > 0).map(({ secteur, montant }) => (
                      <div key={secteur.id} className="ed-barre h-full" title={`${secteur.label} : ${formatMoney(montant)}`} style={{ width: `${(montant / totalKpi) * 100}%`, background: secteur.color, boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.7)' }} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-white/90">
                    {kpiParSecteur.filter((k) => k.montant > 0).map(({ secteur, montant }) => (
                      <span key={secteur.id} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: secteur.color }} />{secteur.label} {Math.round((montant / totalKpi) * 100)}%</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {liste.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <TrendingUp size={34} className="opacity-30" />
            <p className="text-sm">Aucun revenu trouvé.</p>
          </div>
        </Card>
      ) : (
        <Card className="ed-entree !p-0 overflow-hidden">
          <div className="max-h-[66vh] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className={TH}>Date</th><th className={TH}>Revenu</th><th className={TH}>Secteur</th><th className={TH}>Source</th>
                  <th className={`${TH} text-right`}>Montant</th><th className={TH} />
                </tr>
              </thead>
              <tbody>
                {liste.map((l, idx) => {
                  const secteur = SECTEURS.find((x) => x.id === l.secteurId)
                  const secteurColor = secteur?.color || '#64748b'
                  const source = SOURCES[l.type]
                  const IcS = source.icone
                  const memeJour = idx > 0 && liste[idx - 1].date === l.date
                  return (
                    <tr key={l.id} onClick={() => setDetail(l)} style={{ background: `${secteurColor}1c`, animation: 'ed-entree 0.4s ease-out backwards', animationDelay: `${Math.min(idx, 14) * 25}ms` }}
                      className={`cursor-pointer border-t border-gray-100 transition-colors hover:brightness-95 dark:border-white/10 ${memeJour ? '' : 'border-t-gray-300 dark:border-t-white/25'}`}>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold text-gray-700 dark:text-gray-200">{memeJour ? '' : formatDateShort(l.date)}</td>
                      <td className="px-3 py-2 align-top">
                        <span className="flex items-start gap-2">
                          <span title={source.label} className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(source.couleur)}><IcS size={12} /></span>
                          <span className="min-w-0">
                            <span className="block max-w-[320px] break-words font-semibold uppercase text-gray-800 dark:text-gray-100">{l.libelle}</span>
                            {l.tiers && <span className="block max-w-[320px] truncate text-[11px] text-gray-500">{l.tiers}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold uppercase" style={{ color: secteurColor }}>{secteur?.label || l.secteurId}{l.site ? <span className="block text-[10px] font-bold normal-case text-gray-500">{libelleLieu(l.site)}</span> : null}</td>
                      <td className="px-3 py-2 align-top"><Badge tone={source.tone}>{source.label}</Badge></td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-extrabold text-emerald-700">+{Number(l.montant).toLocaleString('fr-FR')}</td>
                      <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setDetail(l)} title="Voir les détails" className="rounded-lg border border-gray-200 bg-white p-1 text-gray-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-gray-800"><Eye size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className={`${TF} text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200`}>Total : {liste.length} entrée(s)</td>
                  <td className={`${TF} whitespace-nowrap text-right font-black text-emerald-700`}>+{Number(total).toLocaleString('fr-FR')}</td>
                  <td className={TF} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="sm" {...glassModalProps(couleurDetail)}
        title="Détail du revenu">
        {detail && (() => {
          const src = SOURCES[detail.type]
          const IcS = src.icone
          const cell = 'flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur-md'
          return (
            <div className="space-y-3 text-sm">
              <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
                style={{ background: `linear-gradient(135deg, ${couleurDetail}, color-mix(in srgb, ${couleurDetail} 45%, #000))` }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <div className="relative flex items-center gap-3">
                  <span className="ed-flotte flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]"><IcS size={24} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-white/80">{detail.libelle}</p>
                    <p className="text-3xl font-black leading-tight">+<Compteur valeur={Number(detail.montant) || 0} format={(v) => Number(v).toLocaleString('fr-FR')} /> <span className="text-sm font-bold text-white/75">FCFA</span></p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleurDetail)}><Layers size={16} /></span>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">Secteur</p><p className="truncate font-bold" style={{ color: couleurDetail }}>{secteurDetail?.label || detail.secteurId}</p></div>
                </div>
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(src.couleur)}><IcS size={16} /></span>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">Source</p><div className="mt-0.5"><Badge tone={src.tone}>{src.label}</Badge></div></div>
                </div>
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#7c3aed')}><CalendarDays size={16} /></span>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">Date</p><p className="font-bold text-gray-800">{formatDateShort(detail.date)}</p></div>
                </div>
                {detail.tiers && (
                  <div className={cell}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0ea5e9')}><UserRound size={16} /></span>
                    <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">{detail.type === 'facture' ? 'Client' : detail.type === 'client' ? 'Enregistré par' : 'Détail'}</p><p className="truncate font-bold text-gray-800">{detail.tiers}</p></div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
