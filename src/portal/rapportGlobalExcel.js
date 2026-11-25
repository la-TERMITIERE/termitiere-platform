// Rapport global de tous les secteurs en Excel : une feuille « Synthèse » (une ligne par secteur, totaux), puis une feuille par secteur avec ses
// opérations (recettes et dépenses datées). Mise en forme de la charte LA TERMITIÈRE (cf. utils/excelReport.js).
import { exportRapportExcel } from '../utils/excelReport'

const nbr = (n) => Math.round(Number(n) || 0)
const fmt = (n) => nbr(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')
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
function rapportSansMontant({ secteurs, libelle, edite, fichier, avecDetails = false }) {
  const colonnes = [{ key: 'secteur', label: 'Secteur', width: 30 }, { key: 'activite', label: 'Activité sur la période', width: 90 }, { key: 'operations', label: 'Opérations', type: 'number', width: 12, align: 'center' }]
  const sections = [{
    name: 'Activité', title: 'Rapport global des secteurs : LA TERMITIÈRE', subtitle: `Période : ${libelle} · ${edite}`,
    columns: colonnes,
    rows: secteurs.map((s) => ({ secteur: s.label, activite: s.activite.map((a) => `${a.libelle} : ${nbr(a.valeur).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`).join(' · '), operations: s.nbOperations }))
  }]
  // Détail demandé : une feuille par secteur avec la date, la nature et le libellé de chaque opération, jamais le montant.
  if (avecDetails) {
    const noms = nomsFeuilles(secteurs.map((s) => s.label))
    secteurs.forEach((s, i) => {
      sections.push({
        name: noms[i], title: `${s.label} : opérations`, subtitle: `Période : ${libelle} · ${edite}`,
        columns: [
          { key: 'date', label: 'Date', width: 12 },
          { key: 'nature', label: 'Nature', width: 12 },
          { key: 'libelle', label: 'Libellé', width: 80 }
        ],
        rows: s.operations.map((o) => ({ date: dateCourte(o.date), nature: o.sens === 'recette' ? 'Recette' : 'Dépense', libelle: o.libelle || '' }))
      })
    })
  }
  exportRapportExcel({ filename: fichier || 'rapport-global.xlsx', sections })
  return sections
}

export function genererRapportGlobalExcel({ rapport, libelle, par = '', avecDetails = true, sansMontant = false, fichier }) {
  const { secteurs, total } = rapport
  const maintenant = new Date()
  const edite = `Édité le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${par ? ` par ${par}` : ''}`
  if (sansMontant) return rapportSansMontant({ secteurs, libelle, edite, fichier, avecDetails })

  const sections = [{
    name: 'Synthèse', title: 'Rapport global des secteurs : LA TERMITIÈRE', subtitle: `Période : ${libelle} · ${edite} · montants en FCFA`,
    columns: [
      { key: 'secteur', label: 'Secteur', width: 30 },
      { key: 'recettes', label: 'Recettes', type: 'money', width: 18 },
      { key: 'depenses', label: 'Dépenses', type: 'money', width: 18 },
      { key: 'benefice', label: 'Bénéfice', type: 'money', width: 18 },
      { key: 'objectif', label: 'Objectif', type: 'money', width: 18 },
      { key: 'atteint', label: 'Atteint (%)', type: 'number', width: 13, align: 'center' },
      { key: 'operations', label: 'Opérations', type: 'number', width: 12, align: 'center' },
      { key: 'cumulRecettes', label: 'Cumul recettes (mois)', type: 'money', width: 20 },
      { key: 'cumulDepenses', label: 'Cumul dépenses (mois)', type: 'money', width: 20 },
      { key: 'cumulBenefice', label: 'Cumul bénéfice (mois)', type: 'money', width: 20 }
    ],
    rows: secteurs.map((s) => ({
      secteur: s.label, recettes: nbr(s.recettes), depenses: nbr(s.depenses), benefice: nbr(s.benefice),
      cumulRecettes: nbr(s.cumulRecettes), cumulDepenses: nbr(s.cumulDepenses), cumulBenefice: nbr(s.cumulBenefice),
      objectif: s.cible > 0 ? nbr(s.cible) : '', atteint: s.pct == null ? '' : Math.round(s.pct), operations: s.nbOperations
    })),
    totals: { __label: 'TOTAL', recettes: nbr(total.recettes), depenses: nbr(total.depenses), benefice: nbr(total.benefice), objectif: total.cible > 0 ? nbr(total.cible) : '', atteint: total.pct == null ? '' : Math.round(total.pct), operations: total.nbOperations, cumulRecettes: nbr(total.cumulRecettes), cumulDepenses: nbr(total.cumulDepenses), cumulBenefice: nbr(total.cumulBenefice) }
  }]

  if (avecDetails) {
    const noms = nomsFeuilles(secteurs.map((s) => s.label))
    secteurs.forEach((s, i) => {
      const activite = s.activite.map((a) => `${a.libelle} : ${nbr(a.valeur).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`).join(' · ')
      sections.push({
        name: noms[i], title: `${s.label} : opérations`,
        subtitle: `Période : ${libelle}${activite ? ` · ${activite}` : ''}${s.cible > 0 ? ` · Objectif ${nbr(s.cible).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA atteint à ${Math.round(s.pct)} %` : ''} · Cumul ${rapport.libelleCumul} : recettes ${fmt(s.cumulRecettes)}, dépenses ${fmt(s.cumulDepenses)}, bénéfice ${fmt(s.cumulBenefice)} FCFA`,
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
  // Dernière feuille : la situation générale de TOUS les secteurs (période et cumul total).
  const sit = rapport.situation
  if (sit) sections.push({
    name: 'Situation générale', title: 'Situation générale de tous les secteurs : LA TERMITIÈRE', subtitle: `Période : ${libelle} · cumul ${rapport.libelleCumul} (du 1er du mois à la date d'extraction) · ${edite} · montants en FCFA`,
    columns: [
      { key: 'secteur', label: 'Secteur', width: 30 },
      { key: 'recettes', label: 'Recettes (période)', type: 'money', width: 20 },
      { key: 'depenses', label: 'Dépenses (période)', type: 'money', width: 20 },
      { key: 'benefice', label: 'Bénéfice (période)', type: 'money', width: 20 },
      { key: 'cumulRecettes', label: 'Cumul recettes (mois)', type: 'money', width: 22 },
      { key: 'cumulDepenses', label: 'Cumul dépenses (mois)', type: 'money', width: 22 },
      { key: 'cumulBenefice', label: 'Cumul bénéfice (mois)', type: 'money', width: 22 }
    ],
    rows: sit.secteurs.map((l) => ({ secteur: l.label, recettes: nbr(l.recettes), depenses: nbr(l.depenses), benefice: nbr(l.benefice), cumulRecettes: nbr(l.cumulRecettes), cumulDepenses: nbr(l.cumulDepenses), cumulBenefice: nbr(l.cumulBenefice) })),
    totals: { __label: 'TOTAL GÉNÉRAL', recettes: nbr(sit.total.recettes), depenses: nbr(sit.total.depenses), benefice: nbr(sit.total.benefice), cumulRecettes: nbr(sit.total.cumulRecettes), cumulDepenses: nbr(sit.total.cumulDepenses), cumulBenefice: nbr(sit.total.cumulBenefice) }
  })
  exportRapportExcel({ filename: fichier || 'rapport-global.xlsx', sections })
  return sections
}
