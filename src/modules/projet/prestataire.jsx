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
