// Annuaire des prestataires — dérivé de l'historique des tâches et dépenses de tous les projets.
import { useState, useMemo } from 'react'
import { Phone, Wrench, Wallet, FolderKanban, X } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { METIERS_PRESTATAIRE, annuairePrestataires } from './prestataire'

export default function Prestataires() {
  const { data: depenses } = useCollection('projet_depenses')
  const { data: taches }   = useCollection('projet_taches')
  const { data: projets }  = useCollection('projets')

  const [search, setSearch]     = useState('')
  const [selection, setSelection] = useState(null)

  const annuaire = useMemo(() => annuairePrestataires(depenses, taches, projets), [depenses, taches, projets])

  const liste = useMemo(() =>
    annuaire.filter((p) => !search || p.nom.toLowerCase().includes(search.toLowerCase())),
  [annuaire, search])

  const metierLabel = (id) => METIERS_PRESTATAIRE.find((m) => m.id === id)?.label || id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-[220px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Rechercher un prestataire…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-gray-400">{liste.length} prestataire(s)</span>
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
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-teal-700">{formatMoney(p.totalVerse)}</p>
                  <p className="text-[10px] text-gray-400">total versé</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelection(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                  <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
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
