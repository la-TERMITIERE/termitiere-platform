// Volet « Tâches Routinières » MAXI LOGISTIQUE — non couvert par la réunion du
// 03/08 (GARDERIE / MAXI-AGRO uniquement) : tâches adaptées au secteur (dépôt,
// matériel, livraisons), regroupées par catégorie. Collection par SITE (Lomé /
// Kara sont deux dépôts indépendants, chacun avec sa propre checklist du jour).
import RoutineTaches from '../../shared/routine/RoutineTaches'
import { COULEUR_MODULE } from '../../utils/color'
import { useSite } from './site/useSite'

const SEED_TACHES = [
  { categorie: 'Ouverture et sécurité du dépôt', titre: "Vérifier l'état des accès, portails et cadenas du dépôt avant l'ouverture" },
  { categorie: 'Ouverture et sécurité du dépôt', titre: 'Contrôler la propreté et le rangement de la cour et des zones de stockage extérieures' },
  { categorie: 'Ouverture et sécurité du dépôt', titre: "S'assurer du bon fonctionnement des équipements de sécurité (extincteurs, éclairage, clôtures)" },

  { categorie: 'Gestion du stock et du matériel', titre: 'Contrôler l\'état et la disponibilité du matériel avant sa mise à disposition' },
  { categorie: 'Gestion du stock et du matériel', titre: 'Vérifier la conformité des quantités en stock avec le référentiel matériel' },
  { categorie: 'Gestion du stock et du matériel', titre: 'Signaler tout matériel défectueux, manquant ou nécessitant un entretien' },
  { categorie: 'Gestion du stock et du matériel', titre: 'Ranger et nettoyer le matériel retourné avant sa remise en stock' },

  { categorie: 'Livraisons et mouvements de matériel', titre: 'Vérifier les bons de sortie et de retour avant tout mouvement de matériel' },
  { categorie: 'Livraisons et mouvements de matériel', titre: 'Contrôler l\'état du véhicule et du matériel de manutention avant chaque livraison' },
  { categorie: 'Livraisons et mouvements de matériel', titre: 'Confirmer la bonne réception du matériel auprès du client à la livraison' },

  { categorie: 'Fin de journée et compte rendu', titre: 'Procéder au nettoyage et au rangement des espaces de travail en fin de journée' },
  { categorie: 'Fin de journée et compte rendu', titre: 'Mettre à jour le registre des sorties, retours et mouvements de la journée' },
  { categorie: 'Fin de journée et compte rendu', titre: 'Élaborer un compte rendu quotidien des activités réalisées et le transmettre au responsable' },
  { categorie: 'Fin de journée et compte rendu', titre: "Vérifier la fermeture sécurisée du dépôt en fin de journée" }
]

export default function TachesRoutinieresLogistique() {
  const site = useSite()
  return (
    <RoutineTaches
      moduleId="logistique"
      collectionPrefix={`logistique_${site}_routine`}
      seedTaches={SEED_TACHES}
      color={COULEUR_MODULE.logistique}
      titre="Tâches Routinières — MAXI LOGISTIQUE"
      description="Checklist quotidienne du dépôt (ouverture, matériel, livraisons, fermeture), à vérifier chaque jour par les agents."
    />
  )
}
