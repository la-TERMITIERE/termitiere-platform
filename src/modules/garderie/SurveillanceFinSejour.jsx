// Surveille les enfants en « Court séjour » (abonnement à la semaine, cf.
// dateFinCourtSejour dans logic.js — calculé à partir de la DATE D'INSCRIPTION,
// jamais de la date du jour) : dès que la durée est écoulée, déclenche UNE SEULE
// notification et pose une alarme PERSISTANTE (visible sur le Dashboard) jusqu'à
// ce qu'un responsable la clôture explicitement (cf. Enfants.jsx → resoudreFinSejour)
// — même principe que l'alarme des incidents (garderie_incidents → alarme/résolu).
// Composant « headless » (aucun rendu), monté dans AppShell.
import { useEffect, useRef } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { todayStr } from '../../utils/formatters'
import { dateFinCourtSejour } from './logic'

const CHECK_MS = 60 * 1000 // une échéance se joue en jours : pas besoin de vérifier plus souvent

export default function SurveillanceFinSejour() {
  const { data: enfants } = useCollection('garderie_enfants')
  const traites = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function declencherAlarme(e) {
      try {
        await updateItem('garderie_enfants', e.id, { finSejourAlarme: true, finSejourAlarmeLe: Date.now() })
        await audit('garderie', 'FIN_SEJOUR_ALARME', `${e.prenom} ${e.nom}`)
        await notify({
          type: 'alerte',
          title: `⏰ Séjour terminé — ${e.prenom} ${e.nom}`,
          body: `Le court séjour de ${e.dureeSemaines} semaine(s) (inscrit le ${e.dateInscription}) est arrivé à échéance.`,
          module: 'garderie',
          forRoles: ['ge', 'gerante_garderie'],
          link: '/garderie'
        })
      } catch (err) { /* best effort — un autre client réessaiera au prochain tick */ }
    }

    function verifier() {
      const today = todayStr()
      for (const e of enfants) {
        if (e.typeAbonnement !== 'court_sejour') continue
        if (e.statut !== 'actif') continue
        if (e.finSejourAlarme) continue // déjà déclenchée (persistante tant que non résolue)
        if (traites.current.has(e.id)) continue
        const fin = dateFinCourtSejour(e.dateInscription, e.dureeSemaines)
        if (!fin || fin > today) continue
        traites.current.add(e.id) // réserve immédiatement, avant l'écriture async
        if (!annule) declencherAlarme(e)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [enfants])

  return null
}
