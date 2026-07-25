// Logique métier — dossiers fonciers, progression des étapes, frais détaillés.

import { etapesPourType, CATEGORIES_FRAIS, FRAIS_INSCRIPTION_LABEL } from './data'
import { genId, todayStr } from '../../utils/formatters'

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
    responsable: '',
    personnel: e.personnel || '',   // intervenant type (Géomètre, OTR, Notaire…)
    cout: e.cout || '',             // référence de coût liée à l'étape
    montant: '',                    // hérité : montant unique (dossiers antérieurs)
    frais: []                       // lignes de frais détaillées de l'étape
  }))
}

// ───────────────────────── FRAIS ─────────────────────────

// Nouvelle ligne de frais vierge.
export const newFrais = (patch = {}) => ({
  id: genId(),
  categorie: 'administratif',
  libelle: '',
  montant: '',
  date: todayStr(),
  note: '',
  ...patch
})

// Somme d'une liste de lignes de frais.
export function totalFrais(frais) {
  return (frais || []).reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
}

// Total d'une étape : somme des lignes détaillées ; à défaut on retombe sur
// l'ancien champ `montant` unique, pour ne rien perdre des dossiers créés avant
// la saisie détaillée.
export function totalEtape(etape) {
  if (!etape) return 0
  if (etape.frais?.length) return totalFrais(etape.frais)
  return parseFloat(etape.montant) || 0
}

// Frais engagés à l'inscription (ouverture du dossier), hors étapes.
export function totalInscription(dossier) {
  return totalFrais(dossier?.fraisInscription)
}

// Total dépensé sur un dossier à l'instant T — inscription + toutes les étapes.
// Ne dépend pas de l'achèvement du dossier : le cumul est disponible en cours de route.
export function totalDossier(dossier) {
  if (!dossier) return 0
  return totalInscription(dossier) + (dossier.etapes || []).reduce((s, e) => s + totalEtape(e), 0)
}

// Toutes les lignes de frais d'un dossier, à plat, enrichies de leur provenance
// (inscription ou étape). Les dossiers antérieurs, qui n'ont qu'un montant unique
// par étape, sont représentés par une ligne de reprise afin de rester comptés.
export function lignesFraisDossier(dossier) {
  if (!dossier) return []
  const lignes = []
  const pousser = (f, source, sourceLabel, ordre) =>
    lignes.push({ ...f, source, sourceLabel, ordre })

  ;(dossier.fraisInscription || []).forEach((f) => pousser(f, 'inscription', FRAIS_INSCRIPTION_LABEL, 0))
  ;[...(dossier.etapes || [])].sort((a, b) => a.ordre - b.ordre).forEach((e) => {
    if (e.frais?.length) {
      e.frais.forEach((f) => pousser(f, e.id, e.label, e.ordre))
    } else if ((parseFloat(e.montant) || 0) > 0) {
      pousser(
        { id: `${e.id}__repris`, categorie: 'autre', libelle: 'Montant saisi (avant détail des frais)', montant: e.montant, date: e.dateFin || '', repris: true },
        e.id, e.label, e.ordre
      )
    }
  })
  return lignes
}

// Répartition du total par catégorie de frais (décroissant), catégories vides exclues.
export function totalParCategorie(dossier) {
  const map = {}
  lignesFraisDossier(dossier).forEach((l) => {
    const cat = l.categorie || 'autre'
    map[cat] = (map[cat] || 0) + (parseFloat(l.montant) || 0)
  })
  return CATEGORIES_FRAIS
    .filter((c) => map[c.id])
    .map((c) => ({ ...c, montant: map[c.id] }))
    .sort((a, b) => b.montant - a.montant)
}

// Récapitulatif poste par poste : inscription puis étapes, avec sous-total et
// nombre de lignes. Sert au tableau « détail de chaque étape et à quel coût ».
export function recapFraisDossier(dossier) {
  const lignes = lignesFraisDossier(dossier)
  const groupes = []
  lignes.forEach((l) => {
    let g = groupes.find((x) => x.source === l.source)
    if (!g) {
      g = { source: l.source, label: l.sourceLabel, ordre: l.ordre, lignes: [], total: 0 }
      groupes.push(g)
    }
    g.lignes.push(l)
    g.total += parseFloat(l.montant) || 0
  })
  return groupes.sort((a, b) => a.ordre - b.ordre)
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
  // Verdict d'appréciation négatif (cession) → dossier rejeté/annulé.
  if (dossier.cession?.appreciation?.verdict === 'annulee') return 'rejete'
  const pct = progressionDossier(dossier.etapes)
  if (['suspendu', 'cloture', 'rejete'].includes(dossier.statut)) return dossier.statut
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
