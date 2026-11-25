// RH : demandes d'accès. Un employé sans compte en demande un depuis la page de connexion ; la RH l'étudie et décide (Info peut aussi décider,
// sans être dans le circuit). Validée, la demande crée un compte au rôle Agent avec E-TACHES ; refusée, une justification est obligatoire.
import { useMemo, useState } from 'react'
import { KeyRound, Search, Phone, Briefcase, Clock3, StickyNote } from 'lucide-react'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { avatarGradient } from '../../utils/color'
import { PageHeader } from './rhui'
import EtudeDemandeAcces from '../../portal/EtudeDemandeAcces'

const dateFr = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function DemandesAcces() {
  const role = useAuth((s) => s.role)
  const { data: demandes } = useCollection('demandes_acces')
  const [etude, setEtude] = useState(null)

  const { attente, traitees } = useMemo(() => {
    const tri = [...demandes].sort((a, b) => (b.creeLe || 0) - (a.creeLe || 0))
    return { attente: tri.filter((d) => d.statut === 'en_attente'), traitees: tri.filter((d) => d.statut !== 'en_attente').slice(0, 30) }
  }, [demandes])

  if (role !== 'rh' && role !== 'info') {
    return <p className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm font-bold text-amber-900">Cette page est réservée à la RH.</p>
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={KeyRound} sousModule="Équipe" titre="Demandes d'accès"
        sousTitre="Les employés sans compte demandent un accès depuis la page de connexion. Étudiez chaque demande, puis validez ou refusez." />

      <ParamsGrille>
        <ParamsCarte icone={Clock3} couleur="#d97706" titre="À étudier" sous={attente.length ? `${attente.length} demande(s) en attente` : 'Aucune demande en attente'} large>
          {attente.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Rien à étudier pour le moment.</p> : (
            <ul className="space-y-2">
              {attente.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: avatarGradient(d.nom) }} aria-hidden="true">{(d.prenom || d.nom || '?').trim().charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate font-bold text-gray-800">{d.nom} <span className="font-mono text-xs font-semibold text-gray-500">({d.login})</span></p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                      {d.poste && <span className="inline-flex items-center gap-1"><Briefcase size={11} aria-hidden="true" />{d.poste}</span>}
                      {d.telephone && <span className="inline-flex items-center gap-1"><Phone size={11} aria-hidden="true" />{d.telephone}</span>}
                      {d.note && <span className="inline-flex items-center gap-1"><StickyNote size={11} aria-hidden="true" />note</span>}
                      <span>{dateFr(d.creeLe)}</span>
                    </p>
                  </div>
                  <button type="button" onClick={() => setEtude(d)}
                    className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #d4574b, #BC3C31)' }}>
                    <Search size={15} aria-hidden="true" />Étudier
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ParamsCarte>

        {traitees.length > 0 && (
          <ParamsCarte icone={KeyRound} couleur="#64748b" titre="Déjà traitées" sous="Les 30 dernières décisions" large>
            <ul className="space-y-1.5">
              {traitees.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/80 bg-white/50 px-3.5 py-2 text-sm">
                  <span className="font-bold text-gray-800">{d.nom}</span>
                  <span className="font-mono text-xs text-gray-500">{d.login}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${d.statut === 'approuvee' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{d.statut === 'approuvee' ? 'Validée' : 'Refusée'}</span>
                  <span className="text-xs text-gray-500">{d.decidePar ? `par ${d.decidePar}` : ''} {dateFr(d.decideLe)}{d.motif ? ` : ${d.motif}` : ''}</span>
                </li>
              ))}
            </ul>
          </ParamsCarte>
        )}
      </ParamsGrille>

      {etude && <EtudeDemandeAcces demande={etude} onClose={() => setEtude(null)} />}
    </div>
  )
}
