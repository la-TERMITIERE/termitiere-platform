// Création d'une dépense E-DÉPENSES — circuit d'autorisation + notifications.
// Extrait de Depenses.jsx pour être réutilisé ailleurs (ex. le bouton « Ajouter une
// dépense » du volet Dépense de chaque secteur métier, dans RecettesDepenses.jsx) sans
// dupliquer la logique d'autorisation/notification.
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { notifierBeneficiaire } from './notifications'
import { genId } from '../../utils/formatters'
import { SECTEURS } from './data'
import { budgetRestantSecteur, budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, libelleSecteurSite } from './logic'
import { FULL_ACCESS_ROLES } from '../../core/roles'

// Raison pour laquelle une dépense devient une demande d'autorisation, ou null si aucune.
// Une dépense « payée depuis la Caisse commune » (cf. financePar) consomme le budget de
// la Caisse commune, pas celui de son secteur d'origine (cf. depensesEntrepriseSecteurMois,
// qui l'exclut du secteur et l'attribue à `divers`) — c'est donc SON budget restant qu'il
// faut vérifier ici, pas celui du secteur affiché sur la dépense.
export function raisonAutorisation(d, { budgets, depenses }) {
  const montant = Number(d.montant) || 0
  if (d.imprevue) return 'dépense imprévue'
  const estCaisseCommune = d.financePar === 'caisse_commune'
  const restant = budgetRestantSecteur(budgets, depenses, estCaisseCommune ? 'divers' : d.secteurId, d.date, estCaisseCommune ? null : d.site)
  if (restant !== null && montant > restant) return `dépasse le budget restant ${estCaisseCommune ? 'de la Caisse commune' : 'du secteur'} (${restant.toLocaleString('fr-FR')} FCFA)`
  return null
}

// Notifie les rôles financiers si le secteur — ou la Caisse commune si la dépense est
// marquée `financePar: 'caisse_commune'` (cf. raisonAutorisation ci-dessus, même logique)
// — atteint 80%+ de son budget mensuel.
async function alerterSiDepassement(d, secteur, { user, budgets, depenses }) {
  const [annee, mois] = (d.date || '').split('-').map(Number)
  if (!annee || !mois) return
  const estCaisseCommune = d.financePar === 'caisse_commune'
  const secteurIdAlerte = estCaisseCommune ? 'divers' : d.secteurId
  const siteAlerte = estCaisseCommune ? null : d.site
  const alloue = budgetSecteur(budgets, secteurIdAlerte, annee, mois, siteAlerte)
  if (alloue <= 0) return
  const depenseTotal = totalDepenses(depensesEntrepriseSecteurMois([...depenses.filter((x) => x.id !== d.id), d], secteurIdAlerte, annee, mois, siteAlerte))
  const pct = Math.round((depenseTotal / alloue) * 100)
  const statut = statutBudget(pct)
  if (statut.key === 'ok') return
  const libelle = estCaisseCommune ? (SECTEURS.find((s) => s.id === 'divers')?.label || 'Caisse commune') : libelleSecteurSite(secteur, d)
  await notify({
    type: statut.key === 'depasse' ? 'danger' : 'warning',
    title: statut.key === 'depasse' ? `🔴 Budget dépassé — ${libelle}` : `🟠 Budget en alerte — ${libelle}`,
    body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
    module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
  })
}

// Crée une nouvelle dépense en appliquant le circuit d'autorisation : imprévue, ou
// montant > budget restant du secteur → demande envoyée au PAU (statut « en attente »)
// ; sinon → décaissée immédiatement. Retourne { statutInitial }.
export async function soumettreNouvelleDepense(d, { user, budgets, depenses }) {
  const secteur = SECTEURS.find((s) => s.id === d.secteurId)
  const libelle = libelleSecteurSite(secteur, d)
  const id = genId()
  const montant = Number(d.montant) || 0
  const raison = raisonAutorisation(d, { budgets, depenses })
  const statutInitial = raison ? 'en_attente' : 'decaissee'
  // `origineSaisie` : marque toute dépense créée via ce circuit partagé comme
  // « effectuée dans E-DÉPENSES » — sert uniquement au secteur MAXI BAT, dont les
  // dépenses ne doivent apparaître dans E-DÉPENSES QUE si elles y ont été saisies
  // (celles gérées depuis E-G.Pro/volet BTP, via `projet_depenses`, ne passent jamais
  // par ce circuit et n'ont donc jamais ce marqueur — cf. le filtre `depenses` de
  // chaque écran E-DÉPENSES).
  const depenseFinale = { ...d, id, montant, statut: statutInitial, origineSaisie: 'e_depenses', enregistrePar: user?.nom || '—', enregistreParUid: user?.uid || null, createdAt: Date.now() }
  await setItem('depense_depenses', id, depenseFinale)
  await audit('depense', 'DEPENSE_CREATE', `${libelle} — ${montant.toLocaleString('fr-FR')} FCFA${raison ? ` (${raison} → demande PAU)` : ''}`, { secteurId: d.secteurId, site: d.site || null, categorie: d.categorie, montant, imprevue: !!d.imprevue, raisonAutorisation: raison })
  if (statutInitial === 'en_attente') {
    // Demande d'autorisation → alerte le PAU (et le super admin) dans sa cloche + push.
    await notify({
      type: 'warning',
      title: `💰 Demande de décaissement — ${libelle}`,
      body: `${montant.toLocaleString('fr-FR')} FCFA · ${d.categorie}${d.description ? ` — ${d.description}` : ''} · ${raison}. En attente de votre autorisation.`,
      module: 'depense', forRoles: ['pau', 'super_admin'], excludeUid: user?.uid, link: '/depense/autorisations'
    })
    // Confirme aussi à la personne qui a saisi la dépense que sa demande est bien
    // partie en autorisation, sans quoi elle n'apprend son sort qu'à la décision du PAU.
    if (user?.uid) {
      await notify({
        type: 'info',
        title: '⏳ Dépense envoyée en demande d\'autorisation',
        body: `${montant.toLocaleString('fr-FR')} FCFA · ${libelle} — ${raison}. En attente de la décision du PAU.`,
        module: 'depense', forUsers: [user.uid], link: '/depense/autorisations'
      })
    }
  } else {
    await notifierBeneficiaire(depenseFinale, libelle)
    // Toute dépense effectivement décaissée (pas une simple demande en attente) doit
    // remonter à l'administration, quel que soit son montant.
    await notify({
      type: 'info',
      title: `💸 Dépense effectuée — ${libelle}`,
      body: `${montant.toLocaleString('fr-FR')} FCFA · ${d.categorie}${d.description ? ` — ${d.description}` : ''} · par ${user?.nom || user?.login || '—'}.`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
      link: '/depense/liste', state: { openDepenseId: id }
    }).catch(() => {})
  }
  await alerterSiDepassement(depenseFinale, secteur, { user, budgets, depenses })
  return { statutInitial }
}
