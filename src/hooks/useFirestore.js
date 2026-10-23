// Hook de souscription temps réel à une collection.
// Se désinscrit automatiquement au démontage (évite les fuites / quotas).
import { useEffect, useState } from 'react'
import { subscribeCollection } from '../core/db'
import { useAuthStore } from '../core/auth'
import { profilVisible } from '../core/roles'

export function useCollection(name) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(!!name)
  const role = useAuthStore((s) => s.role)

  useEffect(() => {
    if (!name) { setData([]); setLoading(false); return }
    setLoading(true)
    const unsub = subscribeCollection(name, (rows) => {
      // Les comptes du rôle Info ne sont visibles que par Info (listes d'utilisateurs, bénéficiaires, responsables…).
      setData(name === 'users' ? rows.filter((r) => profilVisible(role, r)) : rows)
      setLoading(false)
    })
    return () => unsub && unsub()
  }, [name, role])

  return { data, loading }
}
