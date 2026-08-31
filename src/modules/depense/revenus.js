// Agrège les revenus RÉELLEMENT réalisés dans les autres modules, par secteur et par mois.
// Lecture seule : aucune écriture croisée, on ne fait que sommer des collections existantes.
import { revenuClientSecteurMois, revenuManuelSecteurMois } from './logic'
import { matchSite } from '../logistique/site/useSite'

// Garderie : paiements mensuels (mois/annee) + paiements journaliers (date), montant réellement encaissé.
export function revenuGarderie(paiements, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (paiements || [])
    .filter((p) => (p.type === 'journalier' ? (p.date || '').startsWith(prefixe) : Number(p.mois) === mois && Number(p.annee) === annee))
    .reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)
}

// Maxi-Agro : seules les factures CERTIFIÉES constituent un chiffre d'affaires définitif.
export function revenuAgro(factures, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (factures || [])
    .filter((f) => f.statut === 'certifiee' && (f.date || '').startsWith(prefixe))
    .reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
}

// Briqueterie : toute facture de la collection est déjà émise/définitive.
export function revenuFactures(factures, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (factures || [])
    .filter((f) => (f.date || '').startsWith(prefixe))
    .reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
}

// Maxi Logistique (Lomé + Kara, distinguées via `site` si fourni — cf. matchSite,
// même convention que Factures.jsx/Prestations.jsx : le legacy sans site est Lomé) :
// seules les factures APPROUVÉES (autorisation de sortie certifiée) constituent un
// chiffre d'affaires réalisé. Les brouillons ne comptent pas.
export function revenuLogistique(factures, annee, mois, site = null) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (factures || [])
    .filter((f) => f.statut === 'approuvee' && (f.date || '').startsWith(prefixe))
    .filter((f) => !site || matchSite(f, site))
    .reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
}

// Secteurs pour lesquels un revenu réel est disponible ailleurs dans l'application.
export const SECTEURS_AVEC_REVENU = ['garderie', 'agro', 'logistique', 'evenementiel']

// `versementsClientRoutes` (optionnel) : versements clients des projets E-G.Pro déjà
// routés par secteur (cf. versementsClientVersSecteurs) — sert à compter les paiements
// reçus des clients comme un revenu. `revenusManuels` (optionnel) : revenus saisis à la
// main (cf. revenuManuelSecteurMois), pour les secteurs sans facturation automatique.
// L'apport du PAU (financement personnel du promoteur) ne compte plus ici — son suivi
// (apport, dette, remboursement) vit désormais exclusivement dans E-G.Pro.
export function revenuSecteur(collections, secteurId, annee, mois, versementsClientRoutes = [], revenusManuels = [], site = null) {
  const { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel } = collections
  let revenu = 0
  if (secteurId === 'garderie') revenu = revenuGarderie(paiementsGarderie, annee, mois)
  else if (secteurId === 'agro') revenu = revenuAgro(facturesAgro, annee, mois)
  else if (secteurId === 'logistique') revenu = revenuLogistique(facturesLogistique, annee, mois, site)
  else if (secteurId === 'evenementiel') revenu = revenuFactures(facturesEvenementiel, annee, mois)
  return revenu
    + revenuClientSecteurMois(versementsClientRoutes, secteurId, annee, mois, site)
    + revenuManuelSecteurMois(revenusManuels, secteurId, annee, mois, site)
}
