// MAXI-GYM — Abonnements : liste complète + ajout d'un abonnement.
// Simple / VIP : durée fixe 1 mois, tarif fixe. Classique : durée ET tarif libres.
import { useMemo, useState } from 'react'
import { CreditCard, Plus, Trash2, CheckCircle2, Pencil, User, MessageCircle, Receipt, CalendarDays } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { sendWhatsApp } from '../../core/whatsapp'
import { isFullAccessRole } from '../../core/roles'
import { todayStr, formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { CATEGORIES_GYM, categorieLabel, categorieTone, categorieDesc, dateFinAbonnement, dureeJoursMoisDefaut, abonnementActif, statutAbonnement, joursDepuis, genQrToken, QR_CARNET_ACTIF } from './data'
import { useGymParams } from './useGymParams'
import { genererFactureGym } from './genererFacture'
import ClientDetailModal from './ClientDetailModal'
import QrCarnetModal from './QrCarnetModal'
import CalendrierPresences from './CalendrierPresences'
import { useSite, matchSite } from './site/useSite'

const COULEUR = '#A6342A'
const COULEUR2 = '#E8850F'
const COULEUR_CATEGORIE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }
const heureCourte = (d) => d.toTimeString().slice(0, 5)

// Recalcule `dateFin` à partir de la DATE DE DÉBUT + durée — sauf si l'utilisateur
// l'a déjà corrigée manuellement (`dateFinManuelle`), auquel cas on la laisse intacte.
// `dateDebut` = début effectif de l'abonnement (par défaut = date de souscription,
// mais peut être une date future si le client commence plus tard).
function recalculerDateFin(next) {
  if (next.dateFinManuelle) return next
  return { ...next, dateFin: dateFinAbonnement(next.dateDebut || next.date, next.dureeJours) }
}

// Durée (jours) à pré-remplir pour une catégorie donnée — Classique libre garde son
// minimum réglable depuis Paramètres, toutes les autres (Simple/VIP/Classique fixe)
// démarrent sur l'équivalent d'1 mois calendaire, mais restent modifiables ensuite
// (abonnement plus court ou plus long qu'un mois).
function dureeJoursInitiale(categorie, date, classiqueFixe, dureeMin) {
  if (categorie === 'classique' && !classiqueFixe) return String(dureeMin)
  return String(dureeJoursMoisDefaut(date))
}

export default function Abonnements() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  // Coach à attribuer à un abonnement du jour `date` — seulement si un SEUL coach a
  // été pointé présent ce jour-là (aucun ou plusieurs coachs présents → ambigu, on
  // laisse l'abonnement sans coach plutôt que de deviner). Sert au suivi de
  // performance par coach (cf. Coachs.jsx), au-delà de la simple corrélation par jour.
  function coachDuJour(date) {
    const idsUniques = [...new Set(pointagesCoach.filter((p) => p.date === date).map((p) => p.coachId))]
    if (idsUniques.length !== 1) return { coachId: null, coachNom: null }
    const p = pointagesCoach.find((x) => x.date === date && x.coachId === idsUniques[0])
    return { coachId: p.coachId, coachNom: p.coachNom }
  }
  const peutSupprimer = isFullAccessRole(role)
  const params = useGymParams(site)
  const dureeMin = params.dureeClassiqueMinJours
  // Classique à prix FIXE (Kara) : `tarifAbonnementClassique` non nul — se comporte
  // alors comme Simple/VIP (durée fixe 1 mois, prix pré-rempli). `null` (Lomé, par
  // défaut) : Classique garde son prix ET sa durée libres à la saisie.
  const classiqueFixe = params.tarifAbonnementClassique != null
  const tarifs = { simple: params.tarifAbonnementSimple, classique: params.tarifAbonnementClassique, vip: params.tarifAbonnementVip }

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [suggClient, setSuggClient] = useState(false)
  const [clientDetail, setClientDetail] = useState(null)
  const [qrNouveauClient, setQrNouveauClient] = useState(null)
  const [calendrierClient, setCalendrierClient] = useState(null) // abonnement dont on regarde/corrige le calendrier
  const [dateSelectionnee, setDateSelectionnee] = useState(null) // jour cliqué dans ce calendrier, à pointer
  const moisEnCours = todayStr().slice(0, 7)

  // Filtre de période — Jour / Mois / Année / Plage, sur la liste affichée ci-dessous.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')

  const vide = () => {
    const date = todayStr(), categorie = CATEGORIES_GYM[0].id
    const dureeJours = dureeJoursInitiale(categorie, date, classiqueFixe, dureeMin)
    return {
      id: null, date, dateDebut: date, dateDebutManuelle: false,
      clientNom: '', telephone: '', categorie, dureeJours,
      dateFin: dateFinAbonnement(date, dureeJours), dateFinManuelle: false,
      montant: String(tarifs[categorie] || ''), notes: ''
    }
  }
  // Durée d'origine d'un abonnement existant : si elle n'a pas été enregistrée (ancien
  // abonnement Simple/VIP, avant cette fonctionnalité), on la reconstitue exactement à
  // partir des dates déjà enregistrées plutôt que d'appliquer un défaut approximatif.
  const remplir = (a) => {
    const dateDebut = a.dateDebut || a.date // abonnements antérieurs : début = souscription
    return {
      id: a.id, date: a.date, dateDebut, dateDebutManuelle: dateDebut !== a.date,
      clientNom: a.clientNom, telephone: '', categorie: a.categorie,
      dureeJours: a.dureeJours != null ? String(a.dureeJours) : String(Math.max(1, Math.round((new Date(a.dateFin) - new Date(dateDebut)) / 86400000))),
      dateFin: a.dateFin, dateFinManuelle: true,
      montant: String(a.montant), notes: a.notes || ''
    }
  }

  const toutes = useMemo(() => [...abonnements].sort((a, b) => (a.date < b.date ? 1 : -1)), [abonnements])
  const liste = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((a) => (a.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((a) => (a.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((a) => (!filtreDebut || a.date >= filtreDebut) && (!filtreFin || a.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((a) => a.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

  // Dernière arrivée pointée par client — sert à afficher/estimer l'inactivité.
  const dernierePresenceParClient = useMemo(() => {
    const m = new Map()
    for (const p of presences) {
      const cle = (p.clientNom || '').trim().toLowerCase()
      if (!cle) continue
      if (!m.has(cle) || p.date > m.get(cle)) m.set(cle, p.date)
    }
    return m
  }, [presences])

  async function enregistrer() {
    const d = modal
    if (!d.clientNom.trim()) return toast.error('Nom du client requis')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    // Le prix reste modifiable (ex. tarif négocié, majoration) mais ne peut pas descendre
    // sous le tarif de référence de Paramètres — plancher, pas prix imposé. Un Classique
    // à prix libre (Lomé) n'a pas de tarif de référence : aucun plancher ne s'applique.
    const tarifPlancher = (d.categorie === 'classique' && !classiqueFixe) ? null : tarifs[d.categorie]
    if (tarifPlancher > 0 && Number(d.montant) < tarifPlancher) {
      return toast.error(`Le montant ne peut pas être inférieur à ${formatMoney(tarifPlancher)} pour cette catégorie (tarif de Paramètres)`)
    }
    if (d.categorie === 'classique' && !classiqueFixe && (!d.dureeJours || Number(d.dureeJours) < dureeMin)) return toast.error(`Durée requise (minimum ${dureeMin} jours) pour un abonnement Classique`)
    if (!d.dateFin) return toast.error('Date de fin requise')
    setSaving(true)
    try {
      const dateFin = d.dateFin
      const clientNom = d.clientNom.trim()

      // Modification d'un abonnement existant — pas de nouvelle création de client, pas
      // de nouvelle facture ni de nouveau WhatsApp (déjà envoyés à l'enregistrement initial).
      const dateDebut = d.dateDebut || d.date

      if (d.id) {
        const { coachId, coachNom } = coachDuJour(d.date)
        await updateItem('gym_abonnements', d.id, {
          date: d.date, dateDebut, dateFin, clientNom, categorie: d.categorie,
          dureeJours: d.dureeJours ? Number(d.dureeJours) : null,
          montant: Number(d.montant), notes: d.notes.trim(), coachId, coachNom
        })
        await audit('gym', 'ABONNEMENT_MODIFIE', `${clientNom} — ${categorieLabel(d.categorie)} — ${dateDebut !== d.date ? `du ${dateDebut} ` : ''}jusqu'au ${dateFin} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Abonnement modifié ✓')
        setModal(null)
        return
      }

      const { coachId, coachNom } = coachDuJour(d.date)
      const id = await addItem('gym_abonnements', {
        date: d.date, dateDebut, dateFin, clientNom, categorie: d.categorie,
        dureeJours: (d.categorie === 'classique' && !classiqueFixe) ? Number(d.dureeJours) : null,
        montant: Number(d.montant), notes: d.notes.trim(), site, coachId, coachNom,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'ABONNEMENT_CREATE', `${clientNom} — ${categorieLabel(d.categorie)} — ${dateDebut !== d.date ? `du ${dateDebut} ` : ''}jusqu'au ${dateFin} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
      // Le répertoire Clients se construit uniquement à partir des séances/abonnements
      // réellement enregistrés — pas d'ajout manuel possible (cf. Clients.jsx). La
      // fiche est rattachée à la salle : le même nom peut donc exister des deux côtés,
      // chaque salle gardant sa propre clientèle.
      const telephoneSaisi = d.telephone.trim()
      let client = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
      let nouveauClient = null
      if (!client) {
        const qrToken = genQrToken()
        const nouveauClientId = await addItem('gym_clients', { nom: clientNom, telephone: telephoneSaisi, notes: '', site, qrToken, createdAt: Date.now() })
        nouveauClient = { id: nouveauClientId, nom: clientNom, qrToken }
      } else if (telephoneSaisi && !client.telephone) {
        await updateItem('gym_clients', client.id, { telephone: telephoneSaisi })
      }
      const telephone = telephoneSaisi || client?.telephone
      if (telephone) {
        const validite = dateDebut !== d.date
          ? `valable du ${formatDateShort(dateDebut)} au ${formatDateShort(dateFin)}`
          : `valable jusqu'au ${formatDateShort(dateFin)}`
        sendWhatsApp([telephone], {
          title: '🎉 MAXI-GYM',
          body: `Bonjour ${clientNom}, votre abonnement ${categorieLabel(d.categorie)} a bien été enregistré, ${validite}. Bel abonnement à MAXI-GYM ! 🏋️`
        })
      }
      // Une facture est TOUJOURS générée (visible dans le volet Facturation, avec
      // son propre bouton de téléchargement) — plus besoin de case à cocher.
      await genererFactureGym({
        factures, sourceType: 'abonnement', sourceId: id, clientNom, clientTelephone: telephone,
        categorie: d.categorie, description: `Abonnement ${categorieLabel(d.categorie)} — jusqu'au ${dateFin}`, montant: d.montant,
        user, site, date: d.date
      })
      toast.success('Abonnement enregistré ✓')
      setModal(null)
      // Nouveau client : on propose tout de suite son QR carnet, pendant qu'il
      // est encore devant la réception — masqué tant que QR_CARNET_ACTIF est faux.
      if (nouveauClient && QR_CARNET_ACTIF) setQrNouveauClient(nouveauClient)
    } finally { setSaving(false) }
  }

  // Facture un abonnement existant qui n'en a pas encore (ex. enregistré avant ce
  // changement) — sans re-déclencher le WhatsApp ni recréer le client.
  async function facturer(a) {
    const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase())
    await genererFactureGym({
      factures, sourceType: 'abonnement', sourceId: a.id, clientNom: a.clientNom, clientTelephone: client?.telephone,
      categorie: a.categorie, description: `Abonnement ${categorieLabel(a.categorie)} — jusqu'au ${a.dateFin}`, montant: a.montant,
      user, site, date: a.date
    })
    toast.success('Facture générée ✓')
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer l'abonnement de ${a.clientNom} (${categorieLabel(a.categorie)}) ?`)) return
    await removeItem('gym_abonnements', a.id)
    await audit('gym', 'ABONNEMENT_DELETE', `${a.clientNom} — ${categorieLabel(a.categorie)} — ${Number(a.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Abonnement supprimé')
  }

  // Pointage d'arrivée — un abonné vient d'arriver à la salle : on l'enregistre (sert
  // à calculer son inactivité pour l'alerte « à relancer » du Dashboard) et on lui
  // souhaite une bonne séance par WhatsApp si son numéro est connu. `date` par défaut
  // = aujourd'hui (bouton rapide de la liste), mais peut être une date passée — en
  // cliquant sur un jour du calendrier rapide (cf. modale « Calendrier », plus bas) —
  // pour corriger un oubli de pointage (ex. client venu hier).
  const [pointageBusy, setPointageBusy] = useState(null)
  async function pointerArrivee(a, date = todayStr()) {
    const dejaPointe = allPresences.some((p) =>
      matchSite(p, site) && p.date === date && (p.clientNom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase()
    )
    if (dejaPointe) { toast.error(`${a.clientNom} est déjà pointé(e) pour le ${formatDateShort(date)}`); return }
    setPointageBusy(a.id)
    try {
      await addItem('gym_presences', {
        clientNom: a.clientNom, abonnementId: a.id, date, createdAt: Date.now(), site,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null
      })
      await audit('gym', 'PRESENCE_POINTEE', `${a.clientNom} — arrivée pointée (${formatDateShort(date)})`)
      const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase())
      if (client?.telephone && date === todayStr()) {
        sendWhatsApp([client.telephone], {
          title: '🏋️ MAXI-GYM',
          body: `Bonjour ${a.clientNom}, bonne séance à MAXI-GYM aujourd'hui ! 💪`
        })
      }
      toast.success(date === todayStr() ? 'Arrivée pointée ✓' : `Arrivée du ${formatDateShort(date)} pointée ✓`)
      setDateSelectionnee(null)
    } finally {
      setPointageBusy(null)
    }
  }

  // Annulation d'un pointage — ex. jour coché par erreur : on retire l'enregistrement
  // de présence de ce client pour cette date précise (accessible depuis le calendrier
  // rapide, en cliquant sur un jour déjà pointé).
  async function annulerPointage(a, date) {
    const presence = allPresences.find((p) =>
      matchSite(p, site) && p.date === date && (p.clientNom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase()
    )
    if (!presence) return
    if (!window.confirm(`Annuler le pointage de ${a.clientNom} du ${formatDateShort(date)} ?`)) return
    setPointageBusy(a.id)
    try {
      await removeItem('gym_presences', presence.id)
      await audit('gym', 'PRESENCE_ANNULEE', `${a.clientNom} — pointage du ${formatDateShort(date)} annulé`)
      toast.success('Pointage annulé ✓')
      setDateSelectionnee(null)
    } finally {
      setPointageBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #E8850Fe6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <CreditCard size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Abonnements</h2>
          <p className="text-sm text-white/80">{liste.length} abonnement(s) — {formatMoney(total)} au total</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Nouvel abonnement</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Souscrit le', render: (r) => formatDateShort(r.date) },
            { key: 'dateDebut', label: 'Début', render: (r) => {
              const deb = r.dateDebut || r.date
              return <span className={deb > todayStr() ? 'font-semibold text-sky-600' : ''}>{formatDateShort(deb)}</span>
            } },
            { key: 'clientNom', label: 'Client' },
            { key: 'categorie', label: 'Catégorie', render: (r) => <Badge tone={categorieTone(r.categorie)}>{categorieLabel(r.categorie)}</Badge> },
            { key: 'dateFin', label: 'Fin', render: (r) => r.dateFin ? formatDateShort(r.dateFin) : '—' },
            { key: 'statut', label: 'Statut', render: (r) => {
              const st = statutAbonnement(r.dateDebut, r.dateFin)
              return <Badge tone={st.tone}>{st.label}</Badge>
            } },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'derniereArrivee', label: 'Dernière arrivée', render: (r) => {
              if (!abonnementActif(r.dateFin, r.dateDebut)) return '—'
              const derniere = dernierePresenceParClient.get((r.clientNom || '').trim().toLowerCase())
              const jours = joursDepuis(derniere)
              if (jours == null) return <span className="text-gray-400">Jamais pointée</span>
              return <Badge tone={jours >= 7 ? 'danger' : 'success'}>{jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Hier' : `Il y a ${jours} j`}</Badge>
            } },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            { key: 'enregistrePar', label: 'Enregistré par' },
            { key: 'actions', label: '', align: 'right', render: (r) => {
              const dejaFacturee = factures.some((f) => f.sourceType === 'abonnement' && f.sourceId === r.id)
              return (
                <div className="flex justify-end gap-1">
                  {abonnementActif(r.dateFin, r.dateDebut) && (
                    <button onClick={(e) => { e.stopPropagation(); pointerArrivee(r) }} disabled={pointageBusy === r.id} title="Pointer l'arrivée (aujourd'hui)"
                      className="flex items-center gap-1 rounded-lg bg-green-500 px-2 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-600 disabled:opacity-50">
                      <CheckCircle2 size={15} /> Pointer
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setDateSelectionnee(null); setCalendrierClient(r) }} title="Voir le calendrier de présence — et corriger un pointage oublié"
                    className="rounded p-1.5 text-sky-600 hover:bg-sky-50"><CalendarDays size={16} /></button>
                  {!dejaFacturee && (
                    <button onClick={(e) => { e.stopPropagation(); facturer(r) }} title="Générer la facture manquante"
                      className="rounded p-1.5 text-amber-600 hover:bg-amber-50"><Receipt size={16} /></button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setModal(remplir(r)) }} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                  {peutSupprimer && (
                    <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                  )}
                </div>
              )
            } }
          ]}
          rows={liste}
          onRowClick={(r) => setClientDetail(r.clientNom)}
          empty="Aucun abonnement enregistré."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l\'abonnement' : 'Nouvel abonnement'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrer} loading={saving}>{modal?.id ? 'Enregistrer les modifications' : 'Enregistrer'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            {/* Bandeau héro — même dégradé/badge lumineux que l'en-tête du volet. */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(166,52,42,0.35),0_8px_20px_-8px_rgba(166,52,42,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
                <CreditCard size={22} color="white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{modal.clientNom || (modal.id ? 'Modifier l\'abonnement' : 'Nouvel abonnement')}</p>
                <p className="text-sm text-white/80">
                  {modal.categorie === 'classique' && !classiqueFixe ? 'Durée libre — définie à la saisie' : 'Durée par défaut — 1 mois calendaire, modifiable'}
                </p>
              </div>
            </div>

            {/* 📋 Détails */}
            <div className="rounded-2xl border border-red-200 border-l-4 border-l-red-400 bg-red-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700">📋 Détails de l'abonnement</p>
              <FormGroup label="👤 Client" required>
                <div className="relative">
                  <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input value={modal.clientNom} className="pl-8"
                    onChange={(e) => { setModal((f) => ({ ...f, clientNom: e.target.value })); setSuggClient(true) }}
                    onFocus={() => setSuggClient(true)}
                    onBlur={() => setTimeout(() => setSuggClient(false), 150)}
                    placeholder="Nom du client" autoComplete="off" />
                  {suggClient && modal.clientNom.trim() && (() => {
                    const q = modal.clientNom.trim().toLowerCase()
                    const suggestions = clients.filter((c) => (c.nom || '').toLowerCase().includes(q) && (c.nom || '').toLowerCase() !== q).slice(0, 5)
                    return suggestions.length > 0 ? (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                        {suggestions.map((c) => (
                          <button key={c.id} type="button"
                            onMouseDown={() => { setModal((f) => ({ ...f, clientNom: c.nom, telephone: c.telephone || f.telephone })); setSuggClient(false) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-red-50">
                            <span className="font-semibold text-gray-700">{c.nom}</span>
                            {c.telephone && <span className="text-xs text-gray-400">· {c.telephone}</span>}
                          </button>
                        ))}
                      </div>
                    ) : null
                  })()}
                </div>
              </FormGroup>
              {!modal.id && (
                <FormGroup label="📱 Téléphone (WhatsApp)" hint="Optionnel — pour la confirmation WhatsApp automatique">
                  <div className="relative">
                    <MessageCircle size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-green-500" />
                    <Input className="pl-8" value={modal.telephone} onChange={(e) => setModal((f) => ({ ...f, telephone: e.target.value }))} placeholder="ex : 22890000000" />
                  </div>
                </FormGroup>
              )}
              <FormGroup label="🏷️ Catégorie" hint={categorieDesc(modal.categorie)}>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES_GYM.map((c) => {
                    const actif = modal.categorie === c.id
                    const coul = COULEUR_CATEGORIE[c.id]
                    return (
                      <button key={c.id} type="button" onClick={() => {
                        setModal((f) => {
                          const tarif = tarifs[c.id]
                          const dureeJours = dureeJoursInitiale(c.id, f.dateDebut || f.date, classiqueFixe, dureeMin)
                          return recalculerDateFin({ ...f, categorie: c.id, dureeJours, montant: tarif != null ? String(tarif) : f.montant })
                        })
                      }}
                        className={`rounded-xl border px-2 py-2 text-xs font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        style={actif ? { background: coul, borderColor: coul } : undefined}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </FormGroup>
              <FormGroup label="📅 Date de souscription" hint="Jour où l'abonnement est enregistré / payé (compte dans le chiffre d'affaires de ce mois).">
                <Input type="date" value={modal.date} onChange={(e) => setModal((f) => {
                  // Tant que la date de début n'a pas été fixée à part, elle suit la souscription.
                  const next = { ...f, date: e.target.value }
                  if (!f.dateDebutManuelle) next.dateDebut = e.target.value
                  return recalculerDateFin(next)
                })} />
              </FormGroup>

              {/* Date de début effective — par défaut = souscription, mais le client peut
                  vouloir commencer plus tard (ex. souscrit aujourd'hui, démarre le 1er du
                  mois prochain). C'est ELLE qui détermine la date de fin et le statut. */}
              <FormGroup label="▶️ Début de l'abonnement" required
                hint={modal.dateDebutManuelle
                  ? "Le client commence à cette date — l'abonnement reste « À venir » jusque-là."
                  : 'Par défaut le jour de la souscription. Changez-le pour un démarrage différé.'}>
                <div className="flex items-center gap-2">
                  <Input type="date" value={modal.dateDebut || modal.date} min={modal.date}
                    onChange={(e) => setModal((f) => recalculerDateFin({ ...f, dateDebut: e.target.value, dateDebutManuelle: true }))} />
                  {modal.dateDebutManuelle && (
                    <button type="button" onClick={() => setModal((f) => recalculerDateFin({ ...f, dateDebut: f.date, dateDebutManuelle: false }))}
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                      🔄 Le jour même
                    </button>
                  )}
                </div>
                {(modal.dateDebut || modal.date) > todayStr() && (
                  <p className="mt-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                    ⏳ Démarrage différé — l'abonnement sera « À venir » puis « Actif » le {formatDateShort(modal.dateDebut || modal.date)}.
                  </p>
                )}
              </FormGroup>

              {/* Durée modifiable pour TOUTES les catégories — pas seulement Classique :
                  pré-remplie sur l'équivalent d'1 mois calendaire (Simple/VIP/Classique
                  fixe) ou sur le minimum de Paramètres (Classique libre), mais on peut y
                  saisir plus ou moins pour un abonnement plus court ou plus long qu'un mois. */}
              {(() => {
                const libre = modal.categorie === 'classique' && !classiqueFixe
                return (
                  <FormGroup label="⏳ Durée (jours)" required={libre}
                    hint={libre
                      ? `Minimum ${dureeMin} jour${dureeMin > 1 ? 's' : ''}. Ex : 7 = une semaine, 14 = deux semaines, 30 = un mois…`
                      : "Pré-remplie sur l'équivalent d'un mois calendaire — modifiable pour un abonnement plus court ou plus long."}>
                    <Input type="number" min={libre ? dureeMin : 1} value={modal.dureeJours}
                      onChange={(e) => setModal((f) => recalculerDateFin({ ...f, dureeJours: e.target.value }))}
                      placeholder={libre ? `ex : ${dureeMin}` : 'ex : 30'} />
                  </FormGroup>
                )
              })()}

              <FormGroup label="🏁 Date de fin" required
                hint={modal.dateFinManuelle ? 'Corrigée manuellement — recalculer pour revenir à la valeur automatique.' : 'Calculée automatiquement — modifiable si besoin de corriger.'}>
                <div className="flex items-center gap-2">
                  <Input type="date" value={modal.dateFin}
                    onChange={(e) => setModal((f) => ({ ...f, dateFin: e.target.value, dateFinManuelle: true }))} />
                  {modal.dateFinManuelle && (
                    <button type="button" onClick={() => setModal((f) => recalculerDateFin({ ...f, dateFinManuelle: false }))}
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                      🔄 Recalculer
                    </button>
                  )}
                </div>
              </FormGroup>

              {/* Pré-rempli sur le tarif de Paramètres dès que la catégorie en a un fixe
                  (Simple/VIP toujours, Classique seulement si `classiqueFixe`), mais reste
                  modifiable — ce tarif n'est qu'un PLANCHER (ex. majoration négociée), pas
                  un prix imposé : impossible de descendre en dessous, cf. validation dans
                  enregistrer(). Un Classique à prix libre (Lomé) n'a pas de plancher. */}
              {(() => {
                const tarifPlancher = (modal.categorie === 'classique' && !classiqueFixe) ? null : tarifs[modal.categorie]
                return (
                  <FormGroup label="💰 Montant (FCFA)" required
                    hint={tarifPlancher > 0 ? `Minimum ${formatMoney(tarifPlancher)} pour cette catégorie — modifiable au-delà.` : undefined}>
                    <Input type="number" min={tarifPlancher || 0} value={modal.montant} placeholder="ex : 15000"
                      onChange={(e) => setModal((f) => ({ ...f, montant: e.target.value }))} />
                  </FormGroup>
                )
              })()}
              <FormGroup label="📝 Notes" hint="Optionnel">
                <Input value={modal.notes} onChange={(e) => setModal((f) => ({ ...f, notes: e.target.value }))} />
              </FormGroup>
            </div>

            {/* Résumé — confirmation visuelle avant validation. Fond blanc opaque (pas de
                teinte translucide) : sur le panneau glassmorphism déjà semi-transparent,
                un fond en rgba faisait perdre le contraste du texte selon ce qu'il y a
                derrière la modale. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 shadow-sm"
              style={{ background: '#ffffff', borderColor: `${COULEUR}40` }}>
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-gray-600">
                <User size={13} className="shrink-0 text-gray-400" />
                <span className="truncate">{modal.clientNom || 'Client à saisir'}</span>
                <Badge tone={categorieTone(modal.categorie)}>{categorieLabel(modal.categorie)}</Badge>
              </div>
              <span className="shrink-0 text-base font-extrabold" style={{ color: COULEUR2 }}>{formatMoney(Number(modal.montant) || 0)}</span>
              <span className="w-full shrink-0 text-[11px] text-gray-500">
                {(modal.dateDebut || modal.date) !== modal.date
                  ? `Du ${formatDateShort(modal.dateDebut)} au ${formatDateShort(modal.dateFin)}`
                  : `Jusqu'au ${formatDateShort(modal.dateFin)}`}
              </span>
            </div>

            {!modal.id && (
              <p className="text-[11px] text-gray-400">🧾 Une facture sera générée automatiquement — téléchargeable depuis le volet Facturation.</p>
            )}
          </div>
        )}
      </Modal>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
      <QrCarnetModal client={qrNouveauClient} onClose={() => setQrNouveauClient(null)} />

      {/* Calendrier rapide — accessible sans ouvrir la fiche complète du client, pour
          un coup d'œil pendant le pointage à l'accueil. Interactif si l'abonnement est
          actif : cliquer sur un jour passé (ou aujourd'hui) le sélectionne, puis
          « Pointer » l'enregistre — sert à corriger un oubli de pointage. */}
      <Modal open={!!calendrierClient} onClose={() => { setCalendrierClient(null); setDateSelectionnee(null) }}
        title={calendrierClient ? `Calendrier — ${calendrierClient.clientNom}` : ''}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <Button variant="outline" onClick={() => { setCalendrierClient(null); setDateSelectionnee(null) }}>Fermer</Button>
          {calendrierClient && abonnementActif(calendrierClient.dateFin, calendrierClient.dateDebut) && (() => {
            const dejaPointe = !!dateSelectionnee && presences.some((p) =>
              p.date === dateSelectionnee && (p.clientNom || '').trim().toLowerCase() === calendrierClient.clientNom.trim().toLowerCase()
            )
            return dejaPointe ? (
              <Button variant="danger" onClick={() => annulerPointage(calendrierClient, dateSelectionnee)}
                loading={pointageBusy === calendrierClient.id}>
                <Trash2 size={15} /> Annuler le pointage{dateSelectionnee !== todayStr() ? ` — ${formatDateShort(dateSelectionnee)}` : ''}
              </Button>
            ) : (
              <Button onClick={() => pointerArrivee(calendrierClient, dateSelectionnee)}
                disabled={!dateSelectionnee} loading={pointageBusy === calendrierClient.id}>
                <CheckCircle2 size={15} /> Pointer{dateSelectionnee && dateSelectionnee !== todayStr() ? ` — ${formatDateShort(dateSelectionnee)}` : ''}
              </Button>
            )
          })()}
        </>}>
        {calendrierClient && (() => {
          const pointagesClient = presences.filter((p) =>
            (p.clientNom || '').trim().toLowerCase() === calendrierClient.clientNom.trim().toLowerCase() && (p.date || '').startsWith(moisEnCours))
          // Heure d'arrivée affichée directement sur le jour concerné du calendrier.
          const details = Object.fromEntries(pointagesClient.filter((p) => p.createdAt).map((p) => [p.date, heureCourte(new Date(p.createdAt))]))
          const interactif = abonnementActif(calendrierClient.dateFin, calendrierClient.dateDebut)
          return (
            <>
              <CalendrierPresences mois={moisEnCours} joursPresents={pointagesClient.map((p) => p.date)} details={details}
                onDayClick={interactif ? setDateSelectionnee : undefined} selectedDate={dateSelectionnee} />
              {interactif && (
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  {dateSelectionnee
                    ? `Jour sélectionné : ${formatDateShort(dateSelectionnee)} — pointe une arrivée oubliée, ou annule un pointage fait par erreur.`
                    : "Clique sur un jour (passé ou aujourd'hui) pour pointer une arrivée oubliée, ou annuler un pointage par erreur."}
                </p>
              )}
            </>
          )
        })()}
      </Modal>
    </div>
  )
}
