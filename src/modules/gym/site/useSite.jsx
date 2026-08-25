// MAXI-GYM — deux salles indépendantes (Lomé & Kara), même schéma que Maxi
// Logistique (cf. src/modules/logistique/site/useSite.jsx). Chaque enregistrement
// opérationnel (séance, abonnement, facture, présence) ET chaque fiche client
// porte un champ `site` ; les vues du module filtrent sur le site courant, choisi
// dans le sélecteur. Les deux salles ont donc leur propre clientèle : un client
// de Lomé n'apparaît pas à Kara, et inversement.
// Seuls les forfaits et les tarifs/paramètres restent communs aux deux salles.
import { createContext, useContext } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { isViewAllRole } from '../../../core/roles'

export const SITES = [
  { id: 'lome', label: 'Lomé', emoji: '🌆', accent: '#E8850F' },
  { id: 'kara', label: 'Kara', emoji: '⛰️', accent: '#0f766e' }
]

export const SITE_IDS = SITES.map((s) => s.id)
export const isSite = (id) => SITES.some((s) => s.id === id)
export const siteLabel = (id) => SITES.find((s) => s.id === id)?.label || id

// Sites MAXI-GYM auxquels un utilisateur a droit. Les rôles « voit tout »
// accèdent aux deux ; les autres sont limités à `user.gymSites` (choisi à la
// création du compte). Un compte hérité, sans ce champ, garde l'accès aux deux.
export function allowedSitesFor(user, role) {
  if (isViewAllRole(role)) return [...SITE_IDS]
  const raw = user?.gymSites
  if (!Array.isArray(raw)) return [...SITE_IDS]
  return raw.filter(isSite)
}

export function useAllowedSites() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  return allowedSitesFor(user, role)
}

const SiteContext = createContext('lome')

export function SiteProvider({ site, children }) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>
}

// Site courant (id : 'lome' | 'kara'). Défaut 'lome' hors contexte.
export function useSite() {
  return useContext(SiteContext)
}

// Un enregistrement appartient-il au site courant ? Les enregistrements hérités
// (sans champ `site`, antérieurs au découpage) sont rattachés à Lomé.
export const matchSite = (row, site) => (row?.site || 'lome') === site
