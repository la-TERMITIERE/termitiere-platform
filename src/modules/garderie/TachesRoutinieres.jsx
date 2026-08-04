// Volet « Tâches Routinières » de la garderie — tâches définies en réunion du
// 03/08 (DR-DS), regroupées par catégorie telles que transmises par la direction.
import RoutineTaches from '../../shared/routine/RoutineTaches'
import { COULEUR_MODULE } from '../../utils/color'

const SEED_TACHES = [
  { categorie: 'Ouverture et accueil', titre: "Assurer la vérification quotidienne de la propreté, de l'ordre et de la sécurité des locaux avant l'arrivée des enfants" },
  { categorie: 'Ouverture et accueil', titre: 'Préparer les salles d\'activités ainsi que le matériel pédagogique nécessaire au bon déroulement des activités éducatives' },
  { categorie: 'Ouverture et accueil', titre: 'Accueillir les enfants et leurs parents, recueillir les informations importantes et prendre en compte les consignes particulières relatives à chaque enfant' },

  { categorie: 'Encadrement et accompagnement des enfants', titre: "Effectuer un contrôle général de l'état de santé des enfants à leur arrivée afin de détecter toute situation particulière nécessitant une attention spécifique" },
  { categorie: 'Encadrement et accompagnement des enfants', titre: "Assurer l'organisation des repas et des collations tout en veillant au respect des horaires et des besoins alimentaires des enfants" },
  { categorie: 'Encadrement et accompagnement des enfants', titre: 'Superviser les périodes de sieste et de repos dans un environnement calme et sécurisé' },
  { categorie: 'Encadrement et accompagnement des enfants', titre: 'Organiser et encadrer les activités éducatives, pédagogiques et ludiques conformément au planning établi' },
  { categorie: 'Encadrement et accompagnement des enfants', titre: "Veiller quotidiennement à l'hygiène des enfants à travers l'accompagnement aux gestes essentiels (lavage des mains, passage aux toilettes)" },

  { categorie: 'Sécurité et surveillance', titre: 'Assurer le suivi quotidien des présences et des absences des enfants à travers la mise à jour des listes de contrôle' },
  { categorie: 'Sécurité et surveillance', titre: 'Garantir une surveillance permanente des enfants dans les différents espaces, notamment lors des activités en extérieur' },
  { categorie: 'Sécurité et surveillance', titre: "Prendre en charge les premiers soins en cas de blessures légères ou d'incidents, puis informer les responsables et les parents concernés selon la situation" },

  { categorie: 'Fin de journée et suivi', titre: 'Accompagner les enfants lors du départ en veillant à la préparation de leurs affaires et à la mise à jour du carnet de liaison' },
  { categorie: 'Fin de journée et suivi', titre: 'Assurer la remise des enfants exclusivement aux parents ou tuteurs dûment autorisés' },
  { categorie: 'Fin de journée et suivi', titre: 'Procéder au nettoyage, au rangement des salles ainsi qu\'à la désinfection du matériel utilisé afin de maintenir un environnement sain' },
  { categorie: 'Fin de journée et suivi', titre: 'Élaborer un compte rendu quotidien des activités réalisées et transmettre les informations importantes au responsable de la garderie' }
]

export default function TachesRoutinieresGarderie() {
  return (
    <RoutineTaches
      moduleId="garderie"
      collectionPrefix="garderie_routine"
      seedTaches={SEED_TACHES}
      color={COULEUR_MODULE.garderie}
      titre="Tâches Routinières — Garderie"
      description="Tâches définies en réunion du 03 août par la direction (DR-DS), à vérifier chaque jour par les tatas et la gérante."
    />
  )
}
