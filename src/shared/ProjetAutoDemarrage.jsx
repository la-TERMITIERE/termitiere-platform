// Démarrage automatique des projets E-G.Pro : dès que la date de début d'un projet en
// « Planification » est atteinte, il passe automatiquement à « En cours » — sans que
// personne ait besoin de cliquer sur « Démarrer ». Une notification est envoyée au chef
// de projet (responsable) et à la direction (rôles à accès total).
//
// Composant « headless » (aucun rendu) monté globalement dans AppShell pour les
// utilisateurs disposant du module projet : la vérification tourne tant que
// l'application est ouverte, même si personne n'est sur une page E-G.Pro.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { setItem } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { pushToUsers } from '../core/push'
import { FULL_ACCESS_ROLES } from '../core/roles'

const CHECK_MS = 60 * 1000 // vérifie chaque minute — suffisant pour un déclenchement à la date

export default function ProjetAutoDemarrage() {
  const { data: projets } = useCollection('projets')
  const traites = useRef(new Set()) // évite de retraiter le même projet plusieurs fois

  useEffect(() => {
    let annule = false

    async function demarrer(p) {
      try {
        await setItem('projets', p.id, { ...p, statut: 'en_cours', updatedAt: Date.now() })
        await audit('projet', 'projet_modifie', `${p.nom} — démarrage automatique (date de début atteinte)`)
        const forUsers = p.responsableUid ? [p.responsableUid] : []
        await notify({
          type: 'info',
          title: '🚀 Projet démarré automatiquement',
          body: `${p.nom} a atteint sa date de début et passe « En cours ».`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, link: '/projet/projets/liste', state: { openProjetId: p.id }
        })
        if (forUsers.length) {
          pushToUsers(forUsers, { title: '🚀 Projet démarré automatiquement', body: p.nom, url: '/projet/projets/liste' })
        }
      } catch (e) { /* best effort — un autre client réessaiera au prochain tick */ }
    }

    function verifier() {
      const now = Date.now()
      for (const p of projets) {
        if (p.statut !== 'planification') continue   // déjà démarré/terminé/annulé/en pause
        if (!p.dateDebut || p.dateDebut > now) continue // pas encore de date, ou date future
        if (traites.current.has(p.id)) continue
        traites.current.add(p.id)
        if (!annule) demarrer(p)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [projets])

  return null
}
