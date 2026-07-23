// Badges "nouveauté" (menu) — combien d'éléments un autre utilisateur a ajoutés depuis
// ma dernière visite de chaque volet, tous rôles confondus.
//
// Basé sur l'état RÉEL des collections (pas le journal d'audit, qui garde ses entrées
// même après suppression) : dès qu'un élément est supprimé, il disparaît du calcul et
// le badge diminue automatiquement — contrairement à un système fondé sur le journal.
import { setItem } from '../core/db'

// Chaque volet suivi précise soit :
//  • { collection, champDate, champCreateur } — une collection Firestore de premier niveau ;
//  • { collections, champTableau, champDate, champCreateur } — un volet EMBARQUÉ, dont les
//    éléments vivent dans un tableau à l'intérieur de documents d'une ou plusieurs collections
//    parentes (ex. pièces jointes/galerie d'un projet ou d'une tâche).
// Dans tous les cas, `champCreateur` doit être renseigné à la création (voir les écrans
// concernés) — un volet dont les éléments ne portent pas encore ce champ ne peut pas être suivi.
export const VOLETS_SUIVIS = {
  // E-G.Pro
  projetProjets:   { collection: 'projets',          champDate: 'createdAt', champCreateur: 'createdBy' },
  projetTaches:    { collection: 'projet_taches',    champDate: 'createdAt', champCreateur: 'createdBy' },
  projetDepenses:  { collection: 'projet_depenses',  champDate: 'createdAt', champCreateur: 'ajouteParUid' },
  projetBesoins:   { collection: 'projet_besoins',   champDate: 'createdAt', champCreateur: 'demandeParUid' },
  projetMateriel:  { collection: 'projet_materiels', champDate: 'createdAt', champCreateur: 'ajouteParUid' },
  projetDocuments: { collections: ['projets', 'projet_taches'], champTableau: 'pieces',  champDate: 'createdAt', champCreateur: 'ajouteParUid' },
  projetGalerie:   { collections: ['projets'],                  champTableau: 'galerie', champDate: 'date',      champCreateur: 'ajouteParUid' },
  // E-DÉPENSES
  depenseDepenses: { collection: 'depense_depenses', champDate: 'createdAt', champCreateur: 'enregistreParUid' }
}

// Marque un volet comme vu par l'utilisateur courant (fait disparaître son badge).
// Une seule collection `vues_volets` partagée par tous les modules (clé = uid__section).
export function marquerVoletVu(userId, section) {
  if (!userId || !section) return
  return setItem('vues_volets', `${userId}__${section}`, { userId, section, vu: Date.now() })
}

// Calcule les badges pour l'utilisateur courant à partir des collections déjà chargées
// (`donnees` : { [nomCollection]: tableau de documents }) et de `derniereVues`
// (contenu de la collection `vues_volets`).
export function calculerBadges(donnees, derniereVues, monUid) {
  const badges = {}
  for (const [cle, cfg] of Object.entries(VOLETS_SUIVIS)) {
    const vu = derniereVues.find((v) => v.userId === monUid && v.section === cle)?.vu || 0
    let items
    if (cfg.champTableau) {
      // Volet embarqué : on aplatit le tableau de chaque document des collections parentes.
      items = []
      for (const coll of cfg.collections) {
        for (const doc of donnees[coll] || []) items.push(...(doc[cfg.champTableau] || []))
      }
    } else {
      items = donnees[cfg.collection] || []
    }
    badges[cle] = items.filter((it) =>
      (it[cfg.champDate] || 0) > vu && it[cfg.champCreateur] && it[cfg.champCreateur] !== monUid
    ).length
  }
  return badges
}
