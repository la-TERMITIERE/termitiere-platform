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

// Nombre de jours de location, bornes incluses (début = fin ⇒ 1 jour).
export function nbJoursInclus(dateDebut, dateFin) {
  if (!dateDebut) return 1
  const d1 = new Date(dateDebut)
  const d2 = new Date(dateFin || dateDebut)
  if (isNaN(d1) || isNaN(d2)) return 1
  const diff = Math.floor((d2 - d1) / 86400000)
  return Math.max(1, diff + 1)
}

// Montant d'une ligne de prestation : quantité × jours × tarif unitaire/jour.
export function montantLigne(l) {
  const qte = parseInt(l?.qte) || 0
  const jours = parseInt(l?.nbJours) || 1
  const tarif = parseFloat(l?.tarifUnitaire ?? l?.tarif) || 0
  return qte * jours * tarif
}

// ── Analyse détaillée des prestations ───────────────────────────────────────
// Agrège une liste de prestations (déjà filtrée par site/période) pour le
// Pilotage : par élément (matériel), par catégorie, par événement, par client.
// Le CA d'une prestation = somme des montants de lignes + frais éventuels.
export function analyserPrestations(prestations) {
  const elements = {}
  const categories = {}
  const evenements = {}
  const clients = {}

  ;(prestations || [])
    .filter((p) => p.statut !== 'annulee')
    .forEach((p) => {
      const joursPresta = nbJoursInclus(p.dateDebut, p.dateFin)
      let caPresta = 0
      ;(p.lignes || []).forEach((l) => {
        const montant = l.montant != null ? l.montant : montantLigne(l)
        caPresta += montant
        const key = l.materielId || `autre:${l.materielNom || 'Autre'}`
        const cat = l.cat || 'AUTRES'
        const qte = parseInt(l.qte) || 0
        const jours = parseInt(l.nbJours) || joursPresta
        const e = elements[key] || (elements[key] = { key, nom: l.materielNom || 'Autre', cat, count: 0, qte: 0, jours: 0, ca: 0 })
        e.count += 1; e.qte += qte; e.jours += jours; e.ca += montant
        const c = categories[cat] || (categories[cat] = { cat, ca: 0, qte: 0, count: 0, elements: {} })
        c.ca += montant; c.qte += qte; c.count += 1
        c.elements[key] = e
      })
      ;(p.frais || []).forEach((f) => { caPresta += parseFloat(f.montant) || 0 })

      const ev = (p.evenement || '').trim() || 'Non précisé'
      const evStat = evenements[ev] || (evenements[ev] = { label: ev, ca: 0, qte: 0, count: 0 })
      evStat.count += 1; evStat.ca += caPresta
      evStat.qte += (p.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

      const cli = (p.clientNom || '').trim() || 'Client inconnu'
      const cStat = clients[cli] || (clients[cli] = { nom: cli, ca: 0, count: 0, jours: 0, dernier: '' })
      cStat.count += 1; cStat.ca += caPresta; cStat.jours += joursPresta
      if ((p.dateDebut || p.date || '') > cStat.dernier) cStat.dernier = p.dateDebut || p.date || ''
    })

  const parElement = Object.values(elements).sort((a, b) => b.count - a.count)
  const parCategorie = Object.values(categories).map((c) => {
    const els = Object.values(c.elements).sort((a, b) => b.count - a.count)
    return { ...c, elements: els, top: els[0] || null }
  }).sort((a, b) => b.ca - a.ca)
  const parEvenement = Object.values(evenements).sort((a, b) => b.count - a.count)
  const parClient = Object.values(clients).sort((a, b) => b.ca - a.ca)

  return { parElement, parCategorie, parEvenement, parClient }
}
