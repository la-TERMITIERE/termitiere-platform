// Auto-approbation des SORTIES DE FACTURE Maxi-Agro restées « sortie demandée » plus de
// 10 minutes : la sortie est approuvée automatiquement (approuverSortie → crée les sorties
// de stock liées + statut « sortie approuvée »), au cas où aucun membre de l'administration
// n'a pu la traiter. Composant « headless » (aucun rendu) monté dans AppShell : la
// vérification tourne tant que l'application est ouverte.
import { useEffect, useRef } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { approuverSortie } from '../modules/agro/factureWorkflow'

const DELAI_MS = 10 * 60 * 1000 // 10 minutes sans décision → approbation auto
const CHECK_MS = 30 * 1000      // fréquence de vérification
const SYSTEME = { nom: 'Système (auto · 10 min)', uid: null, login: 'systeme' }

// Horodatage de la demande de sortie ("YYYY-MM-DD HH:MM"). Repli : maintenant (pas de délai).
function sortieDemandeeMs(f) {
  if (typeof f.sortieDemandeeAt === 'number') return f.sortieDemandeeAt
  if (f.sortieDemandeeLe) {
    const t = new Date(`${String(f.sortieDemandeeLe).replace(' ', 'T')}:00`).getTime()
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

export default function AutoApproveSortiesFacture() {
  const { data: factures } = useCollection('agro_factures')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false

    function verifier() {
      const now = Date.now()
      for (const f of factures) {
        if (f.statut !== 'sortie_demandee') continue      // seules les sorties en attente
        if (traitees.current.has(f.id)) continue
        if (now - sortieDemandeeMs(f) < DELAI_MS) continue // pas encore 10 min
        traitees.current.add(f.id)
        // approuverSortie fait déjà l'écriture + le décompte de stock + l'audit + la notif.
        if (!annule) approuverSortie(f, SYSTEME).catch(() => { /* best effort — retry au prochain tick */ })
      }
    }

    verifier()
    const timer = setInterval(verifier, CHECK_MS)
    return () => { annule = true; clearInterval(timer) }
  }, [factures])

  return null
}
