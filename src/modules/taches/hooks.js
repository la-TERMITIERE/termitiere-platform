// E-TACHES : accès aux données (personnes, tâches visibles) pour la personne connectée.
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isViewAllRole } from '../../core/roles'
import { COL, voitLaTache } from './data'

// Identité de la personne connectée.
export function useMoi() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  return { moi: user?.uid || user?.login || null, nom: user?.nom || '', role, user }
}

// Personnes à qui on peut confier une tâche : comptes actifs qui ont accès au module E-TACHES.
export function usePersonnel() {
  const { data: users, loading } = useCollection('users')
  const personnel = useMemo(() => users
    .filter((u) => u.actif !== false && (isViewAllRole(u.role) || (u.modules || []).includes('taches')))
    .map((u) => ({ uid: u.uid || u.login, nom: u.nom || u.login, role: u.role, poste: u.poste || '', secteur: u.secteur || '' }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })), [users])
  const parUid = useMemo(() => Object.fromEntries(personnel.map((p) => [p.uid, p])), [personnel])
  return { personnel, parUid, loading }
}

// Toutes les tâches que la personne connectée a le droit de voir.
export function useTaches() {
  const { moi, role } = useMoi()
  const { data, loading } = useCollection(COL.taches)
  const taches = useMemo(() => data.filter((t) => voitLaTache(t, moi, role)), [data, moi, role])
  return { taches, loading }
}
