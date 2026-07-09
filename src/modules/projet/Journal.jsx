// Journal d'activité — module Projet.
// Filtré par module ('projet'), pas par une liste d'actions à maintenir à la
// main : toute nouvelle action journalisée via audit('projet', ...) apparaît
// automatiquement ici, avec un libellé générique tant qu'elle n'a pas d'entrée
// dédiée dans EVENTS ci-dessous.
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateTime } from '../../utils/formatters'

const EVENTS = {
  projet_cree:        { label: 'Projet créé',        emoji: '📁' },
  projet_modifie:      { label: 'Projet modifié',      emoji: '✏️' },
  projet_supprime:     { label: 'Projet supprimé',     emoji: '🗑️' },
  tache_creee:         { label: 'Tâche créée',         emoji: '✅' },
  tache_modifiee:      { label: 'Tâche modifiée',      emoji: '✏️' },
  tache_supprimee:     { label: 'Tâche supprimée',     emoji: '🗑️' },
  document_ajoute:     { label: 'Document ajouté',     emoji: '📎' },
  photos_ajoutees:     { label: 'Photo(s) ajoutée(s)', emoji: '📷' },
  depense_ajoutee:     { label: 'Dépense enregistrée', emoji: '💰' },
  rapport_pdf_genere:  { label: 'Rapport PDF généré',  emoji: '📄' },
  commentaire_ajoute:  { label: 'Commentaire ajouté',  emoji: '💬' },
  besoin_cree:         { label: 'Besoin signalé',      emoji: '📦' },
  besoin_modifie:      { label: 'Besoin modifié',      emoji: '✏️' },
  besoin_en_cours:     { label: 'Besoin pris en charge', emoji: '▶️' },
  besoin_satisfait:    { label: 'Besoin satisfait',    emoji: '✅' },
  besoin_annule:       { label: 'Besoin annulé',       emoji: '🚫' },
  materiel_ajoute:     { label: 'Matériel ajouté',     emoji: '🔧' },
  materiel_modifie:    { label: 'Matériel modifié',    emoji: '✏️' },
  materiel_entree:     { label: 'Entrée de stock',     emoji: '📥' },
  materiel_sortie:     { label: 'Sortie de stock',     emoji: '📤' },
  materiel_mouvement_corrige:  { label: 'Mouvement corrigé',  emoji: '✏️' },
  materiel_mouvement_supprime: { label: 'Mouvement supprimé', emoji: '🗑️' },
  materiel_sur_site:   { label: 'Matériel remis sur site', emoji: '📍' },
  materiel_retourne:   { label: 'Matériel retourné',   emoji: '↩️' },
  materiel_perdu:      { label: 'Matériel signalé perdu', emoji: '⚠️' },
  seuils_modifies:     { label: 'Seuils d\'alerte modifiés', emoji: '⚙️' },
  reinitialisation:    { label: 'Module réinitialisé', emoji: '⚠️' }
}

export default function Journal() {
  const { data: events } = useCollection('audit_global')
  const [search, setSearch] = useState('')
  const [filtreNom, setFiltreNom] = useState('')

  const evenementsProjet = useMemo(() => events.filter((e) => e.module === 'projet'), [events])

  const noms = useMemo(() =>
    [...new Set(evenementsProjet.map((e) => e.userNom).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  [evenementsProjet])

  const liste = useMemo(() =>
    evenementsProjet
      .filter((e) => !filtreNom || e.userNom === filtreNom)
      .filter((e) => !search || JSON.stringify(e).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
      .slice(0, 100),
  [evenementsProjet, filtreNom, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full rounded-xl border border-gray-200 bg-white/70 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreNom} onChange={(e) => setFiltreNom(e.target.value)}>
          <option value="">Tous les utilisateurs</option>
          {noms.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

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
                  {e.details && <p className="text-xs text-gray-500">{e.details}</p>}
                  <p className="text-[10px] text-gray-400">
                    {e.userNom || e.userId || 'Système'} · {formatDateTime(e.timestamp || e.createdAt)}
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
