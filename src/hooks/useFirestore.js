// Hook de souscription temps réel à une collection.
// Se désinscrit automatiquement au démontage (évite les fuites / quotas).
import { useEffect, useState } from 'react'
import { subscribeCollection } from '../core/db'

export function useCollection(name) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeCollection(name, (rows) => {
      setData(rows)
      setLoading(false)
    })
    return () => unsub && unsub()
  }, [name])

  return { data, loading }
}
