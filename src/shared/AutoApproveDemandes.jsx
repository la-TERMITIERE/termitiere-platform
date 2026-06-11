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
import { updateItem, ts } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { pushToUsers } from '../core/push'
import { todayStr, nowHM } from '../utils/formatters'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes sans décision → approbation auto
const CHECK_MS = 30 * 1000      // fréquence de vérification

// Horodatage de création (createdAt ajouté par addItem ; repli sur date + heure).
function createdMs(d) {
  if (typeof d.createdAt === 'number') return d.createdAt
  if (d.date) {
    const t = new Date(`${d.date}T${d.heure || '00:00'}:00`).getTime()
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

export default function AutoApproveDemandes() {
  const { data: demandes } = useCollection('agro_demandes')
  const traitees = useRef(new Set()) // évite de retraiter la même demande

  useEffect(() => {
    let annule = false

    async function autoApprouver(d) {
      try {
        await updateItem('agro_demandes', d.id, {
          statut: 'approuve',
          approbateur: 'systeme',
          approbateurNom: 'Système (auto · 10 min)',
          dateDecision: todayStr() + ' ' + nowHM(),
          commentaireDecision: 'Approbation automatique : aucune décision sous 10 minutes',
          decidedAt: ts(),
          autoApprouve: true
        })
        await audit('agro', 'APPROBATION', `${d.num} — ${d.qte} × ${d.articleNom} (auto 10 min)`)
        await notify({
          type: 'approuve',
          title: 'Demande approuvée automatiquement ✅',
          body: `${d.qte} × ${d.articleNom} — délai de 10 min dépassé, sortie décomptée`,
          module: 'agro',
          forUsers: [d.demandeur],
          link: '/agro/demandes'
        })
        pushToUsers([d.demandeur], {
          title: 'Demande approuvée automatiquement ✅',
          body: `${d.num} : ${d.qte} × ${d.articleNom}`,
          url: '/agro/demandes'
        })
      } catch (e) { /* best effort — un autre client réessaiera */ }
    }

    function verifier() {
      const now = Date.now()
      for (const d of demandes) {
        if (d.statut !== 'en_attente') continue
        if (traitees.current.has(d.id)) continue
        if (now - createdMs(d) < DELAI_MS) continue
        traitees.current.add(d.id)
        if (!annule) autoApprouver(d)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [demandes])

  return null
}
