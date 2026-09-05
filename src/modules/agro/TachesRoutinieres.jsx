// Volet « Tâches Routinières » MAXI-AGRO — planning personnel par agent (tâches
// propres à chacun, avec heure prévue). L'ancienne liste partagée par catégorie
// (réunion du 03/08) a été retirée à la demande de la direction : les tâches sont
// désormais créées manuellement, assignées à un agent précis.
import { useMemo } from 'react'
import RoutineTaches from '../../shared/routine/RoutineTaches'
import { useCollection } from '../../hooks/useFirestore'
import { COULEUR_MODULE } from '../../utils/color'

export default function TachesRoutinieresAgro() {
  // Employés assignables au planning personnel — les VRAIS comptes du logiciel
  // ayant accès au module agro (`modules` contient 'agro'), rôle « agent » : les
  // agents de terrain de la ferme, PAS les rôles de direction/supervision qui ont
  // accès à tous les modules (super-admin, PAU, GE…) ni une liste RH déconnectée
  // des comptes réels. Un compte réel est indispensable ici : c'est ce qui permet
  // de savoir QUI peut modifier/supprimer une tâche, et d'alerter le bon compte
  // sur SON tableau de bord à l'heure prévue.
  const { data: users } = useCollection('users')
  const employesDisponibles = useMemo(
    () => users
      .filter((u) => u.role === 'agent' && (u.modules || []).includes('agro'))
      .map((u) => ({ uid: u.uid || u.login, nom: u.nom }))
      .filter((e) => e.uid && e.nom),
    [users]
  )

  return (
    <RoutineTaches
      moduleId="agro"
      collectionPrefix="agro_routine"
      color={COULEUR_MODULE.agro}
      titre="Tâches Routinières — MAXI-AGRO"
      description="Planning personnel : chaque tâche est assignée à un agent précis, avec une heure prévue."
      // Planning personnel : chaque NOUVELLE tâche routinière doit être assignée à
      // un agent précis avec une heure prévue — les tâches quotidiennes de la ferme
      // diffèrent d'un agent à l'autre et sont cadencées du réveil au soir (une
      // alerte apparaît sur le tableau de bord de l'agent à l'heure dite).
      planningPersonnel
      assignationObligatoire
      employesDisponibles={employesDisponibles}
    />
  )
}
