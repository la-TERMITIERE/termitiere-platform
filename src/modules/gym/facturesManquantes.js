// MAXI-GYM : abonnements et séances restés SANS facture (donc non comptés dans les totaux), et leur régularisation.
// Utilisé par le rattrapage automatique du mois en cours (useFacturesManquantes) et par le bouton « Régulariser » de la
// Facturation pour les mois passés. Chaque facture a un identifiant fixe par source et est créée de façon atomique
// (`claimOnce`) : une même vente n'est jamais facturée deux fois, même avec plusieurs postes ouverts.
// Les séances « partenaire » sont exclues : elles sont facturées au règlement de la structure. Les ventes annulées
// (remboursées) aussi.
import { claimOnce } from '../../core/db'
import { audit } from '../../core/audit'
import { matchSite } from './site/useSite'
import { categorieLabel } from './data'
import { numeroFactureSuivant } from './genererFacture'

export function trouverManquants({ factures, abonnements, seances, site, moisSeul = null, moisExclu = null }) {
  const lies = new Set(factures.filter((f) => f.sourceType && f.sourceId).map((f) => `${f.sourceType}:${f.sourceId}`))
  const dansMois = (d) => {
    const m = (d || '').slice(0, 7)
    if (moisSeul) return m === moisSeul
    if (moisExclu) return m !== moisExclu
    return true
  }
  const montantDu = (x) => Number(x.montantPaye ?? x.montant) || 0
  const abos = abonnements
    .filter((a) => matchSite(a, site) && dansMois(a.date) && !a.annule && montantDu(a) > 0 && !lies.has(`abonnement:${a.id}`))
    .map((src) => ({ type: 'abonnement', src, montant: montantDu(src) }))
  const sea = seances
    .filter((s) => matchSite(s, site) && dansMois(s.date) && !s.annule && !s.partenaire && Number(s.montant) > 0 && !lies.has(`seance:${s.id}`))
    .map((src) => ({ type: 'seance', src, montant: Number(src.montant) || 0 }))
  return [...abos, ...sea]
}

// Crée les factures manquantes (au plus `max` par passage). Renvoie le nombre de factures créées.
export async function facturerManquants(items, { clients, site, user, max = 30 }) {
  let n = 0
  for (const m of items.slice(0, max)) {
    const s = m.src
    const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (s.clientNom || '').trim().toLowerCase())
    const description = m.type === 'abonnement'
      ? `Abonnement ${categorieLabel(s.categorie)}${s.dateFin ? ` : jusqu'au ${s.dateFin}` : ''}`
      : `Séance ${categorieLabel(s.categorie)}`
    try {
      const numero = await numeroFactureSuivant(s.date)
      const gagne = await claimOnce('gym_factures', `auto_${m.type}_${s.id}`, {
        numero, date: s.date, sourceType: m.type, sourceId: s.id, site: s.site || site || 'lome',
        clientNom: s.clientNom, ...(s.clientId || client?.id ? { clientId: s.clientId || client.id } : {}), sexe: s.sexe || '',
        clientTelephone: client?.telephone || '', categorie: s.categorie || '', description,
        montant: m.montant, imprime: false, autoGeneree: true, modePaiement: s.modePaiement || 'especes',
        enregistrePar: s.enregistrePar || user?.nom || '—', enregistreParUid: s.enregistreParUid || user?.uid || null
      })
      if (gagne) {
        n += 1
        await audit('gym', 'FACTURE_AUTO', `${numero} : ${s.clientNom} : ${m.montant.toLocaleString('fr-FR')} FCFA (facture manquante générée)`)
      }
    } catch (e) { console.warn('[gym] facture automatique impossible', s.clientNom, e) }
  }
  return n
}
