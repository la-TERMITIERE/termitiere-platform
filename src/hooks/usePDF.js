// Hook d'export PDF — expose les générateurs préconfigurés LA TERMITIÈRE.
import { genererDocumentPDF, genererRapportPDF } from '../utils/exportPDF'

export function usePDF(module = 'default') {
  return {
    // facture : { numero, date, client, lignes, totalHT, remise, tva, totalTTC }
    generateFacturePDF: (facture) => genererDocumentPDF(facture, 'FACTURE', module),
    generateDevisPDF: (devis) => genererDocumentPDF(devis, 'DEVIS', module),
    generateRapportPDF: genererRapportPDF
  }
}
