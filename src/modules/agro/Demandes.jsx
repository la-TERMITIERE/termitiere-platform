// Demandes de sortie MAXI-AGRO — workflow Agent → Contrôleur/Admin.
//  1. L'agent crée une demande (statut en_attente).
//  2. L'admin/contrôleur approuve ou refuse avec commentaire.
//  3. À l'approbation, la sortie est automatiquement reportée dans la saisie
//     du jour `dateSortie` (la page Saisie lit les demandes approuvées).
import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, X, Clock, Timer } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, getAll, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { pushToUsers } from '../../core/push'
import { sendWhatsApp } from '../../core/whatsapp'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatDateTime } from '../../utils/formatters'
import { dernierStock } from './logic'
import { appliquerDemandeAuStock } from './applyDemande'
import { APPROVER_ROLES, CERTIFIER_ROLES } from '../../core/roles'
import { STATUTS_DEMANDE, normaliserStatut, estActif, estCertifie, actionsDemande } from '../../shared/workflow'

const STATUTS = STATUTS_DEMANDE

export default function Demandes() {
  const { user, role, canManage, canCertify } = useAuth()
  const { data: liste } = useCollection('agro_demandes')
  const { data: inventaires } = useCollection('agro_inventaires')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const isManager = canManage()
  const isCertifier = canCertify()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null) // { demande }
  const [nowTick, setNowTick] = useState(Date.now())

  // Tick pour rafraîchir le compte à rebours d'approbation automatique.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30 * 1000)
    return () => clearInterval(t)
  }, [])

  // Minutes restantes avant approbation automatique (10 min après création).
  const minsAvantAuto = (d) => {
    const created = typeof d.createdAt === 'number'
      ? d.createdAt
      : (Date.parse(`${d.date}T${d.heure || '00:00'}:00`) || Date.now())
    return Math.max(0, Math.ceil((created + 10 * 60 * 1000 - nowTick) / 60000))
  }

  // Formulaire de création
  const [form, setForm] = useState({
    typeArticle: 'animal', articleId: '', qte: 1, dateSortie: todayStr(), motif: 'Vente', message: ''
  })
  const articles = form.typeArticle === 'animal' ? especes : aliments
  const stock = dernierStock(inventaires, form.typeArticle, form.articleId || articles[0]?.id)
  const [commentaire, setCommentaire] = useState('')

  // Les demandes générées par une facture (source:'facture') sont pilotées depuis
  // la page Facturation — on les exclut d'ici pour éviter toute double-validation.
  const demandesManuelles = useMemo(() => liste.filter((d) => d.source !== 'facture'), [liste])

  const filtrees = useMemo(
    () =>
      [...demandesManuelles]
        .filter((d) => (filtre === 'tous' ? true : normaliserStatut(d.statut) === filtre))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [demandesManuelles, filtre]
  )
  const nbAttente = demandesManuelles.filter((d) => estActif(d.statut)).length
  const nbACertifier = demandesManuelles.filter((d) => normaliserStatut(d.statut) === 'approuve_n1').length

  function openCreate() {
    setForm({ typeArticle: 'animal', articleId: especes[0]?.id || '', qte: 1, dateSortie: todayStr(), motif: 'Vente', message: '' })
    setCreateOpen(true)
  }

  async function submitDemande() {
    const art = articles.find((a) => a.id === form.articleId) || articles[0]
    if (!art || form.qte < 1 || !form.dateSortie || !form.message.trim()) {
      return toast.error('Remplissez tous les champs obligatoires')
    }
    const num = genNumero('DEM', liste.length)
    const demande = {
      num, date: todayStr(), heure: nowHM(),
      demandeur: user.login, demandeurNom: user.nom,
      typeArticle: form.typeArticle, articleId: art.id, articleNom: art.nom, articleCat: art.cat,
      qte: parseInt(form.qte) || 0, dateSortie: form.dateSortie,
      motif: form.motif, message: form.message.trim(),
      statut: 'en_attente',
      approbateur: null, approbateurNom: null, dateDecision: null, commentaireDecision: null
    }
    await addItem('agro_demandes', demande)
    await audit('agro', 'DEMANDE', `${num} — ${demande.qte} × ${art.nom} pour le ${form.dateSortie}`)
    // Notifie les responsables (admin + contrôleur) en temps réel.
    await notify({
      type: 'demande',
      title: 'Nouvelle demande de sortie',
      body: `${demande.qte} × ${art.nom} — par ${user.nom} pour le ${form.dateSortie}`,
      module: 'agro',
      forRoles: APPROVER_ROLES,
      excludeUid: user.uid,
      link: '/agro/demandes'
    })
    // Alerte WhatsApp aux responsables disposant d'un numéro (si configuré côté serveur).
    try {
      const users = await getAll('users')
      const managers = users.filter((u) => APPROVER_ROLES.includes(u.role))
      // Push (notification téléphone même app fermée) aux responsables.
      pushToUsers(managers.map((u) => u.uid || u.login), {
        title: 'Nouvelle demande de sortie',
        body: `${demande.qte} × ${art.nom} — par ${user.nom} pour le ${form.dateSortie}`,
        url: '/agro/demandes'
      })
      // WhatsApp (si configuré).
      const phones = managers.filter((u) => u.telephone).map((u) => u.telephone)
      if (phones.length) sendWhatsApp({ phones, text: `🔔 LA TERMITIÈRE — Nouvelle demande de sortie\n${demande.qte} × ${art.nom}\nPar ${user.nom} pour le ${form.dateSortie}\nMotif : ${form.motif}` })
    } catch (e) { /* best effort */ }
    toast.success('📤 Demande soumise à la hiérarchie ✓')
    setCreateOpen(false)
  }

  // Applique une action du workflow (approuver / certifier / refuser).
  async function appliquerDecision(action) {
    const d = decision.demande
    const statut = action.statut // 'approuve_n1' | 'certifie' | 'refuse'
    const horodate = todayStr() + ' ' + nowHM()
    const patch = { statut, decidedAt: ts(), commentaireDecision: commentaire.trim() }
    if (statut === 'approuve_n1') {
      patch.approuveN1Par = user.nom
      patch.approuveN1Le = horodate
    } else if (statut === 'certifie') {
      patch.certifiePar = user.nom
      patch.certifieLe = horodate
      // Compat : conserve les champs « approbateur » historiques.
      patch.approbateur = user.login
      patch.approbateurNom = user.nom
      patch.dateDecision = horodate
      if (!d.approuveN1Par) { patch.approuveN1Par = user.nom; patch.approuveN1Le = horodate }
    } else { // refuse
      patch.refusePar = user.nom
      patch.dateDecision = horodate
    }
    await updateItem('agro_demandes', d.id, patch)

    // L'effet métier (décompte de la sortie) ne s'applique qu'à la CERTIFICATION.
    if (statut === 'certifie') await appliquerDemandeAuStock({ ...d, statut: 'certifie' })

    await audit('agro',
      statut === 'refuse' ? 'REFUS' : statut === 'certifie' ? 'CERTIFICATION' : 'APPROBATION',
      `${d.num} — ${d.qte} × ${d.articleNom} (${d.demandeurNom})`)

    // Notifications selon l'étape atteinte.
    if (statut === 'approuve_n1') {
      // → prévenir les certificateurs qu'une demande attend leur certification.
      await notify({
        type: 'demande', title: 'Demande à certifier 🟡',
        body: `${d.qte} × ${d.articleNom} — approuvée par ${user.nom}`,
        module: 'agro', forRoles: CERTIFIER_ROLES, excludeUid: user.uid, link: '/agro/demandes'
      })
      await notify({
        type: 'info', title: 'Demande approuvée (1er niveau) ✅',
        body: `${d.qte} × ${d.articleNom} — en attente de certification`,
        module: 'agro', forUsers: [d.demandeur], excludeUid: user.uid, link: '/agro/demandes'
      })
    } else {
      // certifie ou refuse → prévenir le demandeur.
      await notify({
        type: statut === 'certifie' ? 'approuve' : 'refus',
        title: statut === 'certifie' ? 'Demande certifiée ✅' : 'Demande refusée ⛔',
        body: `${d.qte} × ${d.articleNom}${commentaire.trim() ? ' — ' + commentaire.trim() : ''}`,
        module: 'agro', forUsers: [d.demandeur], excludeUid: user.uid, link: '/agro/demandes'
      })
      // Confirmation aux responsables qu'une autorisation a été délivrée.
      if (statut === 'certifie') {
        await notify({
          type: 'info', title: `Sortie autorisée par ${user.nom} ✅`,
          body: `${d.qte} × ${d.articleNom} — demandée par ${d.demandeurNom}`,
          module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/demandes'
        })
      }
      // Alerte WhatsApp / push au demandeur (best effort).
      try {
        const verdict = statut === 'certifie' ? 'CERTIFIÉE ✅' : 'REFUSÉE ⛔'
        pushToUsers([d.demandeur], {
          title: statut === 'certifie' ? 'Demande certifiée ✅' : 'Demande refusée ⛔',
          body: `${d.num} : ${d.qte} × ${d.articleNom}`,
          url: '/agro/demandes'
        })
        const users = await getAll('users')
        const dem = users.find((u) => (u.login === d.demandeur || u.uid === d.demandeur))
        if (dem?.telephone) {
          sendWhatsApp({ phones: [dem.telephone], text: `LA TERMITIÈRE — Votre demande ${d.num} est ${verdict}\n${d.qte} × ${d.articleNom}${commentaire.trim() ? '\nNote : ' + commentaire.trim() : ''}` })
        }
      } catch (e) { /* best effort */ }
    }

    if (statut === 'certifie') toast.success(`✅ Certifié — ${d.qte} × ${d.articleNom} sortira le ${d.dateSortie}`)
    else if (statut === 'approuve_n1') toast.success('Approuvé — en attente de certification par la GE')
    else toast.error('Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Timer size={18} className="mt-0.5 shrink-0" />
        <p>
          <strong>Validation à deux niveaux :</strong> un gérant <strong>approuve</strong>, puis la GE (ou la Direction) <strong>certifie</strong> — c'est la certification qui décompte la sortie. À défaut de traitement sous <strong>10 minutes</strong>, la demande est <strong>certifiée automatiquement</strong>. Toutes les sorties restent consultables ci-dessous.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1">
          {[['en_attente', `En attente (${nbAttente})`], ['approuve_n1', `À certifier (${nbACertifier})`], ['certifie', 'Certifiées'], ['refuse', 'Refusées'], ['tous', 'Toutes']].map(
            ([v, l]) => (
              <button
                key={v}
                onClick={() => setFiltre(v)}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${
                  filtre === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l}
              </button>
            )
          )}
        </div>
        {role !== 'superviseur' && (
          <Button className="ml-auto" onClick={openCreate}>
            <Plus size={16} /> Nouvelle demande
          </Button>
        )}
      </div>

      {filtrees.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-gray-400">Aucune demande {filtre !== 'tous' ? STATUTS[filtre]?.short.toLowerCase() : ''}.</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrees.map((d) => {
            const sn = normaliserStatut(d.statut)
            const acts = actionsDemande(d.statut, { canManage: isManager, canCertify: isCertifier })
            return (
            <Card key={d.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-800">{d.qte} × {d.articleNom}</p>
                  <p className="text-xs text-gray-500">{d.num} · {d.articleCat}</p>
                </div>
                <Badge tone={STATUTS[sn]?.tone}>{STATUTS[sn]?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                <span>👤 {d.demandeurNom}</span>
                <span>📅 Sortie : {d.dateSortie}</span>
                <span>🏷️ Motif : {d.motif}</span>
                <span>🕒 {d.date} {d.heure}</span>
              </div>
              {d.message && <p className="rounded bg-gray-50 p-2 text-xs italic text-gray-600">« {d.message} »</p>}
              {sn === 'en_attente' && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                  <Timer size={12} />
                  {minsAvantAuto(d) > 0
                    ? `Certification automatique dans ~${minsAvantAuto(d)} min`
                    : 'Certification automatique imminente…'}
                </p>
              )}
              {d.approuveN1Par && sn !== 'refuse' && (
                <p className="text-[11px] text-gray-500">Approuvé (1er niveau) par {d.approuveN1Par}{d.certifiePar ? ` · Certifié par ${d.certifiePar}` : ''}</p>
              )}
              {d.commentaireDecision && (
                <p className="text-xs text-gray-500">
                  Note : {d.commentaireDecision}
                </p>
              )}
              {acts.length > 0 && (
                <div className="pt-1">
                  <Button variant="success" size="sm" className="w-full" onClick={() => setDecision({ demande: d })}>
                    <Check size={15} /> {sn === 'approuve_n1' ? 'Certifier' : 'Traiter la demande'}
                  </Button>
                </div>
              )}
            </Card>
          )})}
        </div>
      )}

      {/* Modal création */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle demande de sortie"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={submitDemande}>Soumettre</Button></>}
      >
        <FormGroup label="Type d'article" required>
          <Select
            value={form.typeArticle}
            onChange={(e) => setForm((f) => ({ ...f, typeArticle: e.target.value, articleId: (e.target.value === 'animal' ? especes : aliments)[0]?.id || '' }))}
            options={[{ value: 'animal', label: 'Animal' }, { value: 'aliment', label: 'Aliment / Divers' }]}
          />
        </FormGroup>
        <FormGroup label="Article" required>
          <Select value={form.articleId} onChange={(e) => setForm((f) => ({ ...f, articleId: e.target.value }))}>
            {articles.map((a) => <option key={a.id} value={a.id}>{a.nom} ({a.cat})</option>)}
          </Select>
        </FormGroup>
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Quantité" required hint={`Stock dispo : ${stock}`}>
            <Input type="number" min="1" value={form.qte} onChange={(e) => setForm((f) => ({ ...f, qte: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Date de sortie" required>
            <Input type="date" value={form.dateSortie} onChange={(e) => setForm((f) => ({ ...f, dateSortie: e.target.value }))} />
          </FormGroup>
        </div>
        {form.qte > stock && (
          <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">⚠️ Quantité supérieure au stock disponible ({stock}).</p>
        )}
        <FormGroup label="Motif" required>
          <Select value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
            options={['Vente', 'Don', 'Consommation interne', 'Transfert', 'Autre'].map((m) => ({ value: m, label: m }))} />
        </FormGroup>
        <FormGroup label="Message à la hiérarchie" required>
          <textarea className="input-base" rows={3} value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Justification de la demande…" />
        </FormGroup>
      </Modal>

      {/* Modal décision */}
      <Modal
        open={!!decision}
        onClose={() => { setDecision(null); setCommentaire('') }}
        title="Traiter la demande"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDecision(null); setCommentaire('') }}>Annuler</Button>
            {decision && actionsDemande(decision.demande.statut, { canManage: isManager, canCertify: isCertifier }).map((a) => (
              <Button key={a.id} variant={a.tone === 'danger' ? 'danger' : 'success'} onClick={() => appliquerDecision(a)}>
                {a.tone === 'danger' ? <X size={15} /> : <Check size={15} />} {a.label}
              </Button>
            ))}
          </>
        }
      >
        {decision && (
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Clock size={15} /> {decision.demande.qte} × {decision.demande.articleNom}</p>
            <p className="text-xs text-gray-500">Demandé par {decision.demande.demandeurNom} pour le {decision.demande.dateSortie}</p>
            <p className="mt-1"><Badge tone={STATUTS[normaliserStatut(decision.demande.statut)]?.tone}>{STATUTS[normaliserStatut(decision.demande.statut)]?.label}</Badge></p>
          </div>
        )}
        <FormGroup label="Commentaire">
          <textarea className="input-base" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Motif d'approbation, de certification ou de refus…" />
        </FormGroup>
        <p className="text-xs text-gray-400">La sortie n'est décomptée qu'à la <strong>certification</strong> (sur la saisie du {decision?.demande?.dateSortie}).</p>
      </Modal>
    </div>
  )
}
