// Auto-certification des demandes d'autorisation (workflow 2 niveaux partagé
// en_attente → approuvé N1 → certifié) restées sans décision plus de 10 minutes.
// Utilisé pour Logistique (autorisations de sortie matériel) et Briqueterie (ventes) :
// à la certification, la facture passe « approuvée » (logistique) / la vente passe
// « autorisée » (briqueterie). Le stock, lui, est calculé (aucune écriture ici).
//
// Composant « headless » (aucun rendu), monté dans AppShell : la vérification tourne
// tant que l'application est ouverte, même si aucun administrateur n'est sur la page.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { useAuth } from '../hooks/useAuth'
import { updateItem, setItem, getAll, ts } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { pushToUsers } from '../core/push'
import { todayStr, nowHM } from '../utils/formatters'
import { estFinal } from './workflow'
import { correctifEnCours } from './demandes/correctif'
import { retirerVenteDuStock } from '../modules/evenementiel/logic'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes sans décision → certification auto
const CHECK_MS = 30 * 1000      // fréquence de vérification
const AUTEUR = 'Système (auto · 10 min)'

// Horodatage de création. On n'utilise QUE `createdAt`, posé par la couche de
// données au moment de l'écriture. (Audit sécurité 2026-08-04)
//
// L'ancien repli sur `date` + `heure` était exploitable : ces deux champs sont
// saisis par le DEMANDEUR lui-même. Il suffisait d'antidater sa demande pour
// qu'elle soit immédiatement « certifiée automatiquement », sans attendre les
// 10 minutes et sans qu'aucun responsable ne la voie passer.
//
// Renvoie null si l'horodatage est absent ou incohérent → aucune certification
// automatique (une demande sans date fiable doit être traitée par un humain).
function createdMs(d) {
  if (typeof d.createdAt !== 'number' || !Number.isFinite(d.createdAt)) return null
  // Un `createdAt` dans le futur est forcément faux : on refuse aussi.
  if (d.createdAt > Date.now() + 60000) return null
  return d.createdAt
}

// Effets métier de la certification, par module (mêmes écritures que la décision manuelle).
async function effetsCertification(module, d, horodate) {
  if (module === 'logistique') {
    if (d.factureId) await updateItem('logistique_factures', d.factureId, { statut: 'approuvee', approuveePar: AUTEUR, approuveeLe: horodate })
    if (d.prestationId) await updateItem('logistique_prestations', d.prestationId, { approuvee: true, approuveePar: AUTEUR, approuveeLe: horodate })
    // (Le stock logistique est recalculé à partir des demandes CERTIFIÉES —
    //  autoSorties — donc l'auto-certification le décrémente sans écriture ici.)
  } else if (module === 'evenementiel') {
    if (d.venteId) await updateItem('evenementiel_ventes', d.venteId, { statut: 'autorisee' })
    // La briqueterie ne recalcule PAS son stock : le « prêt » (ou caillasses) est
    // décrémenté impérativement, comme dans la certification manuelle. Sans ceci,
    // une vente certifiée par le SYSTÈME ne décrémentait jamais le stock.
    // Idempotent via `stockDecremente` (évite un double décompte).
    if (d.venteId && !d.stockDecremente) {
      const [ventes, inventaires] = await Promise.all([
        getAll('evenementiel_ventes'), getAll('evenementiel_inventaires')
      ])
      const vente = ventes.find((v) => v.id === d.venteId) || (d.lignes ? { lignes: d.lignes } : null)
      const maj = vente && retirerVenteDuStock(inventaires, vente)
      if (maj) {
        await setItem('evenementiel_inventaires', maj.date, {
          ...maj.inv, date: maj.date, briques: maj.briques, savedAt: ts()
        })
      }
    }
  }
}

export default function AutoApproveWorkflow({ collection, module, lien = `/${module}/demandes` }) {
  const { data: demandes } = useCollection(collection)
  const moi = useAuth((s) => s.user?.login)
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    async function autoCertifier(d) {
      try {
        const horodate = todayStr() + ' ' + nowHM()
        await updateItem(collection, d.id, {
          statut: 'certifie',
          approbateur: 'systeme', approbateurNom: AUTEUR,
          approuveN1Par: d.approuveN1Par || AUTEUR, approuveN1Le: d.approuveN1Le || horodate,
          certifiePar: AUTEUR, certifieLe: horodate,
          dateDecision: horodate,
          commentaireDecision: 'Certification automatique : aucune décision sous 10 minutes',
          decidedAt: ts(), autoApprouve: true,
          // Marque le stock comme décrémenté (idempotence, cf. effetsCertification).
          stockDecremente: true
        })
        await effetsCertification(module, d, horodate)
        await audit(module, 'CERTIFICATION', `${d.num || d.id} — autorisation auto (10 min)`)
        const dest = [d.demandeur].filter(Boolean)
        if (dest.length) {
          await notify({
            type: 'approuve', title: 'Autorisation certifiée automatiquement ✅',
            body: `${d.num || ''} — délai de 10 min dépassé, autorisation accordée`,
            module, forUsers: dest, link: lien
          })
          pushToUsers(dest, { title: 'Autorisation certifiée automatiquement ✅', body: `${d.num || ''}`, url: lien })
        }
      } catch (e) { /* best effort — un autre client réessaiera au prochain tick */ }
    }

    function verifier() {
      const now = Date.now()
      for (const d of demandes) {
        if (estFinal(d.statut)) continue        // déjà certifiée ou refusée
        if (correctifEnCours(d)) continue        // un correctif en cours se tranche à la main
        if (traitees.current.has(d.id)) continue
        // SÉPARATION DES POUVOIRS : ce composant tourne dans le navigateur de
        // CHAQUE utilisateur connecté, y compris celui du demandeur. Sans ce
        // garde-fou, c'était l'onglet du demandeur lui-même qui certifiait sa
        // propre sortie de stock. On laisse le navigateur d'un TIERS le faire.
        if (moi && d.demandeur && d.demandeur === moi) continue
        const cree = createdMs(d)
        // Horodatage absent ou incohérent → décision humaine obligatoire.
        if (cree === null) continue
        if (now - cree < DELAI_MS) continue
        traitees.current.add(d.id)
        if (!annule) autoCertifier(d)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [demandes, collection, module, lien, moi])

  return null
}
