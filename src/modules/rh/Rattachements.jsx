// RH : rattachement des comptes (Paramètres). Lier chaque fiche employé au compte de connexion de la plateforme : la vue Employé du tableau de bord,
// les notifications adressées à la personne et le contact de sa fiche en dépendent. Cartes de verre dépoli, listes déroulantes arrondies.
import { Handshake, Link2, Link2Off } from 'lucide-react'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { avatarGradient } from '../../utils/color'
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
      <PageHeader icon={Handshake} sousModule="Paramètres" titre="Rattachement des comptes"
        sousTitre="Associez chaque employé à un compte utilisateur de la plateforme." />

      <ParamsGrille>
        <ParamsCarte icone={Link2} couleur="#0284c7" titre="Employés et comptes" sous={`${lies} sur ${employes.length} employé(s) rattaché(s) à un compte`} large>
          {employes.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Ajoutez d'abord des employés.</p> : (
            <ul className="space-y-2">
              {employes.map((e, i) => (
                <li key={e.id} className="ed-entree flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: avatarGradient(e.nom) }} aria-hidden="true">{(e.nom || '?').trim().charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-bold text-gray-800">{e.nom}</p>
                    <p className="truncate text-xs text-gray-500">{e.poste || 'Poste non défini'} · {e.departement || 'Sans département'}</p>
                  </div>
                  {e.userId
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700"><Link2 size={12} aria-hidden="true" /> {e.userLogin || 'compte lié'}</span>
                    : <span className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-gray-500"><Link2Off size={12} aria-hidden="true" /> Non rattaché</span>}
                  <select value={e.userId || ''} onChange={(ev) => lier(e, ev.target.value)} aria-label={`Compte de ${e.nom}`} className="input-base !w-auto min-w-[12rem]">
                    <option value="">Aucun compte</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.login} ({u.nom})</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
          {users.length === 0 && <p className="mt-3 text-xs text-gray-400">Aucun compte utilisateur disponible (les comptes se gèrent dans le portail, section Utilisateurs).</p>}
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}
