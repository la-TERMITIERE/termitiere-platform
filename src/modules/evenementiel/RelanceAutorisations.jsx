// Briqueterie : plus aucune autorisation n'est validée toute seule. Pour que personne ne l'oublie,
// les validateurs (administration, GE, PAU, Info, directeurs, secrétaire : VALIDATEURS_SORTIE, jamais un agent) sont alertés :
//  - RelanceAutorisations (headless, monté dans AppShell) : une notification (cloche + alerte système)
//    à la création de la demande, puis un rappel toutes les 10 minutes pendant 1 heure tant qu'elle n'est
//    pas décidée. Un seul envoi par demande et par rappel, même si plusieurs sessions sont ouvertes.
//  - AlerteAutorisations (Dashboard Briqueterie) : bandeau qui reste tant que des demandes attendent
//    une décision ; fermable, il ne revient que si la liste change.
// Le demandeur n'est jamais alerté pour sa propre demande : il ne peut pas la valider.
import { useEffect, useRef } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { claimOnce, getAll } from '../../core/db'
import { notify } from '../../core/notify'
import { VALIDATEURS_SORTIE } from '../../core/roles'
import { normaliserStatut } from '../../shared/workflow'
import AlerteDashboard, { useTick } from '../../shared/ui/AlerteDashboard'

const DELAI_MS = 10 * 60 * 1000
const CHECK_MS = 30 * 1000
const MAX_RAPPELS = 6

// Demandes qui attendent une décision (approbation ou certification).
export const aValider = (demandes) => demandes.filter((d) => ['en_attente', 'approuve_n1'].includes(normaliserStatut(d.statut)))

const libelle = (d) => d.briqueNom || d.materielNom || d.clientNom || 'Autorisation'

export default function RelanceAutorisations() {
  const { data: demandes } = useCollection('evenementiel_demandes')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function alerter(d, rang) {
      try {
        const gagne = await claimOnce('evenementiel_relance_autorisations', `${d.id}#${rang}`, { demandeId: d.id }).catch(() => false)
        if (!gagne) return
        const users = await getAll('users')
        const auteur = users.find((u) => u.login && u.login === d.demandeur)
        const etape = normaliserStatut(d.statut) === 'approuve_n1' ? 'à certifier' : 'à valider'
        await notify({
          type: 'demande',
          title: rang === 0 ? `Autorisation ${etape}` : `Autorisation toujours ${etape} ⏳`,
          body: rang === 0
            ? `${d.num || ''} : ${libelle(d)}${d.clientNom ? ' : ' + d.clientNom : ''}, demandée par ${d.demandeurNom || d.demandeur || 'un agent'}. Ouvrez les autorisations pour la valider.`
            : `${d.num || ''} : ${libelle(d)}${d.clientNom ? ' : ' + d.clientNom : ''} attend une décision depuis ${rang * 10} min (rappel ${rang}/${MAX_RAPPELS}).`,
          module: 'evenementiel',
          forRoles: VALIDATEURS_SORTIE,
          excludeUid: auteur?.uid || null,
          link: '/evenementiel/demandes'
        })
      } catch { /* best effort : le rappel suivant réessaiera */ }
    }

    function verifier() {
      const now = Date.now()
      for (const d of aValider(demandes)) {
        if (typeof d.createdAt !== 'number') continue
        const rang = Math.floor((now - d.createdAt) / DELAI_MS)
        if (rang > MAX_RAPPELS) continue
        // Rang 0 : l'alerte de création (la demande vient d'être enregistrée), puis un rappel par tranche de 10 min.
        const cle = `${d.id}#${rang}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle)
        if (!annule) alerter(d, rang)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [demandes])

  return null
}

// Bandeau du Dashboard pour les validateurs (hors demandes qu'ils ont eux-mêmes faites).
export function AlerteAutorisations({ demandes }) {
  useTick()
  const role = useAuth((s) => s.role)
  const login = useAuth((s) => s.user?.login)
  if (!VALIDATEURS_SORTIE.includes(role)) return null
  const items = aValider(demandes)
    .filter((d) => !d.demandeur || d.demandeur !== login)
    .map((d) => ({ id: d.id, texte: d.num || libelle(d), detail: d.clientNom || libelle(d) }))
  return <AlerteDashboard cle={`alerte-autorisations:${login}`} tone="red" icone={ShieldCheck}
    titre={`${items.length} autorisation${items.length > 1 ? 's' : ''} en attente de votre validation`}
    items={items} to="/evenementiel/demandes" lienLabel="Valider dans Autorisations" />
}
