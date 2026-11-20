// Postes proposés quand on renseigne un employé ou un poste : ceux du catalogue d'abord, puis des suggestions selon la catégorie
// du département choisi (ex. santé et bien-être : coach sportif…). Un poste choisi qui n'est pas encore au catalogue y est ajouté à l'enregistrement.
export const POSTES_SUGGERES = {
  agriculture: ["Responsable d'élevage", 'Berger', 'Vétérinaire', 'Ouvrier agricole', "Aide d'élevage", 'Gardien de ferme'],
  logistique: ['Directeur superviseur (DS)', 'Chauffeur', 'Magasinier', 'Chef de parc', 'Agent de livraison', 'Responsable logistique', 'Manutentionnaire'],
  construction: ['Chef de production', 'Ouvrier briquetier', 'Mouleur', "Conducteur d'engin", 'Responsable de chantier'],
  immobilier: ['Agent foncier', 'Géomètre', 'Responsable foncier', 'Assistant juridique'],
  education: ['Directrice de garderie', 'Éducatrice', 'Aide éducatrice', 'Cuisinière', "Agent d'entretien"],
  finance: ['Comptable', 'Caissier', 'Responsable financier', 'Assistant comptable'],
  sante: ['Directeur superviseur (DS)', 'Coach sportif', 'Réceptionniste', 'Responsable de salle', "Agent d'accueil", 'Kinésithérapeute'],
  commercial: ['Commercial', 'Responsable des ventes', 'Chargé de clientèle', 'Assistant commercial'],
  technique: ['Technicien', 'Informaticien', 'Responsable technique', 'Électricien'],
  administration: ['Directeur', 'Assistant de direction', 'Secrétaire', 'Assistant RH', 'Responsable administratif']
}
export const POSTES_GENERAUX = ['Directeur superviseur (DS)', 'Directeur', 'Responsable', 'Assistant(e)', 'Secrétaire', 'Agent', 'Gardien', "Agent d'entretien", 'Stagiaire']

const norme = (t) => String(t || '').trim().toLowerCase()

// postes : catalogue (rh_postes) ; departement : nom du département choisi ; categorieId : sa catégorie (ou '').
// Renvoie [{ intitule, departement, source: 'catalogue' | 'suggestion' }] sans doublon.
export function postesProposes(postes, departement, categorieId) {
  const vus = new Set()
  const sortie = []
  const ajouter = (intitule, source, dep = '') => {
    const k = norme(intitule)
    if (!k || vus.has(k)) return
    vus.add(k)
    sortie.push({ intitule, departement: dep, source })
  }
  const catalogue = [...postes].filter((p) => p.intitule)
  // Les postes du département choisi passent en premier.
  catalogue.filter((p) => departement && norme(p.departement) === norme(departement)).forEach((p) => ajouter(p.intitule, 'catalogue', p.departement))
  catalogue.forEach((p) => ajouter(p.intitule, 'catalogue', p.departement))
  ;(POSTES_SUGGERES[categorieId] || []).forEach((x) => ajouter(x, 'suggestion'))
  POSTES_GENERAUX.forEach((x) => ajouter(x, 'suggestion'))
  return sortie
}
