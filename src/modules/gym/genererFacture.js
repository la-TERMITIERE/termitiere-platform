// MAXI-GYM — génération de facture, déclenchée depuis l'enregistrement d'une
// séance ou d'un abonnement (case à cocher dans leur formulaire respectif).
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { genNumero, todayStr } from '../../utils/formatters'

// `factures` = liste actuelle (pour numéroter) ; `generatePDF` = generateFacturePDF
// de usePDF('gym') — déclenche le téléchargement du PDF si fourni. `site` = salle
// d'origine (lomé/kara) — cf. site/useSite.jsx. `imprime` (optionnel, `true` par
// défaut) : trace si le reçu a RÉELLEMENT été imprimé à la création — l'appelant
// décide s'il imprime (cf. Seances.jsx, case à cocher) ; ce champ ne fait que
// refléter fidèlement ce choix, jamais un « imprimé » supposé.
export async function genererFactureGym({ factures, sourceType, sourceId, clientNom, clientTelephone, categorie, description, montant, user, site, generatePDF, imprime = true }) {
  const numero = genNumero('FACT-GYM', factures.length)
  const payload = {
    numero, date: todayStr(), sourceType, sourceId: sourceId || null, site: site || 'lome',
    clientNom, clientTelephone: clientTelephone || '', categorie: categorie || '', description,
    montant: Number(montant) || 0, imprime: !!imprime,
    enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
  }
  await addItem('gym_factures', payload)
  await audit('gym', 'FACTURE_CREATE', `${numero} — ${clientNom} — ${Number(montant).toLocaleString('fr-FR')} FCFA`)
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
