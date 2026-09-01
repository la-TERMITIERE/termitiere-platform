// Sources de revenus — liste à plat de CHAQUE entrée d'argent réelle (factures
// certifiées/approuvées des modules, versements clients E-G.Pro, revenus saisis
// manuellement), tous secteurs confondus (hors GARDERIE, dont les données actuelles
// ne sont que des essais), filtrable par secteur — même présentation que l'écran
// « Dépenses » (tableau, filtres, clic sur une ligne pour le détail).
import { useMemo, useState, useEffect } from 'react'
import { TrendingUp, Search, Eye, Building2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { formatDateShort, formatMoney, todayStr } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { getModule } from '../../shared/modules'
import { SECTEURS, MOIS_LABELS } from './data'

// Logo/icône de chaque secteur — reprend celui de son module métier (agro, logistique…)
// pour que la carte KPI soit reconnaissable au premier coup d'œil, pas un pictogramme
// générique. « Caisse commune » (divers) et « MAXI BAT » n'ont pas de module dédié.
const iconeSecteur = (id) => getModule(id)?.icon || Building2
import { versementsClientVersSecteurs } from './logic'
import { marquerVoletVu } from '../../shared/nouveautes'

// MAXI BAT n'a pas de revenu suivi ici — géré depuis le volet BTP d'E-G.Pro (même
// exclusion que « Revenus & Budget » standalone, cf. RecettesDepenses.jsx). GARDERIE
// exclue à la demande : ses données de paiement actuelles ne sont que des essais, pas
// des revenus réels — à réintégrer une fois la saisie garderie fiabilisée.
const SECTEURS_AFFICHES = SECTEURS.filter((s) => s.id !== 'bat' && s.id !== 'garderie')

const SOURCES = {
  facture:  { label: 'Facture',           tone: 'success' },
  client:   { label: 'Versement client',  tone: 'info'    },
  manuel:   { label: 'Saisie manuelle',   tone: 'neutral' }
}

export default function SourcesRevenus() {
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')
  const { data: projetsTous }         = useCollection('projets')
  const { data: versementsClientTous }= useCollection('projet_versements_client')
  const { data: revenusManuelsTous }  = useCollection('depense_revenus_manuels')
  const { user } = useAuth()
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
      type: 'facture', libelle: `Facture ${f.num || ''}`, tiers: f.clientNom || '', raw: f
    }))
    facturesEvenementiel.forEach((f) => out.push({
      id: `evt_${f.id}`, secteurId: 'evenementiel', date: f.date, montant: Number(f.totalTTC) || 0,
      type: 'facture', libelle: `Facture ${f.numero || ''}`, tiers: f.client?.nom || '', raw: f
    }))
    // GARDERIE volontairement exclue (données de test, cf. SECTEURS_AFFICHES ci-dessus).
    versementsClientRoutes.forEach((v) => {
      const projet = projetsTous.find((p) => p.id === v.projetId)
      out.push({
        id: `vers_${v.id}`, secteurId: v.secteurId, date: v.date, montant: Number(v.montant) || 0,
        type: 'client', libelle: projet?.nom || 'Versement client', tiers: v.enregistrePar || '', raw: v
      })
    })
    revenusManuelsTous.forEach((r) => out.push({
      id: `man_${r.id}`, secteurId: r.secteurId, date: r.date, montant: Number(r.montant) || 0,
      type: 'manuel', libelle: r.description || 'Revenu saisi manuellement', tiers: r.enregistrePar || '', raw: r
    }))
    return out.filter((l) => l.secteurId !== 'bat' && l.secteurId !== 'garderie').sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [facturesAgro, facturesLogistique, facturesEvenementiel, versementsClientRoutes, projetsTous, revenusManuelsTous])

  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [filtreType, setFiltreType]       = useState('')
  // Filtre de PÉRIODE fusionné dans un seul bloc « Période » : un sélecteur de
  // granularité (Jour / Mois) suivi d'UN SEUL champ de saisie, dont le TYPE change
  // selon le mode choisi (calendrier jour, ou sélecteur mois/année natif) — plutôt
  // que deux champs distincts à remplir/effacer chacun de son côté.
  const [modePeriode, setModePeriode] = useState('jour') // 'jour' | 'mois'
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : filtreJour
  const [recherche, setRecherche]         = useState('')
  const [detail, setDetail]               = useState(null)

  // Base commune (secteur/source/recherche) SANS période — sert de socle pour les KPI
  // "Aujourd'hui"/"Jour"/"Mois" ci-dessous, qui ont chacun leur propre période plutôt
  // que de dépendre du filtre choisi pour le tableau.
  const baseFiltree = useMemo(() => {
    let rows = [...lignes]
    if (filtreSecteur) rows = rows.filter((l) => l.secteurId === filtreSecteur)
    if (filtreType)    rows = rows.filter((l) => l.type === filtreType)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((l) => l.libelle.toLowerCase().includes(q) || (l.tiers || '').toLowerCase().includes(q))
    }
    return rows
  }, [lignes, filtreSecteur, filtreType, recherche])

  const liste = useMemo(() => {
    if (!filtrePeriodeActif) return baseFiltree
    if (modePeriode === 'mois') return baseFiltree.filter((l) => (l.date || '').startsWith(filtreMois))
    return baseFiltree.filter((l) => l.date === filtreJour)
  }, [baseFiltree, modePeriode, filtreJour, filtreMois, filtrePeriodeActif])

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
      : formatDateShort(filtreJour)
  const kpiParSecteur = useMemo(() => {
    // La carte existe pour tout secteur ayant DÉJÀ eu du revenu (peu importe quand) —
    // sinon un secteur sans rien aujourd'hui disparaissait complètement de la vue au
    // lieu d'afficher simplement 0 FCFA. Seule la SOMME affichée est bornée à la période.
    const periode = !filtrePeriodeActif
      ? baseFiltree.filter((l) => l.date === aujourdhui)
      : modePeriode === 'mois'
        ? baseFiltree.filter((l) => (l.date || '').startsWith(filtreMois))
        : baseFiltree.filter((l) => l.date === filtreJour)
    const sommesPeriode = new Map()
    periode.forEach((l) => sommesPeriode.set(l.secteurId, (sommesPeriode.get(l.secteurId) || 0) + l.montant))
    const secteursConnus = new Set(baseFiltree.map((l) => l.secteurId))
    return [...secteursConnus]
      .map((id) => ({ secteur: SECTEURS.find((s) => s.id === id) || { id, label: id, color: '#64748b' }, montant: sommesPeriode.get(id) || 0 }))
      .sort((a, b) => b.montant - a.montant || a.secteur.label.localeCompare(b.secteur.label))
  }, [baseFiltree, modePeriode, filtreJour, filtreMois, filtrePeriodeActif, aujourdhui])
  const secteurDetail = detail ? SECTEURS.find((s) => s.id === detail.secteurId) : null
  const couleurDetail = secteurDetail?.color || COULEUR_MODULE.depense

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(180,83,9,0.88) 0%, rgba(26,26,26,0.88) 100%)' }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <TrendingUp size={26} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Sources de revenus</h2>
          <p className="text-sm text-white/80">Toutes les entrées d'argent réelles — factures, versements clients, saisies manuelles (hors GARDERIE, données de test).</p>
        </div>
      </div>

      {/* KPI par secteur — une carte par secteur générateur de revenu réellement présent
          dans les données (un nouveau secteur ajoute automatiquement sa carte). Somme du
          jour par défaut, ou du mois choisi dans le filtre ci-dessous. */}
      {kpiParSecteur.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpiParSecteur.map(({ secteur, montant }) => (
            <StatCard key={secteur.id} title={secteur.label} value={formatMoney(montant)}
              sub={periodeLabel} icon={iconeSecteur(secteur.id)} accent={secteur.color} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Recherche</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-8" placeholder="Libellé, client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </div>
        </div>
        {/* Même composant qu'en MAXI LOGISTIQUE (Facturation/Prestations) — garantit
            un comportement identique pour comparer les deux écrans sur la même période. */}
        <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Secteur</label>
          <Select value={filtreSecteur} onChange={(e) => setFiltreSecteur(e.target.value)}>
            <option value="">Tous les secteurs</option>
            {SECTEURS_AFFICHES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Source</label>
          <Select value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
            <option value="">Toutes</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <span className="ml-auto text-xs text-gray-400">{liste.length} entrée(s) · {formatMoney(total)}</span>
      </div>

      {liste.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <TrendingUp size={34} className="opacity-30" />
            <p className="text-sm">Aucun revenu trouvé.</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2.5 text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 pb-1 text-left font-bold">Date & secteur</th>
                <th className="px-4 pb-1 text-left font-bold">Revenu</th>
                <th className="px-4 pb-1 text-left font-bold">Source</th>
                <th className="px-4 pb-1 text-right font-bold">Montant</th>
                <th className="px-4 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => {
                const secteur = SECTEURS.find((s) => s.id === l.secteurId)
                const secteurColor = secteur?.color || '#64748b'
                const source = SOURCES[l.type]
                const cell = 'bg-white py-3 align-middle transition-colors group-hover:bg-emerald-50/40'
                return (
                  <tr key={l.id} onClick={() => setDetail(l)}
                    className="group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_18px_-6px_rgba(180,83,9,0.18)] hover:ring-amber-200">
                    <td className={`${cell} rounded-l-2xl border-l-[3px] px-4`} style={{ borderColor: secteurColor }}>
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-700">{formatDateShort(l.date)}</p>
                      <span className="mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: secteurColor + '1a', color: secteurColor }}>
                        {secteur?.label || l.secteurId}
                      </span>
                    </td>
                    <td className={`${cell} px-4`}>
                      <p className="line-clamp-2 max-w-[320px] font-semibold text-gray-800">{l.libelle}</p>
                      {l.tiers && <p className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-gray-500">{l.tiers}</p>}
                    </td>
                    <td className={`${cell} px-4`}>
                      <Badge tone={source.tone}>{source.label}</Badge>
                    </td>
                    <td className={`${cell} whitespace-nowrap px-4 text-right`}>
                      <span className="text-base font-extrabold text-emerald-700">+{Number(l.montant).toLocaleString('fr-FR')}</span>
                      <span className="ml-0.5 text-[10px] font-semibold text-gray-400">FCFA</span>
                    </td>
                    <td className={`${cell} rounded-r-2xl px-3`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <button onClick={() => setDetail(l)} title="Voir les détails" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Eye size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="sm" {...glassModalProps(couleurDetail)}
        title={detail?.libelle || 'Détail du revenu'}>
        {detail && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
              <span className="text-gray-500">Secteur</span>
              <span className="font-bold" style={{ color: secteurDetail?.color }}>{secteurDetail?.label || detail.secteurId}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
              <span className="text-gray-500">Source</span>
              <Badge tone={SOURCES[detail.type].tone}>{SOURCES[detail.type].label}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
              <span className="text-gray-500">Date</span>
              <span className="font-bold text-gray-800">{formatDateShort(detail.date)}</span>
            </div>
            {detail.tiers && (
              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
                <span className="text-gray-500">{detail.type === 'facture' ? 'Client' : detail.type === 'client' ? 'Enregistré par' : 'Détail'}</span>
                <span className="font-bold text-gray-800">{detail.tiers}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
              <span className="text-gray-500">Montant</span>
              <span className="font-bold text-emerald-700">+{formatMoney(detail.montant)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
