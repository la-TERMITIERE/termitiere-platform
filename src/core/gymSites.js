// Accès aux salles MAXI-GYM (Lomé / Kara) — version PURE, sans React, pour être
// utilisable aussi bien côté `core` (notifications) que côté hooks/composants.
// Doit rester alignée avec src/modules/gym/site/useSite.jsx (`allowedSitesFor`).
import { isViewAllRole } from './roles'

export const GYM_SITE_IDS = ['lome', 'kara']

// Salles autorisées pour un utilisateur :
//   • `null`  → accès aux DEUX salles (rôle « voit tout », ou compte hérité sans
//               le champ `gymSites`) ;
//   • liste   → salles explicitement cochées à la création du compte.
export function gymSitesAutorises(user, role) {
  const r = role || user?.role
  if (isViewAllRole(r)) return null
  const raw = user?.gymSites
  if (!Array.isArray(raw)) return null
  return raw.filter((s) => GYM_SITE_IDS.includes(s))
}

// L'utilisateur doit-il recevoir une notification MAXI-GYM rattachée à `site` ?
// Une notif sans `site` (ancienne, ou non rattachée à une salle) reste visible
// par tous ceux qui ont le module.
export function peutVoirNotifSiteGym(user, role, site) {
  if (!site) return true
  const sites = gymSitesAutorises(user, role)
  return sites === null || sites.includes(site)
}
