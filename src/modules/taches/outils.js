// E-TACHES : petits utilitaires de listes.
export const actifs = (liste) => (liste || []).filter((x) => x.actif !== false)

// Catégories déjà utilisées (suggestions de la saisie libre).
export const categoriesUtilisees = (taches) => [...new Set((taches || []).map((t) => (t.categorie || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))

export const heureMessage = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const auj = new Date()
  const memeJour = d.toDateString() === auj.toDateString()
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return memeJour ? h : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${h}`
}

// Recherche insensible aux accents et à la casse.
export const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
