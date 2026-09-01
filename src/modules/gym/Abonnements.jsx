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
import { CATEGORIES_GYM, categorieLabel, categorieTone, categorieDesc, dateFinAbonnement, abonnementActif, joursDepuis, genQrToken, QR_CARNET_ACTIF } from './data'
import { useGymParams } from './useGymParams'
import { genererFactureGym } from './genererFacture'
import ClientDetailModal from './ClientDetailModal'
import QrCarnetModal from './QrCarnetModal'
import CalendrierPresences from './CalendrierPresences'
import { useSite, matchSite } from './site/useSite'

const COULEUR = '#A6342A'
const COULEUR2 = '#E8850F'
const COULEUR_CATEGORIE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }

// Recalcule `dateFin` à partir de date/catégorie/durée — sauf si l'utilisateur l'a
// déjà corrigée manuellement (`dateFinManuelle`), auquel cas on la laisse intacte.
function recalculerDateFin(next, classiqueFixe) {
  if (next.dateFinManuelle) return next
  return { ...next, dateFin: dateFinAbonnement(next.date, next.categorie, next.dureeJours, classiqueFixe) }
}

export default function Abonnements() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
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
  const [calendrierClient, setCalendrierClient] = useState(null)
  const moisEnCours = todayStr().slice(0, 7)

  // Filtre de période — Jour / Mois / Année, sur la liste affichée ci-dessous.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')

  const vide = () => {
    const date = todayStr(), categorie = CATEGORIES_GYM[0].id, dureeJours = String(dureeMin)
    return {
      id: null, date, clientNom: '', telephone: '', categorie, dureeJours,
      dateFin: dateFinAbonnement(date, categorie, dureeJours, classiqueFixe), dateFinManuelle: false,
      montant: String(tarifs[categorie] || ''), notes: ''
    }
  }
  const remplir = (a) => ({
    id: a.id, date: a.date, clientNom: a.clientNom, telephone: '', categorie: a.categorie,
    dureeJours: a.dureeJours != null ? String(a.dureeJours) : String(dureeMin),
    dateFin: a.dateFin, dateFinManuelle: true,
    montant: String(a.montant), notes: a.notes || ''
  })

  const toutes = useMemo(() => [...abonnements].sort((a, b) => (a.date < b.date ? 1 : -1)), [abonnements])
  const liste = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((a) => (a.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((a) => (a.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((a) => a.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee])
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
    if (d.categorie === 'classique' && !classiqueFixe && (!d.dureeJours || Number(d.dureeJours) < dureeMin)) return toast.error(`Durée requise (minimum ${dureeMin} jours) pour un abonnement Classique`)
    if (!d.dateFin) return toast.error('Date de fin requise')
    setSaving(true)
    try {
      const dateFin = d.dateFin
      const clientNom = d.clientNom.trim()

      // Modification d'un abonnement existant — pas de nouvelle création de client, pas
      // de nouvelle facture ni de nouveau WhatsApp (déjà envoyés à l'enregistrement initial).
      if (d.id) {
        await updateItem('gym_abonnements', d.id, {
          date: d.date, dateFin, clientNom, categorie: d.categorie,
          dureeJours: (d.categorie === 'classique' && !classiqueFixe) ? Number(d.dureeJours) : null,
          montant: Number(d.montant), notes: d.notes.trim()
        })
        await audit('gym', 'ABONNEMENT_MODIFIE', `${clientNom} — ${categorieLabel(d.categorie)} — jusqu'au ${dateFin} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Abonnement modifié ✓')
        setModal(null)
        return
      }

      const id = await addItem('gym_abonnements', {
        date: d.date, dateFin, clientNom, categorie: d.categorie,
        dureeJours: (d.categorie === 'classique' && !classiqueFixe) ? Number(d.dureeJours) : null,
        montant: Number(d.montant), notes: d.notes.trim(), site,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'ABONNEMENT_CREATE', `${clientNom} — ${categorieLabel(d.categorie)} — jusqu'au ${dateFin} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
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
        sendWhatsApp([telephone], {
          title: '🎉 MAXI-GYM',
          body: `Bonjour ${clientNom}, votre abonnement ${categorieLabel(d.categorie)} a bien été enregistré, valable jusqu'au ${formatDateShort(dateFin)}. Bel abonnement à MAXI-GYM ! 🏋️`
        })
      }
      // Une facture est TOUJOURS générée (visible dans le volet Facturation, avec
      // son propre bouton de téléchargement) — plus besoin de case à cocher.
      await genererFactureGym({
        factures, sourceType: 'abonnement', sourceId: id, clientNom, clientTelephone: telephone,
        categorie: d.categorie, description: `Abonnement ${categorieLabel(d.categorie)} — jusqu'au ${dateFin}`, montant: d.montant,
        user, site
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
      user, site
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
  // souhaite une bonne séance par WhatsApp si son numéro est connu.
  const [pointageBusy, setPointageBusy] = useState(null)
  async function pointerArrivee(a) {
    setPointageBusy(a.id)
    try {
      await addItem('gym_presences', {
        clientNom: a.clientNom, abonnementId: a.id, date: todayStr(), createdAt: Date.now(), site,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null
      })
      await audit('gym', 'PRESENCE_POINTEE', `${a.clientNom} — arrivée pointée`)
      const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase())
      if (client?.telephone) {
        sendWhatsApp([client.telephone], {
          title: '🏋️ MAXI-GYM',
          body: `Bonjour ${a.clientNom}, bonne séance à MAXI-GYM aujourd'hui ! 💪`
        })
      }
      toast.success('Arrivée pointée ✓')
    } finally {
      setPointageBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #E8850Fe6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <CreditCard size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Abonnements</h2>
          <p className="text-sm text-white/80">{liste.length} abonnement(s) — {formatMoney(total)} au total</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee} />
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Nouvel abonnement</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Début', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'categorie', label: 'Catégorie', render: (r) => <Badge tone={categorieTone(r.categorie)}>{categorieLabel(r.categorie)}</Badge> },
            { key: 'dateFin', label: 'Fin', render: (r) => r.dateFin ? formatDateShort(r.dateFin) : '—' },
            { key: 'statut', label: 'Statut', render: (r) => (
              <Badge tone={abonnementActif(r.dateFin) ? 'success' : 'neutral'}>{abonnementActif(r.dateFin) ? 'Actif' : 'Expiré'}</Badge>
            ) },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'derniereArrivee', label: 'Dernière arrivée', render: (r) => {
              if (!abonnementActif(r.dateFin)) return '—'
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
                  {abonnementActif(r.dateFin) && (
                    <button onClick={(e) => { e.stopPropagation(); pointerArrivee(r) }} disabled={pointageBusy === r.id} title="Pointer l'arrivée"
                      className="flex items-center gap-1 rounded-lg bg-green-500 px-2 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-600 disabled:opacity-50">
                      <CheckCircle2 size={15} /> Pointer
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setCalendrierClient(r.clientNom) }} title="Voir le calendrier de présence"
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
                  {modal.categorie === 'classique' && !classiqueFixe ? 'Durée libre — définie à la saisie' : 'Durée fixe — 1 mois calendaire'}
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
                        const tarif = tarifs[c.id]
                        setModal((f) => recalculerDateFin({ ...f, categorie: c.id, montant: tarif != null ? String(tarif) : f.montant }, classiqueFixe))
                      }}
                        className={`rounded-xl border px-2 py-2 text-xs font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        style={actif ? { background: coul, borderColor: coul } : undefined}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </FormGroup>
              <FormGroup label="📅 Date de souscription">
                <Input type="date" value={modal.date} onChange={(e) => setModal((f) => recalculerDateFin({ ...f, date: e.target.value }, classiqueFixe))} />
              </FormGroup>

              {modal.categorie === 'classique' && !classiqueFixe && (
                <FormGroup label="⏳ Durée (jours)" required hint={`Minimum ${dureeMin} jours (deux semaines) — pas d'offre d'une semaine. Ex : ${dureeMin} = deux semaines, 30 = un mois…`}>
                  <Input type="number" min={dureeMin} value={modal.dureeJours} onChange={(e) => setModal((f) => recalculerDateFin({ ...f, dureeJours: e.target.value }, classiqueFixe))} placeholder={`ex : ${dureeMin}`} />
                </FormGroup>
              )}

              <FormGroup label="🏁 Date de fin" required
                hint={modal.dateFinManuelle ? 'Corrigée manuellement — recalculer pour revenir à la valeur automatique.' : 'Calculée automatiquement — modifiable si besoin de corriger.'}>
                <div className="flex items-center gap-2">
                  <Input type="date" value={modal.dateFin}
                    onChange={(e) => setModal((f) => ({ ...f, dateFin: e.target.value, dateFinManuelle: true }))} />
                  {modal.dateFinManuelle && (
                    <button type="button" onClick={() => setModal((f) => recalculerDateFin({ ...f, dateFinManuelle: false }, classiqueFixe))}
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                      🔄 Recalculer
                    </button>
                  )}
                </div>
              </FormGroup>

              <FormGroup label="💰 Montant (FCFA)" required>
                <Input type="number" min="0" value={modal.montant} onChange={(e) => setModal((f) => ({ ...f, montant: e.target.value }))} placeholder="ex : 15000" />
              </FormGroup>
              <p className="-mt-1.5 mb-3 text-[11px] text-gray-500">
                {classiqueFixe
                  ? <>Pré-rempli pour Simple/Classique/VIP ({formatMoney(tarifs.simple)}/{formatMoney(tarifs.classique)}/{formatMoney(tarifs.vip)}) — modifiable.</>
                  : <>Pré-rempli pour Simple/VIP ({formatMoney(tarifs.simple)}/{formatMoney(tarifs.vip)}) — modifiable. Libre pour Classique.</>}
              </p>
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
              <span className="w-full shrink-0 text-[11px] text-gray-500">Jusqu'au {formatDateShort(modal.dateFin)}</span>
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

      {/* Calendrier rapide — accessible sans ouvrir la fiche complète du client,
          pour un coup d'œil pendant le pointage à l'accueil. */}
      <Modal open={!!calendrierClient} onClose={() => setCalendrierClient(null)} title={calendrierClient ? `Calendrier — ${calendrierClient}` : ''}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<Button variant="outline" onClick={() => setCalendrierClient(null)}>Fermer</Button>}>
        {calendrierClient && (
          <CalendrierPresences mois={moisEnCours}
            joursPresents={presences
              .filter((p) => (p.clientNom || '').trim().toLowerCase() === calendrierClient.trim().toLowerCase() && (p.date || '').startsWith(moisEnCours))
              .map((p) => p.date)} />
        )}
      </Modal>
    </div>
  )
}
