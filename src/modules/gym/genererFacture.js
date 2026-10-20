// MAXI-GYM — génération de facture, déclenchée depuis l'enregistrement d'une
// séance ou d'un abonnement (case à cocher dans leur formulaire respectif).
import { addItem, getAll, updateAtomic } from '../../core/db'
import { audit } from '../../core/audit'
import { todayStr } from '../../utils/formatters'

// Numéro de facture SÉQUENTIEL, unique pour les deux salles : un compteur par année (et par préfixe) tenu dans une
// transaction (`gym_compteurs`). Avant, le numéro venait du nombre de factures affichées : deux enregistrements très
// rapprochés ou une facture supprimée donnaient deux fois le même numéro. Le compteur repart toujours au-dessus du
// plus grand numéro déjà émis, donc il reste cohérent avec les anciennes factures.
export async function numeroFactureSuivant(date, prefixeBase = 'FACT-GYM') {
  const annee = String(date || todayStr()).slice(0, 4)
  const prefixe = `${prefixeBase}-${annee}-`
  let existant = 0
  try {
    const toutes = await getAll('gym_factures')
    existant = toutes.reduce((m, f) => {
      const x = String(f.numero || '')
      return x.startsWith(prefixe) ? Math.max(m, parseInt(x.slice(prefixe.length), 10) || 0) : m
    }, 0)
  } catch { /* lecture impossible : le compteur seul fera foi */ }
  const id = `${prefixeBase}-${annee}`
  let n = 0
  await updateAtomic('gym_compteurs', id, (cur) => {
    n = Math.max(Number(cur?.n) || 0, existant) + 1
    return { id, n }
  })
  return `${prefixe}${String(n).padStart(6, '0')}`
}

// `factures` n'est plus utilisé pour numéroter (gardé pour ne pas modifier les appelants) ; `generatePDF` = generateFacturePDF
// de usePDF('gym') — déclenche le téléchargement du PDF si fourni. `site` = salle d'origine (lomé/kara) — cf.
// site/useSite.jsx. `imprime` (optionnel, `true` par défaut) : trace si le reçu a RÉELLEMENT été imprimé à la création.
// `date` (optionnel) : date de la séance/l'abonnement D'ORIGINE — à passer systématiquement par l'appelant, sinon une
// séance antidatée se retrouve facturée à la date de saisie. `clientId` : fiche du client. `modePaiement` : espèces,
// Mobile Money ou banque (pour la clôture de caisse). `avoir` : facture négative = remboursement (préfixe AVOIR-GYM).
export async function genererFactureGym({ sourceType, sourceId, clientNom, clientId, clientTelephone, categorie, description, montant, user, site, date, sexe, generatePDF, imprime = true, modePaiement = 'especes', avoir = false, versement = false, motif = '' }) {
  const numero = await numeroFactureSuivant(date, avoir ? 'AVOIR-GYM' : 'FACT-GYM')
  const payload = {
    numero, date: date || todayStr(), sourceType, sourceId: sourceId || null, site: site || 'lome',
    clientNom, ...(clientId ? { clientId } : {}), sexe: sexe || '', clientTelephone: clientTelephone || '', categorie: categorie || '', description,
    montant: Number(montant) || 0, imprime: !!imprime, modePaiement,
    ...(avoir ? { avoir: true } : {}), ...(versement ? { versement: true } : {}), ...(motif ? { motif } : {}),
    enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
  }
  await addItem('gym_factures', payload)
  await audit('gym', avoir ? 'REMBOURSEMENT' : 'FACTURE_CREATE', `${numero} : ${clientNom} : ${Number(montant).toLocaleString('fr-FR')} FCFA${motif ? ` : ${motif}` : ''}`)
  if (generatePDF) {
    await generatePDF({
      numero, date: payload.date,
      client: { nom: clientNom, tel: clientTelephone || '' },
      lignes: [{ article: description, qte: 1, prixUnit: payload.montant, total: payload.montant }],
      totalHT: payload.montant, totalTTC: payload.montant
    })
  }
  return payload
}
