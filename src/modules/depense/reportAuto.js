// Report automatique de la CAISSE COURANTE : à partir de novembre 2026, le reste du mois précédent (budget alloué moins
// dépenses de la caisse courante) devient tout seul le premier apport du nouveau mois dans E-DÉPENSES. La Caisse de la
// Comptabilité le reprend comme solde initial. Les agents n'ont plus à le saisir (cf. ressembleAUnReport).
import { useEffect, useMemo, useRef } from 'react'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr } from '../../utils/formatters'
import { budgetDocSecteur, budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses } from './logic'

export const REPORT_AUTO_DEPUIS = '2026-11'
export const MOTIF_REPORT_AUTO = 'Report automatique du mois précédent'
export const ID_REPORT_AUTO = 'report_auto'

// Motif d'un report saisi à la main (« reste du solde du mois de septembre », « solde restant du mois précédent »…).
const REPORT_MANUEL = /(report|reste du solde|solde restant|solde du mois|solde de la caisse)/i
export const ressembleAUnReport = (motif) => REPORT_MANUEL.test(motif || '')

// Vrai si une saisie manuelle de report doit être refusée pour ce mois (YYYY-MM).
export const reportManuelInterdit = (moisCle, motif) => moisCle >= REPORT_AUTO_DEPUIS && ressembleAUnReport(motif) && motif !== MOTIF_REPORT_AUTO

const cle = (a, m) => `${a}-${String(m).padStart(2, '0')}`

// Reports à créer ou à corriger, du premier mois automatique jusqu'au mois en cours : [{ annee, mois, montant, ancienReport, existe }].
// Le report d'un mois est TOUJOURS le reste réel du mois précédent (budget alloué moins dépenses de la caisse courante). Si une dépense
// du mois précédent change après coup (nouvelle saisie, origine des fonds corrigée, suppression), le report déjà écrit est donc recalculé
// au lieu de rester figé sur l'ancien reste. Un report saisi à la main n'est jamais touché. Un reste nul ou négatif ne se reporte pas.
export function reportsManquants(budgets, depenses, aujourdhui = todayStr()) {
  const [fa, fm] = aujourdhui.slice(0, 7).split('-').map(Number)
  const [da, dm] = REPORT_AUTO_DEPUIS.split('-').map(Number)
  const ajustements = {} // variation du budget de chaque mois due aux reports recalculés (le report de décembre dépend de celui de novembre…)
  const out = []
  for (let a = da, m = dm; a < fa || (a === fa && m <= fm); m === 12 ? (a++, m = 1) : m++) {
    const prec = m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 }
    const doc = budgetDocSecteur(budgets, 'divers', a, m)
    const revisions = doc?.revisions || []
    const auto = revisions.find((r) => r.id === ID_REPORT_AUTO)
    if (!auto && revisions.some((r) => ressembleAUnReport(r.motif))) continue // report saisi à la main : laissé tel quel
    const resteReel = budgetSecteur(budgets, 'divers', prec.a, prec.m) + (ajustements[cle(prec.a, prec.m)] || 0)
      - totalDepenses(depensesEntrepriseSecteurMois(depenses, 'divers', prec.a, prec.m))
    const attendu = Math.max(0, Math.round(resteReel))
    const actuel = auto ? (Number(auto.nouveau) || 0) - (Number(auto.ancien) || 0) : 0
    if (attendu === actuel) continue
    out.push({ annee: a, mois: m, montant: attendu, ancienReport: actuel, existe: !!auto })
    ajustements[cle(a, m)] = attendu - actuel
  }
  return out
}

// Écrit les reports à créer ou à corriger (premier apport du mois, daté du 1er) dans le budget de la caisse courante.
export async function creerReportsAuto(budgets, depenses) {
  const aFaire = reportsManquants(budgets, depenses)
  for (const r of aFaire) {
    const doc = budgetDocSecteur(budgets, 'divers', r.annee, r.mois)
    const id = doc?.id || `divers_${cle(r.annee, r.mois)}`
    const ancienMontant = Number(doc?.montant) || 0
    let revisions
    let nouveau
    if (r.existe) {
      // Report déjà écrit : on le remplace par le reste réel, le reste du budget du mois (dotations ajoutées depuis) ne bouge pas.
      nouveau = ancienMontant - r.ancienReport + r.montant
      revisions = (doc.revisions || []).map((x) => (x.id === ID_REPORT_AUTO ? { ...x, nouveau: (Number(x.ancien) || 0) + r.montant, corrigeLe: Date.now() } : x))
    } else {
      nouveau = ancienMontant + r.montant
      const entree = { id: ID_REPORT_AUTO, ancien: ancienMontant, nouveau, motif: MOTIF_REPORT_AUTO, date: new Date(r.annee, r.mois - 1, 1, 0, 0, 1).getTime(), auteur: 'Système' }
      revisions = [...(doc?.revisions || []), entree]
    }
    await setItem('depense_budgets', id, { ...(doc || {}), id, secteurId: 'divers', site: null, annee: r.annee, mois: r.mois, montant: nouveau, revisions, updatedAt: Date.now() })
    await audit('depense', 'REPORT_AUTO', `Caisse courante : report ${r.existe ? `corrigé de ${r.ancienReport.toLocaleString('fr-FR')} à` : 'automatique de'} ${r.montant.toLocaleString('fr-FR')} FCFA (${cle(r.annee, r.mois)})`, { annee: r.annee, mois: r.mois, montant: r.montant, ancienReport: r.ancienReport })
  }
  return aFaire.length
}

// À appeler dans E-DÉPENSES et dans la Caisse : crée les reports manquants dès que les données sont chargées, par un
// utilisateur autorisé en écriture (la création est idempotente : un mois déjà reporté n'est jamais refait).
export function useReportAutomatique(actif = true) {
  const role = useAuth((s) => s.role)
  const { data: budgets, loading: chargeB } = useCollection('depense_budgets')
  const { data: toutes, loading: chargeD } = useCollection('depense_depenses')
  const depenses = useMemo(() => toutes.filter((d) => !d.projetId), [toutes])
  const enCours = useRef(false)
  const peutEcrire = actif && isFullAccessRole(role) && !isReadOnlyRole(role)
  useEffect(() => {
    if (!peutEcrire || chargeB || chargeD || enCours.current) return
    if (!reportsManquants(budgets, depenses).length) return
    enCours.current = true
    creerReportsAuto(budgets, depenses)
      .catch((e) => console.warn('Report automatique impossible', e))
      .finally(() => { enCours.current = false })
  }, [peutEcrire, chargeB, chargeD, budgets, depenses])
}
