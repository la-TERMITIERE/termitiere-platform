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
import { updateItem, ts } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { pushToUsers } from '../core/push'
import { todayStr, nowHM } from '../utils/formatters'
import { estFinal } from './workflow'
import { correctifEnCours } from './demandes/correctif'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes sans décision → certification auto
const CHECK_MS = 30 * 1000      // fréquence de vérification
const AUTEUR = 'Système (auto · 10 min)'

// Horodatage de création (createdAt ajouté par addItem ; repli sur date + heure).
function createdMs(d) {
  if (typeof d.createdAt === 'number') return d.createdAt
  if (d.date) {
    const t = new Date(`${d.date}T${d.heure || '00:00'}:00`).getTime()
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

// Effets métier de la certification, par module (mêmes écritures que la décision manuelle).
async function effetsCertification(module, d, horodate) {
  if (module === 'logistique') {
    if (d.factureId) await updateItem('logistique_factures', d.factureId, { statut: 'approuvee', approuveePar: AUTEUR, approuveeLe: horodate })
    if (d.prestationId) await updateItem('logistique_prestations', d.prestationId, { approuvee: true, approuveePar: AUTEUR, approuveeLe: horodate })
  } else if (module === 'evenementiel') {
    if (d.venteId) await updateItem('evenementiel_ventes', d.venteId, { statut: 'autorisee' })
  }
}

export default function AutoApproveWorkflow({ collection, module, lien = `/${module}/demandes` }) {
  const { data: demandes } = useCollection(collection)
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
          decidedAt: ts(), autoApprouve: true
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
        if (now - createdMs(d) < DELAI_MS) continue
        traitees.current.add(d.id)
        if (!annule) autoCertifier(d)
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [demandes, collection, module, lien])

  return null
}
