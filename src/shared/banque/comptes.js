// Comptes bancaires suivis dans « Mouvements bancaires » : un par secteur (collection `${secteur}_banque`) et, pour les
// sources de revenus ajoutées à la main (hors secteurs), un compte par source : leurs mouvements sont rangés ensemble
// dans la collection `autres_banque`, avec le champ `sourceId` de la source.
export const PREFIXE_AUTRE = 'autre:'
export const estAutreSource = (id) => String(id || '').startsWith(PREFIXE_AUTRE)
export const collectionBanque = (id) => (estAutreSource(id) ? 'autres_banque' : `${id}_banque`)
export const moduleAudit = (id) => (estAutreSource(id) ? 'comptabilite' : id)
export const idSource = (id) => String(id).slice(PREFIXE_AUTRE.length)

// Chaque compte bancaire garde sa teinte (SUNU, NSIA…), pour le repérer d'un coup d'œil partout.
const TEINTES_BANQUE = ['#0f766e', '#4f46e5', '#b45309', '#be185d', '#0369a1', '#7c3aed']
export const teinteBanque = (nom) => {
  let h = 0
  for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES_BANQUE[h % TEINTES_BANQUE.length]
}
