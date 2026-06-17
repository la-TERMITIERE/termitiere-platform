// Logique métier — dossiers fonciers, progression des étapes.

import { etapesPourType } from './data'

// Types disponibles = types par défaut + types personnalisés (référentiel).
export function typesDisponibles(defaults, customTypes = []) {
  return [...defaults, ...customTypes]
}

// Étapes initiales en tenant compte des types personnalisés (qui référencent un
// « modèle » d'étapes existant). Repli sur le type lui-même si pas de modèle.
export function initEtapesPour(typeId, customTypes = []) {
  const custom = (customTypes || []).find((t) => t.id === typeId)
  return initEtapes(custom?.modele || typeId)
}

export function initEtapes(typeId) {
  return etapesPourType(typeId).map((e) => ({
    id: e.id,
    label: e.label,
    ordre: e.ordre,
    statut: 'a_faire',
    dateDebut: '',
    dateFin: '',
    notes: '',
    responsable: ''
  }))
}

export function progressionDossier(etapes) {
  if (!etapes?.length) return 0
  const terminees = etapes.filter((e) => e.statut === 'termine').length
  return Math.round((terminees / etapes.length) * 100)
}

export function etapeCourante(etapes) {
  if (!etapes?.length) return null
  const enCours = etapes.find((e) => e.statut === 'en_cours')
  if (enCours) return enCours
  return etapes.find((e) => e.statut === 'a_faire') || etapes[etapes.length - 1]
}

export function statutAutoDossier(dossier) {
  const pct = progressionDossier(dossier.etapes)
  if (dossier.statut === 'suspendu' || dossier.statut === 'cloture') return dossier.statut
  if (pct === 100) {
    if (dossier.type === 'morcellement') return 'morcellement'
    if (dossier.type === 'mutation') return 'mutation'
    return 'titre_obtenu'
  }
  if (pct > 0) return 'en_cours'
  return 'ouvert'
}

export function peutPasserSuivante(etapes, etapeId) {
  const sorted = [...etapes].sort((a, b) => a.ordre - b.ordre)
  const idx = sorted.findIndex((e) => e.id === etapeId)
  if (idx <= 0) return true
  return sorted[idx - 1].statut === 'termine'
}

export function filtrerDossiers(dossiers, { type, statut, recherche }) {
  return dossiers.filter((d) => {
    if (type && type !== 'tous' && d.type !== type) return false
    if (statut && statut !== 'tous' && d.statut !== statut) return false
    if (recherche) {
      const q = recherche.toLowerCase()
      const hay = [d.num, d.commune, d.lot, d.proprietaire, d.reference].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
