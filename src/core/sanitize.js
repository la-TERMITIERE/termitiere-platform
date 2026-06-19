// Validation + assainissement des données AVANT qu'elles touchent la base.
// Appliqué à TOUS les champs de TOUTES les écritures (pas seulement le login).
//
// Objectifs :
//  - retirer les caractères de contrôle (peuvent casser le stockage / servir d'injection) ;
//  - plafonner la longueur (empêche l'abus / le gonflement volontaire de la base) ;
//  - borner la profondeur des objets (empêche les structures piégées).
//
// NB : on ne ré-encode PAS le HTML ici — React échappe déjà l'affichage par défaut,
// ré-encoder corromprait le texte. On neutralise ce qui est dangereux au stockage.

const MAX_STRING = 8000      // longueur max d'une valeur texte
const MAX_KEY = 200          // longueur max d'une clé
const MAX_DEPTH = 16         // profondeur max d'un objet

// Retire les caractères de contrôle (codes < 32 sauf tab/retours, et 127),
// sans utiliser de caractère littéral dans le code source.
function cleanString(s) {
  const str = String(s)
  let v = ''
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c === 127) continue
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue
    v += str[i]
  }
  if (v.length > MAX_STRING) v = v.slice(0, MAX_STRING)
  return v
}

export function sanitizeData(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return null
  const t = typeof value
  if (t === 'string') return cleanString(value)
  if (t === 'number') return Number.isFinite(value) ? value : 0
  if (t === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 5000).map((v) => sanitizeData(v, depth + 1))
  if (t === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const key = cleanString(k).slice(0, MAX_KEY)
      if (key) out[key] = sanitizeData(v, depth + 1)
    }
    return out
  }
  return undefined // fonctions, symboles… : jamais stockés
}

// Validateurs de format réutilisables (principe « est-ce le bon format ? »).
export const isValidLogin = (s) => typeof s === 'string' && /^[\w.@-]{2,64}$/.test(s.trim())
export const isValidPhone = (s) => !s || /^[+\d][\d\s-]{5,20}$/.test(String(s).trim())
