// Volet « Tâches Routinières » MAXI-AGRO — tâches définies en réunion du 03/08
// (DR-DS), regroupées par catégorie telles que transmises par la direction.
import RoutineTaches from '../../shared/routine/RoutineTaches'
import { COULEUR_MODULE } from '../../utils/color'

const SEED_TACHES = [
  { categorie: 'Entretien, organisation et suivi des infrastructures', titre: "Assurer l'entretien régulier des chambres, des toilettes et des différents espaces de vie afin de maintenir un cadre propre, sain et agréable" },
  { categorie: 'Entretien, organisation et suivi des infrastructures', titre: 'Veiller au nettoyage et à l\'entretien de la devanture de la villa ainsi que des espaces extérieurs' },
  { categorie: 'Entretien, organisation et suivi des infrastructures', titre: "Effectuer des contrôles périodiques de l'état général de la villa du Directeur Général (DG), notamment en ce qui concerne la propreté, l'organisation et les éventuelles anomalies constatées" },
  { categorie: 'Entretien, organisation et suivi des infrastructures', titre: "Signaler toute dégradation, panne ou besoin d'intervention nécessitant une prise en charge particulière" },
  { categorie: 'Entretien, organisation et suivi des infrastructures', titre: "Participer au maintien de l'ordre et de la propreté des infrastructures liées aux activités de La ferme" },

  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Assurer le suivi quotidien des animaux à travers l\'observation de leur état général, leur comportement et leurs conditions de vie' },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Participer à l'alimentation des animaux en respectant les quantités et les horaires établis" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Veiller à l\'approvisionnement en eau et au maintien des conditions nécessaires au bien-être des animaux' },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Effectuer le nettoyage et l'entretien des enclos, bâtiments d'élevage et espaces réservés aux animaux" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Contrôler l'état de santé des animaux afin d'identifier rapidement les signes de maladie ou d'anomalie" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Assurer le suivi des animaux malades ou nécessitant une attention particulière et informer les responsables concernés' },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Participer aux opérations de vaccination, de traitement et de suivi sanitaire selon les programmes établis' },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Réaliser le suivi des effectifs d'animaux (naissances, mortalités, ventes et mouvements)" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Contrôler les stocks d'aliments pour animaux et signaler les besoins de réapprovisionnement" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Participer à la collecte, au tri et au suivi de la production des œufs' },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: "Veiller à la propreté des zones de stockage des aliments et du matériel d'élevage" },
  { categorie: "Tâches liées à l'élevage et à la production animale", titre: 'Effectuer des comptes rendus réguliers sur les activités réalisées et les observations effectuées auprès du responsable' }
]

export default function TachesRoutinieresAgro() {
  return (
    <RoutineTaches
      moduleId="agro"
      collectionPrefix="agro_routine"
      seedTaches={SEED_TACHES}
      color={COULEUR_MODULE.agro}
      titre="Tâches Routinières — MAXI-AGRO"
      description="Tâches définies en réunion du 03 août par la direction (DR-DS), à vérifier chaque jour par les agents de la ferme."
    />
  )
}
