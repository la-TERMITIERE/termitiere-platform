// MAXI-GYM — Séances : liste complète + ajout d'une séance ponctuelle.
import { useEffect, useMemo, useState } from 'react'
import { Ticket, Plus, Trash2, Pencil, User, MessageCircle, Receipt, Printer, Lock } from 'lucide-react'
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
import { CATEGORIES_SEANCE, categorieLabel, categorieTone, categorieDesc, finValiditeSeance, seanceValide, genQrToken, QR_CARNET_ACTIF } from './data'
import { useGymParams } from './useGymParams'
import { genererFactureGym } from './genererFacture'
import { imprimerTicketSeance } from './printTicket'
import ClientDetailModal from './ClientDetailModal'
import QrCarnetModal from './QrCarnetModal'
import { useSite, matchSite } from './site/useSite'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'
const COULEUR_CATEGORIE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }
const heureCourte = (d) => d.toTimeString().slice(0, 5)

export default function Seances() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  // Coach à attribuer à une séance du jour `date` — même règle que pour les
  // abonnements (cf. Abonnements.jsx → coachDuJour) : seulement si un SEUL coach a
  // été pointé présent ce jour-là, sinon ambigu et on laisse la séance sans coach.
  function coachDuJour(date) {
    const idsUniques = [...new Set(pointagesCoach.filter((p) => p.date === date).map((p) => p.coachId))]
    if (idsUniques.length !== 1) return { coachId: null, coachNom: null }
    const p = pointagesCoach.find((x) => x.date === date && x.coachId === idsUniques[0])
    return { coachId: p.coachId, coachNom: p.coachNom }
  }
  const peutSupprimer = isFullAccessRole(role)
  const params = useGymParams(site)
  const tarifs = { simple: params.tarifSeanceSimple, vip: params.tarifSeanceVip }

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [suggClient, setSuggClient] = useState(false)
  const [clientDetail, setClientDetail] = useState(null)
  const [qrNouveauClient, setQrNouveauClient] = useState(null)

  // Rafraîchit l'affichage toutes les 30 s : sans ça, le badge « Valide / Expirée »
  // d'une séance est figé à sa valeur du chargement de la page et resterait « Valide »
  // (vert) même une fois les N heures de validité écoulées, jusqu'à un rechargement.
  const [, tickValidite] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tickValidite((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Filtre de période — Jour / Mois / Année / Plage, sur la liste affichée ci-dessous.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')

  const vide = () => ({ id: null, date: todayStr(), clientNom: '', telephone: '', categorie: CATEGORIES_SEANCE[0].id, montant: String(tarifs[CATEGORIES_SEANCE[0].id] || ''), notes: '', imprimer: true, partenaire: false, partenaireStructure: '' })
  const remplir = (s) => ({ id: s.id, date: s.date, clientNom: s.clientNom, telephone: '', categorie: s.categorie, montant: String(s.montant), notes: s.notes || '', partenaire: !!s.partenaire, partenaireStructure: s.partenaireStructure || '' })

  const toutes = useMemo(() => [...seances].sort((a, b) => (a.date < b.date ? 1 : -1)), [seances])
  const liste = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((s) => (s.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((s) => (s.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((s) => (!filtreDebut || s.date >= filtreDebut) && (!filtreFin || s.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((s) => s.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

  async function enregistrer() {
    const d = modal
    if (!d.clientNom.trim()) return toast.error('Nom du client requis')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (d.partenaire && !d.partenaireStructure.trim()) return toast.error('Indiquez la structure du partenaire (ex. CIMTOGO)')
    setSaving(true)
    try {
      const clientNom = d.clientNom.trim()

      // Modification d'une séance existante — pas de nouvelle création de client, pas
      // de nouvelle facture ni de nouveau WhatsApp (déjà envoyés à l'enregistrement initial).
      if (d.id) {
        const { coachId, coachNom } = coachDuJour(d.date)
        await updateItem('gym_seances', d.id, {
          date: d.date, clientNom, categorie: d.categorie, montant: Number(d.montant), notes: d.notes.trim(), coachId, coachNom
        })
        await audit('gym', 'SEANCE_MODIFIEE', `${clientNom} — ${categorieLabel(d.categorie)} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Séance modifiée ✓')
        setModal(null)
        return
      }

      // Le répertoire Clients se construit uniquement à partir des séances/abonnements
      // réellement enregistrés — pas d'ajout manuel possible (cf. Clients.jsx). La
      // fiche est rattachée à la salle : le même nom peut donc exister des deux côtés,
      // chaque salle gardant sa propre clientèle.
      // Client partenaire : la séance est « portée au compte du partenaire » — pas
      // de facture ni de ticket sur le moment, c'est la structure qui règle le lot
      // en fin de mois (cf. volet « Clients partenaires »). Le marquage peut venir
      // de la fiche client OU être coché ici, à l'enregistrement de la séance.
      const telephoneSaisi = d.telephone.trim()
      let client = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
      const estPartenaire = !!d.partenaire || !!client?.partenaire
      const partenaireStructure = (d.partenaire ? d.partenaireStructure.trim() : '') || client?.partenaireStructure || ''
      let nouveauClient = null
      if (!client) {
        const qrToken = genQrToken()
        const nouveauClientId = await addItem('gym_clients', {
          nom: clientNom, telephone: telephoneSaisi, notes: '', site, qrToken, createdAt: Date.now(),
          partenaire: estPartenaire, partenaireStructure: estPartenaire ? partenaireStructure : ''
        })
        nouveauClient = { id: nouveauClientId, nom: clientNom, qrToken }
      } else if (telephoneSaisi && !client.telephone) {
        await updateItem('gym_clients', client.id, { telephone: telephoneSaisi })
      }
      // Coché ici sur un client existant pas encore marqué (ou structure différente) :
      // on met à jour sa fiche pour que ce soit automatique la prochaine fois.
      if (estPartenaire && client && (!client.partenaire || (client.partenaireStructure || '') !== partenaireStructure)) {
        await updateItem('gym_clients', client.id, { partenaire: true, partenaireStructure })
      }

      const { coachId, coachNom } = coachDuJour(d.date)
      const id = await addItem('gym_seances', {
        date: d.date, clientNom, categorie: d.categorie, montant: Number(d.montant), notes: d.notes.trim(), site, coachId, coachNom,
        partenaire: estPartenaire, partenaireStructure, regleParPartenaire: false,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'SEANCE_CREATE', `${clientNom} — ${categorieLabel(d.categorie)} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA${estPartenaire ? ` — portée au compte ${partenaireStructure}` : ''}`)
      const telephone = telephoneSaisi || client?.telephone
      if (telephone) {
        sendWhatsApp([telephone], {
          title: '🏋️ MAXI-GYM',
          body: `Bonjour ${clientNom}, votre séance ${categorieLabel(d.categorie)} vient d'être enregistrée. Bonne séance ! 💪`
        })
      }

      if (estPartenaire) {
        toast.success(`Séance portée au compte de ${partenaireStructure} — à régler en fin de mois ✓`)
        setModal(null)
      } else {
        // Une facture est TOUJOURS générée pour un client normal (visible dans le
        // volet Facturation, avec son propre bouton d'impression). Le ticket ne
        // s'imprime que si la case « Imprimer le reçu » est cochée.
        const facture = await genererFactureGym({
          factures, sourceType: 'seance', sourceId: id, clientNom, clientTelephone: telephone,
          categorie: d.categorie, description: `Séance ${categorieLabel(d.categorie)}`, montant: d.montant,
          user, site, date: d.date, imprime: d.imprimer
        })
        if (d.imprimer) imprimerTicketSeance(facture)
        toast.success(d.imprimer ? 'Séance enregistrée — reçu imprimé ✓' : 'Séance enregistrée ✓')
        setModal(null)
      }
      // Nouveau client : on propose tout de suite son QR carnet, pendant qu'il
      // est encore devant la réception — masqué tant que QR_CARNET_ACTIF est faux.
      if (nouveauClient && QR_CARNET_ACTIF) setQrNouveauClient(nouveauClient)
    } finally { setSaving(false) }
  }

  // Facture une séance existante qui n'en a pas encore (ex. enregistrée avant ce
  // changement) — sans re-déclencher le WhatsApp ni recréer le client.
  async function facturer(s) {
    const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (s.clientNom || '').trim().toLowerCase())
    const facture = await genererFactureGym({
      factures, sourceType: 'seance', sourceId: s.id, clientNom: s.clientNom, clientTelephone: client?.telephone,
      categorie: s.categorie, description: `Séance ${categorieLabel(s.categorie)}`, montant: s.montant,
      user, site, date: s.date
    })
    imprimerTicketSeance(facture)
    toast.success('Facture générée ✓')
  }

  async function supprimer(s) {
    if (!confirm(`Supprimer la séance de ${s.clientNom} du ${formatDateShort(s.date)} ?`)) return
    await removeItem('gym_seances', s.id)
    await audit('gym', 'SEANCE_DELETE', `${s.clientNom} — ${Number(s.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Séance supprimée')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Ticket size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Séances</h2>
          <p className="text-sm text-white/80">{liste.length} séance(s) — {formatMoney(total)} au total — valables {params.validiteSeanceHeures} h</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism) — à la place
            d'une ligne séparée en dessous. */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Nouvelle séance</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client', render: (r) => (
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{r.clientNom}</span>
                {r.partenaire && (
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">🤝 {r.partenaireStructure || 'partenaire'}</span>
                )}
              </div>
            ) },
            { key: 'categorie', label: 'Catégorie', render: (r) => <Badge tone={categorieTone(r.categorie)}>{categorieLabel(r.categorie)}</Badge> },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'validite', label: 'Validité', render: (r) => {
              const valide = seanceValide(r.createdAt, params.validiteSeanceHeures, r.date)
              return (
                <Badge tone={valide ? 'success' : 'neutral'}>
                  {valide ? `Valide jusqu'à ${heureCourte(finValiditeSeance(r.createdAt, params.validiteSeanceHeures, r.date))}` : 'Expirée'}
                </Badge>
              )
            } },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            { key: 'enregistrePar', label: 'Enregistrée par' },
            { key: 'actions', label: '', align: 'right', render: (r) => {
              // Séance partenaire : pas de facture ni de ticket — juste l'état de
              // règlement par la structure (mis à jour depuis le volet Clients partenaires).
              if (r.partenaire) {
                return (
                  <div className="flex justify-end gap-1">
                    <Badge tone={r.regleParPartenaire ? 'success' : 'warning'}>
                      {r.regleParPartenaire ? 'Réglé par la structure' : 'Au compte du partenaire'}
                    </Badge>
                    <button onClick={(e) => { e.stopPropagation(); setModal(remplir(r)) }} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                    {peutSupprimer && (
                      <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    )}
                  </div>
                )
              }
              const facture = factures.find((f) => f.sourceType === 'seance' && f.sourceId === r.id)
              return (
                <div className="flex justify-end gap-1">
                  {facture ? (
                    <button onClick={(e) => { e.stopPropagation(); imprimerTicketSeance(facture) }}
                      title={facture.imprime === false ? 'Pas encore imprimé — cliquer pour imprimer' : 'Réimprimer le ticket'}
                      className={`rounded p-1.5 hover:bg-orange-50 ${facture.imprime === false ? 'text-amber-500' : 'text-orange-600'}`}><Printer size={16} /></button>
                  ) : (
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
          empty="Aucune séance enregistrée."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier la séance' : 'Nouvelle séance'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrer} loading={saving}>{modal?.id ? 'Enregistrer les modifications' : 'Enregistrer'}</Button></>}>
        {modal && (() => {
          const ficheClientSaisi = clients.find((c) => (c.nom || '').trim().toLowerCase() === modal.clientNom.trim().toLowerCase())
          return (
          <div className="space-y-4">
            {/* Bandeau héro — même dégradé/badge lumineux que l'en-tête du volet. */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,133,15,0.35),0_8px_20px_-8px_rgba(232,133,15,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
                <Ticket size={22} color="white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{modal.clientNom || (modal.id ? 'Modifier la séance' : 'Nouvelle séance')}</p>
                <p className="text-sm text-white/80">⏱️ Valable {params.validiteSeanceHeures} h à partir de l'enregistrement</p>
              </div>
            </div>


            {/* 📋 Détails */}
            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-700">📋 Détails de la séance</p>
              <FormGroup label="👤 Client" required>
                <div className="relative">
                  <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input value={modal.clientNom} className="pl-8"
                    onChange={(e) => {
                      const nom = e.target.value
                      const fiche = clients.find((c) => (c.nom || '').trim().toLowerCase() === nom.trim().toLowerCase())
                      setModal((f) => ({ ...f, clientNom: nom, ...(fiche ? { partenaire: !!fiche.partenaire, partenaireStructure: fiche.partenaireStructure || f.partenaireStructure } : {}) }))
                      setSuggClient(true)
                    }}
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
                            onMouseDown={() => { setModal((f) => ({ ...f, clientNom: c.nom, telephone: c.telephone || f.telephone, partenaire: !!c.partenaire, partenaireStructure: c.partenaireStructure || f.partenaireStructure })); setSuggClient(false) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-orange-50">
                            <span className="font-semibold text-gray-700">{c.nom}</span>
                            {c.partenaire && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">🤝 {c.partenaireStructure || 'partenaire'}</span>}
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
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES_SEANCE.map((c) => {
                    const actif = modal.categorie === c.id
                    const coul = COULEUR_CATEGORIE[c.id]
                    return (
                      <button key={c.id} type="button" onClick={() => {
                        const tarif = tarifs[c.id]
                        setModal((f) => ({ ...f, categorie: c.id, montant: tarif != null ? String(tarif) : f.montant }))
                      }}
                        className={`rounded-xl border px-2 py-2 text-xs font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        style={actif ? { background: coul, borderColor: coul } : undefined}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </FormGroup>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="📅 Date"><Input type="date" value={modal.date} onChange={(e) => setModal((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
                <FormGroup label="💰 Montant (FCFA)" required>
                  {/* Verrouillé sur le tarif configuré dans Paramètres — impossible de saisir
                      un autre montant (ex. 500 pour une Simple à 1000) que ce soit à la
                      création ou en modifiant une séance existante. Pour changer le prix,
                      il faut changer le tarif dans Paramètres (s'applique aux prochaines
                      séances). Simple/VIP uniquement ici — le Classique n'existe pas en séance. */}
                  <div className="relative">
                    <Input type="number" min="0" value={modal.montant} disabled className="bg-gray-50 pr-9 font-bold text-gray-700" />
                    <Lock size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </FormGroup>
              </div>
              <FormGroup label="📝 Notes" hint="Optionnel">
                <Input value={modal.notes} onChange={(e) => setModal((f) => ({ ...f, notes: e.target.value }))} />
              </FormGroup>
            </div>

            {/* Résumé — fond blanc opaque (pas de teinte translucide) pour rester lisible
                sur le panneau glassmorphism déjà semi-transparent de la modale. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 shadow-sm"
              style={{ background: '#ffffff', borderColor: `${COULEUR}40` }}>
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-gray-600">
                <User size={13} className="shrink-0 text-gray-400" />
                <span className="truncate">{modal.clientNom || 'Client à saisir'}</span>
                <Badge tone={categorieTone(modal.categorie)}>{categorieLabel(modal.categorie)}</Badge>
              </div>
              <span className="shrink-0 text-base font-extrabold" style={{ color: COULEUR2 }}>{formatMoney(Number(modal.montant) || 0)}</span>
            </div>

            {/* Client partenaire — marquable directement ici (et pas seulement sur la
                fiche client) : pré-coché si la fiche du client saisi l'est déjà. Une
                séance partenaire est « portée au compte » : pas de facture ni de ticket,
                réglée par la structure en fin de mois (cf. volet Clients partenaires). */}
            {!modal.id && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 py-2.5">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={!!modal.partenaire}
                    onChange={(e) => setModal((f) => ({ ...f, partenaire: e.target.checked, imprimer: e.target.checked ? false : f.imprimer }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600" />
                  <span className="font-semibold text-sky-900">🤝 Client partenaire (paie en fin de mois via sa structure)</span>
                </label>
                {modal.partenaire && (
                  <div className="mt-2.5 space-y-1.5">
                    <FormGroup label="Structure" required className="!mb-0">
                      <Input value={modal.partenaireStructure} onChange={(e) => setModal((f) => ({ ...f, partenaireStructure: e.target.value }))} placeholder="ex : CIMTOGO" />
                    </FormGroup>
                    <p className="text-[11px] text-sky-700">
                      Séance <strong>portée au compte du partenaire</strong> : ni facture ni ticket maintenant.
                      {!ficheClientSaisi?.partenaire && ' La fiche du client sera aussi marquée « partenaire » pour les prochaines fois.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!modal.id && !modal.partenaire && (
              <div className="rounded-xl border px-3.5 py-2.5 shadow-sm" style={{ background: '#ffffff', borderColor: `${COULEUR}40` }}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={modal.imprimer} onChange={(e) => setModal((f) => ({ ...f, imprimer: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300" style={{ accentColor: COULEUR }} />
                  <span className="font-semibold text-gray-700">
                    <Printer size={13} className="mr-1 inline -mt-0.5" />
                    Imprimer le reçu maintenant
                  </span>
                </label>
                <p className="ml-6 mt-0.5 text-[11px] text-gray-400">
                  {modal.imprimer
                    ? '🧾 Une facture sera générée et le ticket de caisse s\'imprimera aussitôt.'
                    : 'Une facture sera quand même générée (visible dans Facturation) — mais sans impression immédiate. Réimprimable à tout moment depuis la liste.'}
                </p>
              </div>
            )}
          </div>
          )
        })()}
      </Modal>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
      <QrCarnetModal client={qrNouveauClient} onClose={() => setQrNouveauClient(null)} />
    </div>
  )
}
