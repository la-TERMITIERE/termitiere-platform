// MAXI-GYM — Modale d'ajout/modification d'un coach (planning hebdomadaire :
// jours de présence + heure d'arrivée prévue). PARTAGÉE entre Paramètres (admin,
// qui garde en plus la suppression) et le volet Coachs (ouvert aux agents —
// ajout/modification uniquement, la suppression reste réservée à l'administration
// depuis Paramètres, cf. Params.jsx).
import { useState } from 'react'
import { UserCog, Clock3 } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { JOURS_SEMAINE } from './data'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { siteLabel } from './site/useSite'

const COULEUR = '#E8850F'

// `coachModal` (piloté par l'appelant) : null = fermé, { nom:'', horaires } = ajout,
// { id, nom, horaires } = modification.
export default function CoachFormModal({ coachModal, setCoachModal, site }) {
  const [saving, setSaving] = useState(false)

  async function enregistrer() {
    const d = coachModal
    if (!d.nom.trim()) return toast.error('Nom du coach requis')
    setSaving(true)
    try {
      if (d.id) {
        await updateItem('gym_coachs', d.id, { nom: d.nom.trim(), horaires: d.horaires })
        await audit('gym', 'COACH_MODIFIE', `${d.nom.trim()} — ${siteLabel(site)}`)
        toast.success('Coach modifié ✓')
      } else {
        await addItem('gym_coachs', { nom: d.nom.trim(), site, horaires: d.horaires })
        await audit('gym', 'COACH_CREATE', `${d.nom.trim()} — ${siteLabel(site)}`)
        toast.success('Coach ajouté ✓')
      }
      setCoachModal(null)
    } finally { setSaving(false) }
  }

  return (
    <Modal open={!!coachModal} onClose={() => setCoachModal(null)} size="md" title={coachModal?.id ? 'Modifier le coach' : 'Ajouter un coach'}
      {...glassModalProps(COULEUR_MODULE.gym)}
      footer={<><Button variant="outline" onClick={() => setCoachModal(null)}>Annuler</Button><Button onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
      {coachModal && (() => {
        const joursActifs = JOURS_SEMAINE.filter((j) => coachModal.horaires[j.id]?.actif)
        return (
          <div className="space-y-4">
            {/* Bandeau héro — même recette que les modales Séances/Abonnements. */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,133,15,0.35),0_8px_20px_-8px_rgba(232,133,15,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
                <UserCog size={24} color="white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{coachModal.nom || (coachModal.id ? 'Modifier le coach' : 'Nouveau coach')}</p>
                <p className="text-sm text-white/80">
                  {joursActifs.length > 0 ? `📅 ${joursActifs.length} jour${joursActifs.length > 1 ? 's' : ''} programmé${joursActifs.length > 1 ? 's' : ''}/semaine` : '📅 Aucun jour programmé encore'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <FormGroup label="👤 Nom du coach" required>
                <Input value={coachModal.nom} onChange={(e) => setCoachModal((m) => ({ ...m, nom: e.target.value }))} placeholder="ex : Willy" />
              </FormGroup>
            </div>

            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-700">📅 Jours de présence</p>
              {/* Sélecteur compact — un clic par jour, façon calendrier hebdomadaire. */}
              <div className="grid grid-cols-7 gap-1.5">
                {JOURS_SEMAINE.map((j) => {
                  const actif = coachModal.horaires[j.id]?.actif
                  return (
                    <button key={j.id} type="button"
                      onClick={() => setCoachModal((m) => ({ ...m, horaires: { ...m.horaires, [j.id]: { ...m.horaires[j.id], actif: !actif } } }))}
                      title={j.label}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                      style={actif ? { background: COULEUR, borderColor: COULEUR } : undefined}>
                      {j.label.slice(0, 3)}
                    </button>
                  )
                })}
              </div>

              {joursActifs.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700"><Clock3 size={12} /> Heure d'arrivée prévue</p>
                  {joursActifs.map((j) => {
                    const h = coachModal.horaires[j.id]
                    return (
                      <div key={j.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                        <span className="text-sm font-semibold text-gray-700">{j.label}</span>
                        <input type="time" value={h.heure}
                          onChange={(e) => setCoachModal((m) => ({ ...m, horaires: { ...m.horaires, [j.id]: { ...h, heure: e.target.value } } }))}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-700" />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-center text-xs text-gray-400">Choisis au moins un jour ci-dessus pour définir son heure d'arrivée.</p>
              )}
            </div>
          </div>
        )
      })()}
    </Modal>
  )
}
