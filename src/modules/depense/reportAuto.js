// Report automatique de la CAISSE COMMUNE : à partir de novembre 2026, le reste du mois précédent (budget alloué moins
// dépenses de la caisse commune) devient tout seul le premier apport du nouveau mois dans E-DÉPENSES. La Caisse de la
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

// Reports à créer, du premier mois automatique jusqu'au mois en cours : [{ annee, mois, montant }].
// Un mois qui a déjà son report (automatique ou saisi) est laissé tel quel. Un reste nul ou négatif ne se reporte pas.
export function reportsManquants(budgets, depenses, aujourdhui = todayStr()) {
  const [fa, fm] = aujourdhui.slice(0, 7).split('-').map(Number)
  const [da, dm] = REPORT_AUTO_DEPUIS.split('-').map(Number)
  const ajouts = {}
  const out = []
  for (let a = da, m = dm; a < fa || (a === fa && m <= fm); m === 12 ? (a++, m = 1) : m++) {
    const prec = m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 }
    const doc = budgetDocSecteur(budgets, 'divers', a, m)
    if ((doc?.revisions || []).some((r) => r.id === ID_REPORT_AUTO || ressembleAUnReport(r.motif))) continue
    const reste = budgetSecteur(budgets, 'divers', prec.a, prec.m) + (ajouts[cle(prec.a, prec.m)] || 0)
      - totalDepenses(depensesEntrepriseSecteurMois(depenses, 'divers', prec.a, prec.m))
    if (reste > 0) { out.push({ annee: a, mois: m, montant: reste }); ajouts[cle(a, m)] = reste }
  }
  return out
}

// Écrit les reports manquants (premier apport du mois, daté du 1er) dans le budget de la caisse commune.
export async function creerReportsAuto(budgets, depenses) {
  const aFaire = reportsManquants(budgets, depenses)
  for (const r of aFaire) {
    const doc = budgetDocSecteur(budgets, 'divers', r.annee, r.mois)
    const ancien = Number(doc?.montant) || 0
    const nouveau = ancien + r.montant
    const id = doc?.id || `divers_${cle(r.annee, r.mois)}`
    const entree = { id: ID_REPORT_AUTO, ancien, nouveau, motif: MOTIF_REPORT_AUTO, date: new Date(r.annee, r.mois - 1, 1, 0, 0, 1).getTime(), auteur: 'Système' }
    await setItem('depense_budgets', id, { ...(doc || {}), id, secteurId: 'divers', site: null, annee: r.annee, mois: r.mois, montant: nouveau, revisions: [...(doc?.revisions || []), entree], updatedAt: Date.now() })
    await audit('depense', 'REPORT_AUTO', `Caisse commune : report automatique de ${r.montant.toLocaleString('fr-FR')} FCFA (${cle(r.annee, r.mois)})`, { annee: r.annee, mois: r.mois, montant: r.montant })
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
