// RH — Rattachement des comptes (Collaborateurs & Contrats).
// Lier chaque employé RH à un compte utilisateur de la plateforme.
import { Handshake, Link2, Link2Off } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COL } from './store/rhStore'
import { PageHeader } from './rhui'

export default function Rattachements() {
  const { data: employes } = useCollection(COL.employes)
  const { data: users } = useCollection('users')

  async function lier(emp, userId) {
    const u = users.find((x) => x.id === userId)
    await updateItem(COL.employes, emp.id, { userId: userId || '', userLogin: u?.login || '' })
    toast.success(userId ? `Compte « ${u?.login} » rattaché` : 'Rattachement retiré')
  }

  const lies = employes.filter((e) => e.userId).length

  return (
    <div className="space-y-5">
      <PageHeader icon={Handshake} sousModule="Collaborateurs & Contrats" titre="Rattachement des comptes"
        sousTitre="Associez chaque employé à un compte utilisateur de la plateforme." />

      <div className="flex items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <Link2 size={16} /> {lies} / {employes.length} employé(s) rattaché(s) à un compte utilisateur.
      </div>

      <Card className="!p-0 overflow-hidden">
        {employes.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Ajoutez d'abord des employés.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {employes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{e.nom}</p>
                  <p className="text-xs text-gray-500">{e.poste || '—'} · {e.departement || '—'}</p>
                </div>
                {e.userId
                  ? <Badge tone="success"><Link2 size={12} /> {e.userLogin || 'compte lié'}</Badge>
                  : <Badge tone="neutral"><Link2Off size={12} /> Non rattaché</Badge>}
                <select value={e.userId || ''} onChange={(ev) => lier(e, ev.target.value)} className="input-base !w-auto">
                  <option value="">— Aucun compte —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.login} ({u.nom})</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
        {users.length === 0 && <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 dark:border-white/10">Aucun compte utilisateur disponible (les comptes se gèrent dans le portail → Utilisateurs).</p>}
      </Card>
    </div>
  )
}
