// Constantes du module Événementiel.
export const STATUTS_EVENEMENT = {
  prospect: { label: 'Prospect', tone: 'neutral', color: '#94a3b8' },
  confirme: { label: 'Confirmé', tone: 'info', color: '#0284c7' },
  en_cours: { label: 'En cours', tone: 'warning', color: '#d97706' },
  termine: { label: 'Terminé', tone: 'success', color: '#16a34a' },
  annule: { label: 'Annulé', tone: 'danger', color: '#dc2626' }
}
export const ORDRE_STATUTS = ['prospect', 'confirme', 'en_cours', 'termine', 'annule']

export const TYPES_EVENEMENT = [
  { value: 'mariage', label: '💍 Mariage' },
  { value: 'bapteme', label: '👶 Baptême' },
  { value: 'conference', label: '🎤 Conférence' },
  { value: 'anniversaire', label: '🎂 Anniversaire' },
  { value: 'autre', label: '🎉 Autre' }
]
export const labelType = (t) => TYPES_EVENEMENT.find((x) => x.value === t)?.label || t

export const SERVICES = ['Sono', 'Décoration', 'Catering', 'Sécurité', 'Photo/Vidéo', 'Logistique']

export const STATUTS_DEVIS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  envoye: { label: 'Envoyé', tone: 'info' },
  accepte: { label: 'Accepté', tone: 'success' },
  refuse: { label: 'Refusé', tone: 'danger' }
}
