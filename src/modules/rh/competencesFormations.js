// Lien entre Compétences et Formations : une formation vise une compétence (par son nom) et un niveau à atteindre ; ses participants sont des
// identifiants d'employés, ou ['*'] pour tout le personnel. Ces fonctions servent aux deux écrans (Compétences : « Formation prévue » et
// « Planifier une formation » ; Formations : proposition de monter les niveaux quand une formation est terminée).
import { NIVEAUX_COMPETENCE } from './store/rhStore'

// Comparaison de noms de compétence sans tenir compte des majuscules ni des accents (« Soudure » = « soudure »).
export const norme = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
export const indexNiveau = (n) => NIVEAUX_COMPETENCE.indexOf(n)
export const formationConcerne = (f, employeId) => (f.participants || []).includes('*') || (f.participants || []).includes(employeId)

// Niveaux qui manquent à une ligne de compétence (positif), 0 si la cible est atteinte, négatif si elle est dépassée ; null si un niveau manque.
export function ecartCompetence(r) {
  const a = indexNiveau(r.niveau), c = indexNiveau(r.cible)
  return a < 0 || c < 0 ? null : c - a
}

// Formation de la compétence d'une ligne qui n'est pas encore terminée et où cet employé est inscrit (planifiée ou en cours), sinon null.
export function formationPrevue(formations, ligne) {
  return formations.find((f) => f.statut !== 'terminee' && norme(f.competence) && norme(f.competence) === norme(ligne.competence) && formationConcerne(f, ligne.employeId)) || null
}

// Lignes de compétence à planifier avec celle-ci : même compétence, un écart, pas encore de formation prévue (un seul clic forme tout le monde).
export function ligneSansFormation(competences, formations, ligne) {
  return competences.filter((c) => norme(c.competence) === norme(ligne.competence) && (ecartCompetence(c) ?? 0) > 0 && !formationPrevue(formations, c))
}

// Formation terminée : qui peut passer au niveau visé ? `montees` : lignes de compétence dont le niveau est plus bas ; `creations` : participants
// inscrits un par un qui n'avaient pas encore cette compétence (jamais pour « tout le personnel »).
export function niveauxAMonter(formation, competences, employes) {
  const nom = norme(formation.competence), vise = indexNiveau(formation.niveauVise)
  if (!nom || vise < 0) return { montees: [], creations: [] }
  const participants = formation.participants || []
  const lignes = competences.filter((c) => norme(c.competence) === nom)
  const montees = lignes.filter((c) => formationConcerne(formation, c.employeId) && indexNiveau(c.niveau) < vise)
    .map((c) => ({ ligne: c, de: c.niveau || 'Non renseigné', vers: formation.niveauVise }))
  const creations = participants.filter((id) => id !== '*' && !lignes.some((c) => c.employeId === id))
    .map((id) => ({ employeId: id, employeNom: employes.find((e) => e.id === id)?.nom || '', vers: formation.niveauVise }))
  return { montees, creations }
}
