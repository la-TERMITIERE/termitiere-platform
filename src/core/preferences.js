// Préférences d'affichage de la personne sur CET appareil (Zustand), gardées dans le navigateur et appliquées dès le chargement :
// - taille du texte : classe texte-petit / texte-grand sur <html> (l'interface est en rem, tout suit) ;
// - animations réduites : classe sans-animations sur <html> (coupe les mouvements décoratifs).
import { create } from 'zustand'

const CLE = 'termitiere_preferences'
export const TAILLES = [{ id: 'petit', label: 'Petit' }, { id: 'normal', label: 'Normal' }, { id: 'grand', label: 'Grand' }]

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') } catch { return {} } }
const ecrire = (p) => { try { localStorage.setItem(CLE, JSON.stringify(p)) } catch { /* stockage indisponible : la préférence ne durera pas */ } }

function appliquer({ taille, sansAnimations }) {
  if (typeof document === 'undefined') return
  const h = document.documentElement
  h.classList.toggle('texte-petit', taille === 'petit')
  h.classList.toggle('texte-grand', taille === 'grand')
  h.classList.toggle('sans-animations', !!sansAnimations)
}

const depart = { taille: 'normal', sansAnimations: false, ...lire() }
appliquer(depart)

export const usePreferences = create((set, get) => ({
  taille: depart.taille,
  sansAnimations: depart.sansAnimations,
  reglerTaille: (taille) => { const p = { ...get(), taille }; ecrire({ taille, sansAnimations: p.sansAnimations }); appliquer(p); set({ taille }) },
  reglerAnimations: (sansAnimations) => { const p = { ...get(), sansAnimations }; ecrire({ taille: p.taille, sansAnimations }); appliquer(p); set({ sansAnimations }) },
  reinitialiser: () => { ecrire({}); appliquer({ taille: 'normal', sansAnimations: false }); set({ taille: 'normal', sansAnimations: false }) }
}))
