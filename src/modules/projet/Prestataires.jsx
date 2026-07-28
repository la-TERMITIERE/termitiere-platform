// Annuaire des prestataires — dérivé de l'historique des tâches et dépenses de tous les projets.
import { useState, useMemo } from 'react'
import { Phone, Wrench, Wallet, FolderKanban, Trash2, Receipt } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { safeKey } from '../../core/users'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { METIERS_PRESTATAIRE, annuairePrestataires } from './prestataire'
import { useAuthStore } from '../../core/auth'
import { projetsVisibles, scopeParProjets } from './logic'

export default function Prestataires() {
  const { data: depensesTous } = useCollection('projet_depenses')
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: projetsTous }  = useCollection('projets')
  const { data: masquesTous }  = useCollection('projet_prestataires_masques')
  const { user, role } = useAuthStore()
  // Le superviseur consulte tout, mais n'agit sur rien (lecture seule globale).
  const lectureSeule = ['superviseur', 'partenaire'].includes(role)
  // Accès complet pour la secrétaire/l'agent, sauf le retrait de l'annuaire (suppression réservée).
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)

  // Cloisonnement : un chef de projet ne voit que les prestataires de ses projets.
  const projets  = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const depenses = useMemo(() => scopeParProjets(depensesTous, projets), [depensesTous, projets])
  const taches   = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])

  const [search, setSearch]         = useState('')
  const [filtreMetier, setFiltreMetier] = useState('')
  const [filtreProjet, setFiltreProjet] = useState('')
  const [selection, setSelection]   = useState(null)

  const idsMasques = useMemo(() => new Set(masquesTous.map((m) => m.id)), [masquesTous])

  const annuaireComplet = useMemo(() => annuairePrestataires(depenses, taches, projets), [depenses, taches, projets])
  const annuaire = useMemo(() => annuaireComplet.filter((p) => !idsMasques.has(safeKey(p.nom.toLowerCase()))), [annuaireComplet, idsMasques])

  const liste = useMemo(() =>
    annuaire
      .filter((p) => !search || p.nom.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => !filtreMetier || p.metier === filtreMetier)
      .filter((p) => !filtreProjet || p.projets.has(filtreProjet)),
  [annuaire, search, filtreMetier, filtreProjet])

  const metierLabel = (id) => METIERS_PRESTATAIRE.find((m) => m.id === id)?.label || id

  const supprimer = async (p) => {
    if (!peutSupprimer) return
    if (!window.confirm(`Retirer "${p.nom}" de l'annuaire ?\n\nL'historique des tâches et dépenses déjà enregistrées n'est PAS supprimé — seule la fiche de l'annuaire disparaît. Le prestataire réapparaîtra automatiquement si son nom est de nouveau saisi.`)) return
    await setItem('projet_prestataires_masques', safeKey(p.nom.toLowerCase()), { nom: p.nom, masqueLe: Date.now() })
    if (selection?.nom === p.nom) setSelection(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-[220px] rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Rechercher un prestataire…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          value={filtreMetier} onChange={(e) => setFiltreMetier(e.target.value)}>
          <option value="">Tous les métiers</option>
          {METIERS_PRESTATAIRE.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((pr) => <option key={pr.id} value={pr.id}>{pr.nom}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-400">{liste.length} prestataire(s)</span>
      </div>

      <p className="text-xs text-gray-400">
        Cet annuaire se construit automatiquement à partir des tâches et dépenses saisies — aucune fiche à créer à part.
      </p>

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucun prestataire trouvé. Ils apparaissent ici dès qu'un nom est saisi dans une tâche ou une dépense.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((p) => (
            <Card key={p.nom} className="card-hover" onClick={() => setSelection(p)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800">{p.nom}</p>
                  <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
                    {p.metier && <span className="flex items-center gap-1"><Wrench size={12} />{metierLabel(p.metier)}</span>}
                    {p.telephone && <span className="flex items-center gap-1"><Phone size={12} />{p.telephone}</span>}
                    <span className="flex items-center gap-1"><FolderKanban size={12} />{p.nbProjets} projet(s)</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <div className="text-right">
                    <p className="text-sm font-bold text-teal-700">{formatMoney(p.totalVerse)}</p>
                    <p className="text-[10px] text-gray-400">total versé</p>
                  </div>
                  {peutSupprimer && (
                    <button
                      onClick={(e) => { e.stopPropagation(); supprimer(p) }}
                      title="Retirer de l'annuaire"
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!selection} onClose={() => setSelection(null)} title="Fiche prestataire"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {selection && (
          <div className="space-y-4">
            {/* En-tête glassmorphism — nom + coordonnées bien visibles */}
            <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.92) 0%, rgba(15,84,80,0.88) 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-extrabold text-white shadow-sm backdrop-blur-sm">
                  {selection.nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-snug">{selection.nom}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {selection.metier && (
                      <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                        <Wrench size={11} />{metierLabel(selection.metier)}
                      </span>
                    )}
                    {selection.telephone && (
                      <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                        <Phone size={11} />{selection.telephone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Total versé — mis en avant */}
            <div className="rounded-2xl border border-teal-100/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
                <Wallet size={13} /> Total versé
              </div>
              <p className="mt-1 text-2xl font-black leading-none text-gray-900">
                {formatMoney(selection.totalVerse)}<span className="ml-1 text-xs font-bold text-gray-400">FCFA</span>
              </p>
              <p className="mt-1 text-[11px] text-gray-400">sur {selection.nbProjets} projet{selection.nbProjets > 1 ? 's' : ''}</p>
            </div>

            {/* Historique des paiements */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                <Receipt size={13} /> Historique des paiements
              </p>
              {!selection.paiements.length ? (
                <p className="rounded-2xl bg-white/60 py-6 text-center text-sm text-gray-400 backdrop-blur-sm">Aucun paiement enregistré pour l'instant.</p>
              ) : (
                <div className="space-y-1.5">
                  {selection.paiements.map((pmt, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3.5 py-2.5 text-sm shadow-sm backdrop-blur-sm transition-colors hover:bg-white">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <FolderKanban size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-700">{pmt.projetNom || 'Projet inconnu'}</p>
                        <p className="text-xs text-gray-400">{pmt.date ? formatDateShort(pmt.date) : '—'}</p>
                      </div>
                      <p className="shrink-0 font-mono font-bold text-gray-800">{formatMoney(pmt.montant)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
