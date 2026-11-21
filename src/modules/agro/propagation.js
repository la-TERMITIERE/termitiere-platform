// Continuité des effectifs entre les jours (MAXI-AGRO) : après la modification d'un jour, les jours suivants déjà enregistrés
// reprennent son EF Final comme EF Initial (voir suiteRecalculee dans logic.js).
import { getAll, setItem } from '../../core/db'
import { suiteRecalculee } from './logic'

// Corrige les jours qui suivent `date`. Renvoie le nombre de jours corrigés (0 si tout était déjà cohérent).
// Au mieux : une erreur ici ne doit jamais faire échouer l'enregistrement du jour lui-même.
export async function propagerSuite(date) {
  try {
    const inventaires = await getAll('agro_inventaires')
    const aCorriger = suiteRecalculee(inventaires, date)
    for (const doc of aCorriger) {
      await setItem('agro_inventaires', doc.date, { date: doc.date, animaux: doc.animaux, aliments: doc.aliments })
    }
    return aCorriger.length
  } catch (e) {
    console.warn('[agro] propagation aux jours suivants impossible :', e)
    return 0
  }
}
