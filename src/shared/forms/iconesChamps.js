// Icônes automatiques des champs de formulaire : une fenêtre qui fournit ce contexte (ex. ModalAgro) voit chaque
// <FormGroup> sans icône explicite recevoir celle qui correspond à son libellé. Aucun effet ailleurs.
import { createContext } from 'react'
import {
  CalendarDays, UserRound, Phone, Mail, MapPin, Package, PawPrint, Hash, Banknote, Percent, AlignLeft,
  Syringe, Receipt, Ruler, Tag, Clock, Scale, Wheat
} from 'lucide-react'

export const IconesAutoContext = createContext(false)

const REGLES = [
  [/date|rendez-vous|échéance|echeance/i, CalendarDays],
  [/heure/i, Clock],
  [/t[ée]l[ée]phone|\btel\b|contact/i, Phone],
  [/e-?mail|courriel/i, Mail],
  [/adresse|lieu|site/i, MapPin],
  [/client|nom\b|apport|recommand|v[ée]t[ée]rinaire|agent|responsable|b[ée]n[ée]ficiaire/i, UserRound],
  [/esp[èe]ce|animal|animaux/i, PawPrint],
  [/aliment|divers/i, Wheat],
  [/dosage/i, Syringe],
  [/facture/i, Receipt],
  [/produit|article|stock|cat[ée]gorie|type/i, Package],
  [/effectif|initial/i, Scale],
  [/quantit|qt[ée]|nombre|nb\b|combien/i, Hash],
  [/prix|montant|total|co[ûu]t|valeur/i, Banknote],
  [/remise|tva|%|taux/i, Percent],
  [/unit[ée]/i, Ruler],
  [/note|description|motif|commentaire|observation|message|d[ée]tail/i, AlignLeft]
]

export function iconePourLabel(label) {
  const t = typeof label === 'string' ? label : ''
  for (const [re, Ic] of REGLES) if (re.test(t)) return Ic
  return Tag
}
