// Champ bénéficiaire (membre de l'entreprise) : saisie libre + suggestions des utilisateurs.
import { useMemo, useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

// ── Champ bénéficiaire (membre de l'entreprise) : saisie libre + suggestions ──
export default function ChampBeneficiaire({ value, onChange, onSelectUser, users }) {
  const [open, setOpen]     = useState(false)
  const [filtre, setFiltre] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const suggestions = useMemo(() => {
    const q = filtre.toLowerCase()
    return users.filter((u) => u.actif !== false && (u.nom || u.login || '').toLowerCase().includes(q)).slice(0, 10)
  }, [users, filtre])

  const choisir = (u) => { onSelectUser(u); setFiltre(''); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Nom du bénéficiaire…"
          value={open ? filtre : value}
          onChange={(e) => { setFiltre(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-primary"><ChevronDown size={14} /></button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length
            ? <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur : votre saisie sera utilisée.</p>
            : <ul className="max-h-48 overflow-y-auto py-1">
                {suggestions.map((u) => (
                  <li key={u.uid}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-primary/10"
                    onMouseDown={(e) => { e.preventDefault(); choisir(u) }}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary-dark">
                      {(u.nom || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">{u.nom}</p>
                      {u.poste && <p className="text-[10px] text-gray-400">{u.poste}</p>}
                    </div>
                  </li>
                ))}
              </ul>
          }
        </div>
      )}
    </div>
  )
}
