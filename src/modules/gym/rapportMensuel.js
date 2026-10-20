// MAXI-GYM : rapport mensuel (Excel) pour la direction : encaissements, répartition par catégorie et par mode de paiement,
// nouveaux abonnés, abonnés perdus (abonnement terminé dans le mois, non renouvelé) et objectif du mois.
// Les chiffres d'argent viennent des FACTURES (comme le Dashboard et la Facturation) : les remboursements (factures
// négatives) sont donc déjà déduits.
import { exportRapportExcel } from '../../utils/excelReport'
import { MOIS_LABELS } from '../depense/data'
import { categorieLabel, modePaiementLabel, MODES_PAIEMENT_GYM } from './data'

const cle = (x) => x.clientId || (x.clientNom || '').trim().toLowerCase()
const somme = (l, f = (x) => Number(x.montant) || 0) => l.reduce((t, x) => t + f(x), 0)

// Chiffres du mois, aussi utilisables à l'écran.
export function chiffresMois({ mois, factures, abonnements, objectif }) {
  const f = factures.filter((x) => (x.date || '').startsWith(mois))
  const encaisse = somme(f)
  const remboursements = -somme(f.filter((x) => x.avoir))
  const seances = somme(f.filter((x) => x.sourceType === 'seance' && !x.avoir))
  const abos = somme(f.filter((x) => x.sourceType === 'abonnement' && !x.avoir))
  const parMode = MODES_PAIEMENT_GYM.map((m) => ({ ...m, montant: somme(f.filter((x) => (x.modePaiement || 'especes') === m.id)) }))
  const parCategorie = new Map()
  f.forEach((x) => { const k = categorieLabel(x.categorie) || 'Autre'; parCategorie.set(k, (parCategorie.get(k) || 0) + (Number(x.montant) || 0)) })
  // Nouveaux abonnés : clients dont le tout premier abonnement date de ce mois.
  const premier = new Map()
  abonnements.filter((a) => !a.annule).forEach((a) => { const k = cle(a); if (!premier.has(k) || a.date < premier.get(k).date) premier.set(k, a) })
  const nouveaux = [...premier.values()].filter((a) => (a.date || '').startsWith(mois))
  // Abonnés perdus : le dernier abonnement du client se termine dans le mois et rien ne le prolonge.
  const dernier = new Map()
  abonnements.filter((a) => !a.annule).forEach((a) => { const k = cle(a); if (!dernier.has(k) || (a.dateFin || '') > (dernier.get(k).dateFin || '')) dernier.set(k, a) })
  const perdus = [...dernier.values()].filter((a) => (a.dateFin || '').startsWith(mois))
  return { encaisse, remboursements, seances, abos, parMode, parCategorie: [...parCategorie.entries()].sort((a, b) => b[1] - a[1]), nouveaux, perdus, objectif: objectif || null, pctObjectif: objectif > 0 ? Math.round((encaisse / objectif) * 100) : null }
}

export function exporterRapportMensuel({ mois, site, factures, abonnements, objectif }) {
  const c = chiffresMois({ mois, factures, abonnements, objectif })
  const [an, m] = mois.split('-').map(Number)
  const periode = `${MOIS_LABELS[m - 1]} ${an}`
  const salle = site === 'kara' ? 'Kara' : 'Lomé'
  exportRapportExcel({
    filename: `rapport-maxi-gym-${site}-${mois}.xlsx`,
    sections: [
      {
        id: 'synthese', name: 'Synthèse', title: `MAXI-GYM ${salle} : rapport de ${periode}`, subtitle: 'Chiffres tirés des factures (remboursements déduits)',
        columns: [{ key: 'indicateur', label: 'Indicateur', width: 36 }, { key: 'valeur', label: 'Valeur (FCFA ou nombre)', width: 24, type: 'number' }],
        rows: [
          { indicateur: 'Total encaissé', valeur: c.encaisse },
          { indicateur: 'dont séances', valeur: c.seances },
          { indicateur: 'dont abonnements', valeur: c.abos },
          { indicateur: 'Remboursements', valeur: c.remboursements },
          ...(c.objectif ? [{ indicateur: 'Objectif du mois', valeur: c.objectif }, { indicateur: 'Objectif atteint (%)', valeur: c.pctObjectif }] : []),
          { indicateur: 'Nouveaux abonnés', valeur: c.nouveaux.length },
          { indicateur: 'Abonnés perdus (abonnement terminé, non renouvelé)', valeur: c.perdus.length }
        ]
      },
      {
        id: 'categories', name: 'Par catégorie', title: 'Encaissements par catégorie', subtitle: periode,
        columns: [{ key: 'categorie', label: 'Catégorie', width: 28 }, { key: 'montant', label: 'Montant (FCFA)', width: 18, type: 'money' }],
        rows: c.parCategorie.map(([categorie, montant]) => ({ categorie, montant })), totals: { __label: 'TOTAL', montant: c.encaisse }
      },
      {
        id: 'modes', name: 'Par mode de paiement', title: 'Encaissements par mode de paiement', subtitle: periode,
        columns: [{ key: 'mode', label: 'Mode de paiement', width: 28 }, { key: 'montant', label: 'Montant (FCFA)', width: 18, type: 'money' }],
        rows: c.parMode.map((x) => ({ mode: modePaiementLabel(x.id), montant: x.montant })), totals: { __label: 'TOTAL', montant: c.encaisse }
      },
      {
        id: 'nouveaux', name: 'Nouveaux abonnés', title: 'Nouveaux abonnés', subtitle: periode,
        columns: [{ key: 'client', label: 'Client', width: 28 }, { key: 'categorie', label: 'Catégorie', width: 18 }, { key: 'date', label: 'Souscrit le', width: 14 }, { key: 'montant', label: 'Montant (FCFA)', width: 16, type: 'money' }],
        rows: c.nouveaux.map((a) => ({ client: a.clientNom, categorie: categorieLabel(a.categorie), date: a.date, montant: Number(a.montant) || 0 }))
      },
      {
        id: 'perdus', name: 'Abonnés perdus', title: 'Abonnés dont l\'abonnement s\'est terminé sans renouvellement', subtitle: periode,
        columns: [{ key: 'client', label: 'Client', width: 28 }, { key: 'categorie', label: 'Catégorie', width: 18 }, { key: 'fin', label: 'Terminé le', width: 14 }],
        rows: c.perdus.map((a) => ({ client: a.clientNom, categorie: categorieLabel(a.categorie), fin: a.dateFin }))
      }
    ]
  })
}
