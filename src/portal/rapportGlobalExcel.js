// Rapport global de tous les secteurs en Excel : une feuille « Synthèse » (une ligne par secteur, totaux), puis une feuille par secteur avec ses
// opérations (recettes et dépenses datées). Mise en forme de la charte LA TERMITIÈRE (cf. utils/excelReport.js).
import { exportRapportExcel } from '../utils/excelReport'

const nbr = (n) => Math.round(Number(n) || 0)
const dateCourte = (j) => String(j || '').split('-').reverse().join('/')

// Nom de feuille Excel : 31 caractères au plus, sans : \ / ? * [ ] et sans doublon.
function nomsFeuilles(labels) {
  const pris = new Set(['Synthèse'])
  return labels.map((l) => {
    const base = String(l).replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Secteur'
    let nom = base, i = 2
    while (pris.has(nom)) nom = `${base.slice(0, 26)} ${i++}`
    pris.add(nom)
    return nom
  })
}

// Rapport sans montant (Assistant(e) GE) : une seule feuille, l'activité de chaque secteur, aucune somme d'argent.
function rapportSansMontant({ secteurs, libelle, edite, fichier }) {
  const colonnes = [{ key: 'secteur', label: 'Secteur', width: 30 }, { key: 'activite', label: 'Activité sur la période', width: 90 }, { key: 'operations', label: 'Opérations', type: 'number', width: 12, align: 'center' }]
  const sections = [{
    name: 'Activité', title: 'Rapport global des secteurs : LA TERMITIÈRE', subtitle: `Période : ${libelle} · ${edite}`,
    columns: colonnes,
    rows: secteurs.map((s) => ({ secteur: s.label, activite: s.activite.map((a) => `${a.libelle} : ${nbr(a.valeur).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`).join(' · '), operations: s.nbOperations }))
  }]
  exportRapportExcel({ filename: fichier || 'rapport-global.xlsx', sections })
  return sections
}

export function genererRapportGlobalExcel({ rapport, libelle, par = '', avecDetails = true, sansMontant = false, fichier }) {
  const { secteurs, total } = rapport
  const maintenant = new Date()
  const edite = `Édité le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${par ? ` par ${par}` : ''}`
  if (sansMontant) return rapportSansMontant({ secteurs, libelle, edite, fichier })

  const sections = [{
    name: 'Synthèse', title: 'Rapport global des secteurs : LA TERMITIÈRE', subtitle: `Période : ${libelle} · ${edite} · montants en FCFA`,
    columns: [
      { key: 'secteur', label: 'Secteur', width: 30 },
      { key: 'recettes', label: 'Recettes', type: 'money', width: 18 },
      { key: 'depenses', label: 'Dépenses', type: 'money', width: 18 },
      { key: 'benefice', label: 'Bénéfice', type: 'money', width: 18 },
      { key: 'objectif', label: 'Objectif', type: 'money', width: 18 },
      { key: 'atteint', label: 'Atteint (%)', type: 'number', width: 13, align: 'center' },
      { key: 'operations', label: 'Opérations', type: 'number', width: 12, align: 'center' }
    ],
    rows: secteurs.map((s) => ({
      secteur: s.label, recettes: nbr(s.recettes), depenses: nbr(s.depenses), benefice: nbr(s.benefice),
      objectif: s.cible > 0 ? nbr(s.cible) : '', atteint: s.pct == null ? '' : Math.round(s.pct), operations: s.nbOperations
    })),
    totals: { __label: 'TOTAL', recettes: nbr(total.recettes), depenses: nbr(total.depenses), benefice: nbr(total.benefice), objectif: total.cible > 0 ? nbr(total.cible) : '', atteint: total.pct == null ? '' : Math.round(total.pct), operations: total.nbOperations }
  }]

  if (avecDetails) {
    const noms = nomsFeuilles(secteurs.map((s) => s.label))
    secteurs.forEach((s, i) => {
      const activite = s.activite.map((a) => `${a.libelle} : ${nbr(a.valeur).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`).join(' · ')
      sections.push({
        name: noms[i], title: `${s.label} : opérations`,
        subtitle: `Période : ${libelle}${activite ? ` · ${activite}` : ''}${s.cible > 0 ? ` · Objectif ${nbr(s.cible).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA atteint à ${Math.round(s.pct)} %` : ''}`,
        columns: [
          { key: 'date', label: 'Date', width: 12 },
          { key: 'type', label: 'Type', width: 12 },
          { key: 'libelle', label: 'Libellé', width: 64 },
          { key: 'recette', label: 'Recettes', type: 'money', width: 18 },
          { key: 'depense', label: 'Dépenses', type: 'money', width: 18 }
        ],
        rows: s.operations.map((o) => ({
          date: dateCourte(o.date), type: o.sens === 'recette' ? 'Recette' : 'Dépense', libelle: o.libelle || '',
          recette: o.sens === 'recette' ? nbr(o.montant) : '', depense: o.sens === 'depense' ? nbr(o.montant) : ''
        })),
        totals: { __label: 'TOTAL', recette: nbr(s.recettes), depense: nbr(s.depenses) }
      })
    })
  }
  exportRapportExcel({ filename: fichier || 'rapport-global.xlsx', sections })
  return sections
}
