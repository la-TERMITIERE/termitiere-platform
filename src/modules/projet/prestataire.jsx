// Référentiel & champ partagé — coordonnées prestataire (utilisé par Dépenses et Tâches).
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export const METIERS_PRESTATAIRE = [
  { id: 'macon',        label: 'Maçon'          },
  { id: 'menuisier',    label: 'Menuisier'      },
  { id: 'electricien',  label: 'Électricien'    },
  { id: 'plombier',     label: 'Plombier'       },
  { id: 'peintre',      label: 'Peintre'        },
  { id: 'ferrailleur',  label: 'Ferrailleur'    },
  { id: 'carreleur',    label: 'Carreleur'      },
  { id: 'autre',        label: 'Autre métier'   }
]

export const TYPES_PAIEMENT_PRESTA = {
  total:  { label: 'Somme totale', tone: 'success' },
  avance: { label: 'Tranche',      tone: 'warning' }
}

// ── Champ métier prestataire : liste prédéfinie + saisie libre ────────────
export function ChampMetier({ value, onChange }) {
  const [libre, setLibre] = useState(!METIERS_PRESTATAIRE.find((m) => m.id === value) && !!value)

  const handleSelect = (e) => {
    const val = e.target.value
    if (val === '__libre__') { setLibre(true); onChange('') }
    else { setLibre(false); onChange(val) }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none"
          value={libre ? '__libre__' : (value || '')}
          onChange={handleSelect}
        >
          <option value="">— Choisir —</option>
          {METIERS_PRESTATAIRE.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          <option value="__libre__">✏️ Saisir un métier…</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      {libre && (
        <input
          autoFocus
          className="w-full rounded-lg border border-teal-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Nom du métier…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

// ── Annuaire des prestataires — dérivé de l'historique tâches + dépenses (pas de saisie séparée) ──
export function annuairePrestataires(depenses = [], taches = [], projets = []) {
  const map = new Map()
  const nomProjet = (id) => projets.find((p) => p.id === id)?.nom || ''

  const toucher = (nom, { telephone, metier, projetId, montant, date } = {}) => {
    const nomTrim = (nom || '').trim()
    if (!nomTrim) return
    const cle = nomTrim.toLowerCase()
    if (!map.has(cle)) map.set(cle, { nom: nomTrim, telephone: '', metier: '', totalVerse: 0, projets: new Set(), paiements: [] })
    const entree = map.get(cle)
    if (telephone) entree.telephone = telephone
    if (metier) entree.metier = metier
    if (projetId) entree.projets.add(projetId)
    if (montant) {
      entree.totalVerse += montant
      entree.paiements.push({ montant, date, projetNom: nomProjet(projetId) })
    }
  }

  taches.forEach((t) => toucher(t.prestataireNom, { telephone: t.prestataireTelephone, metier: t.prestataireMetier, projetId: t.projetId }))
  depenses.forEach((d) => toucher(d.fournisseur, { telephone: d.prestataireTelephone, metier: d.prestataireMetier, projetId: d.projetId, montant: Number(d.montant) || 0, date: d.date }))

  return [...map.values()]
    .map((e) => ({ ...e, nbProjets: e.projets.size, paiements: e.paiements.sort((a, b) => (b.date || 0) - (a.date || 0)) }))
    .sort((a, b) => b.totalVerse - a.totalVerse)
}

// Noms connus (pour autocomplétion) et dernières coordonnées saisies (pour pré-remplissage).
export function nomsPrestatairesConnus(depenses = [], taches = []) {
  const set = new Set()
  taches.forEach((t) => { if (t.prestataireNom?.trim()) set.add(t.prestataireNom.trim()) })
  depenses.forEach((d) => { if (d.fournisseur?.trim()) set.add(d.fournisseur.trim()) })
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function coordonneesPrestataires(depenses = [], taches = []) {
  const map = new Map()
  const enregistrer = (nom, telephone, metier) => {
    const cle = (nom || '').trim().toLowerCase()
    if (!cle) return
    const prev = map.get(cle) || {}
    map.set(cle, { telephone: telephone || prev.telephone || '', metier: metier || prev.metier || '' })
  }
  taches.forEach((t) => enregistrer(t.prestataireNom, t.prestataireTelephone, t.prestataireMetier))
  depenses.forEach((d) => enregistrer(d.fournisseur, d.prestataireTelephone, d.prestataireMetier))
  return map
}
