// Briqueterie La Termitière — matières premières, catégories de briques, recettes.

export const MATIERES = [
  { id: 'ciment', nom: 'Ciment', unite: 'sacs' },
  { id: 'concasse', nom: 'Concassé / Gravillon', unite: 'm³' },
  { id: 'sable', nom: 'Sable fin', unite: 'm³' }
]

export const BRIQUES = [
  { id: 'b12_creux', nom: '12 creux', tarifVente: 350 },
  { id: 'b15_creux', nom: '15 creux', tarifVente: 400 },
  { id: 'b15_pleins', nom: '15 pleins', tarifVente: 450 },
  { id: 'b12_pleins', nom: '12 pleins', tarifVente: 380 },
  { id: 'b10_pleins', nom: '10 pleins', tarifVente: 320 },
  { id: 'hourdis_12', nom: 'Hourdis de 12', tarifVente: 500 },
  { id: 'hourdis_15', nom: 'Hourdis de 15', tarifVente: 550 },
  { id: 'caillasses', nom: 'Caillasses (cassées)', tarifVente: 80 }
]

// Consommation par 1000 briques produites (ajustable dans Paramètres).
export const RECETTES_DEFAULT = {
  b12_creux: { ciment: 8, concasse: 2.5, sable: 1.5 },
  b15_creux: { ciment: 9, concasse: 2.8, sable: 1.6 },
  b15_pleins: { ciment: 10, concasse: 3, sable: 1.8 },
  b12_pleins: { ciment: 8.5, concasse: 2.6, sable: 1.5 },
  b10_pleins: { ciment: 7, concasse: 2.2, sable: 1.3 },
  hourdis_12: { ciment: 12, concasse: 3.5, sable: 2 },
  hourdis_15: { ciment: 14, concasse: 4, sable: 2.2 }
}

export const AUTORITES_SORTIE = [
  'Direction Générale',
  'Contrôle Interne',
  'Service Commercial'
]

export const DUREE_SECHAGE_JOURS = 5
export const DUREE_PRODUCTION_OPTIONS = [24, 48]

export const ETATS_BRIQUE = [
  { id: 'appatam', label: 'Appatam (production)', color: '#7c3aed' },
  { id: 'sechage', label: 'En séchage (extérieur)', color: '#ca8a04' },
  { id: 'pret', label: 'Prêtes à vendre', color: '#16a34a' },
  { id: 'caillasses', label: 'Caillasses', color: '#64748b' }
]
