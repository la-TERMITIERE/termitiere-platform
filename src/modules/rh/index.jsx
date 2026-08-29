// Module RESSOURCES HUMAINES — routes internes.
// Reproduction de la structure du module RH de FEZIRE : 7 sous-modules, ~22 écrans.
import { Routes, Route } from 'react-router-dom'
import {
  Factory, ClipboardList, Users, Repeat, Handshake, Tag, Settings,
  Send, BookOpen, Gauge, TrendingUp, Scale, ListChecks, Lightbulb, Plane
} from 'lucide-react'
import Dashboard from './Dashboard'
import Departements from './Departements'
import Postes from './Postes'
import Employes from './Employes'
import Contrats from './Contrats'
import Conges from './Conges'
import Presences from './Presences'
import Paie from './Paie'
import PaieConfiguration from './PaieConfiguration'
import EtatSalaires from './EtatSalaires'
import Scaffold from './Scaffold'

export default function RhModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      {/* Structure RH */}
      <Route path="departements" element={<Departements />} />
      <Route path="postes" element={<Postes />} />
      <Route path="organigramme" element={<Scaffold icon={Users} sousModule="Structure RH" titre="Organigramme Interactif"
        sousTitre="Visualisez la hiérarchie de l'organisation, département par département."
        points={['Arborescence hiérarchique dynamique (N+1 / N-1)', 'Rattachement de chaque employé à un poste et un manager', 'Vue par département et effectifs']} />} />
      {/* Collaborateurs & Contrats */}
      <Route path="employes" element={<Employes />} />
      <Route path="contrats" element={<Contrats />} />
      <Route path="onboarding" element={<Scaffold icon={Repeat} sousModule="Collaborateurs & Contrats" titre="Onboarding / Offboarding"
        sousTitre="Parcours d'intégration des nouveaux et de départ des sortants."
        points={['Check-lists d\'intégration (matériel, accès, formation)', 'Parcours de départ (restitution, solde de tout compte)', 'Suivi de l\'avancement par étape']} />} />
      <Route path="rattachements" element={<Scaffold icon={Handshake} sousModule="Collaborateurs & Contrats" titre="Rattachement des comptes"
        sousTitre="Lier chaque employé à un compte utilisateur de la plateforme."
        points={['Association employé ↔ compte utilisateur', 'Provisionnement des accès selon le poste', 'Révocation à la sortie']} />} />
      <Route path="titres-badges" element={<Scaffold icon={Tag} sousModule="Collaborateurs & Contrats" titre="Diplômes & badges"
        sousTitre="Diplômes, certifications et badges de compétence des collaborateurs."
        points={['Registre des diplômes et certifications', 'Badges de compétence attribués', 'Échéances de recyclage / renouvellement']} />} />
      {/* Temps & Paie */}
      <Route path="conges" element={<Conges />} />
      <Route path="presences" element={<Presences />} />
      <Route path="paie" element={<Paie />} />
      <Route path="paie-configuration" element={<PaieConfiguration />} />
      <Route path="etat-salaires" element={<EtatSalaires />} />
      {/* Talent & Développement */}
      <Route path="recrutement" element={<Scaffold icon={Send} sousModule="Talent & Développement" titre="Recrutement & Offres"
        sousTitre="Publiez des offres et suivez le pipeline de candidatures."
        points={['Offres d\'emploi (brouillon → publiée → clôturée)', 'Pipeline : Candidature → Présélection → Entretien → Offre → Recruté', 'Conversion d\'un candidat retenu en employé']} />} />
      <Route path="formulaires" element={<Scaffold icon={ClipboardList} sousModule="Talent & Développement" titre="Formulaires & candidature"
        sousTitre="Formulaires de candidature personnalisés par offre."
        points={['Constructeur de formulaire de candidature', 'Réception et tri des réponses', 'Lien public de candidature']} />} />
      <Route path="formations" element={<Scaffold icon={BookOpen} sousModule="Talent & Développement" titre="Formations"
        sousTitre="Plan de formation et suivi des sessions."
        points={['Catalogue et sessions (planifiée / en cours / terminée)', 'Inscriptions et présence', 'Coût et évaluation de la formation']} />} />
      <Route path="evaluations" element={<Scaffold icon={Gauge} sousModule="Talent & Développement" titre="Évaluations"
        sousTitre="Campagnes d'évaluation et entretiens annuels."
        points={['Grilles d\'évaluation par poste', 'Entretiens annuels et objectifs', 'Historique de performance']} />} />
      <Route path="competences" element={<Scaffold icon={TrendingUp} sousModule="Talent & Développement" titre="Compétences & GPEC"
        sousTitre="Cartographie des compétences et gestion prévisionnelle des emplois."
        points={['Référentiel de compétences (Débutant → Expert)', 'Matrice compétences × employés', 'Écarts et besoins en formation (GPEC)']} />} />
      {/* Pilotage & Conformité */}
      <Route path="conformite" element={<Scaffold icon={Scale} sousModule="Pilotage & Conformité" titre="Conformité & Alertes RH"
        sousTitre="Registre du personnel et alertes réglementaires."
        points={['Alertes : fins de CDD, périodes d\'essai, visites médicales', 'Registre unique du personnel', 'Échéances documentaires et légales']} />} />
      {/* Vie d'Équipe */}
      <Route path="taches" element={<Scaffold icon={ListChecks} sousModule="Vie d'Équipe" titre="Tâches d'équipe"
        sousTitre="Suivi des tâches et petits projets d'équipe (Kanban)."
        points={['Tableau Kanban des tâches d\'équipe', 'Affectation et échéances', 'Progression par membre']} />} />
      <Route path="impacts" element={<Scaffold icon={Lightbulb} sousModule="Vie d'Équipe" titre="Impact Collègue"
        sousTitre="Reconnaissances et feedbacks positifs entre collègues."
        points={['Envoi de reconnaissances (feedback positif)', 'Mur des réussites d\'équipe', 'Valorisation du travail au quotidien']} />} />
      {/* Missions & Frais */}
      <Route path="missions" element={<Scaffold icon={Plane} sousModule="Missions & Frais" titre="Missions & frais"
        sousTitre="Ordres de mission et notes de frais."
        points={['Ordres de mission (demandée → approuvée → terminée)', 'Notes de frais rattachées à la mission', 'Remboursement (lien avec la trésorerie / comptabilité)']} />} />
      <Route path="missions-configuration" element={<Scaffold icon={Settings} sousModule="Missions & Frais" titre="Configuration des missions"
        sousTitre="Barèmes d'indemnités et règles de remboursement."
        points={['Barème d\'indemnités journalières', 'Plafonds par type de frais', 'Circuit de validation']} />} />
    </Routes>
  )
}
