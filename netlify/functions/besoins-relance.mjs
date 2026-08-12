// Fonction Netlify PLANIFIÉE : relance 3×/jour des besoins non résolus — E-G.Pro
// (`projet_besoins`, liés à un projet) ET tous les autres secteurs (`sector_besoins`,
// volet générique cf. src/shared/besoins/SectorBesoins.jsx : Maxi-Agro, Maxi Logistique,
// E-Briqueterie, E-Garderie, E-Foncier).
//
// Un besoin dont la VALIDATION est encore « en_attente » (ni validé, ni refusé)
// déclenche une notification (push + in-app) à chaque exécution, tant qu'il
// n'a pas été traité — c'est volontairement RÉPÉTITIF : l'objectif est qu'un
// besoin oublié ne reste jamais silencieux plus d'une demi-journée.
//
// Destinataires : PAU, GE, Directeur/Directrice, Info, Superviseur — les seuls
// rôles qui reçoivent les alertes/rappels de besoins (cf. BESOINS_NOTIF_ROLES,
// même liste que côté client dans src/modules/projet/Besoins.jsx). Ni
// super_admin ni admin : ce sont des comptes techniques, pas des rôles métier
// à solliciter sur des décisions d'achat.
//
// Configuration requise (Netlify → Site settings → Environment variables) :
//   FIREBASE_SERVICE_ACCOUNT (obligatoire) — même clé que login.js/send-push.js.
//   VAPID_PUBLIC / VAPID_PRIVATE (obligatoire pour le push) — mêmes clés que send-push.js.
//   FIREBASE_DATABASE_URL (optionnel) — défaut = base de production.
//
// Sans FIREBASE_SERVICE_ACCOUNT ou sans les clés VAPID, la fonction se termine
// sans erreur (rien à notifier plutôt qu'un crash planifié qui alerte personne).
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import webpush from 'web-push'

const DB_URL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL
  || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const VAPID_PUBLIC = process.env.VAPID_PUBLIC
const VAPID_PRIVATE = process.env.VAPID_PRIVATE

// Même liste que BESOINS_NOTIF_ROLES côté client — à garder synchronisée.
const BESOINS_NOTIF_ROLES = ['pau', 'ge', 'directeur', 'info', 'superviseur']

// Même libellés que SECTEURS dans src/modules/depense/data.js — à garder synchronisés.
const SECTEUR_LABELS = {
  agro: 'MAXI-AGRO', logistique: 'MAXI LOGISTIQUE', bat: 'MAXI BAT',
  evenementiel: 'BRIQUETERIE', garderie: 'GARDERIE', foncier: 'E-FONCIER', divers: 'HORS SECTEUR'
}

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try {
    initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DB_URL })
    return true
  } catch (e) {
    console.error('[besoins-relance] FIREBASE_SERVICE_ACCOUNT invalide :', e?.message)
    return false
  }
}

export default async () => {
  if (!ensureAdmin()) {
    console.warn('[besoins-relance] FIREBASE_SERVICE_ACCOUNT absent — rien à faire.')
    return new Response('Config manquante (FIREBASE_SERVICE_ACCOUNT)', { status: 200 })
  }

  const db = getDatabase()

  // 1) Besoins toujours EN ATTENTE de validation (validation manquante = 'en_attente'
  //    par défaut, cf. `validationDe` côté client) — E-G.Pro (`projet_besoins`, lié à un
  //    projet) ET tous les autres secteurs (`sector_besoins`, lié à un secteur).
  const [besoinsSnap, projetsSnap, sectorBesoinsSnap] = await Promise.all([
    db.ref('tp/projet_besoins').once('value'),
    db.ref('tp/projets').once('value'),
    db.ref('tp/sector_besoins').once('value')
  ])
  const besoinsVal = besoinsSnap.val() || {}
  const projetsVal = projetsSnap.val() || {}
  const sectorBesoinsVal = sectorBesoinsSnap.val() || {}
  const contexteDe = (b) => (b.projetId ? projetsVal[b.projetId]?.nom : SECTEUR_LABELS[b.secteurId] || b.secteurId) || ''
  const enAttente = [
    ...Object.entries(besoinsVal).map(([id, b]) => ({ id, ...b })),
    ...Object.entries(sectorBesoinsVal).map(([id, b]) => ({ id, ...b }))
  ].filter((b) => (b.validation || 'en_attente') === 'en_attente' && b.statut !== 'annule')

  if (!enAttente.length) {
    console.log('[besoins-relance] Aucun besoin en attente — rien à envoyer.')
    return new Response('Rien à relancer', { status: 200 })
  }

  // 2) Destinataires : utilisateurs actifs dont le rôle est dans BESOINS_NOTIF_ROLES.
  const usersSnap = await db.ref('tp/users').once('value')
  const usersVal = usersSnap.val() || {}
  const destinataires = Object.entries(usersVal)
    .map(([uid, u]) => ({ uid, ...u }))
    .filter((u) => BESOINS_NOTIF_ROLES.includes(u.role) && u.actif !== false)

  if (!destinataires.length) {
    console.warn('[besoins-relance] Aucun destinataire (PAU/GE/directeur/info/superviseur) actif.')
    return new Response('Aucun destinataire', { status: 200 })
  }

  // 3) Message récapitulatif — un push par destinataire vaut mieux qu'un par
  //    besoin (3 rappels/jour × N besoins en attente aurait vite spammé).
  const apercu = enAttente.slice(0, 3)
    .map((b) => `${b.titre}${contexteDe(b) ? ' — ' + contexteDe(b) : ''}`)
    .join(' · ')
  const reste = enAttente.length - apercu.split(' · ').length
  const titre = `🔔 ${enAttente.length} besoin(s) en attente de validation`
  const corps = apercu + (reste > 0 ? ` · et ${reste} autre(s)` : '')

  const now = Date.now()

  // Lien du push/cloche : la page Besoins du secteur concerné si tous les besoins en
  // attente viennent du même secteur/projet, sinon l'accueil (récap multi-secteurs).
  const secteursConcernes = new Set(enAttente.map((b) => (b.projetId ? 'projet' : b.secteurId)))
  const lien = secteursConcernes.size === 1
    ? (enAttente[0].projetId ? '/projet/besoins' : `/${enAttente[0].secteurId}/besoins`)
    : '/'

  // 4) Notification IN-APP (cloche) — une par destinataire, pour l'historique.
  const notifWrites = destinataires.map((u) =>
    db.ref('tp/notifications').push({
      type: 'demande', title: titre, body: corps, module: 'projet',
      forUsers: [u.uid], forRoles: [], excludeUid: null, link: lien,
      readBy: {}, createdAt: now
    }).catch((e) => console.error('[besoins-relance] écriture notification échouée :', e?.message))
  )

  // 5) PUSH — nécessite les clés VAPID ; sans elles, on garde au moins la cloche in-app.
  let pushWrites = []
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:latermitiere2021@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
    const subsSnap = await db.ref('tp/push_subs').once('value')
    const subsVal = subsSnap.val() || {}
    const uidsCibles = new Set(destinataires.map((u) => u.uid))
    const payload = JSON.stringify({
      title: titre, body: corps, url: lien, type: 'demande', module: 'projet', urgent: true
    })
    pushWrites = Object.values(subsVal)
      .filter((s) => uidsCibles.has(s.uid))
      .map((s) =>
        webpush.sendNotification(s.sub, payload).catch((e) => {
          // 404/410 = abonnement expiré : on ne le nettoie pas ici (best-effort),
          // le client le remplacera à la prochaine ouverture de l'app.
          if (e?.statusCode !== 404 && e?.statusCode !== 410) {
            console.error('[besoins-relance] envoi push échoué :', e?.message)
          }
        })
      )
  } else {
    console.warn('[besoins-relance] VAPID_PUBLIC/VAPID_PRIVATE absents — push désactivé, cloche in-app seule.')
  }

  await Promise.all([...notifWrites, ...pushWrites])

  console.log(`[besoins-relance] ${enAttente.length} besoin(s) en attente → ${destinataires.length} destinataire(s) notifié(s).`)
  return new Response(`${enAttente.length} besoin(s) → ${destinataires.length} destinataire(s)`, { status: 200 })
}

// 3 fois par jour : 8h, 13h, 18h (UTC — Netlify Scheduled Functions utilisent
// l'heure UTC ; le Togo est en UTC+0, donc ces horaires correspondent déjà à
// l'heure locale de Lomé sans décalage à appliquer).
export const config = { schedule: '0 8,13,18 * * *' }
