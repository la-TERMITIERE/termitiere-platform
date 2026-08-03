// Notifications automatiques des alertes E-G.Pro — remplace l'ancien onglet Alertes.
// Destinataires : le responsable du projet concerné + les membres de la direction.
// Une alerte non résolue relance une notification :
//   - « Budget dépassé » : une seule fois par JOUR.
//   - tout le reste (projet en retard, tâche en dépassement, tâche en retard,
//     aucun avancement) : une seule fois par SEMAINE (7 jours depuis le dernier envoi).
// « Projet terminé » est une bonne nouvelle : une seule notification, jamais répétée.
// « Reste à payer » reste groupé, visible uniquement dans le bandeau du Dashboard —
// jamais poussé en notification (trop fréquent pour relancer en boucle).
//
// Composant « headless » (aucun rendu) monté globalement dans AppShell pour les
// utilisateurs disposant du module projet : la vérification tourne tant que
// l'application est ouverte, même si personne n'est sur une page E-G.Pro.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { getOne, setItem, claimOnce } from '../core/db'
import { notify } from '../core/notify'
import { FULL_ACCESS_ROLES } from '../core/roles'
import { genererAlertes } from '../modules/projet/logic'
import { SEUILS_DEFAUT } from '../modules/projet/data'
import { todayStr } from '../utils/formatters'

const CHECK_MS    = 20 * 1000            // fréquence de vérification
const SEMAINE_MS  = 7 * 24 * 60 * 60 * 1000 // délai minimum entre deux relances « hebdo »

const TITRES = {
  projet_retard:   '⏰ Projet en retard',
  budget_depasse:  '💰 Budget dépassé',
  tache_depassee:  '💰 Tâche en dépassement',
  reste_a_payer:   '🏦 Reste à payer',
  tache_retard:    '⚠️ Tâche en retard',
  avancement_zero: '⏳ Aucun avancement',
  termine:         '✅ Projet terminé'
}

// Alertes rattachées à UN projet précis (pas à une tâche) : le clic sur la
// notification ouvre directement sa fiche au lieu du tableau de bord général.
const TYPES_AVEC_FICHE_PROJET = ['projet_retard', 'budget_depasse', 'avancement_zero', 'termine']
function lienDetail(alerte) {
  return TYPES_AVEC_FICHE_PROJET.includes(alerte.type)
    ? { link: '/projet/projets/liste', state: { openProjetId: alerte.projetId } }
    : { link: '/projet' }
}

export default function ProjetAlerteWatcher() {
  const { data: projets } = useCollection('projets')
  const { data: taches }  = useCollection('projet_taches')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: configs } = useCollection('projet_params')
  const traiteesTermine = useRef(new Set())  // évite de re-vérifier "termine" déjà envoyé cette session
  const traiteesJour    = useRef(new Set())  // idem pour les alertes journalières (budget dépassé), par jour

  useEffect(() => {
    let annule = false

    async function traiterAlerte(alerte) {
      // « Reste à payer » : uniquement visible dans le bandeau Alertes du Dashboard,
      // pas de notification poussée (alerte groupée, trop fréquente pour relancer en boucle).
      if (alerte.type === 'reste_a_payer') return

      const projet = projets.find((p) => p.id === alerte.projetId)
      const forUsers = projet?.responsableUid ? [projet.responsableUid] : []
      const titre = TITRES[alerte.type] || 'Alerte projet'

      if (alerte.type === 'termine') {
        // Bonne nouvelle : une seule notification, jamais répétée. `claimOnce` est
        // ATOMIQUE (transaction RTDB) — contrairement à un getOne()+setItem(), il
        // n'y a pas de fenêtre de course : si deux utilisateurs ont l'appli ouverte
        // au même moment, un seul des deux gagne la réclamation et envoie la notif.
        if (traiteesTermine.current.has(alerte.id)) return
        traiteesTermine.current.add(alerte.id)
        const gagne = await claimOnce('projet_alertes_notif', alerte.id, { compteur: 1, dernierEnvoi: Date.now(), jour: todayStr() }).catch(() => false)
        if (!gagne) return
        await notify({
          type: 'success', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, ...lienDetail(alerte),
          projetId: alerte.projetId
        }).catch(() => {})
        return
      }

      if (alerte.type === 'budget_depasse') {
        // Une seule notification par jour : réclamation atomique sur une clé datée
        // (contrairement à « termine », elle doit pouvoir se redéclencher le lendemain
        // si le budget est toujours dépassé).
        const cleJour = `${alerte.id}_${todayStr()}`
        if (traiteesJour.current.has(cleJour)) return
        traiteesJour.current.add(cleJour)
        const gagne = await claimOnce('projet_alertes_notif', cleJour, { envoyeLe: Date.now() }).catch(() => false)
        if (!gagne) return
        await notify({
          type: 'warning', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, ...lienDetail(alerte),
          projetId: alerte.projetId
        }).catch(() => {})
        return
      }

      // Tout le reste (projet en retard, tâche en dépassement, tâche en retard,
      // aucun avancement) : une seule notification par semaine tant que l'alerte persiste.
      const track = await getOne('projet_alertes_notif', alerte.id).catch(() => null)
      const dernierEnvoi = track?.dernierEnvoi || 0
      if (dernierEnvoi && Date.now() - dernierEnvoi < SEMAINE_MS) return

      await notify({
        type: 'warning', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
        module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, ...lienDetail(alerte),
        projetId: alerte.projetId
      }).catch(() => {})
      await setItem('projet_alertes_notif', alerte.id, { dernierEnvoi: Date.now() }).catch(() => {})
    }

    function verifier() {
      const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT
      const alertes = genererAlertes(projets, taches, depenses, seuils)
      for (const alerte of alertes) {
        if (!annule) traiterAlerte(alerte)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [projets, taches, depenses, configs])

  return null
}
