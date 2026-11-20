// RH : alertes d'échéances. Un seul calcul (calculerEcheances), trois usages :
//  - useEcheancesRh : les lignes « À traiter » de la page d'accueil (une ligne par catégorie, pour rester compact) ;
//  - RelanceEcheancesRh (monté dans AppShell) : une notification (cloche + push) à l'administration RH, une seule fois par échéance et par seuil,
//    même si plusieurs sessions sont ouvertes (claimOnce) ;
//  - le registre de la page Conformité continue de lister le détail.
// Catégories : contrats expirés, contrats qui arrivent à échéance (30 jours), fins de période d'essai, évaluations annuelles dues,
// formations planifiées dont la date est passée.
import { useEffect, useMemo, useRef } from 'react'
import { FileWarning, CalendarClock, UserCheck, ClipboardCheck, GraduationCap, Cake, PartyPopper, Package } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { claimOnce } from '../../core/db'
import { notify } from '../../core/notify'
import { todayStr, formatDateShort } from '../../utils/formatters'
import { COL, TYPES_CONTRAT } from './store/rhStore'
import { evenementsEmployes } from './datesEquipe'

// Ceux qui lisent la base RH et décident : l'administration (le même motif que les règles de la base, sans le superviseur).
export const ROLES_ECHEANCES_RH = ['super_admin', 'pau', 'ge', 'df', 'directeur', 'admin', 'info']

const JOUR = 864e5
const ecartJours = (iso, today) => Math.round((new Date(`${iso}T00:00:00`) - new Date(`${today}T00:00:00`)) / JOUR)
const dansJours = (n) => (n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} j`)

// Les catégories : id, couleur, icône, libellé au pluriel/singulier, page d'ouverture.
export const CATEGORIES_ECHEANCE = {
  expire:     { couleur: '#dc2626', icone: FileWarning,   lien: '/rh/contrats',    un: 'contrat expiré',                 plusieurs: 'contrats expirés' },
  echeance:   { couleur: '#ea580c', icone: CalendarClock, lien: '/rh/contrats',    un: 'contrat à échéance sous 30 jours', plusieurs: 'contrats à échéance sous 30 jours' },
  essai:      { couleur: '#f59e0b', icone: UserCheck,     lien: '/rh/contrats',    un: "fin de période d'essai à décider", plusieurs: "fins de période d'essai à décider" },
  evaluation: { couleur: '#0284c7', icone: ClipboardCheck, lien: '/rh/evaluations', un: 'évaluation annuelle due',        plusieurs: 'évaluations annuelles dues' },
  formation:  { couleur: '#16a34a', icone: GraduationCap, lien: '/rh/formations',  un: 'formation en retard',            plusieurs: 'formations en retard' },
  anniversaire: { couleur: '#db2777', icone: Cake,        lien: '/rh/anniversaires', un: "anniversaire à souhaiter aujourd'hui", plusieurs: "anniversaires à souhaiter aujourd'hui" },
  dotation:   { couleur: '#0d9488', icone: Package,      lien: '/rh/dotations',      un: 'employé parti avec du matériel non rendu', plusieurs: 'employés partis avec du matériel non rendu' },
  anciennete: { couleur: '#7c3aed', icone: PartyPopper,   lien: '/rh/anniversaires', un: "anniversaire d'embauche aujourd'hui",  plusieurs: "anniversaires d'embauche aujourd'hui" }
}

// Retourne [{ cle, categorie, seuil, qui, detail, jours }] : une entrée par contrat, employé ou formation concernés.
export function calculerEcheances({ employes, contrats, evaluations, formations, dotations = [], today = todayStr() }) {
  const sortis = new Set(employes.filter((e) => e.statut === 'sorti').map((e) => e.id))
  const nomDe = (id) => employes.find((e) => e.id === id)?.nom
  const sorties = []

  // Un contrat est « remplacé » quand le même employé en a un autre, en cours, qui va plus loin (renouvellement) ou sans date de fin (CDI).
  const enCours = (c) => !c.resiliee && !sortis.has(c.employeId)
  const remplace = (c) => contrats.some((o) => o.id !== c.id && o.employeId === c.employeId && !o.resiliee && (!o.dateFin || o.dateFin > c.dateFin))
  contrats.filter((c) => enCours(c) && c.dateFin && !remplace(c)).forEach((c) => {
    const j = ecartJours(c.dateFin, today)
    const qui = c.employeNom || nomDe(c.employeId) || 'Employé'
    const type = TYPES_CONTRAT[c.type]?.label || c.type
    if (j < 0) { sorties.push({ cle: `contrat_${c.id}`, categorie: 'expire', seuil: 'exp', qui, detail: `${type} : fin le ${formatDateShort(c.dateFin)}`, jours: j }); return }
    if (j > 30) return
    const seuil = j <= 0 ? 0 : j <= 7 ? 7 : 30
    sorties.push({ cle: `contrat_${c.id}`, categorie: c.type === 'essai' ? 'essai' : 'echeance', seuil, qui, detail: `${c.type === 'essai' ? "Fin d'essai" : `${type} : fin`} le ${formatDateShort(c.dateFin)} (${dansJours(j)})`, jours: j })
  })

  // Évaluation annuelle due : employé en poste depuis plus d'un an, sans évaluation réalisée sur les 12 derniers mois.
  const il_y_a_un_an = new Date(new Date(`${today}T00:00:00`).getTime() - 365 * JOUR).toISOString().slice(0, 10)
  employes.filter((e) => (e.statut || 'actif') !== 'sorti' && e.dateEmbauche && e.dateEmbauche <= il_y_a_un_an).forEach((e) => {
    const recente = evaluations.some((v) => v.employeId === e.id && v.statut !== 'planifiee' && typeof v.createdAt === 'number' && v.createdAt >= new Date(`${il_y_a_un_an}T00:00:00`).getTime())
    if (!recente) sorties.push({ cle: `eval_${e.id}`, categorie: 'evaluation', seuil: 'mois', qui: e.nom || 'Employé', detail: 'Aucune évaluation sur les 12 derniers mois', jours: 0 })
  })

  // Formations planifiées dont la date est passée.
  formations.filter((f) => f.statut === 'planifiee' && f.dateDebut && f.dateDebut < today).forEach((f) => {
    sorties.push({ cle: `formation_${f.id}`, categorie: 'formation', seuil: 'mois', qui: f.titre || 'Formation', detail: `Prévue le ${formatDateShort(f.dateDebut)}`, jours: ecartJours(f.dateDebut, today) })
  })

  // Matériel non restitué : un employé sorti qui a encore des articles « en possession ».
  employes.filter((e) => e.statut === 'sorti').forEach((e) => {
    const restants = dotations.filter((d) => d.employeId === e.id && (d.statut === 'en_possession' || !d.statut))
    if (!restants.length) return
    const articles = restants.map((d) => `${d.article}${Number(d.quantite) > 1 ? ` x${d.quantite}` : ''}`).join(', ')
    sorties.push({ cle: `dotation_${e.id}`, categorie: 'dotation', seuil: 'depart', qui: e.nom || 'Employé', jours: 0, detail: `${restants.length} article(s) non restitué(s) : ${articles}` })
  })

  // Anniversaires du jour : naissance et embauche (à partir de 1 an). La RH est alertée le jour même ; le lendemain l'alerte disparaît.
  evenementsEmployes(employes, today, 0).forEach((ev) => {
    const naissance = ev.type === 'naissance'
    sorties.push({ cle: ev.cle, categorie: naissance ? 'anniversaire' : 'anciennete', seuil: today.slice(0, 4), qui: ev.employe.nom || 'Employé', userId: ev.employe.userId || null, jours: 0,
      detail: naissance ? `Fête ses ${ev.nombre} ans aujourd'hui` : `${ev.nombre} an${ev.nombre > 1 ? 's' : ''} dans l'entreprise aujourd'hui` })
  })
  return sorties
}

// Lit les collections RH (seulement pour l'administration RH) et calcule les échéances.
export function useDonneesEcheances(actif) {
  const { data: employes } = useCollection(actif ? COL.employes : null)
  const { data: contrats } = useCollection(actif ? COL.contrats : null)
  const { data: evaluations } = useCollection(actif ? COL.evaluations : null)
  const { data: formations } = useCollection(actif ? COL.formations : null)
  const { data: dotations } = useCollection(actif ? COL.dotations : null)
  const jour = todayStr()
  return useMemo(() => (actif ? calculerEcheances({ employes, contrats, evaluations, formations, dotations, today: jour }) : []), [actif, employes, contrats, evaluations, formations, dotations, jour])
}

// Lignes de la page d'accueil : une par catégorie non vide, la plus grave d'abord.
export function useEcheancesRh() {
  const role = useAuth((s) => s.role)
  const hasModule = useAuth((s) => s.hasModule)
  const peutVoir = ROLES_ECHEANCES_RH.includes(role) && hasModule('rh')
  const echeances = useDonneesEcheances(peutVoir)
  return useMemo(() => {
    const ordre = ['anniversaire', 'anciennete', 'dotation', 'expire', 'echeance', 'essai', 'evaluation', 'formation']
    return ordre.map((id) => {
      const liste = echeances.filter((e) => e.categorie === id).sort((a, b) => a.jours - b.jours)
      if (!liste.length) return null
      const cat = CATEGORIES_ECHEANCE[id]
      const noms = liste.slice(0, 3).map((e) => e.qui).join(', ') + (liste.length > 3 ? ` et ${liste.length - 3} autre${liste.length - 3 > 1 ? 's' : ''}` : '')
      return { id: `echeance_${id}`, icone: cat.icone, couleur: cat.couleur, titre: `${liste.length} ${liste.length > 1 ? cat.plusieurs : cat.un}`, sous: noms, lien: cat.lien }
    }).filter(Boolean)
  }, [echeances])
}

// Relais : une notification par échéance et par seuil (30 jours, 7 jours, le jour même, expiré). Les évaluations et les formations en retard
// sont regroupées en un seul message par mois. Le premier navigateur qui réclame la clé envoie ; les autres ne font rien.
export default function RelanceEcheancesRh() {
  const role = useAuth((s) => s.role)
  const uid = useAuth((s) => s.user?.uid)
  const actif = ROLES_ECHEANCES_RH.includes(role)
  const echeances = useDonneesEcheances(actif)
  const faits = useRef(new Set())

  useEffect(() => {
    if (!actif || !echeances.length) return
    let annule = false
    const mois = todayStr().slice(0, 7)

    async function envoyer(cle, payload) {
      if (faits.current.has(cle)) return
      faits.current.add(cle)
      try {
        const gagne = await claimOnce('rh_alertes_echeances', cle, { creeLe: todayStr() }).catch(() => false)
        if (!gagne || annule) return
        await notify({ type: 'warning', module: 'rh', forRoles: ROLES_ECHEANCES_RH, ...payload })      } catch { /* best effort : le prochain passage réessaiera */ }
    }

    // Contrats : un message par contrat et par seuil.
    echeances.filter((e) => ['expire', 'echeance', 'essai'].includes(e.categorie)).forEach((e) => {
      const cat = CATEGORIES_ECHEANCE[e.categorie]
      const titre = e.categorie === 'expire' ? `Contrat expiré : ${e.qui}` : e.categorie === 'essai' ? `Fin de période d'essai : ${e.qui}` : `Contrat à échéance : ${e.qui}`
      envoyer(`${e.cle}#${e.seuil}`, { title: titre, body: `${e.detail}. Prolongez, renouvelez ou résiliez dans les contrats.`, link: cat.lien })
    })
    // Matériel non restitué après un départ : une notification par employé.
    echeances.filter((e) => e.categorie === 'dotation').forEach((e) => {
      envoyer(`${e.cle}#${e.seuil}`, { title: `Matériel non restitué : ${e.qui}`, body: `${e.detail}. Faites-le restituer ou déclarez-le perdu dans les dotations.`, link: CATEGORIES_ECHEANCE.dotation.lien })
    })
    // Anniversaires du jour : une notification par personne et par année.
    echeances.filter((e) => ['anniversaire', 'anciennete'].includes(e.categorie)).forEach((e) => {
      const naissance = e.categorie === 'anniversaire'
      envoyer(`${e.cle}#${e.seuil}`, { type: 'info', title: `${naissance ? 'Anniversaire' : "Anniversaire d'embauche"} : ${e.qui} 🎂`, body: `${e.qui} : ${e.detail.toLowerCase()}. Pensez à lui souhaiter.`, link: CATEGORIES_ECHEANCE[e.categorie].lien, excludeUid: e.userId || null })
    })
    // Évaluations et formations : un résumé par mois.
    ;['evaluation', 'formation'].forEach((id) => {
      const liste = echeances.filter((e) => e.categorie === id)
      if (!liste.length) return
      const cat = CATEGORIES_ECHEANCE[id]
      envoyer(`${id}_${mois}`, { title: `${liste.length} ${liste.length > 1 ? cat.plusieurs : cat.un}`, body: liste.slice(0, 4).map((e) => e.qui).join(', ') + (liste.length > 4 ? '…' : ''), link: cat.lien })
    })
    return () => { annule = true }
  }, [actif, echeances, uid])

  return null
}
