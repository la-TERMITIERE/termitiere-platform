// Logique métier — stock matériel logistique & événementiel.
import { estCertifie } from '../../shared/workflow'

export function previousInventoryDate(inventaires, date) {
  const dates = inventaires.map((i) => i.date).filter((d) => d && d < date).sort()
  return dates.length ? dates[dates.length - 1] : null
}

export const getInventaire = (inventaires, date) =>
  inventaires.find((i) => i.date === date) || null

export const sommeMouvements = (lignes) =>
  (lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

export const sommeType = (lignes, type) =>
  (lignes || []).filter((l) => l.type === type).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

// Sorties automatiques d'un matériel à une date : somme des autorisations de sortie
// CERTIFIÉES prévues ce jour. Une autorisation couvre soit plusieurs lignes
// (workflow prestation → une autorisation pour tout le matériel loué), soit — pour
// les enregistrements hérités — un unique { materielId, qte }.
export function autoSorties(demandes, materielId, dateSortie) {
  return (demandes || [])
    .filter((d) => estCertifie(d.statut) && d.dateSortie === dateSortie)
    .reduce((s, d) => {
      if (Array.isArray(d.lignes) && d.lignes.length) {
        return s + d.lignes
          .filter((l) => l.materielId === materielId)
          .reduce((a, l) => a + (parseInt(l.qte) || 0), 0)
      }
      return d.materielId === materielId ? s + (parseInt(d.qte) || 0) : s
    }, 0)
}

// EF Final = init + achats − sorties (locations) + retours OK
// Cassé / Perdu : enregistrés pour le suivi, ne réintègrent pas le stock.
export function agregerMateriel({ init = 0, entrees = [], sorties = [], retours = [] }, autoSor = 0) {
  const achats = sommeMouvements(entrees)
  const sorManuel = sommeMouvements(sorties)
  const totalSor = sorManuel + (autoSor || 0)
  const retourOk = sommeType(retours, 'OK')
  const retourCasse = sommeType(retours, 'Cassé')
  const retourPerdu = sommeType(retours, 'Perdu')
  const fin = Math.max(0, init + achats - totalSor + retourOk)
  const coutAchats = (entrees || []).reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.cout) || 0), 0)
  return { init, ent: achats, sor: totalSor, retourOk, retourCasse, retourPerdu, fin, coutAchats }
}

export function mouvementsDepuisSaisie(saved) {
  if (!saved) return { entrees: [], sorties: [], retours: [] }
  if (saved.entrees || saved.sorties || saved.retours) {
    return { entrees: saved.entrees || [], sorties: saved.sorties || [], retours: saved.retours || [] }
  }
  const entrees = saved.ent ? [{ type: 'Achat', qte: saved.ent, cout: 0, label: '' }] : []
  const sorties = saved.sor ? [{ type: 'Location', qte: saved.sor, label: '' }] : []
  return { entrees, sorties, retours: [] }
}

export function dernierStock(inventaires, materielId) {
  const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  return tri[0]?.materiels?.[materielId]?.fin || 0
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

export const ENTREE_TYPES = ['Achat']
export const SORTIE_TYPES_SAISIE = ['Ajustement']
export const RETOUR_TYPES = ['OK', 'Cassé', 'Perdu']
