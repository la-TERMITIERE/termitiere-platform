// RH : Annonces. Données et règles partagées par le volet de la RH et par l'accueil de chacun.
//   Collections : `annonces` (le texte), `annonces_lectures` (qui a lu quoi : un document `${annonceId}_${uid}`), `annonces_pieces` (fichiers joints,
//   chargés seulement à l'ouverture d'une annonce pour ne pas alourdir l'accueil). Volontairement hors du préfixe `rh_` : tout le monde doit pouvoir les lire.
import { Info, FileText, CalendarDays, PartyPopper, TriangleAlert, Tag } from 'lucide-react'
import { todayStr } from '../../utils/formatters'
import { isFullAccessRole } from '../../core/roles'

export const COL_ANNONCES = 'annonces'
export const COL_LECTURES = 'annonces_lectures'
export const COL_PIECES = 'annonces_pieces'

export const CATEGORIES = [
  { id: 'info', label: 'Information', couleur: '#0284c7', icone: Info },
  { id: 'note', label: 'Note de service', couleur: '#475569', icone: FileText },
  { id: 'evenement', label: 'Événement', couleur: '#7c3aed', icone: CalendarDays },
  { id: 'felicitations', label: 'Félicitations', couleur: '#db2777', icone: PartyPopper },
  { id: 'urgent', label: 'Urgent', couleur: '#dc2626', icone: TriangleAlert },
  { id: 'autre', label: 'Autre', couleur: '#0d9488', icone: Tag }
]
export const categorieDe = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0]
// Type d'une annonce, avec son libellé : pour « Autre », c'est le texte saisi par la RH (`categorieLabel`).
export const categorieAnnonce = (a) => { const c = categorieDe(a?.categorie); return c.id === 'autre' && a?.categorieLabel ? { ...c, label: a.categorieLabel } : c }

export const AUDIENCES = [
  { value: 'tous', label: 'Tout le monde' },
  { value: 'secteurs', label: 'Par secteur' },
  { value: 'personnes', label: 'Des personnes précises' }
]

// Publier, modifier et supprimer : la RH et l'administration (accès total). Les autres lisent.
export const peutPublierAnnonce = (role) => isFullAccessRole(role)

// Une annonce est « en cours » jusqu'à sa date de fin incluse, ou jusqu'à ce que la RH la marque « effectuée » ; sans date de fin, elle reste en cours.
export const estEffectuee = (a) => !!a.effectueLe
export const estActive = (a, jour = todayStr()) => !estEffectuee(a) && (!a.dateFin || a.dateFin >= jour)
// Rappelée trois fois par jour tant qu'elle n'est pas effectuée (par défaut), sauf si la RH a désactivé le rappel : elle disparaît alors dès qu'on l'a lue.
export const rappelee = (a) => a.rappel !== false

// Audience. « Tout le monde » = tous les comptes actifs. « Par secteur » et « Des personnes précises » se définissent sur les EMPLOYÉS de l'annuaire RH
// (département, personnes) ; à la publication on les résout en comptes grâce au rattachement employé, compte (RH, Paramètres, Comptes) et on garde ces
// comptes dans `audience.uids` : l'accueil de chacun n'a ainsi pas besoin de lire l'annuaire RH, qui est réservé à l'administration.
// Un employé sans compte ne peut pas être prévenu (compté dans `audience.sansCompte`).
export const employeActif = (e) => (e.statut || 'actif') !== 'sorti'
export const compteDeEmploye = (e, users) => users.find((u) => u.id === e.userId || (e.userLogin && u.login === e.userLogin))

// Fixe l'audience à enregistrer à partir du choix du formulaire.
export function construireAudience({ type, secteurs = [], employes: ids = [] }, employes, users) {
  if (type === 'tous') return { type: 'tous', secteurs: [], employes: [], uids: [], noms: [], sansCompte: 0 }
  const concernes = type === 'secteurs'
    ? employes.filter(employeActif).filter((e) => secteurs.includes(e.departement))
    : employes.filter((e) => ids.includes(e.id))
  const comptes = concernes.map((e) => ({ e, u: compteDeEmploye(e, users) }))
  return {
    type, secteurs: type === 'secteurs' ? secteurs : [], employes: type === 'personnes' ? ids : [],
    uids: [...new Set(comptes.filter((c) => c.u).map((c) => c.u.uid || c.u.login))],
    noms: concernes.map((e) => e.nom), sansCompte: comptes.filter((c) => !c.u).length
  }
}

// L'annonce s'adresse-t-elle à ce compte ? (`user` : { uid })
export const concerne = (a, user) => (a.audience?.type || 'tous') === 'tous' || (a.audience?.uids || []).includes(user?.uid)

// Comptes actifs visés par l'annonce, hors son auteur : [{ uid, nom }].
export function destinatairesDe(a, users, sauf = null) {
  return users
    .filter((u) => u.actif !== false)
    .map((u) => ({ uid: u.uid || u.login, nom: u.nom || u.login }))
    .filter((u) => u.uid && u.uid !== sauf)
    .filter((u) => concerne(a, u))
}

export const libelleAudience = (a) => {
  const type = a.audience?.type || 'tous'
  if (type === 'tous') return 'Tout le monde'
  if (type === 'secteurs') return `Secteur : ${(a.audience.secteurs || []).join(', ') || '-'}`
  const noms = a.audience.noms || []
  return noms.length <= 2 && noms.length ? noms.join(', ') : `${noms.length} personne${noms.length > 1 ? 's' : ''}`
}

export const cleLecture = (annonceId, uid) => `${annonceId}_${uid}`
