// Approbation automatique des demandes (autorisations) de sortie MAXI-AGRO :
// toute demande restée « en attente » plus de 10 minutes est approuvée
// automatiquement. L'approbation déclenche le décompte automatique de la sortie
// (la page Saisie lit les demandes approuvées). Couvre TOUS les motifs : ventes,
// dons, transferts, consommation interne et autres sous-demandes de sortie.
//
// Composant « headless » (aucun rendu) monté globalement dans AppShell pour les
// utilisateurs disposant du module agro : la vérification tourne tant que
// l'application est ouverte, même si personne n'est sur la page des demandes.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { useAuth } from '../hooks/useAuth'
import { updateItem, ts } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { pushToUsers } from '../core/push'
import { todayStr, nowHM } from '../utils/formatters'
import { appliquerDemandeAuStock } from '../modules/agro/applyDemande'
import { estFinal } from './workflow'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes sans décision → approbation auto
const CHECK_MS = 30 * 1000      // fréquence de vérification

// Horodatage de création. On n'utilise QUE `createdAt`, posé à l'écriture.
// L'ancien repli sur `date` + `heure` — deux champs saisis par le DEMANDEUR —
// permettait d'antidater une demande pour la faire approuver automatiquement
// sur-le-champ. Renvoie null si l'horodatage est absent ou incohérent :
// la demande exige alors une décision humaine. (Audit sécurité 2026-08-04)
function createdMs(d) {
  if (typeof d.createdAt !== 'number' || !Number.isFinite(d.createdAt)) return null
  if (d.createdAt > Date.now() + 60000) return null
  return d.createdAt
}

export default function AutoApproveDemandes() {
  const { data: demandes } = useCollection('agro_demandes')
  const moi = useAuth((s) => s.user?.login)
  const traitees = useRef(new Set()) // évite de retraiter la même demande

  useEffect(() => {
    let annule = false

    async function autoApprouver(d) {
      try {
        const horodate = todayStr() + ' ' + nowHM()
        await updateItem('agro_demandes', d.id, {
          statut: 'certifie',
          approbateur: 'systeme',
          approbateurNom: 'Système (auto · 10 min)',
          approuveN1Par: d.approuveN1Par || 'Système (auto · 10 min)',
          approuveN1Le: d.approuveN1Le || horodate,
          certifiePar: 'Système (auto · 10 min)',
          certifieLe: horodate,
          dateDecision: horodate,
          commentaireDecision: 'Certification automatique : aucune décision sous 10 minutes',
          decidedAt: ts(),
          autoApprouve: true
        })
        // Décompte immédiat de la sortie (comptabilisée comme sortie/vente).
        await appliquerDemandeAuStock({ ...d, statut: 'certifie' })
        await audit('agro', 'CERTIFICATION', `${d.num} — ${d.qte} × ${d.articleNom} (auto 10 min)`)
        await notify({
          type: 'approuve',
          title: 'Demande certifiée automatiquement ✅',
          body: `${d.qte} × ${d.articleNom} — délai de 10 min dépassé, sortie décomptée`,
          module: 'agro',
          forUsers: [d.demandeur],
          link: '/agro/demandes'
        })
        pushToUsers([d.demandeur], {
          title: 'Demande certifiée automatiquement ✅',
          body: `${d.num} : ${d.qte} × ${d.articleNom}`,
          url: '/agro/demandes'
        })
      } catch (e) { /* best effort — un autre client réessaiera */ }
    }

    function verifier() {
      const now = Date.now()
      for (const d of demandes) {
        if (estFinal(d.statut)) continue // déjà certifiée ou refusée
        if (traitees.current.has(d.id)) continue
        // Le navigateur du demandeur ne valide pas sa propre demande : ce
        // composant tourne chez chaque utilisateur connecté, laissons un tiers.
        if (moi && d.demandeur && d.demandeur === moi) continue
        const cree = createdMs(d)
        if (cree === null) continue // horodatage non fiable → décision humaine
        if (now - cree < DELAI_MS) continue
        traitees.current.add(d.id)
        if (!annule) autoApprouver(d)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [demandes, moi])

  return null
}
