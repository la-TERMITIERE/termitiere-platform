// Fonctions utilitaires de formatage — monnaie FCFA, dates FR, identifiants.

// L'espace insécable fine (U+202F) utilisée par défaut comme séparateur de milliers en
// locale fr-FR n'est pas supportée par les polices standard de jsPDF (Helvetica…) — elle
// s'affiche alors bien trop large dans les PDF générés. On la remplace par une espace normale.
const espacerMilliers = (s) => s.replace(/[  ]/g, ' ')

// Formate un montant en FCFA (entier, sans décimales).
export const formatMoney = (amount) =>
  espacerMilliers(new Intl.NumberFormat('fr-FR').format(Math.round(Number(amount) || 0))) + ' FCFA'

// Formate un nombre simple (séparateur de milliers FR).
export const formatNumber = (n) =>
  espacerMilliers(new Intl.NumberFormat('fr-FR').format(Number(n) || 0))

// Extrait le montant FCFA (nombre) d'un texte libre — sert à isoler la somme des
// colonnes « Détails » du journal d'audit (ex. "Kara — FAC-…-000031 — 10 000 FCFA
// (brouillon)" → 10000), pour une colonne dédiée exploitable dans Excel (SOMME()),
// sans jamais modifier ou retirer le texte d'origine. Renvoie '' si aucun montant
// n'est trouvé (ex. "AUT-KARA-2026-000033 — autorisation auto (10 min)").
export function extraireMontantFCFA(texte) {
  if (!texte) return ''
  const m = String(texte).match(/([\d][\d\s .,]*)\s*FCFA/)
  if (!m) return ''
  const nombre = Number(m[1].replace(/[\s .,]/g, ''))
  return Number.isFinite(nombre) ? nombre : ''
}

// Date longue : "01 juin 2026". Accepte string 'YYYY-MM-DD' ou Date.
export const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d)) return String(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Date courte : "01/06/2026".
export const formatDateShort = (dateStr) => {
  if (!dateStr) return ''
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d)) return String(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Date + heure : "01/06/2026 14:32".
export const formatDateTime = (value) => {
  if (!value) return ''
  // Support des Timestamp Firestore (objet avec .toDate())
  const d = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value)
  if (isNaN(d)) return String(value)
  return (
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  )
}

// Date du jour au format 'YYYY-MM-DD' (clé d'inventaire).
export const todayStr = () => new Date().toISOString().split('T')[0]

// Décale une date 'YYYY-MM-DD' de n jours.
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Identifiant court pseudo-aléatoire en majuscules.
export const genId = () => Math.random().toString(36).slice(2, 10).toUpperCase()

// Numéro de document séquentiel : PREFIX-YYYY-000001.
export const genNumero = (prefix, count) =>
  `${prefix}-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(6, '0')}`

// Heure courante "HH:MM".
export const nowHM = () => {
  const n = new Date()
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')
}
