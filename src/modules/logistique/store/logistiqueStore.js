// Constantes et libellés du module Logistique.
export const STATUTS_VEHICULE = {
  disponible: { label: 'Disponible', tone: 'success' },
  en_mission: { label: 'En mission', tone: 'info' },
  maintenance: { label: 'Maintenance', tone: 'warning' }
}

export const TYPES_VEHICULE = [
  { value: 'camion', label: 'Camion' },
  { value: 'pickup', label: 'Pick-up' },
  { value: 'moto', label: 'Moto' },
  { value: 'autre', label: 'Autre' }
]

export const STATUTS_LIVRAISON = {
  planifiee: { label: 'Planifiée', tone: 'neutral' },
  en_cours: { label: 'En cours', tone: 'info' },
  livree: { label: 'Livrée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'danger' }
}
