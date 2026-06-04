// Demandes de sortie MAXI-AGRO — workflow Agent → Contrôleur/Admin.
//  1. L'agent crée une demande (statut en_attente).
//  2. L'admin/contrôleur approuve ou refuse avec commentaire.
//  3. À l'approbation, la sortie est automatiquement reportée dans la saisie
//     du jour `dateSortie` (la page Saisie lit les demandes approuvées).
import { useMemo, useState } from 'react'
import { Plus, Check, X, Clock } from 'lucide-react'
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
import { addItem, updateItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, genNumero, formatDateTime } from '../../utils/formatters'
import { dernierStock } from './logic'

const STATUTS = {
  en_attente: { label: '⏳ En attente', tone: 'warning' },
  approuve: { label: '✅ Approuvé', tone: 'success' },
  refuse: { label: '❌ Refusé', tone: 'danger' }
}

export default function Demandes() {
  const { user, canManage } = useAuth()
  const { data: liste } = useCollection('agro_demandes')
  const { data: inventaires } = useCollection('agro_inventaires')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const isManager = canManage()

  const [filtre, setFiltre] = useState('en_attente')
  const [createOpen, setCreateOpen] = useState(false)
  const [decision, setDecision] = useState(null) // { demande, action }

  // Formulaire de création
  const [form, setForm] = useState({
    typeArticle: 'animal', articleId: '', qte: 1, dateSortie: todayStr(), motif: 'Vente', message: ''
  })
  const articles = form.typeArticle === 'animal' ? especes : aliments
  const stock = dernierStock(inventaires, form.typeArticle, form.articleId || articles[0]?.id)
  const [commentaire, setCommentaire] = useState('')

  const filtrees = useMemo(
    () =>
      [...liste]
        .filter((d) => (filtre === 'tous' ? true : d.statut === filtre))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [liste, filtre]
  )
  const nbAttente = liste.filter((d) => d.statut === 'en_attente').length

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
      forRoles: ['admin', 'controleur'],
      excludeUid: user.uid,
      link: '/agro/demandes'
    })
    toast.success('📤 Demande soumise à la hiérarchie ✓')
    setCreateOpen(false)
  }

  async function appliquerDecision(statut) {
    const d = decision.demande
    await updateItem('agro_demandes', d.id, {
      statut,
      approbateur: user.login,
      approbateurNom: user.nom,
      dateDecision: todayStr() + ' ' + nowHM(),
      commentaireDecision: commentaire.trim(),
      decidedAt: ts()
    })
    await audit('agro', statut === 'approuve' ? 'APPROBATION' : 'REFUS',
      `${d.num} — ${d.qte} × ${d.articleNom} (${d.demandeurNom})`)
    // Notifie le demandeur de la décision.
    await notify({
      type: statut === 'approuve' ? 'approuve' : 'refus',
      title: statut === 'approuve' ? 'Demande approuvée ✅' : 'Demande refusée ⛔',
      body: `${d.qte} × ${d.articleNom}${commentaire.trim() ? ' — ' + commentaire.trim() : ''}`,
      module: 'agro',
      forUsers: [d.demandeur],
      excludeUid: user.uid,
      link: '/agro/demandes'
    })
    if (statut === 'approuve')
      toast.success(`✅ Approuvé — ${d.qte} × ${d.articleNom} sortira le ${d.dateSortie}`)
    else toast.error('Demande refusée')
    setDecision(null)
    setCommentaire('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-white p-1">
          {[['en_attente', `En attente (${nbAttente})`], ['approuve', 'Approuvées'], ['refuse', 'Refusées'], ['tous', 'Toutes']].map(
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
        <Button className="ml-auto" onClick={openCreate}>
          <Plus size={16} /> Nouvelle demande
        </Button>
      </div>

      {filtrees.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-gray-400">Aucune demande {filtre !== 'tous' ? STATUTS[filtre]?.label.toLowerCase() : ''}.</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrees.map((d) => (
            <Card key={d.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-800">{d.qte} × {d.articleNom}</p>
                  <p className="text-xs text-gray-500">{d.num} · {d.articleCat}</p>
                </div>
                <Badge tone={STATUTS[d.statut]?.tone}>{STATUTS[d.statut]?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                <span>👤 {d.demandeurNom}</span>
                <span>📅 Sortie : {d.dateSortie}</span>
                <span>🏷️ Motif : {d.motif}</span>
                <span>🕒 {d.date} {d.heure}</span>
              </div>
              {d.message && <p className="rounded bg-gray-50 p-2 text-xs italic text-gray-600">« {d.message} »</p>}
              {d.commentaireDecision && (
                <p className="text-xs text-gray-500">
                  Décision par {d.approbateurNom} : {d.commentaireDecision}
                </p>
              )}
              {isManager && d.statut === 'en_attente' && (
                <div className="flex gap-2 pt-1">
                  <Button variant="success" size="sm" className="flex-1" onClick={() => setDecision({ demande: d, action: 'approuve' })}>
                    <Check size={15} /> Approuver
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => setDecision({ demande: d, action: 'refuse' })}>
                    <X size={15} /> Refuser
                  </Button>
                </div>
              )}
            </Card>
          ))}
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
        title={decision?.action === 'approuve' ? 'Approuver la demande' : 'Refuser la demande'}
        footer={
          <>
            <Button variant="danger" onClick={() => appliquerDecision('refuse')}><X size={15} /> Refuser</Button>
            <Button variant="success" onClick={() => appliquerDecision('approuve')}><Check size={15} /> Approuver</Button>
          </>
        }
      >
        {decision && (
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Clock size={15} /> {decision.demande.qte} × {decision.demande.articleNom}</p>
            <p className="text-xs text-gray-500">Demandé par {decision.demande.demandeurNom} pour le {decision.demande.dateSortie}</p>
          </div>
        )}
        <FormGroup label="Commentaire">
          <textarea className="input-base" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Motif d'approbation ou de refus…" />
        </FormGroup>
        <p className="text-xs text-gray-400">À l'approbation, la sortie sera automatiquement ajoutée à la saisie du {decision?.demande?.dateSortie}.</p>
      </Modal>
    </div>
  )
}
