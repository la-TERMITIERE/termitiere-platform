// COMPTABILITÉ — Mouvements bancaires : LE volet unique des comptes bancaires de tous les secteurs
// (MAXI-AGRO, MAXI LOGISTIQUE, MAXI-GYM, E-GARDERIE). On y saisit, corrige et supprime les dépôts et
// retraits (collection `${secteur}_banque`) ; le menu « Secteur » filtre la liste, et le solde du secteur
// choisi apparaît alors en tête. Toucher « Dépôts » ou « Retraits » ouvre le détail. Les anciens volets
// « Compte bancaire » des secteurs sont retirés. Réservé à PAU / Assistant PAU / GE / Info (BANQUE_ROLES).
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Landmark, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CalendarDays, Layers, FileText, Wallet, ListOrdered, FileSpreadsheet, Paperclip, Inbox, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { peutVoirBanque, isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { setItem, removeItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import ModalMouvement from '../../shared/banque/ModalMouvement'
import MouvementFiche from './MouvementFiche'
import { COL } from './data'
import { glassModalProps } from '../../utils/color'
import { exportRapportExcel } from '../../utils/excelReport'
import { ouvrirPiece } from '../../utils/fichiers'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { TYPES_MOUVEMENT_BANQUE, SECTEURS as SECTEURS_DEPENSE, LOGISTIQUE_SITES } from '../depense/data'
import { PREFIXE_AUTRE, SECTEUR_SANS, collectionBanque, moduleAudit, teinteBanque } from '../../shared/banque/comptes'
import BandeauCompta, { BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

// Un compte bancaire par secteur : collection `${id}_banque`. Les secteurs sont ceux d'E-DÉPENSES, sans la
// caisse courante (qui n'est pas un secteur) : E-G.Pro et E-VOYAGE n'en sont pas non plus. MAXI LOGISTIQUE et
// MAXI-GYM ont deux sites (Lomé, Kara) : le site se choisit à la saisie.
const SITES_PAR_SECTEUR = { logistique: LOGISTIQUE_SITES, gym: [{ id: 'lome', label: 'Lomé' }, { id: 'kara', label: 'Kara' }] }
// TRANSPORTS s'y ajoute comme source de revenus à part entière. D'autres sources se créent à la main (« Autre source »).
const SECTEURS = [
  ...SECTEURS_DEPENSE.filter((x) => x.id !== 'divers').map((x) => ({ id: x.id, nom: x.label, color: x.color, sites: SITES_PAR_SECTEUR[x.id] || null })),
  { id: 'transport', nom: 'TRANSPORTS', color: '#0891b2', sites: null },
  // Mouvements saisis sans secteur (le secteur est facultatif) : ils ont leur propre compte.
  { id: SECTEUR_SANS, nom: 'SANS SECTEUR', color: '#64748b', sites: null }
]
const COULEUR_AUTRE_SOURCE = '#7c3aed'

const montant = (m) => Number(m.montant) || 0
const somme = (rows, type) => rows.filter((m) => m.type === type).reduce((t, m) => t + montant(m), 0)
const TH = 'sticky top-0 z-10 bg-orange-50 shadow-[0_1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800 px-3 py-2.5'

// Indicateur de la banque où le dépôt (ou le retrait) a été fait : pastille teintée avec la petite icône de banque.
function PastilleBanque({ nom, numero }) {
  if (!nom) return <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-400"><Landmark size={11} /> Non précisée</span>
  const c = teinteBanque(nom)
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm" style={{ background: `linear-gradient(135deg, ${c}22, ${c}0d)`, color: c, boxShadow: `inset 0 0 0 1px ${c}33` }}>
      <Landmark size={11} strokeWidth={2.4} /> {nom}{numero ? <span className="font-mono text-[10px] opacity-80">••{String(numero).slice(-4)}</span> : null}
    </span>
  )
}

// Type du mouvement : flèche qui descend vers la banque pour un dépôt, qui en sort pour un retrait.
function PastilleType({ type, label }) {
  const depot = type === 'depot'
  const Icone = depot ? ArrowDownCircle : ArrowUpCircle
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${depot ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>
      <Icone size={12} strokeWidth={2.4} /> {label}
    </span>
  )
}

const ENTETE = (Icone, texte) => <span className="inline-flex items-center gap-1.5"><Icone size={12} className="shrink-0 text-orange-400" strokeWidth={2.4} />{texte}</span>

export default function MouvementsBancaires() {
  const { role, user } = useAuth()
  const { data: agro } = useCollection('agro_banque')
  const { data: logistique } = useCollection('logistique_banque')
  const { data: gym } = useCollection('gym_banque')
  const { data: garderie } = useCollection('garderie_banque')
  const { data: bat } = useCollection('bat_banque')
  const { data: evenementiel } = useCollection('evenementiel_banque')
  const { data: transport } = useCollection('transport_banque')
  const { data: siege } = useCollection('siege_banque')
  const { data: autres } = useCollection('autres_banque')
  const { data: sourcesPerso } = useCollection(COL.sourcesRevenus)
  const { data: banques } = useCollection(COL.banques)
  const sources = { agro, logistique, gym, garderie, bat, evenementiel, transport, [SECTEUR_SANS]: siege }

  const [secteur, setSecteur] = useState('') // '' = tous les secteurs
  const [type, setType] = useState('') // '' | 'depot' | 'retrait'
  // Ouvert depuis la carte d'un compte (…/mouvements-bancaires/:banqueId) : ce compte est déjà choisi.
  const { banqueId } = useParams()
  const navigate = useNavigate()
  const [banqueFiltre, setBanqueFiltre] = useState(banqueId && banqueId !== 'tous' ? banqueId : '') // '' = toutes, '__aucune__' = non précisée
  const [mois, setMois] = useState('')
  const [recherche, setRecherche] = useState('')
  const [ajout, setAjout] = useState(false)
  const [edition, setEdition] = useState(null) // mouvement en cours de modification
  const [fiche, setFiche] = useState(null) // mouvement dont on consulte tous les détails
  const [detail, setDetail] = useState(null) // 'depot' | 'retrait'
  const [ouverture, setOuverture] = useState(null) // { montant, date } : solde d'ouverture du secteur filtré
  const [ouvBanque, setOuvBanque] = useState(null) // { id, nom, montant, date } : solde d'ouverture d'une banque
  const [soldes, setSoldes] = useState(false) // fenêtre « soldes par secteur et par banque »
  const [saving, setSaving] = useState(false)

  const secteurComplet = (m) => (m.siteNom ? `${m.secteurNom} · ${m.siteNom}` : m.secteurNom)
  const nomBanque = (m) => banques.find((b) => b.id === m.banqueId)?.nom || m.banqueNom || ''
  const numeroBanque = (m) => banques.find((b) => b.id === m.banqueId)?.numero || m.banqueNumero || ''
  const peutEcrire = !isReadOnlyRole(role)

  // Solde de chaque secteur : ouverture + dépôts - retraits.
  const comptes = useMemo(() => [
    ...SECTEURS,
    ...sourcesPerso.map((c) => ({ id: `${PREFIXE_AUTRE}${c.id}`, nom: String(c.nom || '').toUpperCase(), color: COULEUR_AUTRE_SOURCE, sites: null, custom: true, sourceId: c.id }))
  ], [sourcesPerso])
  const parSecteur = useMemo(() => comptes.map((s) => {
    const brut = s.custom ? autres.filter((m) => m.sourceId === s.sourceId) : (sources[s.id] || [])
    const ouvertureRec = brut.find((m) => m.ouverture)
    const initial = Number(ouvertureRec?.montant) || 0
    const rows = brut.filter((m) => !m.ouverture).map((m) => ({ ...m, secteurId: s.id, secteurNom: s.nom, siteNom: (s.sites || []).find((st) => st.id === m.site)?.label || '' }))
    return { ...s, ouvertureRec, initial, rows, depots: somme(rows, 'depot'), retraits: somme(rows, 'retrait'), solde: initial + somme(rows, 'depot') - somme(rows, 'retrait') }
  }), [agro, logistique, gym, garderie, bat, evenementiel, transport, siege, autres, comptes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Solde de chaque banque : solde d'ouverture de la banque + dépôts - retraits qui lui sont rattachés (tous secteurs).
  const parBanque = useMemo(() => {
    const tous = parSecteur.flatMap((x) => x.rows)
    const groupes = banques.map((b) => ({ id: b.id, nom: b.nom, rec: b, initial: Number(b.soldeOuverture) || 0, rows: tous.filter((m) => m.banqueId === b.id) }))
    const connues = new Set(banques.map((b) => b.id))
    const parNom = new Map()
    tous.filter((m) => !connues.has(m.banqueId)).forEach((m) => { const n = m.banqueNom || ''; parNom.set(n, [...(parNom.get(n) || []), m]) })
    parNom.forEach((rows, n) => groupes.push({ id: n ? `nom:${n}` : '__aucune__', nom: n ? `${n} (supprimée)` : 'Banque non précisée', rec: null, initial: 0, rows }))
    return groupes.map((g) => ({ ...g, depots: somme(g.rows, 'depot'), retraits: somme(g.rows, 'retrait'), solde: g.initial + somme(g.rows, 'depot') - somme(g.rows, 'retrait') }))
  }, [parSecteur, banques])
  const banqueChoisie = parBanque.find((b) => b.id === banqueFiltre) || null
  const soldeTotalBanques = parBanque.reduce((t, b) => t + b.solde, 0)

  const choisi = parSecteur.find((s) => s.id === secteur) || null
  const soldeTotal = parSecteur.reduce((t, s) => t + s.solde, 0)

  // Filtres hors « type » : servent aux chiffres des KPI (Dépôts et Retraits restent toujours affichés).
  const listeHorsType = useMemo(() => {
    let rows = parSecteur.flatMap((s) => s.rows)
    if (secteur) rows = rows.filter((m) => m.secteurId === secteur)
    if (banqueFiltre === '__aucune__') rows = rows.filter((m) => !nomBanque(m))
    else if (banqueFiltre) rows = rows.filter((m) => m.banqueId === banqueFiltre)
    if (mois) rows = rows.filter((m) => (m.date || '').startsWith(mois))
    rows = rows.filter((m) => correspond(recherche, m.libelle, m.origine, m.personne, m.secteurNom, m.siteNom, nomBanque(m)))
    return rows.sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1))
  }, [parSecteur, secteur, mois, recherche, banqueFiltre, banques]) // eslint-disable-line react-hooks/exhaustive-deps

  const liste = useMemo(() => (type ? listeHorsType.filter((m) => m.type === type) : listeHorsType), [listeHorsType, type])
  const totalDepots = somme(listeHorsType, 'depot')
  const totalRetraits = somme(listeHorsType, 'retrait')
  const totalListeDepots = somme(liste, 'depot')
  const totalListeRetraits = somme(liste, 'retrait')
  const filtreActif = !!(secteur || type || mois || banqueFiltre || recherche.trim())

  // Détail d'un KPI : répartition par secteur et par banque, puis la liste des mouvements.
  const detailRows = useMemo(() => (!detail ? [] : detail === 'tous' ? liste : listeHorsType.filter((m) => m.type === detail)), [detail, liste, listeHorsType])
  const signe = (m) => TYPES_MOUVEMENT_BANQUE[m.type]?.signe || 0
  const grouper = (cle) => {
    const map = new Map()
    detailRows.forEach((m) => { const k = cle(m) || 'Non précisée'; const x = map.get(k) || { nom: k, total: 0, nb: 0 }; x.total += detail === 'tous' ? signe(m) * montant(m) : montant(m); x.nb += 1; map.set(k, x) })
    return [...map.values()].sort((a, b) => b.total - a.total)
  }

  const suggestions = {
    libelles: [...new Set(['DEPOT', 'RETRAIT', 'RETRAIT CHEQUE', 'ALIMENTATION CAISSE', ...parSecteur.flatMap((x) => x.rows.map((m) => m.libelle)).filter(Boolean)])],
    origines: [...new Set(parSecteur.flatMap((x) => x.rows.map((m) => m.origine)).filter(Boolean))].sort(),
    personnes: [...new Set(parSecteur.flatMap((x) => x.rows.map((m) => m.personne)).filter(Boolean))].sort()
  }

  async function supprimer(m) {
    try {
      await removeItem(collectionBanque(m.secteurId), m.id)
      await audit(moduleAudit(m.secteurId), 'BANQUE_MOUVEMENT_DELETE', `${TYPES_MOUVEMENT_BANQUE[m.type]?.label || m.type} : ${montant(m).toLocaleString('fr-FR')} FCFA`)
      toast.success('Mouvement supprimé ✓')
    } catch (e) {
      if (!String(e?.message || e?.code || e).startsWith('SUPPRESSION')) throw e
    }
  }

  async function enregistrerOuverture() {
    if (saving || !choisi) return
    setSaving(true)
    try {
      const m = Number(ouverture.montant) || 0
      const id = choisi.ouvertureRec?.id || (choisi.custom ? `ouverture_${choisi.sourceId}` : 'ouverture')
      await setItem(collectionBanque(choisi.id), id, { id, ouverture: true, montant: m, date: ouverture.date, type: 'ouverture', ...(choisi.custom ? { sourceId: choisi.sourceId } : {}) })
      await audit(moduleAudit(choisi.id), 'BANQUE_SOLDE_INITIAL', `Solde d'ouverture fixé à ${m.toLocaleString('fr-FR')} FCFA au ${formatDateShort(ouverture.date)}`)
      toast.success("Solde d'ouverture mis à jour ✓")
      setOuverture(null)
    } finally {
      setSaving(false)
    }
  }

  async function enregistrerOuvertureBanque() {
    if (saving || !ouvBanque) return
    setSaving(true)
    try {
      const m = Number(ouvBanque.montant) || 0
      await updateItem(COL.banques, ouvBanque.id, { soldeOuverture: m, dateOuverture: ouvBanque.date })
      await audit('comptabilite', 'BANQUE_SOLDE_INITIAL', `${ouvBanque.nom} : solde d'ouverture fixé à ${m.toLocaleString('fr-FR')} FCFA au ${formatDateShort(ouvBanque.date)}`)
      toast.success("Solde d'ouverture de la banque mis à jour ✓")
      setOuvBanque(null)
    } finally {
      setSaving(false)
    }
  }

  function exporter() {
    exportRapportExcel({
      filename: `mouvements-bancaires${choisi ? `-${choisi.id}` : ''}${mois ? `-${mois}` : ''}-${todayStr()}.xlsx`,
      sections: [
        {
          name: 'Soldes par secteur', title: 'Comptes bancaires : soldes par secteur', subtitle: `Situation au ${formatDateShort(todayStr())}`,
          columns: [
            { key: 'secteur', label: 'Secteur', width: 24 }, { key: 'ouverture', label: "Solde d'ouverture", type: 'money', width: 18 },
            { key: 'depots', label: 'Dépôts', type: 'money', width: 16 }, { key: 'retraits', label: 'Retraits', type: 'money', width: 16 },
            { key: 'solde', label: 'Solde actuel', type: 'money', width: 18 }, { key: 'nb', label: 'Mouvements', width: 12 }
          ],
          rows: parSecteur.map((s) => ({ secteur: s.nom, ouverture: s.initial, depots: s.depots, retraits: s.retraits, solde: s.solde, nb: s.rows.length })),
          totals: { __label: 'TOTAL', ouverture: parSecteur.reduce((t, s) => t + s.initial, 0), depots: parSecteur.reduce((t, s) => t + s.depots, 0), retraits: parSecteur.reduce((t, s) => t + s.retraits, 0), solde: soldeTotal }
        },
        {
          name: 'Soldes par banque', title: 'Comptes bancaires : soldes par banque', subtitle: `Situation au ${formatDateShort(todayStr())}`,
          columns: [
            { key: 'banque', label: 'Banque', width: 26 }, { key: 'numero', label: 'N° de compte', width: 22 }, { key: 'ouverture', label: "Solde d'ouverture", type: 'money', width: 18 },
            { key: 'depots', label: 'Dépôts', type: 'money', width: 16 }, { key: 'retraits', label: 'Retraits', type: 'money', width: 16 },
            { key: 'solde', label: 'Solde actuel', type: 'money', width: 18 }, { key: 'nb', label: 'Mouvements', width: 12 }
          ],
          rows: parBanque.map((b) => ({ banque: b.nom, numero: b.rec?.numero || '', ouverture: b.initial, depots: b.depots, retraits: b.retraits, solde: b.solde, nb: b.rows.length })),
          totals: { __label: 'TOTAL', ouverture: parBanque.reduce((t, b) => t + b.initial, 0), depots: parBanque.reduce((t, b) => t + b.depots, 0), retraits: parBanque.reduce((t, b) => t + b.retraits, 0), solde: soldeTotalBanques }
        },
        {
          name: 'Mouvements', title: 'Mouvements bancaires', subtitle: `${liste.length} mouvement(s)${choisi ? ` : ${choisi.nom}` : ''}${mois ? ` : ${mois}` : ''}`,
          columns: [
            { key: 'date', label: 'Date', width: 12 }, { key: 'secteur', label: 'Secteur', width: 22 }, { key: 'libelle', label: 'Libellé', width: 34 },
            { key: 'banque', label: 'Banque', width: 20 }, { key: 'numero', label: 'N° de compte', width: 22 }, { key: 'origine', label: 'Origine', width: 24 }, { key: 'personne', label: 'Personne', width: 22 }, { key: 'type', label: 'Type', width: 12 },
            { key: 'depot', label: 'Dépôt', type: 'money', width: 16 }, { key: 'retrait', label: 'Retrait', type: 'money', width: 16 }
          ],
          rows: liste.map((m) => ({
            date: formatDateShort(m.date), secteur: secteurComplet(m), libelle: m.libelle || '', banque: nomBanque(m), numero: numeroBanque(m), origine: m.origine || '', personne: m.personne || '',
            type: TYPES_MOUVEMENT_BANQUE[m.type]?.label || m.type, depot: m.type === 'depot' ? montant(m) : 0, retrait: m.type === 'retrait' ? montant(m) : 0
          })),
          totals: { __label: 'TOTAL', depot: totalListeDepots, retrait: totalListeRetraits }
        }
      ]
    })
  }

  return (
    <div className="space-y-5">
      <BandeauCompta icone={Landmark}
        titre={banqueChoisie && banqueId === banqueChoisie.id ? banqueChoisie.nom : 'Mouvements bancaires'}
        sous={banqueChoisie && banqueId === banqueChoisie.id ? `${banqueChoisie.rec?.numero ? `Compte N° ${banqueChoisie.rec.numero} · ` : ''}mouvements de tous les secteurs sur ce compte.` : 'Soldes et mouvements des comptes bancaires de tous les secteurs.'}>
        <BoutonBande icone={ArrowLeft} onClick={() => navigate('/comptabilite/mouvements-bancaires')} title="Revenir au choix du compte">Comptes</BoutonBande>
        <ChampBande label="Secteur">
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-36`}>
            <option value="">Tous les secteurs</option>
            {parSecteur.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        </ChampBande>
        <ChampRecherche variant="glass" className="!w-44" value={recherche} onChange={setRecherche} placeholder="Libellé, origine…" />
        <ChampBande label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-28`}>
            <option value="">Tous</option>
            <option value="depot">Dépôts</option>
            <option value="retrait">Retraits</option>
          </select>
        </ChampBande>
        <ChampBande label="Banque">
          <select value={banqueFiltre} onChange={(e) => setBanqueFiltre(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-32`}>
            <option value="">Toutes</option>
            {banques.map((b) => <option key={b.id} value={b.id}>{b.nom}{b.numero ? ` · N° ${b.numero}` : ''}</option>)}
            <option value="__aucune__">Non précisée</option>
          </select>
        </ChampBande>
        <ChampBande label="Mois"><input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-36`} /></ChampBande>
        {filtreActif && <BoutonBande plein={false} onClick={() => { setSecteur(''); setType(''); setMois(''); setBanqueFiltre(''); setRecherche('') }}>Tout afficher</BoutonBande>}
      </BandeauCompta>

      {(peutVoirBanque(role) || peutEcrire) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <style>{`
            @keyframes mb-ondes { 0% { box-shadow: 0 8px 18px -8px rgba(234,88,12,0.7), 0 0 0 0 rgba(234,88,12,0.45); } 70% { box-shadow: 0 8px 18px -8px rgba(234,88,12,0.7), 0 0 0 12px rgba(234,88,12,0); } 100% { box-shadow: 0 8px 18px -8px rgba(234,88,12,0.7), 0 0 0 0 rgba(234,88,12,0); } }
            @keyframes mb-plus { 0%, 70%, 100% { transform: rotate(0deg) scale(1); } 85% { transform: rotate(90deg) scale(1.25); } }
            @keyframes mb-brille { 0% { transform: translateX(-130%) skewX(-20deg); } 55%, 100% { transform: translateX(260%) skewX(-20deg); } }
          `}</style>
          {peutVoirBanque(role) && (
            <button type="button" onClick={exporter} disabled={!liste.length}
              className="inline-flex items-center gap-2 rounded-2xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-extrabold text-orange-700 shadow-sm transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-orange-50 disabled:opacity-50">
              <FileSpreadsheet size={17} /> Export Excel
            </button>
          )}
          {peutEcrire && <button type="button" onClick={() => setAjout(true)}
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border border-orange-300 bg-gradient-to-br from-orange-500 to-orange-700 px-4 py-2.5 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5"
            style={{ animation: 'mb-ondes 2.4s ease-out infinite' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" style={{ animation: 'mb-brille 3.6s ease-in-out infinite' }} />
            <Plus size={17} className="relative" style={{ animation: 'mb-plus 3.6s ease-in-out infinite' }} />
            <span className="relative">Ajouter un mouvement</span>
          </button>}
        </div>
      )}

      <div className={`grid grid-cols-2 gap-3 ${banqueChoisie ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {/* Le solde du secteur n'apparaît que lorsqu'on filtre sur ce secteur. */}
        {choisi ? (
          <div className="relative">
            <StatCard title={`SOLDE ${choisi.nom}`} value={formatMoney(choisi.solde)} sub={`${choisi.rows.length} mouvement(s)`} accent={choisi.color} icon={Landmark} onClick={() => setSoldes(true)} />
            {isFullAccessRole(role) && (
              <button type="button" title="Modifier le solde d'ouverture" aria-label="Modifier le solde d'ouverture"
                onClick={() => setOuverture({ montant: choisi.initial, date: choisi.ouvertureRec?.date || todayStr() })}
                className="absolute right-2 top-2 rounded-lg bg-white/80 p-1.5 shadow-sm hover:bg-white" style={{ color: choisi.color }}><Pencil size={13} /></button>
            )}
          </div>
        ) : (
          <StatCard title="SOLDE BANCAIRE TOTAL" value={formatMoney(soldeTotal)} sub="toucher : détail par banque" accent="#ea580c" icon={Landmark} onClick={() => setSoldes(true)} />
        )}
        {/* Le solde d'une banque n'apparaît que lorsqu'on filtre sur cette banque. */}
        {banqueChoisie && (
          <div className="relative">
            <StatCard title={`SOLDE ${banqueChoisie.nom}`.toUpperCase()} value={formatMoney(banqueChoisie.solde)} sub={`${banqueChoisie.rec?.numero ? `N° ${banqueChoisie.rec.numero} · ` : ''}${banqueChoisie.rows.length} mouvement(s) · tous secteurs`} accent="#0f766e" icon={Landmark} onClick={() => setSoldes(true)} />
            {banqueChoisie.rec && isFullAccessRole(role) && (
              <button type="button" title="Modifier le solde d'ouverture de la banque" aria-label="Modifier le solde d'ouverture de la banque"
                onClick={() => setOuvBanque({ id: banqueChoisie.id, nom: banqueChoisie.nom, montant: banqueChoisie.initial, date: banqueChoisie.rec.dateOuverture || todayStr() })}
                className="absolute right-2 top-2 rounded-lg bg-white/80 p-1.5 text-teal-700 shadow-sm hover:bg-white"><Pencil size={13} /></button>
            )}
          </div>
        )}
        <StatCard title={`DÉPÔTS${filtreActif ? ' (FILTRE)' : ''}`} value={`+${formatMoney(totalDepots)}`} sub="toucher pour le détail" accent="#2563eb" icon={ArrowDownCircle} onClick={() => setDetail('depot')} />
        <StatCard title={`RETRAITS${filtreActif ? ' (FILTRE)' : ''}`} value={`-${formatMoney(totalRetraits)}`} sub="toucher pour le détail" accent="#dc2626" icon={ArrowUpCircle} onClick={() => setDetail('retrait')} />
        <StatCard title="MOUVEMENTS" value={liste.length} sub={filtreActif ? 'selon les filtres : toucher pour le détail' : 'toucher pour le détail'} accent="#0d9488" icon={ListOrdered} onClick={() => setDetail('tous')} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className={TH}>{ENTETE(CalendarDays, 'Date')}</th><th className={TH}>{ENTETE(Layers, 'Secteur')}</th><th className={TH}>{ENTETE(FileText, 'Libellé / Origine')}</th><th className={TH}>{ENTETE(Landmark, 'Banque')}</th>
                <th className={TH}>{ENTETE(ArrowLeftRight, 'Type')}</th><th className={`${TH} text-right`}>{ENTETE(Wallet, 'Montant')}</th>{peutEcrire && <th className={`${TH} w-20`}></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {liste.length === 0 && (
                <tr><td colSpan={peutEcrire ? 7 : 6} className="px-3 py-10 text-center text-gray-400">
                  <Inbox className="mx-auto mb-2" size={28} />
                  {filtreActif ? 'Aucun mouvement pour ces filtres.' : 'Aucun mouvement bancaire enregistré.'}
                </td></tr>
              )}
              {liste.map((m) => {
                const t = TYPES_MOUVEMENT_BANQUE[m.type] || { label: m.type, tone: 'neutral', signe: 0 }
                const s = parSecteur.find((x) => x.id === m.secteurId)
                return (
                  <tr key={`${m.secteurId}_${m.id}`} onClick={() => setFiche(m)} className="cursor-pointer hover:bg-orange-50/60 dark:hover:bg-white/5">
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">{formatDateShort(m.date)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${s?.color}1a`, color: s?.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />{secteurComplet(m)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-100">
                        {m.libelle || ':'}
                        {m.piece && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); ouvrirPiece(m.piece) }} title="Voir le justificatif" className="text-gray-400 hover:text-orange-600"><Paperclip size={13} /></button>
                        )}
                      </p>
                      {(m.origine || m.personne) && <p className="text-[11px] text-gray-500">{[m.origine, m.personne].filter(Boolean).join(' · ')}</p>}
                    </td>
                    <td className="px-3 py-2"><PastilleBanque nom={nomBanque(m)} numero={numeroBanque(m)} /></td>
                    <td className="px-3 py-2"><PastilleType type={m.type} label={t.label} /></td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-extrabold ${t.signe > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {t.signe > 0 ? '+' : '-'}{montant(m).toLocaleString('fr-FR')}
                    </td>
                    {peutEcrire && (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setEdition(m)} title="Modifier" className="rounded p-1.5 text-orange-600 hover:bg-orange-50"><Pencil size={14} /></button>
                          {isFullAccessRole(role) && <button type="button" onClick={() => supprimer(m)} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {liste.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="sticky bottom-0 z-10 bg-orange-50 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-gray-700 shadow-[0_-1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800 dark:text-gray-200">
                    Total : {liste.length} mouvement(s)
                    <span className="ml-2 normal-case text-blue-600">dépôts +{totalListeDepots.toLocaleString('fr-FR')}</span>
                    <span className="ml-2 normal-case text-red-600">retraits -{totalListeRetraits.toLocaleString('fr-FR')}</span>
                  </td>
                  <td className={`sticky bottom-0 z-10 whitespace-nowrap bg-orange-50 px-3 py-2.5 text-right text-sm font-black shadow-[0_-1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800 ${totalListeDepots - totalListeRetraits >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {totalListeDepots - totalListeRetraits >= 0 ? '+' : '-'}{Math.abs(totalListeDepots - totalListeRetraits).toLocaleString('fr-FR')}
                  </td>
                  {peutEcrire && <td className="sticky bottom-0 z-10 bg-orange-50 shadow-[0_-1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Ajout et modification d'un mouvement */}
      <ModalMouvement open={ajout} onClose={() => setAjout(false)} user={user} banques={banques} suggestions={suggestions}
        secteurs={parSecteur.filter((x) => x.id !== SECTEUR_SANS).map((x) => ({ id: x.id, nom: x.nom, color: x.color, sites: x.sites }))} secteurId={secteur === SECTEUR_SANS ? '' : (secteur || '')} />
      <ModalMouvement open={!!edition} onClose={() => setEdition(null)} user={user} banques={banques} suggestions={suggestions} fixeSecteur
        secteurs={parSecteur.filter((x) => x.id !== SECTEUR_SANS).map((x) => ({ id: x.id, nom: x.nom, color: x.color, sites: x.sites }))} secteurId={edition?.secteurId} mouvement={edition} />

      {/* Tous les détails d'un mouvement */}
      <MouvementFiche mouvement={fiche} secteur={fiche ? parSecteur.find((x) => x.id === fiche.secteurId) : null} banque={fiche ? nomBanque(fiche) : ''} numero={fiche ? numeroBanque(fiche) : ''}
        onClose={() => setFiche(null)}
        onModifier={peutEcrire ? (m) => { setFiche(null); setEdition(m) } : null}
        onSupprimer={isFullAccessRole(role) ? (m) => { setFiche(null); supprimer(m) } : null} />

      {/* Détail des dépôts ou des retraits : par secteur, par banque, puis la liste */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(detail === 'depot' ? '#2563eb' : detail === 'retrait' ? '#dc2626' : '#0d9488')}
        title={`${detail === 'depot' ? 'Dépôts' : detail === 'retrait' ? 'Retraits' : 'Tous les mouvements'}${filtreActif ? ' (selon les filtres)' : ''}`}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (
          <div className="space-y-3">
            {detail === 'tous' ? (
              <p className="text-sm text-gray-600">
                <strong>{detailRows.length} mouvement(s)</strong> : dépôts <strong className="text-blue-700">+{somme(detailRows, 'depot').toLocaleString('fr-FR')}</strong>,
                retraits <strong className="text-red-700">-{somme(detailRows, 'retrait').toLocaleString('fr-FR')}</strong>, net{' '}
                <strong className={somme(detailRows, 'depot') - somme(detailRows, 'retrait') >= 0 ? 'text-blue-700' : 'text-red-700'}>
                  {somme(detailRows, 'depot') - somme(detailRows, 'retrait') >= 0 ? '+' : '-'}{Math.abs(somme(detailRows, 'depot') - somme(detailRows, 'retrait')).toLocaleString('fr-FR')} FCFA
                </strong>.
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                <strong className={detail === 'depot' ? 'text-blue-700' : 'text-red-700'}>{detail === 'depot' ? '+' : '-'}{somme(detailRows, detail).toLocaleString('fr-FR')} FCFA</strong>
                {' '}sur {detailRows.length} mouvement(s).
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {[['Par secteur', grouper(secteurComplet)], ['Par banque', grouper(nomBanque)]].map(([titre, groupes]) => (
                <div key={titre} className="rounded-xl border border-white/60 bg-white/80 p-3 shadow-sm">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{titre}</p>
                  {groupes.length === 0 && <p className="text-sm text-gray-400">Aucun mouvement.</p>}
                  {groupes.map((g) => (
                    <div key={g.nom} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-700">{g.nom} <span className="text-xs text-gray-400">({g.nb})</span></span>
                      <span className="font-extrabold text-gray-900">{g.total.toLocaleString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-white/60 bg-white/80 shadow-sm">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Secteur</th><th className="px-3 py-2">Libellé</th><th className="px-3 py-2">Banque</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Montant</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {detailRows.map((m) => (
                    <tr key={`${m.secteurId}_${m.id}`} onClick={() => { setDetail(null); setFiche(m) }} className="cursor-pointer hover:bg-orange-50/60">
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold text-gray-700">{formatDateShort(m.date)}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600">{secteurComplet(m)}</td>
                      <td className="px-3 py-1.5 text-gray-800">{m.libelle || ':'}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600">{nomBanque(m) || ':'}</td>
                      <td className="px-3 py-1.5"><Badge tone={TYPES_MOUVEMENT_BANQUE[m.type]?.tone || 'neutral'}>{TYPES_MOUVEMENT_BANQUE[m.type]?.label || m.type}</Badge></td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right font-bold ${signe(m) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{signe(m) >= 0 ? '+' : '-'}{montant(m).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                  {detailRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Aucun mouvement.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Solde d'ouverture du secteur filtré (administration) */}
      <Modal open={!!ouverture} onClose={() => setOuverture(null)} size="sm" title={`Solde d'ouverture : ${choisi?.nom || ''}`} {...glassModalProps(choisi?.color || '#ea580c')}
        footer={<><Button variant="outline" onClick={() => setOuverture(null)} disabled={saving}>Annuler</Button><Button style={{ backgroundColor: choisi?.color }} onClick={enregistrerOuverture} loading={saving}>Enregistrer</Button></>}>
        {ouverture && (
          <div className="rounded-xl border border-white/60 bg-white/80 p-3 shadow-sm">
            <p className="mb-2 text-xs text-gray-500">Solde du compte bancaire avant le premier mouvement enregistré ici. Tous les soldes affichés en découlent.</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Date"><Input type="date" value={ouverture.date} onChange={(e) => setOuverture((s) => ({ ...s, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Montant (FCFA)"><Input type="number" value={ouverture.montant} onChange={(e) => setOuverture((s) => ({ ...s, montant: e.target.value }))} /></FormGroup>
            </div>
          </div>
        )}
      </Modal>

      {/* Soldes par secteur et par banque */}
      <Modal open={soldes} onClose={() => setSoldes(false)} size="lg" {...glassModalProps('#ea580c')} title="Soldes des comptes bancaires"
        footer={<Button variant="ghost" onClick={() => setSoldes(false)}>Fermer</Button>}>
        <div className="space-y-3">
          {[['Par secteur', parSecteur.map((x) => ({ id: x.id, nom: x.nom, initial: x.initial, depots: x.depots, retraits: x.retraits, solde: x.solde, nb: x.rows.length })), soldeTotal],
            ['Par banque', parBanque.map((b) => ({ id: b.id, nom: b.nom, initial: b.initial, depots: b.depots, retraits: b.retraits, solde: b.solde, nb: b.rows.length })), soldeTotalBanques]].map(([titre, lignes, total]) => (
            <div key={titre} className="overflow-hidden rounded-xl border border-white/60 bg-white/80 shadow-sm">
              <p className="px-3 pt-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">{titre}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">{titre === 'Par banque' ? 'Banque' : 'Secteur'}</th><th className="px-3 py-2 text-right">Ouverture</th><th className="px-3 py-2 text-right">Dépôts</th><th className="px-3 py-2 text-right">Retraits</th><th className="px-3 py-2 text-right">Solde</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {lignes.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Aucune banque enregistrée.</td></tr>}
                    {lignes.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5 font-semibold text-gray-800">{l.nom} <span className="text-xs font-normal text-gray-400">({l.nb})</span></td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-gray-600">{l.initial.toLocaleString('fr-FR')}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-blue-600">+{l.depots.toLocaleString('fr-FR')}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-red-600">-{l.retraits.toLocaleString('fr-FR')}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-extrabold text-gray-900">{l.solde.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-orange-50"><td colSpan={4} className="px-3 py-2 text-xs font-extrabold uppercase text-gray-700">Total</td><td className="whitespace-nowrap px-3 py-2 text-right font-black text-gray-900">{total.toLocaleString('fr-FR')}</td></tr></tfoot>
                </table>
              </div>
            </div>
          ))}
          {Math.abs(soldeTotal - soldeTotalBanques) >= 1 && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              Les deux totaux diffèrent de {Math.abs(soldeTotal - soldeTotalBanques).toLocaleString('fr-FR')} FCFA : les soldes d'ouverture sont saisis séparément par secteur et par banque. Ils se rejoignent quand les deux sont renseignés de façon cohérente.
            </p>
          )}
        </div>
      </Modal>

      {/* Solde d'ouverture d'une banque (administration) */}
      <Modal open={!!ouvBanque} onClose={() => setOuvBanque(null)} size="sm" title={`Solde d'ouverture : ${ouvBanque?.nom || ''}`} {...glassModalProps('#0f766e')}
        footer={<><Button variant="outline" onClick={() => setOuvBanque(null)} disabled={saving}>Annuler</Button><Button style={{ backgroundColor: '#0f766e' }} onClick={enregistrerOuvertureBanque} loading={saving}>Enregistrer</Button></>}>
        {ouvBanque && (
          <div className="rounded-xl border border-white/60 bg-white/80 p-3 shadow-sm">
            <p className="mb-2 text-xs text-gray-500">Solde de cette banque avant le premier mouvement qui lui est rattaché ici. Le solde affiché pour la banque en découle.</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Date"><Input type="date" value={ouvBanque.date} onChange={(e) => setOuvBanque((x) => ({ ...x, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Montant (FCFA)"><Input type="number" value={ouvBanque.montant} onChange={(e) => setOuvBanque((x) => ({ ...x, montant: e.target.value }))} /></FormGroup>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
