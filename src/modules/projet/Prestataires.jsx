// Annuaire des prestataires — dérivé de l'historique des tâches et dépenses de tous les projets.
import { useState, useMemo } from 'react'
import { Phone, Wrench, Wallet, FolderKanban, X, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
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
            <Card key={p.nom} className="cursor-pointer" onClick={() => setSelection(p)}>
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
                  <button
                    onClick={(e) => { e.stopPropagation(); supprimer(p) }}
                    title="Retirer de l'annuaire"
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelection(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/50 bg-white/90 p-5 shadow-[0_32px_64px_-16px_rgba(26,26,26,0.35)] backdrop-blur-xl backdrop-saturate-150" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-gray-800">{selection.nom}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                  {selection.metier && <span className="flex items-center gap-1"><Wrench size={12} />{metierLabel(selection.metier)}</span>}
                  {selection.telephone && <span className="flex items-center gap-1"><Phone size={12} />{selection.telephone}</span>}
                </div>
              </div>
              <button onClick={() => setSelection(null)} className="rounded p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>

            <div className="mb-3 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2">
              <Wallet size={14} className="text-teal-600" />
              <span className="text-sm font-bold text-teal-800">{formatMoney(selection.totalVerse)}</span>
              <span className="text-xs text-teal-600">versés sur {selection.nbProjets} projet(s)</span>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Historique des paiements</p>
            {!selection.paiements.length ? (
              <p className="text-sm text-gray-400">Aucun paiement enregistré pour l'instant.</p>
            ) : (
              <div className="space-y-1.5">
                {selection.paiements.map((pmt, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-gray-700">{pmt.projetNom || 'Projet inconnu'}</p>
                      <p className="text-xs text-gray-400">{pmt.date ? formatDateShort(pmt.date) : '—'}</p>
                    </div>
                    <p className="font-mono font-semibold text-gray-700">{formatMoney(pmt.montant)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
