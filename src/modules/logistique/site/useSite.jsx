// Sous-applications Maxi Logistique : deux sites indépendants (Lomé & Kara).
// Chaque enregistrement opérationnel (saisie magasin, prestation, facture,
// autorisation de sortie, retour) porte un champ `site` pour la traçabilité ;
// les vues du module filtrent sur le site courant, choisi dans le sélecteur.
import { createContext, useContext } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { isViewAllRole } from '../../../core/roles'

export const SITES = [
  { id: 'lome', label: 'Lomé', emoji: '🌆', accent: '#BC3C31' },
  { id: 'kara', label: 'Kara', emoji: '⛰️', accent: '#0f766e' }
]

export const SITE_IDS = SITES.map((s) => s.id)
export const isSite = (id) => SITES.some((s) => s.id === id)
export const siteLabel = (id) => SITES.find((s) => s.id === id)?.label || id

// Sites Maxi Logistique auxquels un utilisateur a droit. Les rôles « voit tout »
// (super-admin, PAU, GE, superviseur) accèdent aux deux ; les autres sont limités
// à `user.logistiqueSites` (choisi à la création du compte). Un compte hérité,
// sans ce champ, garde l'accès aux deux sites.
export function allowedSitesFor(user, role) {
  if (isViewAllRole(role)) return [...SITE_IDS]
  const raw = user?.logistiqueSites
  // Compte hérité (champ absent) → accès aux deux sites. Restriction explicite
  // (tableau, éventuellement vide) → uniquement les sites cochés.
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
