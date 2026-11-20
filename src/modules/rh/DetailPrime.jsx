// RH : détail d'une prime et son circuit, le même que les autorisations de salaire : Demande (RH) → Validation (DF) → Approbation (GE) → Autorisation (PAU).
// Une fois la dernière étape cochée, la prime s'ajoute au salaire. Utilisé par la page Primes et par la page d'accueil du portail.
import { useState } from 'react'
import { Check, X, Pencil, Trash2, Send, CalendarDays, Wallet, Layers, AlignLeft, Users, Gift, Repeat, Ban } from 'lucide-react'
import DetailFiche from './DetailFiche'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { STATUTS_PRIME } from './store/rhStore'
import { RefusMissionModal } from './DetailMission'
import { moisEnClair } from './DetailAvance'
import { ChapeletAutorisation, ETAPES } from './DetailAutorisationSalaire'
import { peutTraiterPrime, etapeCourante, validerEtapePrime, refuserPrime, arreterPrime, resumePrime, cibleLibelle, valeurLibelle, employesConcernes, montantPourEmploye, totalEstime } from './primesCircuit'

const jourCourt = (iso) => (iso ? formatDateShort(String(iso).slice(0, 10)) : '')
export const periodePrime = (p) => (p.periodicite === 'ponctuelle' ? `Une seule fois : ${moisEnClair(p.moisDebut)}` : `Chaque mois dès ${moisEnClair(p.moisDebut)}${p.moisFin ? ` jusqu'à ${moisEnClair(p.moisFin)}` : ', jusqu\'à son arrêt'}`)

export default function DetailPrime({ prime, employes = [], onClose, onModifier, onSupprimer }) {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: users } = useCollection('users')
  const [refus, setRefus] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  if (!prime) return null
  const p = prime
  const statut = p.statut || 'en_attente'
  const st = STATUTS_PRIME[statut]
  const complet = isFullAccessRole(role)
  const etape = etapeCourante(p)
  const concernes = employesConcernes(p, employes)
  const encoreActive = statut === 'autorise' && p.periodicite !== 'ponctuelle' && !p.moisFin

  async function valider() {
    setEnvoi(true)
    try {
      const r = await validerEtapePrime(p, user)
      toast.success(r.fin ? `Prime autorisée : elle s'ajoute au salaire${r.ajoutes ? ` (${r.ajoutes} bulletin(s) mis à jour)` : ''}${r.verrouilles ? ` · ${r.verrouilles} bulletin(s) déjà validé(s) non modifié(s)` : ''}` : `${r.etape.fait} ✓ : transmise à ${r.suivante.sigle}`)
      onClose()
    } finally { setEnvoi(false) }
  }
  const actions = []
  if (onSupprimer && complet && ['en_attente', 'refuse'].includes(statut) && !Object.keys(p.validations || {}).length) actions.push({ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => onSupprimer(p) })
  if (onModifier && complet && statut === 'refuse') actions.push({ label: 'Corriger et renvoyer', icone: Pencil, tone: 'neutre', onClick: () => onModifier(p) })
  else if (onModifier && complet && statut === 'en_attente' && !Object.keys(p.validations || {}).length) actions.push({ label: 'Modifier', icone: Pencil, tone: 'neutre', onClick: () => onModifier(p) })
  if (peutTraiterPrime(p, user, role)) {
    actions.push({ label: 'Refuser', icone: X, tone: 'danger', onClick: () => setRefus(true) })
    actions.push({ label: etape.cle === 'autorisation' ? 'Autoriser la prime' : etape.verbe, icone: Check, tone: 'succes', onClick: valider })
  }
  if (encoreActive && complet) actions.push({ label: 'Arrêter cette prime', icone: Ban, tone: 'neutre', onClick: async () => { setEnvoi(true); try { await arreterPrime(p); toast.success('Prime arrêtée : elle ne figurera plus après ce mois'); onClose() } finally { setEnvoi(false) } } })

  return (
    <>
      <DetailFiche onClose={onClose} actions={envoi ? [] : actions}
        fiche={{
          titre: p.typeNom || 'Prime', sous: `${cibleLibelle(p)} : ${valeurLibelle(p)}`, couleur: '#be185d', badge: { label: st?.label, tone: st?.tone },
          enfants: (
            <div className="rounded-2xl border border-white/80 bg-white/70 px-3 py-3 backdrop-blur-md">
              <span className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Circuit de la demande</span>
              <ChapeletAutorisation d={p} users={users} />
              {etape && <p className="mt-2 text-[11px] text-gray-500">Étape en cours : {etape.label} ({etape.sigle}). La prime s'ajoute au salaire à la fin du circuit.</p>}
            </div>
          ),
          tuiles: [
            { icone: Gift, label: 'Type', valeur: p.typeNom },
            { icone: Users, label: 'Pour', valeur: cibleLibelle(p) },
            { icone: Wallet, label: 'Valeur', valeur: valeurLibelle(p), couleur: '#16a34a' },
            { icone: p.periodicite === 'ponctuelle' ? CalendarDays : Repeat, label: 'Période', valeur: periodePrime(p), large: true },
            { icone: Layers, label: 'Total estimé par mois', valeur: concernes.length ? formatMoney(totalEstime(p, employes)) : '', couleur: '#be185d' },
            { icone: Users, label: `Employés concernés (${concernes.length})`, large: true,
              valeur: concernes.slice(0, 12).map((e) => `${e.nom} : ${formatMoney(montantPourEmploye(p, e))}`).join(' · ') + (concernes.length > 12 ? ` · et ${concernes.length - 12} autre(s)` : '') },
            { icone: AlignLeft, label: 'Motif', valeur: p.motif, large: true },
            { icone: Send, label: 'Demande', valeur: p.creePar ? `Saisie par ${p.creePar}${p.creeLe ? ` le ${jourCourt(p.creeLe)}` : ''}` : '', large: true },
            ...ETAPES.filter((e) => e.role && p.validations?.[e.cle]).map((e) => ({ icone: Check, label: `${e.label} (${e.sigle})`, valeur: `${e.fait} par ${p.validations[e.cle].par || e.sigle}${p.validations[e.cle].le ? ` le ${jourCourt(p.validations[e.cle].le)}` : ''}`, large: true, couleur: e.coul })),
            { icone: X, label: `Refusée par ${p.refus?.par || p.decidePar || '?'}${p.refus?.etape ? ` (étape ${ETAPES.find((e) => e.cle === p.refus.etape)?.label})` : ''}`, valeur: statut === 'refuse' ? (p.motifRefus || 'Aucun motif') : '', large: true, couleur: '#dc2626' }
          ]
        }} />
      {refus && <RefusMissionModal mission={p} employes={employes} onClose={() => setRefus(false)} onFait={onClose} refuser={refuserPrime} resume={resumePrime} titre="Refuser la prime" />}
    </>
  )
}
