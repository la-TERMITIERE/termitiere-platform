// Journal d'activité — module Projet.
import { useMemo, useState } from 'react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateTime } from '../../utils/formatters'

const EVENTS = {
  projet_cree:       { label: 'Projet créé',       emoji: '📁' },
  projet_modifie:    { label: 'Projet modifié',     emoji: '✏️' },
  projet_supprime:   { label: 'Projet supprimé',    emoji: '🗑️' },
  tache_creee:       { label: 'Tâche créée',        emoji: '✅' },
  tache_modifiee:    { label: 'Tâche modifiée',     emoji: '✏️' },
  tache_supprimee:   { label: 'Tâche supprimée',    emoji: '🗑️' },
  document_ajoute:   { label: 'Document ajouté',    emoji: '📎' },
  photo_ajoutee:     { label: 'Photo ajoutée',      emoji: '📷' },
  depense_ajoutee:   { label: 'Dépense enregistrée',emoji: '💰' },
  rapport_pdf_genere:{ label: 'Rapport PDF généré', emoji: '📄' },
  besoin_cree:       { label: 'Besoin signalé',     emoji: '📦' },
  commentaire_ajoute:{ label: 'Commentaire ajouté', emoji: '💬' }
}
const ACTIONS_PROJET = new Set(Object.keys(EVENTS))

export default function Journal() {
  const { data: events } = useCollection('audit_global')
  const [search, setSearch] = useState('')

  const liste = useMemo(() =>
    events
      .filter((e) => ACTIONS_PROJET.has(e.action))
      .filter((e) => !search || JSON.stringify(e).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
      .slice(0, 100),
  [events, search])

  return (
    <div className="space-y-4">
      <input className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        placeholder="Rechercher dans le journal…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucune activité enregistrée.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((e, i) => {
            const ev = EVENTS[e.action] || { label: e.action, emoji: '•' }
            return (
              <div key={e.id || i} className="flex items-start gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm shadow-sm backdrop-blur-sm">
                <span className="text-base">{ev.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-700">{ev.label}</p>
                  {e.data?.nom   && <p className="text-xs text-gray-500">{e.data.nom}</p>}
                  {e.data?.titre && <p className="text-xs text-gray-500">{e.data.titre}</p>}
                  <p className="text-[10px] text-gray-400">
                    {e.userEmail || e.userId || 'Système'} · {formatDateTime(e.timestamp || e.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
