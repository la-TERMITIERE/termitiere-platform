// Logique métier — briqueterie (matières, production, stock briques, autorisations).

export function previousInventoryDate(inventaires, date) {
  const dates = inventaires.map((i) => i.date).filter((d) => d && d < date).sort()
  return dates.length ? dates[dates.length - 1] : null
}

export const getInventaire = (inventaires, date) =>
  inventaires.find((i) => i.date === date) || null

export const sommeMouvements = (lignes) =>
  (lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

export function autoSortiesVentes(demandes, briqueId, dateSortie) {
  return (demandes || [])
    .filter((d) => d.statut === 'approuve' && d.briqueId === briqueId && d.dateSortie === dateSortie)
    .reduce((s, d) => s + (parseInt(d.qte) || 0), 0)
}

export function agregerMatiere({ init = 0, entrees = [], consommations = [] }) {
  const ent = sommeMouvements(entrees)
  const conso = sommeMouvements(consommations)
  const fin = Math.max(0, init + ent - conso)
  const coutEntrees = (entrees || []).reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.cout) || 0), 0)
  return { init, ent, conso, fin, coutEntrees }
}

export function stockBriqueTotal(stock) {
  if (!stock) return 0
  return (stock.appatam || 0) + (stock.sechage || 0) + (stock.pret || 0) + (stock.caillasses || 0)
}

export function calcConsommationProduction(quantites, recettes) {
  const conso = { ciment: 0, concasse: 0, sable: 0 }
  Object.entries(quantites || {}).forEach(([briqueId, qte]) => {
    const q = parseInt(qte) || 0
    if (!q || briqueId === 'caillasses') return
    const rec = recettes[briqueId]
    if (!rec) return
    const factor = q / 1000
    conso.ciment += (rec.ciment || 0) * factor
    conso.concasse += (rec.concasse || 0) * factor
    conso.sable += (rec.sable || 0) * factor
  })
  return conso
}

export function joursDepuis(dateStr) {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now - d) / (1000 * 60 * 60 * 24))
}

export function statutAutorisation(approbations, autorites) {
  const list = autorites || []
  const vals = list.map((a) => approbations?.[a])
  if (vals.some((v) => v === 'refuse')) return 'refuse'
  if (vals.every((v) => v === 'approuve')) return 'approuve'
  const nb = vals.filter((v) => v === 'approuve').length
  return nb > 0 ? 'partiel' : 'en_attente'
}

export function peutModifierLigne(ligne, userId) {
  if (!ligne?.agentId) return true
  return ligne.agentId === userId
}

export function mergeMouvementsUtilisateur(_prev, next, userId, userNom) {
  const autres = (next || []).filter((l) => l.agentId && l.agentId !== userId)
  const miennes = (next || [])
    .filter((l) => !l.agentId || l.agentId === userId)
    .map((l) => ({ ...l, agentId: userId, agentNom: userNom }))
  return [...autres, ...miennes]
}

export function annoterLignesAgent(lignes, userId, userNom) {
  return (lignes || []).map((l) => (l.agentId ? l : { ...l, agentId: userId, agentNom: userNom }))
}

export function dernierStockBriques(inventaires, briqueId, etat = 'pret') {
  const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  return tri[0]?.briques?.[briqueId]?.[etat] || 0
}
