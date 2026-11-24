// E-TACHES : rappels automatiques, en notification push, pour la personne connectée (jamais d'e-mail) :
//   • tâche à démarrer (date de début atteinte), échéance demain, échéance aujourd'hui ;
//   • tâche en retard (rappel le premier jour, puis tous les 3 jours), pour le destinataire ET pour celui qui l'a confiée.
// Chaque rappel n'est envoyé qu'une fois (claimOnce), même si plusieurs sessions sont ouvertes.
// Composant sans affichage, monté dans AppShell quand la personne a le module.
import { useEffect, useRef } from 'react'
import { claimOnce } from '../../core/db'
import { notify } from '../../core/notify'
import { todayStr } from '../../utils/formatters'
import { estArchivee, estDestinataire, estAuteur, estMembre, joursAvant } from './data'
import { useMoi, useTaches } from './hooks'

export default function RelanceTaches() {
  const { moi } = useMoi()
  const { taches } = useTaches()
  const faits = useRef(new Set())

  useEffect(() => {
    if (!moi || !taches.length) return
    const jour = todayStr()
    let annule = false

    async function envoyer(cle, payload) {
      if (faits.current.has(cle)) return
      faits.current.add(cle)
      try {
        const gagne = await claimOnce('taches_rappels', cle, { creeLe: jour }).catch(() => false)
        if (!gagne || annule) return
        await notify({ module: 'taches', forUsers: [moi], ...payload })
      } catch { /* best effort : le prochain passage réessaiera */ }
    }

    taches.filter((t) => t.statut !== 'Terminé' && !estArchivee(t, jour)).forEach((t) => {
      const mienne = estDestinataire(t, moi) || estMembre(t, moi)
      const lien = `/taches/taches?t=${t.id}`
      const reste = joursAvant(t.dateLimite, jour)
      const base = `${moi}#${t.id}`
      if (mienne) {
        if (t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour) envoyer(`${base}#debut`, { type: 'info', title: `Tâche à démarrer : ${t.titre}`, body: 'La date de début est arrivée.', link: lien })
        if (reste === 1) envoyer(`${base}#j1`, { type: 'info', title: `Échéance demain : ${t.titre}`, body: `À rendre le ${t.dateLimite.split('-').reverse().join('/')}.`, link: lien })
        if (reste === 0) envoyer(`${base}#j0`, { type: 'info', title: `Échéance aujourd'hui : ${t.titre}`, body: 'À rendre aujourd\'hui.', link: lien })
        if (reste !== null && reste < 0) envoyer(`${base}#retard#${Math.floor((-reste - 1) / 3)}`, { type: 'warning', title: `Tâche en retard : ${t.titre}`, body: `En retard de ${-reste} jour${-reste > 1 ? 's' : ''}.`, link: lien })
      } else if (estAuteur(t, moi) && reste !== null && reste < 0) {
        envoyer(`${base}#retard-auteur#${Math.floor((-reste - 1) / 3)}`, { type: 'info', title: `Tâche en retard : ${t.titre}`, body: `${t.destNom} a ${-reste} jour${-reste > 1 ? 's' : ''} de retard.`, link: lien })
      }
    })
    return () => { annule = true }
  }, [moi, taches])

  return null
}

