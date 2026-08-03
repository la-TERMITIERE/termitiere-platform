// Création d'une dépense E-DÉPENSES — circuit d'autorisation + notifications.
// Extrait de Depenses.jsx pour être réutilisé ailleurs (ex. le bouton « Ajouter une
// dépense » du volet Dépense de chaque secteur métier, dans RecettesDepenses.jsx) sans
// dupliquer la logique d'autorisation/notification.
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { notifierBeneficiaire } from './notifications'
import { genId } from '../../utils/formatters'
import { SECTEURS, SEUIL_APPROBATION_PAU, sourceFinancementDefaut } from './data'
import { budgetRestantSecteur, budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget } from './logic'
import { FULL_ACCESS_ROLES } from '../../core/roles'

// Raison pour laquelle une dépense devient une demande d'autorisation, ou null si aucune.
export function raisonAutorisation(d, { budgets, depenses }) {
  const montant = Number(d.montant) || 0
  if (d.imprevue) return 'dépense imprévue'
  if (montant > SEUIL_APPROBATION_PAU) return `dépasse ${SEUIL_APPROBATION_PAU.toLocaleString('fr-FR')} FCFA`
  const restant = budgetRestantSecteur(budgets, depenses, d.secteurId, d.date)
  if (restant !== null && montant > restant) return `dépasse le budget restant du secteur (${restant.toLocaleString('fr-FR')} FCFA)`
  return null
}

// Notifie les rôles financiers si le secteur atteint 80%+ de son budget mensuel.
async function alerterSiDepassement(d, secteur, { user, budgets, depenses }) {
  const [annee, mois] = (d.date || '').split('-').map(Number)
  if (!annee || !mois) return
  const alloue = budgetSecteur(budgets, d.secteurId, annee, mois)
  if (alloue <= 0) return
  const depenseTotal = totalDepenses(depensesSecteurMois([...depenses.filter((x) => x.id !== d.id), d], d.secteurId, annee, mois))
  const pct = Math.round((depenseTotal / alloue) * 100)
  const statut = statutBudget(pct)
  if (statut.key === 'ok') return
  await notify({
    type: statut.key === 'depasse' ? 'danger' : 'warning',
    title: statut.key === 'depasse' ? `🔴 Budget dépassé — ${secteur?.label || d.secteurId}` : `🟠 Budget en alerte — ${secteur?.label || d.secteurId}`,
    body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
    module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
  })
}

// Crée une nouvelle dépense en appliquant le circuit d'autorisation : imprévue, ou
// montant > seuil, ou montant > budget restant du secteur → demande envoyée au PAU
// (statut « en attente ») ; sinon → décaissée immédiatement. Retourne { statutInitial }.
export async function soumettreNouvelleDepense(d, { user, budgets, depenses }) {
  const secteur = SECTEURS.find((s) => s.id === d.secteurId)
  const id = genId()
  const montant = Number(d.montant) || 0
  const raison = raisonAutorisation(d, { budgets, depenses })
  const statutInitial = raison ? 'en_attente' : 'decaissee'
  const depenseFinale = { ...d, id, montant, statut: statutInitial, enregistrePar: user?.nom || '—', enregistreParUid: user?.uid || null, createdAt: Date.now() }
  await setItem('depense_depenses', id, depenseFinale)
  await audit('depense', 'DEPENSE_CREATE', `${secteur?.label || d.secteurId} — ${montant.toLocaleString('fr-FR')} FCFA${raison ? ` (${raison} → demande PAU)` : ''}${(d.sourceFinancement || sourceFinancementDefaut) === 'pau' ? ' (apport PAU)' : ''}`, { secteurId: d.secteurId, categorie: d.categorie, montant, imprevue: !!d.imprevue, raisonAutorisation: raison, sourceFinancement: d.sourceFinancement || sourceFinancementDefaut })
  if (statutInitial === 'en_attente') {
    // Demande d'autorisation → alerte le PAU (et le super admin) dans sa cloche + push.
    await notify({
      type: 'warning',
      title: `💰 Demande de décaissement — ${secteur?.label || d.secteurId}`,
      body: `${montant.toLocaleString('fr-FR')} FCFA · ${d.categorie}${d.description ? ` — ${d.description}` : ''} · ${raison}. En attente de votre autorisation.`,
      module: 'depense', forRoles: ['pau', 'super_admin'], excludeUid: user?.uid, link: '/depense/autorisations'
    })
    // Confirme aussi à la personne qui a saisi la dépense que sa demande est bien
    // partie en autorisation, sans quoi elle n'apprend son sort qu'à la décision du PAU.
    if (user?.uid) {
      await notify({
        type: 'info',
        title: '⏳ Dépense envoyée en demande d\'autorisation',
        body: `${montant.toLocaleString('fr-FR')} FCFA · ${secteur?.label || d.secteurId} — ${raison}. En attente de la décision du PAU.`,
        module: 'depense', forUsers: [user.uid], link: '/depense/autorisations'
      })
    }
  } else {
    await notifierBeneficiaire(depenseFinale, secteur?.label || d.secteurId)
    // Toute dépense effectivement décaissée (pas une simple demande en attente) doit
    // remonter à l'administration, quel que soit son montant.
    await notify({
      type: 'info',
      title: `💸 Dépense effectuée — ${secteur?.label || d.secteurId}`,
      body: `${montant.toLocaleString('fr-FR')} FCFA · ${d.categorie}${d.description ? ` — ${d.description}` : ''} · par ${user?.nom || user?.login || '—'}.`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
      link: '/depense/liste', state: { openDepenseId: id }
    }).catch(() => {})
  }
  // Apport personnel du PAU : information réservée à l'administration (compte
  // comme un revenu du secteur et reste une dette à lui restituer, cf. Dashboard).
  if ((d.sourceFinancement || sourceFinancementDefaut) === 'pau') {
    await notify({
      type: 'info',
      title: `💜 Apport du PAU — ${secteur?.label || d.secteurId}`,
      body: `${montant.toLocaleString('fr-FR')} FCFA financés personnellement par le PAU${d.description ? ` — ${d.description}` : ''}.`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
      link: '/depense/liste', state: { openDepenseId: id }
    }).catch(() => {})
  }
  await alerterSiDepassement(depenseFinale, secteur, { user, budgets, depenses })
  return { statutInitial }
}
