// MAXI-GYM — Paramètres : tarifs, durées et validité, réservé à l'administration.
import { useEffect, useMemo, useState } from 'react'
import { Settings, Save, AlertTriangle, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { useGymParams, saveGymParams } from './useGymParams'
import { useSite, matchSite, siteLabel } from './site/useSite'

const COULEUR = '#E8850F'
const TEXTE_CONFIRMATION = 'RÉINITIALISER'

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
  { nom: 'gym_presences', label: 'Arrivées pointées' }
]

export default function Params() {
  const { user } = useAuth()
  const site = useSite()
  const params = useGymParams()
  const [form, setForm] = useState(params)
  const [saving, setSaving] = useState(false)

  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const donnees = { gym_seances: seances, gym_abonnements: abonnements, gym_clients: clients, gym_factures: factures, gym_presences: presences }
  const totalEnregistrements = COLLECTIONS_A_VIDER.reduce((s, c) => s + (donnees[c.nom]?.length || 0), 0)

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
      await audit('gym', 'RESET_TOTAL', `Réinitialisation de MAXI-GYM ${siteLabel(site)} par ${user?.nom || user?.login || '—'} — ${compte} enregistrement(s) supprimé(s)`)
      toast.success(`MAXI-GYM ${siteLabel(site)} réinitialisé ✓`)
      setConfirmTexte('')
    } finally {
      setResetting(false)
    }
  }

  // Les valeurs chargées depuis Firebase arrivent après le premier rendu — on
  // resynchronise le formulaire dès qu'elles sont disponibles (une seule fois,
  // pour ne pas écraser une saisie en cours si le doc change entre-temps ailleurs).
  useEffect(() => { setForm(params) }, [params.tarifSeanceSimple, params.tarifSeanceVip, params.tarifAbonnementSimple, params.tarifAbonnementVip, params.dureeClassiqueMinJours, params.validiteSeanceHeures])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }))

  async function enregistrer() {
    setSaving(true)
    try {
      await saveGymParams(form, user)
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
          <p className="text-sm text-white/80">Tarifs, durées et validité — MAXI-GYM</p>
        </div>
      </div>

      <Card title="🎫 Tarifs des séances (FCFA)">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Simple">
            <Input type="number" min="0" value={form.tarifSeanceSimple} onChange={set('tarifSeanceSimple')} />
          </FormGroup>
          <FormGroup label="VIP">
            <Input type="number" min="0" value={form.tarifSeanceVip} onChange={set('tarifSeanceVip')} />
          </FormGroup>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Le Classique n'a pas de tarif fixe — prix libre à la saisie.</p>
      </Card>

      <Card title="💳 Tarifs des abonnements (FCFA)">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Simple">
            <Input type="number" min="0" value={form.tarifAbonnementSimple} onChange={set('tarifAbonnementSimple')} />
          </FormGroup>
          <FormGroup label="VIP">
            <Input type="number" min="0" value={form.tarifAbonnementVip} onChange={set('tarifAbonnementVip')} />
          </FormGroup>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Simple et VIP sont toujours valables 1 mois calendaire. Le Classique n'a pas de tarif fixe.</p>
      </Card>

      <Card title="⏱️ Durées et validité">
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Validité d'une séance (heures)">
            <Input type="number" min="1" value={form.validiteSeanceHeures} onChange={set('validiteSeanceHeures')} />
          </FormGroup>
          <FormGroup label="Durée minimale — Abonnement Classique (jours)">
            <Input type="number" min="1" value={form.dureeClassiqueMinJours} onChange={set('dureeClassiqueMinJours')} />
          </FormGroup>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={enregistrer} loading={saving}><Save size={16} /> Enregistrer les réglages</Button>
      </div>

      <Card className="border-2 border-red-200 bg-red-50/60">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600" />
          <h3 className="text-base font-extrabold text-red-800">Zone de danger — Réinitialiser MAXI-GYM {siteLabel(site)}</h3>
        </div>
        <p className="mb-3 text-sm text-red-800">
          Supprime <strong>définitivement et sans possibilité de retour</strong> les données de la salle <strong>{siteLabel(site)}</strong> uniquement — l'autre salle n'est pas affectée, de même que les forfaits personnalisés, communs aux deux salles :
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
        <FormGroup label={`Pour confirmer, tape exactement « ${TEXTE_CONFIRMATION} »`}>
          <Input value={confirmTexte} onChange={(e) => setConfirmTexte(e.target.value)} placeholder={TEXTE_CONFIRMATION}
            className="border-red-300 focus:border-red-500 focus:ring-red-400/40" />
        </FormGroup>
        <Button variant="danger" disabled={confirmTexte !== TEXTE_CONFIRMATION || totalEnregistrements === 0}
          loading={resetting} onClick={reinitialiserTout}>
          <Trash2 size={16} /> Réinitialiser définitivement MAXI-GYM
        </Button>
      </Card>
    </div>
  )
}
