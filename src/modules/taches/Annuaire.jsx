// E-TACHES : annuaire des personnes actives de la plateforme (rôle, secteur, poste, contact).
import { useMemo, useState } from 'react'
import { BookUser, Search, Mail, Phone } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import EtatVide from '../../shared/ui/EtatVide'
import AvatarNom from '../../shared/ui/AvatarNom'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { roleLabel, roleTone } from '../../core/roles'
import { COULEUR, niveauTaches } from './data'
import { useMoi } from './hooks'
import { normaliser } from './outils'

export default function Annuaire() {
  const { role } = useMoi()
  const { data: users } = useCollection('users')
  const [q, setQ] = useState('')
  const actifs = useMemo(() => users.filter((u) => u.actif !== false).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' })), [users])
  const liste = useMemo(() => {
    const n = normaliser(q)
    return n ? actifs.filter((u) => normaliser(`${u.nom} ${u.secteur} ${u.poste} ${u.email} ${roleLabel(u.role)}`).includes(n)) : actifs
  }, [actifs, q])

  if (niveauTaches(role) === 'emp') return <EtatVide icone={BookUser} accent={COULEUR} texte="L'annuaire est réservé à l'encadrement" />

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={BookUser} surtitre="E-TACHES" titre="Annuaire" sous={`Toutes les personnes actives (${actifs.length}).`}
        pied={
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-white sm:max-w-md">
            <Search size={14} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, secteur, poste, e-mail)" aria-label="Rechercher dans l'annuaire" className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-white/70" />
          </label>
        } />
      {liste.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {liste.map((u) => (
            <li key={u.login || u.uid} className="card flex min-w-0 items-center gap-3 border-white/60 p-4 backdrop-blur-xl" style={{ background: `linear-gradient(160deg, rgba(255,255,255,0.8), ${COULEUR}0f)` }}>
              <AvatarNom nom={u.nom} accent={COULEUR} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-gray-800"><span className="truncate">{u.nom}</span><Badge tone={roleTone(u.role)}>{roleLabel(u.role)}</Badge></p>
                <p className="truncate text-xs text-gray-500">{u.secteur || '?'}{u.poste ? ` · ${u.poste}` : ''}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  {u.email && <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 font-semibold text-violet-700"><Mail size={12} />{u.email}</a>}
                  {u.telephone && <a href={`tel:${String(u.telephone).replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 font-semibold text-violet-700"><Phone size={12} />{u.telephone}</a>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : <EtatVide icone={Search} accent={COULEUR} texte="Aucun résultat" />}
    </div>
  )
}
