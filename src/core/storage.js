// Point d'entrée des opérations de migration localStorage → stockage plateforme.
// (Ré-exporte les helpers de utils/migration pour respecter la structure core/.)
export {
  detecterAnciennesDonnees,
  migrerDonnees,
  migrerDepuisFirebase,
  fetchAncienneDB,
  resumerDB
} from '../utils/migration'

