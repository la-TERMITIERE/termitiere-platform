// Suivi "dernière vue" par utilisateur et par volet — sert à calculer les badges
// "nouveauté" dans le menu (cf. Sidebar.jsx). S'appuie sur le journal d'audit déjà
// existant : chaque ajout (tâche, dépense, document, photo, commentaire, projet)
// y est déjà tracé via audit('projet', ...).
import { setItem } from '../../core/db'

// Actions d'audit associées à chaque volet — utilisées pour compter les nouveautés.
export const ACTIONS_PAR_VOLET = {
  projetProjets:      ['projet_cree'],
  projetTaches:       ['tache_creee'],
  projetDocuments:    ['document_ajoute'],
  projetGalerie:      ['photos_ajoutees'],
  projetDepenses:     ['depense_ajoutee'],
  projetCommentaires: ['commentaire_ajoute']
}

// Marque le volet comme vu par l'utilisateur courant (fait disparaître son badge).
export function marquerVoletVu(userId, section) {
  if (!userId || !section) return
  return setItem('projet_dernieres_vues', `${userId}__${section}`, {
    userId, section, vu: Date.now()
  })
}
