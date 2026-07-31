// Notifications automatiques des alertes E-G.Pro — remplace l'ancien onglet Alertes.
// Destinataires : le responsable du projet concerné + les membres de la direction.
// Une alerte non résolue relance une notification toutes les 2 minutes, jusqu'à
// 3 fois ; passé ce quota, elle se tait jusqu'au lendemain (nouveau cycle de 3).
// « Projet terminé » est une bonne nouvelle : une seule notification, jamais répétée.
// « Aucun avancement » : une seule notification par JOUR (pas de relance toutes les
// 2 minutes, un projet stagnant reste stagnant pendant des jours).
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

const REPEAT_MS    = 2 * 60 * 1000 // 2 minutes entre deux relances
const MAX_REPEATS  = 3             // 3 relances max par jour
const CHECK_MS     = 20 * 1000 // fréquence de vérification (assez fine pour ne pas rater le créneau de 2 min)

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
  const traiteesTermine = useRef(new Set()) // évite de re-vérifier "termine" déjà envoyé cette session
  const traiteesAvancementJour = useRef(new Set()) // idem pour "aucun avancement", par jour

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

      if (alerte.type === 'avancement_zero') {
        // Une seule notification par jour : réclamation atomique sur une clé datée
        // (contrairement à « termine », elle doit pouvoir se redéclencher le lendemain
        // si le projet est toujours sans avancement).
        const cleJour = `${alerte.id}_${todayStr()}`
        if (traiteesAvancementJour.current.has(cleJour)) return
        traiteesAvancementJour.current.add(cleJour)
        const gagne = await claimOnce('projet_alertes_notif', cleJour, { envoyeLe: Date.now() }).catch(() => false)
        if (!gagne) return
        await notify({
          type: 'warning', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, ...lienDetail(alerte),
          projetId: alerte.projetId
        }).catch(() => {})
        return
      }

      const today = todayStr()
      const track = await getOne('projet_alertes_notif', alerte.id).catch(() => null)
      const memeJour = track?.jour === today
      const compteur = memeJour ? (track.compteur || 0) : 0
      const dernierEnvoi = memeJour ? (track.dernierEnvoi || 0) : 0

      if (compteur >= MAX_REPEATS) return // quota du jour atteint → silence jusqu'à demain
      if (dernierEnvoi && Date.now() - dernierEnvoi < REPEAT_MS) return // pas encore 1 minute

      await notify({
        type: 'warning', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
        module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, ...lienDetail(alerte),
        projetId: alerte.projetId
      }).catch(() => {})
      await setItem('projet_alertes_notif', alerte.id, { compteur: compteur + 1, dernierEnvoi: Date.now(), jour: today }).catch(() => {})
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
