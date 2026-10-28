// MAXI-GYM — Paramètres : tarifs, durées et validité, réservé à l'administration.
import { useEffect, useMemo, useState } from 'react'
import { Settings, Save, AlertTriangle, Trash2, Plus, Pencil, UserCog, Clock3, Ticket, CreditCard, Eraser, Archive } from 'lucide-react'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import ObjectifParam from '../comptabilite/ObjectifParam'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useAuth } from '../../hooks/useAuth'
import { peutEcrireGym, peutAdministrerGym } from '../../core/roles'
import { useCollection } from '../../hooks/useFirestore'
import { removeItem, setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { useGymParams, saveGymParams } from './useGymParams'
import { useSite, matchSite, siteLabel } from './site/useSite'
import { JOURS_SEMAINE, horairesVides } from './data'
import CoachFormModal from './CoachFormModal'
import { candidatsAutoSuppression } from './purgeClient'
import { exportRapportExcel } from '../../utils/excelReport'
import { categorieLabel } from './data'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { ChampUnite, BoutonGym } from './uiHelpers'

const COULEUR = '#E8850F'
// Le mot RÉELLEMENT attendu est en minuscules sans accent, alors que l'écran
// l'affiche en MAJUSCULES (cf. .toUpperCase() plus bas) et que la comparaison est
// STRICTE. Volontaire : quelqu'un qui recopie machinalement ce qui est affiché (ou
// colle une capture) échoue ; l'opérateur légitime sait qu'il faut taper
// « reinitialiser » en minuscules. Friction anti-malveillance sur une suppression
// définitive des données de la salle.
const TEXTE_CONFIRMATION = 'reinitialiser'

// Collections vidées par la réinitialisation — uniquement les données propres à
// LA SALLE COURANTE (séances/abonnements/factures/présences/clients portent tous
// un champ `site`). L'autre salle n'est jamais touchée. Les forfaits personnalisés
// et les réglages (tarifs/durées, cf. `gym_params`) restent intacts : ils sont
// communs aux deux salles, et ce sont des paramètres de configuration, pas des
// données d'activité à remettre à zéro.
const COLLECTIONS_A_VIDER = [
  { nom: 'gym_seances', label: 'Séances' },
  { nom: 'gym_abonnements', label: 'Abonnements' },
  { nom: 'gym_clients', label: 'Clients' },
  { nom: 'gym_factures', label: 'Factures' },
  { nom: 'gym_presences', label: 'Arrivées pointées' },
  { nom: 'gym_coachs', label: 'Coachs' },
  { nom: 'gym_pointages_coach', label: 'Pointages coachs' },
  { nom: 'gym_reglements_partenaires', label: 'Règlements partenaires' }
]

export default function Params() {
  const { user, role } = useAuth()
  const lectureSeule = !peutEcrireGym(role)
  const site = useSite()
  const params = useGymParams(site)
  const [form, setForm] = useState(params)
  const [saving, setSaving] = useState(false)

  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const { data: allCoachs } = useCollection('gym_coachs')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  const { data: allReglementsPart } = useCollection('gym_reglements_partenaires')
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const coachs = useMemo(() => allCoachs.filter((c) => matchSite(c, site)), [allCoachs, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  const reglementsPart = useMemo(() => allReglementsPart.filter((r) => matchSite(r, site)), [allReglementsPart, site])
  const donnees = {
    gym_seances: seances, gym_abonnements: abonnements, gym_clients: clients, gym_factures: factures,
    gym_presences: presences, gym_coachs: coachs, gym_pointages_coach: pointagesCoach,
    gym_reglements_partenaires: reglementsPart
  }
  const totalEnregistrements = COLLECTIONS_A_VIDER.reduce((s, c) => s + (donnees[c.nom]?.length || 0), 0)

  // ── Coachs : planning hebdomadaire (programmation des jours/heures d'arrivée) ──
  // L'ajout/la modification se font via CoachFormModal, partagée avec le volet
  // Coachs (ouvert aux agents) — seule la suppression reste ici, réservée à
  // l'administration (les agents n'ont pas accès à Paramètres).
  const [coachModal, setCoachModal] = useState(null) // { id?, nom, horaires }

  async function supprimerCoach(c) {
    if (!window.confirm(`Retirer le coach « ${c.nom} » ? Son historique de pointage reste conservé.`)) return
    await removeItem('gym_coachs', c.id)
    await audit('gym', 'COACH_DELETE', `${c.nom} : ${siteLabel(site)}`)
    toast.success('Coach retiré')
  }
  const nbJoursProgrammes = (c) => Object.values(c.horaires || {}).filter((h) => h?.actif).length

  // ── Archivage des anciennes séances : allège la base sans perdre le chiffre d'affaires ──
  // Les séances de plus de N mois sont exportées en Excel, résumées par mois (`gym_archives`), puis retirées. Les FACTURES
  // restent : les totaux d'argent ne changent pas. Jamais archivées : séances de partenaires non encore réglées, et séances
  // sans facture (leur vente disparaîtrait des totaux).
  const peutArchiver = peutAdministrerGym(role)
  const [moisArchive, setMoisArchive] = useState(12)
  const [archivage, setArchivage] = useState(null) // { fait, total }
  const limiteArchive = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - Math.max(6, Number(moisArchive) || 12))
    return d.toISOString().slice(0, 10)
  }, [moisArchive])
  const seancesArchivables = useMemo(() => {
    const liees = new Set(factures.filter((f) => f.sourceType === 'seance' && f.sourceId).map((f) => f.sourceId))
    return seances.filter((s) => (s.date || '') < limiteArchive && !(s.partenaire && !s.regleParPartenaire) && (s.partenaire || liees.has(s.id)))
  }, [seances, factures, limiteArchive])
  const montantArchivable = seancesArchivables.reduce((t, s) => t + (Number(s.montant) || 0), 0)
  async function archiverSeances() {
    if (!peutArchiver || archivage) return
    const lot = seancesArchivables.slice(0, 300)
    if (!window.confirm(`Archiver ${lot.length} séance${lot.length > 1 ? 's' : ''} de plus de ${Math.max(6, Number(moisArchive) || 12)} mois (${formatMoney(lot.reduce((t, s) => t + (Number(s.montant) || 0), 0))}) ?\n\n1. Un fichier Excel de ces séances est d'abord téléchargé : gardez-le.\n2. Un résumé par mois est conservé.\n3. Les séances sont ensuite retirées de la base. Les factures restent : l'argent encaissé ne change pas.\n\nAction définitive.`)) return
    setArchivage({ fait: 0, total: lot.length })
    try {
      exportRapportExcel({
        filename: `archive-seances-${site}-${limiteArchive}.xlsx`,
        sections: [{
          id: 'archive', name: 'Séances archivées', title: `MAXI-GYM ${siteLabel(site)} : séances archivées`, subtitle: `Avant le ${formatDateShort(limiteArchive)} : ${lot.length} séance(s)`,
          columns: [{ key: 'date', label: 'Date', width: 14 }, { key: 'client', label: 'Client', width: 26 }, { key: 'categorie', label: 'Catégorie', width: 18 }, { key: 'montant', label: 'Montant', width: 14, type: 'money' }, { key: 'par', label: 'Enregistrée par', width: 20 }],
          rows: lot.map((s) => ({ date: s.date, client: s.clientNom, categorie: categorieLabel(s.categorie), montant: Number(s.montant) || 0, par: s.enregistrePar || '' })),
          totals: { __label: 'TOTAL', montant: lot.reduce((t, s) => t + (Number(s.montant) || 0), 0) }
        }]
      })
      // Résumé par mois (cumulé si ce mois a déjà été archivé en partie).
      const parMois = new Map()
      lot.forEach((s) => {
        const m = (s.date || '').slice(0, 7)
        const e = parMois.get(m) || { nb: 0, montant: 0, parCategorie: {} }
        e.nb += 1; e.montant += Number(s.montant) || 0
        const k = categorieLabel(s.categorie); e.parCategorie[k] = (e.parCategorie[k] || 0) + (Number(s.montant) || 0)
        parMois.set(m, e)
      })
      const anciens = await import('../../core/db').then((db) => db.getAll('gym_archives')).catch(() => [])
      for (const [m, e] of parMois) {
        const avant = anciens.find((a) => a.id === `${site}-${m}`)
        const cumul = { nb: (avant?.nb || 0) + e.nb, montant: (avant?.montant || 0) + e.montant, parCategorie: { ...(avant?.parCategorie || {}) } }
        Object.entries(e.parCategorie).forEach(([k, v]) => { cumul.parCategorie[k] = (cumul.parCategorie[k] || 0) + v })
        await setItem('gym_archives', `${site}-${m}`, { id: `${site}-${m}`, site, mois: m, ...cumul, archiveLe: Date.now() })
      }
      let fait = 0
      for (const s of lot) {
        await removeItem('gym_seances', s.id, { sansMotif: true })
        fait += 1
        if (fait % 10 === 0 || fait === lot.length) setArchivage({ fait, total: lot.length })
        await new Promise((r) => setTimeout(r, 260))
      }
      await audit('gym', 'SEANCES_ARCHIVEES', `MAXI-GYM ${siteLabel(site)} : ${lot.length} séance(s) d'avant le ${limiteArchive} archivée(s) (${lot.reduce((t, s) => t + (Number(s.montant) || 0), 0).toLocaleString('fr-FR')} FCFA)`)
      toast.success(`${lot.length} séance${lot.length > 1 ? 's' : ''} archivée${lot.length > 1 ? 's' : ''} ✓${seancesArchivables.length > lot.length ? ` : il en reste ${seancesArchivables.length - lot.length}, relancez` : ''}`)
    } catch (e) {
      console.error('[gym] archivage échoué', e)
      toast.error(e?.message || 'L\'archivage a échoué : vérifiez les séances restantes')
    } finally { setArchivage(null) }
  }

  const [confirmTexte, setConfirmTexte] = useState('')
  const [resetting, setResetting] = useState(false)

  async function reinitialiserTout() {
    if (confirmTexte !== TEXTE_CONFIRMATION) return
    setResetting(true)
    try {
      let compte = 0
      for (const c of COLLECTIONS_A_VIDER) {
        for (const item of donnees[c.nom] || []) {
          await removeItem(c.nom, item.id)
          compte += 1
        }
      }
      // L'audit est fait en best-effort : s'il échoue (ex. droit refusé sur le
      // journal), on ne veut pas faire croire à l'utilisateur que la suppression
      // elle-même a échoué alors que les données sont bel et bien parties.
      try {
        await audit('gym', 'RESET_TOTAL', `Réinitialisation de MAXI-GYM ${siteLabel(site)} par ${user?.nom || user?.login || '—'} : ${compte} enregistrement(s) supprimé(s)`)
      } catch (e) {
        console.warn('[gym] audit RESET_TOTAL non enregistré :', e)
      }
      toast.success(`MAXI-GYM ${siteLabel(site)} réinitialisé ✓ (${compte} enregistrement${compte > 1 ? 's' : ''} supprimé${compte > 1 ? 's' : ''})`)
      setConfirmTexte('')
    } catch (e) {
      // Auparavant silencieux : une erreur ici (ex. droit refusé par les règles
      // Firebase) arrêtait la boucle sans aucun message — impression que « rien
      // ne se passe » alors qu'une suppression a en réalité échoué en coulisse.
      console.error('[gym] réinitialisation MAXI-GYM échouée :', e)
      toast.error(e?.message || 'La réinitialisation a échoué : voir la console pour le détail.')
    } finally {
      setResetting(false)
    }
  }

  // Les valeurs chargées depuis Firebase arrivent après le premier rendu — on
  // resynchronise le formulaire dès qu'elles sont disponibles (une seule fois,
  // pour ne pas écraser une saisie en cours si le doc change entre-temps ailleurs),
  // et aussi si on change de salle (chaque salle a ses propres réglages).
  useEffect(() => { setForm(params) }, [site, params.tarifSeanceSimple, params.tarifSeanceVip, params.tarifAbonnementSimple, params.tarifAbonnementVip, params.tarifAbonnementClassique, params.dureeClassiqueMinJours, params.validiteSeanceHeures, params.objectifMensuel, params.autoSuppressionActive, params.delaiSuppressionAbonneJours, params.delaiSuppressionSeanceJours])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }))
  // Champ nullable : vide = comportement libre historique (Classique), un nombre = prix fixe.
  const setNullable = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v === '' ? null : (Number(v) || 0) })) }

  // Clients qui seraient supprimés MAINTENANT avec les délais saisis : aperçu avant d'activer la suppression automatique.
  const delais = { ...form, delaiSuppressionAbonneJours: Math.max(1, Number(form.delaiSuppressionAbonneJours) || 1), delaiSuppressionSeanceJours: Math.max(1, Number(form.delaiSuppressionSeanceJours) || 1) }
  const candidatsSuppression = useMemo(
    () => candidatsAutoSuppression({ clients, abonnements, seances, presences, params: delais, site }),
    [clients, abonnements, seances, presences, site, delais.validiteSeanceHeures, delais.delaiSuppressionAbonneJours, delais.delaiSuppressionSeanceJours] // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function enregistrer() {
    if (form.autoSuppressionActive && !params.autoSuppressionActive && candidatsSuppression.length > 0) {
      if (!window.confirm(`En activant la suppression automatique, ${candidatsSuppression.length} client(s) déjà terminé(s) seront supprimés dès la prochaine ouverture du Dashboard par l'administration. Continuer ?`)) return
    }
    setSaving(true)
    try {
      await saveGymParams({ ...form, delaiSuppressionAbonneJours: delais.delaiSuppressionAbonneJours, delaiSuppressionSeanceJours: delais.delaiSuppressionSeanceJours }, user, site)
      toast.success('Réglages enregistrés ✓')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Settings size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Paramètres</h2>
          <p className="text-sm text-white/80">Tarifs, durées et validité : MAXI-GYM {siteLabel(site)}</p>
        </div>
      </div>

      {lectureSeule && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          Lecture seule : dans MAXI-GYM, seuls les agents, Info et Assistant PAU peuvent modifier les réglages.
        </div>
      )}
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
        Ces réglages sont propres à <strong>{siteLabel(site)}</strong> : l'autre salle a les siens, indépendants.
      </div>

      <ParamsGrille>
      <ParamsCarte icone={Ticket} couleur={COULEUR} titre="Tarifs des séances (FCFA)">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Simple">
            <ChampUnite unite="FCFA" min="0" value={form.tarifSeanceSimple} onChange={set('tarifSeanceSimple')} />
          </FormGroup>
          <FormGroup label="VIP">
            <ChampUnite unite="FCFA" min="0" value={form.tarifSeanceVip} onChange={set('tarifSeanceVip')} />
          </FormGroup>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Le Classique n'a pas de tarif fixe : prix libre à la saisie.</p>
      </ParamsCarte>

      <ParamsCarte icone={CreditCard} couleur={COULEUR} titre="Tarifs des abonnements (FCFA)">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Simple">
            <ChampUnite unite="FCFA" min="0" value={form.tarifAbonnementSimple} onChange={set('tarifAbonnementSimple')} />
          </FormGroup>
          <FormGroup label="VIP">
            <ChampUnite unite="FCFA" min="0" value={form.tarifAbonnementVip} onChange={set('tarifAbonnementVip')} />
          </FormGroup>
        </div>
        <FormGroup label="Classique" className="mt-3" hint="Laisser vide = prix ET durée libres à la saisie (comportement historique). Un montant = prix fixe, durée fixe 1 mois (comme Simple/VIP).">
          <ChampUnite unite="FCFA" min="0" value={form.tarifAbonnementClassique ?? ''} onChange={setNullable('tarifAbonnementClassique')} placeholder="Vide = prix libre" />
        </FormGroup>
        <p className="mt-1 text-[11px] text-gray-400">
          {form.tarifAbonnementClassique != null
            ? 'Classique à prix fixe : durée fixe 1 mois calendaire, comme Simple/VIP.'
            : 'Simple et VIP sont toujours valables 1 mois calendaire. Le Classique n\'a pas de tarif fixe.'}
        </p>
      </ParamsCarte>

      <ParamsCarte icone={Clock3} couleur={COULEUR} titre="Durées et validité">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Validité d'une séance (heures)">
            <ChampUnite unite="heures" min="1" value={form.validiteSeanceHeures} onChange={set('validiteSeanceHeures')} />
          </FormGroup>
          <FormGroup label="Durée minimale : Abonnement Classique (jours)"
            hint={form.tarifAbonnementClassique != null ? 'Sans effet ici : Classique est à prix/durée fixe pour cette salle.' : undefined}>
            <ChampUnite unite="jours" min="1" value={form.dureeClassiqueMinJours} onChange={set('dureeClassiqueMinJours')} disabled={form.tarifAbonnementClassique != null} />
          </FormGroup>
        </div>
      </ParamsCarte>

      <ObjectifParam poleId={`gym_${site}`} couleur={COULEUR} moduleId="gym" large={false} />

      <ParamsCarte icone={Eraser} couleur={COULEUR} titre="Suppression automatique des clients" large>
        <p className="mb-3 text-xs text-gray-500">
          Libère la base : une fois l'abonnement (ou la séance) terminé depuis plus longtemps que le délai ci-dessous, le client disparaît totalement
          (fiche, abonnements, séances et arrivées pointées). Les factures restent, donc le chiffre d'affaires aussi.
          Elle s'applique quand l'administration ouvre le Dashboard de la salle.
        </p>
        <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
          <input type="checkbox" checked={!!form.autoSuppressionActive}
            onChange={(e) => setForm((f) => ({ ...f, autoSuppressionActive: e.target.checked }))}
            className="h-4 w-4 shrink-0 accent-orange-600" />
          <span className="text-sm font-semibold text-gray-800">Activer la suppression automatique pour {siteLabel(site)}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Abonnés : délai après la fin de l'abonnement" hint="Par défaut 90 jours (3 mois).">
            <ChampUnite unite="jours" min="1" value={form.delaiSuppressionAbonneJours} onChange={set('delaiSuppressionAbonneJours')} />
          </FormGroup>
          <FormGroup label="Clients de séances : délai après la dernière séance" hint="Par défaut 30 jours.">
            <ChampUnite unite="jours" min="1" value={form.delaiSuppressionSeanceJours} onChange={set('delaiSuppressionSeanceJours')} />
          </FormGroup>
        </div>
        <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-semibold ${candidatsSuppression.length ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'}`}>
          {candidatsSuppression.length
            ? `Avec ces délais, ${candidatsSuppression.length} client(s) seraient supprimés dès maintenant : ${candidatsSuppression.slice(0, 5).map((c) => c.dossier.nom).join(', ')}${candidatsSuppression.length > 5 ? '…' : ''}`
            : 'Avec ces délais, aucun client ne serait supprimé pour le moment.'}
        </p>
      </ParamsCarte>

      {peutArchiver && (
        <ParamsCarte icone={Archive} couleur={COULEUR} titre="Archivage des anciennes séances">
          <p className="mb-3 text-xs text-gray-500">
            Allège la base : les séances anciennes sont exportées en Excel, résumées par mois, puis retirées. Les <strong>factures restent</strong>, donc les montants encaissés ne changent pas.
            Les séances de partenaires non réglées et les séances sans facture ne sont jamais archivées.
          </p>
          <FormGroup label="Archiver les séances de plus de" hint="Minimum 6 mois. Par défaut 12 mois.">
            <ChampUnite unite="mois" min="6" value={moisArchive} onChange={(e) => setMoisArchive(e.target.value)} />
          </FormGroup>
          <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-semibold ${seancesArchivables.length ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'}`}>
            {seancesArchivables.length
              ? `${seancesArchivables.length} séance${seancesArchivables.length > 1 ? 's' : ''} d'avant le ${formatDateShort(limiteArchive)} (${formatMoney(montantArchivable)}) peuvent être archivées${seancesArchivables.length > 300 ? ', 300 à la fois' : ''}.`
              : `Aucune séance à archiver avant le ${formatDateShort(limiteArchive)}.`}
          </p>
          {archivage && <p className="mt-2 text-xs font-semibold text-orange-700">Archivage en cours : {archivage.fait} / {archivage.total}. Ne fermez pas la page.</p>}
          <BoutonGym variante="secondaire" icone={Archive} className="mt-3" onClick={archiverSeances} loading={!!archivage} disabled={!seancesArchivables.length}>Exporter en Excel puis archiver</BoutonGym>
        </ParamsCarte>
      )}

      <div className="flex justify-end lg:col-span-2">
        <BoutonGym icone={Save} onClick={enregistrer} loading={saving} disabled={lectureSeule}>Enregistrer les réglages</BoutonGym>
      </div>

      <ParamsCarte icone={UserCog} couleur={COULEUR} titre="Coachs" large>
        <p className="mb-3 text-xs text-gray-500">
          Planning hebdomadaire par coach : jours de présence et heure d'arrivée prévue. Le pointage réel se fait depuis le volet « Coachs ».
        </p>
        <div className="space-y-2">
          {coachs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-l-4 border-gray-200 bg-orange-50/40 px-3 py-2.5" style={{ borderLeftColor: COULEUR }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${COULEUR}, #A6342A)` }}>
                  <UserCog size={14} />
                </span>
                <div className="min-w-0">
                <p className="font-semibold text-gray-800">{c.nom}</p>
                <p className="text-xs text-gray-500">
                  {nbJoursProgrammes(c) > 0
                    ? JOURS_SEMAINE.filter((j) => c.horaires?.[j.id]?.actif).map((j) => `${j.label.slice(0, 3)} ${c.horaires[j.id].heure}`).join(' · ')
                    : 'Aucun jour programmé'}
                </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setCoachModal({ id: c.id, nom: c.nom, horaires: { ...horairesVides(), ...c.horaires }, objectifAbonnements: c.objectifAbonnements ?? '', primeParAbonnement: c.primeParAbonnement ?? '' })} className="rounded-2xl p-1.5 text-indigo-600 hover:bg-indigo-50" title="Modifier"><Pencil size={15} /></button>
                <button onClick={() => supprimerCoach(c)} className="rounded-2xl p-1.5 text-red-500 hover:bg-red-50" title="Retirer"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {!coachs.length && <p className="py-4 text-center text-sm text-gray-400">Aucun coach enregistré pour {siteLabel(site)}.</p>}
        </div>
        <BoutonGym variante="secondaire" icone={Plus} className="mt-3" disabled={lectureSeule} onClick={() => setCoachModal({ nom: '', horaires: horairesVides() })}>Ajouter un coach</BoutonGym>
      </ParamsCarte>

      <ParamsCarte icone={AlertTriangle} danger large titre={`Zone de danger : Réinitialiser MAXI-GYM ${siteLabel(site)}`}>
        <p className="mb-3 text-sm text-red-800">
          Supprime <strong>définitivement et sans possibilité de retour</strong> les données de la salle <strong>{siteLabel(site)}</strong> uniquement : l'autre salle n'est pas affectée, de même que les forfaits personnalisés, communs aux deux salles :
        </p>
        <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-red-700">
          {COLLECTIONS_A_VIDER.map((c) => (
            <li key={c.nom} className="flex items-center justify-between">
              <span>{c.label}</span>
              <span className="font-bold">{donnees[c.nom]?.length || 0}</span>
            </li>
          ))}
        </ul>
        <p className="mb-3 text-xs text-red-600">
          Total : <strong>{totalEnregistrements} enregistrement(s)</strong>. Les tarifs et réglages ci-dessus ne sont pas touchés.
        </p>
        <FormGroup label={`Pour confirmer, recopiez exactement : « ${TEXTE_CONFIRMATION.toUpperCase()} »`}>
          <Input value={confirmTexte} onChange={(e) => setConfirmTexte(e.target.value)} placeholder={TEXTE_CONFIRMATION.toUpperCase()}
            className="border-red-300 focus:border-red-500 focus:ring-red-400/40" />
        </FormGroup>
        <BoutonGym variante="danger" icone={Trash2} disabled={lectureSeule || confirmTexte !== TEXTE_CONFIRMATION || totalEnregistrements === 0}
          loading={resetting} onClick={reinitialiserTout}>
          Réinitialiser définitivement MAXI-GYM {siteLabel(site)}
        </BoutonGym>
      </ParamsCarte>

      </ParamsGrille>

      <CoachFormModal coachModal={coachModal} setCoachModal={setCoachModal} site={site} />
    </div>
  )
}
