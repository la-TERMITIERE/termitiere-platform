// MAXI-GYM — Facturation : liste des factures générées (depuis Séances/Abonnements).
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useMemo, useState } from 'react'
import { Receipt, FileDown, FileSpreadsheet, FileText, Pencil, Trash2, Printer, Wallet, Ticket, CreditCard, Check, AlertTriangle, BarChart3 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { usePDF } from '../../hooks/usePDF'
import { useAuth } from '../../hooks/useAuth'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { peutAdministrerGym, canExportGym } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { imprimerTicketSeance } from './printTicket'
import { exportRapportExcel } from '../../utils/excelReport'
import { genererRapportMultiPDF } from '../../utils/exportPDF'
import { categorieLabel, modePaiementLabel, indexSexeClients, sexeDe, filtrerParSexe, sexeInfo } from './data'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useSite, matchSite } from './site/useSite'
import { SexeFiltre, SexeBadge } from './SexeUI'
import { trouverManquants, facturerManquants } from './facturesManquantes'
import { exporterRapportMensuel } from './rapportMensuel'
import { useGymParams } from './useGymParams'
import { useFacturesManquantesGym } from './useFacturesManquantes'

const COULEUR = '#E8850F'

export default function Facturation() {
  const site = useSite()
  useFacturesManquantesGym(site) // les abonnements et séances du mois sans facture sont facturés automatiquement
  const { data: allFactures } = useCollection('gym_factures')
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const { data: allClients } = useCollection('gym_clients')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allSeances } = useCollection('gym_seances')
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const seances = useMemo(() => allSeances.filter((x) => matchSite(x, site)), [allSeances, site])
  const params = useGymParams(site)
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const idxSexe = useMemo(() => indexSexeClients(clients), [clients])
  const [filtreSexe, setFiltreSexe] = useState('')
  const [recherche, setRecherche] = useState('')
  const { generateFacturePDF } = usePDF('gym')
  const { user, role } = useAuth()
  const peutSupprimer = peutAdministrerGym(role)

  // Filtre de période — Jour / Mois / Année, sur la liste affichée ci-dessous.
  // Par défaut sur le MOIS EN COURS (pas « Tous ») : c'est ce qui permet au Cumul
  // facturation de correspondre, dès l'ouverture, au « Total encaissé » du
  // Dashboard (lui aussi calé sur le mois en cours) — sans ça les deux chiffres
  // divergent simplement parce qu'ils ne couvrent pas la même période.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour

  const [edit, setEdit] = useState(null)
  const [regularisation, setRegularisation] = useState(false)

  // Ventes (abonnements, séances) des MOIS PASSÉS restées sans facture : jamais comptées dans les totaux. Le mois en cours se
  // rattrape tout seul ; pour les mois passés, Info régularise ici, en connaissance de cause (les totaux de ces mois changent).
  const manquantsPasses = useMemo(
    () => trouverManquants({ factures, abonnements, seances, site, moisExclu: todayStr().slice(0, 7) }),
    [factures, abonnements, seances, site]
  )
  const sommeManquants = manquantsPasses.reduce((t, m) => t + m.montant, 0)
  async function regulariser() {
    const n = manquantsPasses.length
    if (!confirm(`Créer la facture de ${n} vente${n > 1 ? 's' : ''} des mois passés restée${n > 1 ? 's' : ''} sans facture (${formatMoney(sommeManquants)} au total) ?\nLes totaux de ces mois vont augmenter de ce montant.`)) return
    setRegularisation(true)
    try {
      const faites = await facturerManquants(manquantsPasses, { clients: allClients, site, user, max: 25 })
      toast.success(`${faites} facture${faites > 1 ? 's' : ''} créée${faites > 1 ? 's' : ''}${n > faites ? ` : il en reste ${n - faites}, cliquez à nouveau` : ''}`)
    } finally { setRegularisation(false) }
  }
  const [saving, setSaving] = useState(false)

  const toutes = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])
  // Période d'abord ; le tri par sexe s'applique ensuite (`liste`). `listePeriode`
  // sert à compter les « non précisé » sur la période affichée.
  const listePeriode = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((f) => (f.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((f) => (f.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((f) => (!filtreDebut || f.date >= filtreDebut) && (!filtreFin || f.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((f) => f.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const liste = useMemo(() => filtrerParSexe(listePeriode, filtreSexe, idxSexe).filter((f) => correspond(recherche, f.clientNom, f.numero)), [listePeriode, filtreSexe, idxSexe, recherche])
  const nbInconnus = useMemo(() => listePeriode.filter((f) => !sexeDe(f, idxSexe)).length, [listePeriode, idxSexe])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])
  // Cumuls détaillés — séances / abonnements / les deux combinés (3 KPI distincts,
  // visibles de TOUS les rôles y compris l'agent : décision explicite, contrairement
  // au reste de l'app où ces totaux restent réservés à l'administration).
  const seancesListe = useMemo(() => liste.filter((f) => f.sourceType !== 'abonnement'), [liste])
  const abonnementsListe = useMemo(() => liste.filter((f) => f.sourceType === 'abonnement'), [liste])
  const totalSeances = useMemo(() => seancesListe.reduce((s, x) => s + (Number(x.montant) || 0), 0), [seancesListe])
  const totalAbonnements = useMemo(() => abonnementsListe.reduce((s, x) => s + (Number(x.montant) || 0), 0), [abonnementsListe])

  function reimprimer(f) {
    generateFacturePDF({
      numero: f.numero, date: f.date,
      client: { nom: f.clientNom, tel: f.clientTelephone || '' },
      lignes: [{ article: f.description, qte: 1, prixUnit: f.montant, total: f.montant }],
      totalHT: f.montant, totalTTC: f.montant
    })
  }

  async function enregistrerEdit() {
    if (!edit.clientNom.trim()) return toast.error('Nom du client requis')
    if (!edit.montant || Number(edit.montant) <= 0) return toast.error('Montant requis')
    setSaving(true)
    try {
      await updateItem('gym_factures', edit.id, {
        clientNom: edit.clientNom.trim(), montant: Number(edit.montant), description: edit.description.trim()
      })
      await audit('gym', 'FACTURE_MODIFIEE', `${edit.numero} : ${edit.clientNom.trim()} : ${Number(edit.montant).toLocaleString('fr-FR')} FCFA`)
      toast.success('Facture modifiée ✓')
      setEdit(null)
    } finally { setSaving(false) }
  }

  async function supprimer(f) {
    // Une facture ne se supprime pas seule tant que sa vente existe et qu'elle en est la seule trace : la vente
    // reviendrait sans facture (et serait refacturée ou signalée). On supprime alors la vente, la facture part avec.
    const vente = f.sourceType === 'abonnement' ? abonnements.find((a) => a.id === f.sourceId)
      : f.sourceType === 'seance' ? seances.find((x) => x.id === f.sourceId) : null
    const autres = factures.filter((x) => x.id !== f.id && x.sourceType === f.sourceType && x.sourceId === f.sourceId && !x.avoir && !x.versement)
    if (vente && !f.avoir && !f.versement && autres.length === 0) {
      toast.error(`Cette facture est celle d'${f.sourceType === 'abonnement' ? 'un abonnement' : 'une séance'} encore enregistré${f.sourceType === 'abonnement' ? '' : 'e'}. Supprimez-${f.sourceType === 'abonnement' ? 'le' : 'la'} depuis ${f.sourceType === 'abonnement' ? 'Abonnements' : 'Séances'} : la facture partira avec.`)
      return
    }
    if (!confirm(`Supprimer la facture ${f.numero} de ${f.clientNom} ?`)) return
    await removeItem('gym_factures', f.id)
    await audit('gym', 'FACTURE_SUPPRIMEE', `${f.numero} : ${f.clientNom}`)
    toast.success('Facture supprimée')
  }

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel). Plutôt qu'exporter
  // aveuglément toute la liste mélangée, on demande d'abord CE QUI doit être exporté
  // (séances / abonnements / les deux) — cf. modal ci-dessous — puis on génère UNE
  // FEUILLE PAR CATÉGORIE (au lieu d'une seule liste mêlant les deux avec une colonne
  // « Origine ») : plus lisible à l'ouverture, chaque feuille a ses propres totaux.
  const [exportOpen, setExportOpen] = useState(false)
  const [exportChoix, setExportChoix] = useState('both') // 'seances' | 'abonnements' | 'both'

  // `avecOrigine` : feuille « Séances et abonnements » (les deux mélangés, avec une
  // colonne Origine) — placée EN PREMIER quand on exporte « Les deux », pour que les
  // séances ET les abonnements soient visibles dès l'ouverture du classeur (sinon seul
  // le premier onglet, « Séances », s'affichait et l'onglet « Abonnements » passait inaperçu).
  const feuilleDe = (nom, sousListe, avecOrigine = false) => {
    const rows = sousListe.map((f) => ({
      'N°': f.numero,
      'Date': formatDateShort(f.date),
      'Client': f.clientNom || '—',
      'Sexe': sexeInfo(sexeDe(f, idxSexe))?.label || '—',
      ...(avecOrigine ? { 'Origine': f.sourceType === 'abonnement' ? 'Abonnement' : 'Séance' } : {}),
      'Description': f.description || '—',
      'Montant': Number(f.montant) || 0
    }))
    return {
      name: nom,
      title: `${nom} : MAXI-GYM`,
      subtitle: avecOrigine
        ? `${sousListe.length} facture${sousListe.length > 1 ? 's' : ''} (${seancesListe.length} séance${seancesListe.length > 1 ? 's' : ''}, ${abonnementsListe.length} abonnement${abonnementsListe.length > 1 ? 's' : ''}) : ${formatMoney(rows.reduce((s, r) => s + r['Montant'], 0))} au total`
        : `${sousListe.length} ${nom.toLowerCase()}${sousListe.length > 1 ? 's' : ''} : ${formatMoney(rows.reduce((s, r) => s + r['Montant'], 0))} au total`,
      columns: [
        { key: 'N°', label: 'N°', width: 14 },
        { key: 'Date', label: 'Date', width: 12 },
        { key: 'Client', label: 'Client', width: 22 },
        { key: 'Sexe', label: 'Sexe', width: 10 },
        ...(avecOrigine ? [{ key: 'Origine', label: 'Origine', width: 14 }] : []),
        { key: 'Description', label: 'Description', width: 34 },
        { key: 'Montant', label: 'Montant', width: 16, type: 'money' }
      ],
      rows,
      totals: { __label: 'TOTAL', 'Montant': rows.reduce((s, r) => s + r['Montant'], 0) }
    }
  }

  function exportXLSX() {
    const sections = []
    if (exportChoix === 'both') sections.push(feuilleDe('Séances et abonnements', liste, true))
    if (exportChoix === 'seances' || exportChoix === 'both') sections.push(feuilleDe('Séances', seancesListe))
    if (exportChoix === 'abonnements' || exportChoix === 'both') sections.push(feuilleDe('Abonnements', abonnementsListe))
    const suffixe = exportChoix === 'seances' ? 'seances' : exportChoix === 'abonnements' ? 'abonnements' : 'completes'
    exportRapportExcel({
      filename: `factures-maxi-gym-${suffixe}-${todayStr()}.xlsx`,
      sections
    })
    setExportOpen(false)
  }

  // Synthèse littéraire par catégorie (simple/classique/vip) — remplace un
  // graphique par un court paragraphe résumant la répartition du rapport PDF.
  function syntheseParCategorie(sousListe, nom) {
    if (sousListe.length === 0) return `Aucun enregistrement "${nom}" sur la période sélectionnée.`
    const totalSection = sousListe.reduce((s, f) => s + (Number(f.montant) || 0), 0)
    const map = new Map()
    sousListe.forEach((f) => {
      const cat = categorieLabel(f.categorie) || 'Autre'
      const e = map.get(cat) || { n: 0, montant: 0 }
      e.n++; e.montant += Number(f.montant) || 0
      map.set(cat, e)
    })
    const entries = [...map.entries()].sort((a, b) => b[1].montant - a[1].montant)
    const detail = entries.map(([cat, e]) => `${cat} : ${e.n} (${formatMoney(e.montant)})`).join(' · ')
    const top = entries[0]
    return `${sousListe.length} enregistrement(s) "${nom}" sur la période, pour un total de ${formatMoney(totalSection)}. Répartition par catégorie : ${detail}. La catégorie la plus active est "${top[0]}", avec ${formatMoney(top[1].montant)} encaissés.`
  }

  const sectionPdfDe = (nom, sousListe) => {
    const totalSection = sousListe.reduce((s, f) => s + (Number(f.montant) || 0), 0)
    return {
      nom,
      sousTitre: `${sousListe.length} ${nom.toLowerCase()}${sousListe.length > 1 ? 's' : ''} · ${formatMoney(totalSection)} au total`,
      synthese: syntheseParCategorie(sousListe, nom),
      colonnes: ['N°', 'Date', 'Client', 'Sexe', 'Description', 'Montant (FCFA)'],
      lignes: sousListe.map((f) => [f.numero, formatDateShort(f.date), f.clientNom || '—', sexeInfo(sexeDe(f, idxSexe))?.label || '—', f.description || '—', (Number(f.montant) || 0).toLocaleString('fr-FR')]),
      totalRow: ['', '', '', '', 'TOTAL', totalSection.toLocaleString('fr-FR')]
    }
  }

  async function exportPDFDoc() {
    const sections = []
    if (exportChoix === 'seances' || exportChoix === 'both') sections.push(sectionPdfDe('Séances', seancesListe))
    if (exportChoix === 'abonnements' || exportChoix === 'both') sections.push(sectionPdfDe('Abonnements', abonnementsListe))
    const suffixe = exportChoix === 'seances' ? 'seances' : exportChoix === 'abonnements' ? 'abonnements' : 'completes'
    await genererRapportMultiPDF({
      titre: 'RAPPORT DE FACTURATION',
      module: 'gym',
      sections,
      fichier: `factures-maxi-gym-${suffixe}-${todayStr()}.pdf`
    })
    setExportOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Receipt size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Facturation</h2>
          <p className="text-sm text-white/80">{liste.length} facture(s) : {formatMoney(total)} au total</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
        <SexeFiltre value={filtreSexe} onChange={setFiltreSexe} inconnus={nbInconnus} />
        {canExportGym(role) && (
          <button onClick={() => setExportOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <FileSpreadsheet size={14} /> Exporter
          </button>
        )}
        {canExportGym(role) && (
          <button onClick={() => exporterRapportMensuel({ mois: (modePeriode === 'mois' && filtreMois) || todayStr().slice(0, 7), site, factures, abonnements, objectif: params.objectifMensuel })}
            title="Rapport du mois affiché : encaissements, catégories, modes de paiement, nouveaux abonnés et abonnés perdus"
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <BarChart3 size={14} /> Rapport mensuel
          </button>
        )}
      </div>

      {peutSupprimer && manquantsPasses.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 backdrop-blur-md">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1"><strong>{manquantsPasses.length} vente{manquantsPasses.length > 1 ? 's' : ''} des mois passés sans facture</strong> ({formatMoney(sommeManquants)}) : elle{manquantsPasses.length > 1 ? 's ne sont' : ' n\'est'} comptée{manquantsPasses.length > 1 ? 's' : ''} dans aucun total.</p>
          <Button onClick={regulariser} loading={regularisation}>Régulariser</Button>
        </div>
      )}

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Une facture est générée automatiquement à chaque enregistrement d'une séance ou d'un abonnement. Si une facture manque pour un enregistrement plus ancien, une icône 🧾 permet de la générer directement depuis le volet Séances/Abonnements concerné. Pour les séances, le ticket de caisse s'imprime automatiquement (imprimante thermique) : l'icône 🖨️ permet de le réimprimer à tout moment.
      </div>

      {/* 3 KPI de cumul — Séances, Abonnements, et les deux combinés — recalculés
          selon le filtre de période ci-dessous (`liste`). Visibles à TOUS les
          rôles, y compris l'agent (décision explicite). */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Cumul séances"
          value={formatMoney(totalSeances)}
          sub={`${seancesListe.length} séance${seancesListe.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={Ticket} accent={COULEUR_MODULE.gym} />
        <StatCard
          title="Cumul abonnements"
          value={formatMoney(totalAbonnements)}
          sub={`${abonnementsListe.length} abonnement${abonnementsListe.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={CreditCard} accent="#A6342A" />
        <StatCard
          title="Cumul facturation (total)"
          value={formatMoney(total)}
          sub={`${liste.length} facture${liste.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={Wallet} accent="#16a34a" />
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'numero', label: 'N°', render: (r) => <span className="font-mono text-xs">{r.numero}</span> },
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'sexe', label: 'Sexe', align: 'center', render: (r) => <SexeBadge sexe={sexeDe(r, idxSexe)} /> },
            { key: 'sourceType', label: 'Origine', render: (r) => r.avoir ? <Badge tone="danger">Remboursement</Badge> : r.versement ? <Badge tone="warning">Solde abonnement</Badge> : <Badge tone="info">{r.sourceType === 'abonnement' ? 'Abonnement' : r.sourceType === 'seance' ? 'Séance' : 'Règlement partenaire'}</Badge> },
            { key: 'modePaiement', label: 'Paiement', render: (r) => <Badge tone="neutral">{modePaiementLabel(r.modePaiement)}</Badge> },
            { key: 'description', label: 'Description', render: (r) => r.description || '—' },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong className={Number(r.montant) < 0 ? 'text-red-600' : ''}>{formatMoney(r.montant)}</strong> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                {r.sourceType === 'seance' ? (
                  <button onClick={() => imprimerTicketSeance(r)}
                    title={r.imprime === false ? 'Pas encore imprimé : cliquer pour imprimer' : 'Réimprimer le ticket'}
                    className={`rounded p-1.5 hover:bg-orange-50 ${r.imprime === false ? 'text-amber-500' : 'text-orange-600'}`}><Printer size={16} /></button>
                ) : (
                  <button onClick={() => reimprimer(r)} title="Télécharger le PDF" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><FileDown size={16} /></button>
                )}
                <button onClick={() => setEdit({ id: r.id, numero: r.numero, clientNom: r.clientNom, montant: String(r.montant), description: r.description || '' })}
                  title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                {peutSupprimer && (
                  <button onClick={() => supprimer(r)} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune facture générée pour l'instant."
        />
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Modifier la facture ${edit.numero}` : 'Modifier'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrerEdit} loading={saving}>Enregistrer</Button></>}>
        {edit && (
          <div className="space-y-3">
            <FormGroup label="Client" required>
              <Input value={edit.clientNom} onChange={(e) => setEdit((f) => ({ ...f, clientNom: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Montant (FCFA)" required>
              <Input type="number" min="0" value={edit.montant} onChange={(e) => setEdit((f) => ({ ...f, montant: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Description" hint="Optionnel">
              <Input value={edit.description} onChange={(e) => setEdit((f) => ({ ...f, description: e.target.value }))} />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Choix de l'export Excel — plutôt que d'exporter tout d'un coup, on demande
          d'abord la catégorie (séances / abonnements / les deux) : chaque catégorie
          choisie devient sa propre feuille, bien organisée, plutôt qu'une liste unique
          mélangée avec une colonne « Origine ». */}
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exporter la facturation"
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <Button variant="outline" onClick={() => setExportOpen(false)}>Annuler</Button>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Excel</Button>
          <Button onClick={exportPDFDoc}><FileText size={16} /> PDF</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Que voulez-vous exporter ? (période actuellement filtrée : {liste.length} facture(s))</p>
          <div className="flex gap-2">
            {[
              { id: 'seances', label: 'Séances', icon: Ticket, desc: `${seancesListe.length} séance${seancesListe.length > 1 ? 's' : ''}` },
              { id: 'abonnements', label: 'Abonnements', icon: CreditCard, desc: `${abonnementsListe.length} abonnement${abonnementsListe.length > 1 ? 's' : ''}` },
              { id: 'both', label: 'Les deux', icon: Wallet, desc: `${liste.length} facture${liste.length > 1 ? 's' : ''}` }
            ].map((opt) => {
              const actif = exportChoix === opt.id
              const Icone = opt.icon
              return (
                <button key={opt.id} type="button" onClick={() => setExportChoix(opt.id)}
                  className={`relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-bold transition-all ${actif ? 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                  style={actif ? { borderColor: COULEUR, background: `${COULEUR}14`, color: COULEUR } : undefined}>
                  {actif && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: COULEUR }}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <Icone size={18} />
                  <span>{opt.label}</span>
                  <span className="text-[10px] font-normal text-gray-400">{opt.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>
    </div>
  )
}
