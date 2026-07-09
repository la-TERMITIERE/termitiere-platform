// Notifications automatiques des alertes E-G.Pro — remplace l'ancien onglet Alertes.
// Destinataires : le responsable du projet concerné + les membres de la direction.
// Une alerte non résolue relance une notification toutes les minutes, jusqu'à
// 5 fois ; passé ce quota, elle se tait jusqu'au lendemain (nouveau cycle de 5).
// « Projet terminé » est une bonne nouvelle : une seule notification, jamais répétée.
//
// Composant « headless » (aucun rendu) monté globalement dans AppShell pour les
// utilisateurs disposant du module projet : la vérification tourne tant que
// l'application est ouverte, même si personne n'est sur une page E-G.Pro.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { getOne, setItem } from '../core/db'
import { notify } from '../core/notify'
import { FULL_ACCESS_ROLES } from '../core/roles'
import { genererAlertes } from '../modules/projet/logic'
import { SEUILS_DEFAUT } from '../modules/projet/data'
import { todayStr } from '../utils/formatters'

const REPEAT_MS    = 60 * 1000 // 1 minute entre deux relances
const MAX_REPEATS  = 5         // 5 relances max par jour
const CHECK_MS     = 20 * 1000 // fréquence de vérification (assez fine pour ne pas rater le créneau d'1 min)

const TITRES = {
  projet_retard:   '⏰ Projet en retard',
  budget_depasse:  '💰 Budget dépassé',
  tache_depassee:  '💰 Tâche en dépassement',
  tache_retard:    '⚠️ Tâche en retard',
  avancement_zero: '⏳ Aucun avancement',
  termine:         '✅ Projet terminé'
}

export default function ProjetAlerteWatcher() {
  const { data: projets } = useCollection('projets')
  const { data: taches }  = useCollection('projet_taches')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: configs } = useCollection('projet_params')
  const traiteesTermine = useRef(new Set()) // évite de re-vérifier "termine" déjà envoyé cette session

  useEffect(() => {
    let annule = false

    async function traiterAlerte(alerte) {
      const projet = projets.find((p) => p.id === alerte.projetId)
      const forUsers = projet?.responsableUid ? [projet.responsableUid] : []
      const titre = TITRES[alerte.type] || 'Alerte projet'

      if (alerte.type === 'termine') {
        // Bonne nouvelle : une seule notification, jamais répétée.
        if (traiteesTermine.current.has(alerte.id)) return
        traiteesTermine.current.add(alerte.id)
        const track = await getOne('projet_alertes_notif', alerte.id).catch(() => null)
        if (track) return
        await notify({
          type: 'success', title: titre, body: `${alerte.projetNom} — ${alerte.message}`,
          module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, link: '/projet/projets'
        }).catch(() => {})
        await setItem('projet_alertes_notif', alerte.id, { compteur: 1, dernierEnvoi: Date.now(), jour: todayStr() }).catch(() => {})
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
        module: 'projet', forRoles: FULL_ACCESS_ROLES, forUsers, link: '/projet'
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
