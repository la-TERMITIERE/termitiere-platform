// Comptes bancaires suivis dans « Mouvements bancaires » : un par secteur (collection `${secteur}_banque`) et, pour les
// sources de revenus ajoutées à la main (hors secteurs), un compte par source : leurs mouvements sont rangés ensemble
// dans la collection `autres_banque`, avec le champ `sourceId` de la source.
export const PREFIXE_AUTRE = 'autre:'
export const estAutreSource = (id) => String(id || '').startsWith(PREFIXE_AUTRE)
export const collectionBanque = (id) => (estAutreSource(id) ? 'autres_banque' : `${id}_banque`)
export const moduleAudit = (id) => (estAutreSource(id) ? 'comptabilite' : id)
export const idSource = (id) => String(id).slice(PREFIXE_AUTRE.length)
