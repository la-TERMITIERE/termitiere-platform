// MAXI-GYM — Nos forfaits : grille tarifaire (séances + abonnements) par catégorie,
// lue depuis les réglages configurables (cf. Paramètres / useGymParams.js). Les 3
// forfaits standards (Simple/Classique/VIP) sont modifiables ici directement (mêmes
// champs que Paramètres) et on peut ajouter des forfaits personnalisés en plus
// (stockés dans `gym_forfaits`) — tarifs/durée/avantages libres.
import { useState } from 'react'
import { Tag, Ticket, CreditCard, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { formatMoney } from '../../utils/formatters'
import { CATEGORIES_GYM } from './data'
import { useGymParams, saveGymParams } from './useGymParams'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'
const BORDURE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }

export default function Forfaits() {
  const { user, role } = useAuth()
  const peutGerer = isFullAccessRole(role)
  const params = useGymParams()
  const { data: forfaitsPerso } = useCollection('gym_forfaits')

  const [editCat, setEditCat] = useState(null) // null | 'simple' | 'classique' | 'vip'
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const [nouveauModal, setNouveauModal] = useState(null)
  const [creating, setCreating] = useState(false)

  const forfaits = {
    simple: {
      seance: formatMoney(params.tarifSeanceSimple),
      abonnement: formatMoney(params.tarifAbonnementSimple) + ' / mois',
      avantages: ['Accès salle de musculation', 'Sans tapis roulant ni escalator']
    },
    classique: {
      seance: 'Non proposée (abonnement uniquement)',
      abonnement: `Tarif et durée libres (min. ${params.dureeClassiqueMinJours} jours)`,
      avantages: ['Réservé aux abonnements — pas de séance ponctuelle', 'Durée définie à la demande', `Minimum ${params.dureeClassiqueMinJours} jours (deux semaines)`, 'Tarif négocié à la souscription']
    },
    vip: {
      seance: formatMoney(params.tarifSeanceVip),
      abonnement: formatMoney(params.tarifAbonnementVip) + ' / mois',
      avantages: ['Accès complet à la salle', 'Tapis roulant et escalator inclus']
    }
  }

  function ouvrirEdit(catId) {
    setEditCat(catId)
    if (catId === 'classique') {
      setEditForm({ dureeClassiqueMinJours: String(params.dureeClassiqueMinJours) })
    } else {
      setEditForm({
        tarifSeance: String(catId === 'simple' ? params.tarifSeanceSimple : params.tarifSeanceVip),
        tarifAbonnement: String(catId === 'simple' ? params.tarifAbonnementSimple : params.tarifAbonnementVip)
      })
    }
  }

  async function enregistrerEdit() {
    setSaving(true)
    try {
      const maj = { ...params }
      if (editCat === 'classique') {
        maj.dureeClassiqueMinJours = Number(editForm.dureeClassiqueMinJours) || params.dureeClassiqueMinJours
      } else if (editCat === 'simple') {
        maj.tarifSeanceSimple = Number(editForm.tarifSeance) || 0
        maj.tarifAbonnementSimple = Number(editForm.tarifAbonnement) || 0
      } else if (editCat === 'vip') {
        maj.tarifSeanceVip = Number(editForm.tarifSeance) || 0
        maj.tarifAbonnementVip = Number(editForm.tarifAbonnement) || 0
      }
      await saveGymParams(maj, user)
      toast.success('Forfait mis à jour ✓')
      setEditCat(null)
    } finally { setSaving(false) }
  }

  async function creerForfait() {
    const f = nouveauModal
    if (!f.nom.trim()) return toast.error('Nom du forfait requis')
    setCreating(true)
    try {
      await addItem('gym_forfaits', {
        nom: f.nom.trim(),
        tarifSeance: f.tarifSeance ? Number(f.tarifSeance) : null,
        tarifAbonnement: f.tarifAbonnement ? Number(f.tarifAbonnement) : null,
        avantages: f.avantages.split('\n').map((l) => l.trim()).filter(Boolean),
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'FORFAIT_CREATE', f.nom.trim())
      toast.success('Forfait ajouté ✓')
      setNouveauModal(null)
    } finally { setCreating(false) }
  }

  async function supprimerForfait(f) {
    if (!confirm(`Supprimer le forfait « ${f.nom} » ?`)) return
    await removeItem('gym_forfaits', f.id)
    await audit('gym', 'FORFAIT_DELETE', f.nom)
    toast.success('Forfait supprimé')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div className="flex items-center gap-4">
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
          }}>
            <Tag size={28} color="white" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">Nos forfaits</h2>
            <p className="text-sm text-white/80">Tarifs des séances et abonnements par catégorie</p>
          </div>
        </div>
        {peutGerer && (
          <Button variant="outline" className="!border-white/50 !bg-white/10 !text-white hover:!bg-white/20"
            onClick={() => setNouveauModal({ nom: '', tarifSeance: '', tarifAbonnement: '', avantages: '' })}>
            <Plus size={16} /> Ajouter un forfait
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CATEGORIES_GYM.map((c) => (
          <Card key={c.id} className="overflow-hidden p-0">
            <div className="border-t-4 p-4" style={{ borderColor: BORDURE[c.id] }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-gray-800">{c.label}</h3>
                <div className="flex items-center gap-1.5">
                  <Badge tone={c.tone}>{c.label}</Badge>
                  {peutGerer && (
                    <button onClick={() => ouvrirEdit(c.id)} title="Modifier" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
              <p className="mb-4 text-sm text-gray-500">{c.desc}</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><Ticket size={15} /> Séance</span>
                  <span className="font-bold text-gray-800">{forfaits[c.id].seance}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><CreditCard size={15} /> Abonnement</span>
                  <span className="font-bold text-gray-800">{forfaits[c.id].abonnement}</span>
                </div>
              </div>

              <ul className="mt-4 space-y-1.5">
                {forfaits[c.id].avantages.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-gray-600">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {a}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}

        {forfaitsPerso.map((f) => (
          <Card key={f.id} className="overflow-hidden p-0">
            <div className="border-t-4 p-4" style={{ borderColor: COULEUR2 }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-gray-800">{f.nom}</h3>
                {peutGerer && (
                  <button onClick={() => supprimerForfait(f)} title="Supprimer" className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><Ticket size={15} /> Séance</span>
                  <span className="font-bold text-gray-800">{f.tarifSeance != null ? formatMoney(f.tarifSeance) : 'Non proposé'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><CreditCard size={15} /> Abonnement</span>
                  <span className="font-bold text-gray-800">{f.tarifAbonnement != null ? formatMoney(f.tarifAbonnement) : 'Non proposé'}</span>
                </div>
              </div>

              {f.avantages?.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {f.avantages.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Modification d'un forfait standard */}
      <Modal open={!!editCat} onClose={() => setEditCat(null)} title={editCat ? `Modifier — ${CATEGORIES_GYM.find((c) => c.id === editCat)?.label}` : ''}
        footer={<><Button variant="outline" onClick={() => setEditCat(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrerEdit} loading={saving}>Enregistrer</Button></>}>
        {editForm && (
          <div className="space-y-3">
            {editCat === 'classique' ? (
              <FormGroup label="Durée minimum (jours)" required hint="Deux semaines minimum — pas d'offre d'une semaine.">
                <Input type="number" min="1" value={editForm.dureeClassiqueMinJours}
                  onChange={(e) => setEditForm((f) => ({ ...f, dureeClassiqueMinJours: e.target.value }))} />
              </FormGroup>
            ) : (
              <>
                <FormGroup label="Tarif séance (FCFA)" required>
                  <Input type="number" min="0" value={editForm.tarifSeance}
                    onChange={(e) => setEditForm((f) => ({ ...f, tarifSeance: e.target.value }))} />
                </FormGroup>
                <FormGroup label="Tarif abonnement (FCFA / mois)" required>
                  <Input type="number" min="0" value={editForm.tarifAbonnement}
                    onChange={(e) => setEditForm((f) => ({ ...f, tarifAbonnement: e.target.value }))} />
                </FormGroup>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Nouveau forfait personnalisé */}
      <Modal open={!!nouveauModal} onClose={() => setNouveauModal(null)} title="Nouveau forfait"
        footer={<><Button variant="outline" onClick={() => setNouveauModal(null)} disabled={creating}>Annuler</Button><Button onClick={creerForfait} loading={creating}>Ajouter</Button></>}>
        {nouveauModal && (
          <div className="space-y-3">
            <FormGroup label="Nom du forfait" required>
              <Input value={nouveauModal.nom} onChange={(e) => setNouveauModal((f) => ({ ...f, nom: e.target.value }))} placeholder="ex : Forfait Étudiant" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Tarif séance (FCFA)" hint="Optionnel">
                <Input type="number" min="0" value={nouveauModal.tarifSeance} onChange={(e) => setNouveauModal((f) => ({ ...f, tarifSeance: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Tarif abonnement (FCFA)" hint="Optionnel">
                <Input type="number" min="0" value={nouveauModal.tarifAbonnement} onChange={(e) => setNouveauModal((f) => ({ ...f, tarifAbonnement: e.target.value }))} />
              </FormGroup>
            </div>
            <FormGroup label="Avantages" hint="Un avantage par ligne">
              <textarea value={nouveauModal.avantages} onChange={(e) => setNouveauModal((f) => ({ ...f, avantages: e.target.value }))}
                rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                placeholder={'ex : Accès salle\nCours collectifs inclus'} />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
