// Hook d'export PDF — expose les générateurs préconfigurés LA TERMITIÈRE.
import { genererDocumentPDF, genererRapportPDF } from '../utils/exportPDF'

export function usePDF() {
  return {
    // facture : { numero, date, client, lignes, totalHT, remise, tva, totalTTC }
    generateFacturePDF: (facture) => genererDocumentPDF(facture, 'FACTURE'),
    generateDevisPDF: (devis) => genererDocumentPDF(devis, 'DEVIS'),
    generateRapportPDF: genererRapportPDF
  }
}
