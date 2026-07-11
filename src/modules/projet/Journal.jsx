// Journal d'activité — module Projet.
// Filtré par module ('projet'), pas par une liste d'actions à maintenir à la
// main : toute nouvelle action journalisée via audit('projet', ...) apparaît
// automatiquement ici, avec un libellé générique tant qu'elle n'a pas d'entrée
// dédiée dans EVENTS ci-dessous.
//
// Deux vues complémentaires, pas redondantes :
//  - « Journal »     : recherche rapide dans les 100 événements les plus récents.
//  - « Historique »  : archive complète, organisée en timeline par jour, filtrable
//    par projet et par type d'action — toute l'activité, pas seulement les tâches.
import { useEffect, useMemo, useState } from 'react'
import { Search, History } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateTime } from '../../utils/formatters'

const EVENTS = {
  projet_cree:        { label: 'Projet créé',        emoji: '📁' },
  projet_modifie:      { label: 'Projet modifié',      emoji: '✏️' },
  projet_supprime:     { label: 'Projet supprimé',     emoji: '🗑️' },
  projet_budget_revise: { label: 'Budget révisé',      emoji: '💰' },
  tache_creee:         { label: 'Tâche créée',         emoji: '✅' },
  tache_modifiee:      { label: 'Tâche modifiée',      emoji: '✏️' },
  tache_supprimee:     { label: 'Tâche supprimée',     emoji: '🗑️' },
  tache_montant_revise: { label: 'Montant tâche révisé', emoji: '💰' },
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
  materiel_epuise:     { label: 'Stock déclaré épuisé', emoji: '🚫' },
  materiel_mouvement_corrige:  { label: 'Mouvement corrigé',  emoji: '✏️' },
  materiel_mouvement_supprime: { label: 'Mouvement supprimé', emoji: '🗑️' },
  materiel_sur_site:   { label: 'Matériel remis sur site', emoji: '📍' },
  materiel_retourne:   { label: 'Matériel retourné',   emoji: '↩️' },
  materiel_perdu:      { label: 'Matériel signalé perdu', emoji: '⚠️' },
  seuils_modifies:     { label: 'Seuils d\'alerte modifiés', emoji: '⚙️' },
  reinitialisation:    { label: 'Module réinitialisé', emoji: '⚠️' }
}

function OngletJournal({ evenementsProjet }) {
  const [search, setSearch] = useState('')
  const [filtreNom, setFiltreNom] = useState('')

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

// ─── Onglet Historique — archive complète, timeline par jour ──────────────────

function OngletHistorique({ evenementsProjet, projets }) {
  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreAction, setFiltreAction] = useState('')
  // Pagination par jour (pas par événement) — évite de couper une journée en deux.
  // Se réinitialise à chaque changement de filtre pour ne pas garder une profondeur
  // héritée d'une autre recherche.
  const JOURS_PAR_PAGE = 20
  const [joursAffiches, setJoursAffiches] = useState(JOURS_PAR_PAGE)

  const lignes = useMemo(() => {
    let result = evenementsProjet.filter((e) => !filtreAction || e.action === filtreAction)
    if (filtreProjet) {
      const p = projets.find((x) => x.id === filtreProjet)
      if (p) result = result.filter((e) => (e.details || '').includes(p.nom) || (e.details || '').includes(filtreProjet))
    }
    return result.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
  }, [evenementsProjet, filtreProjet, filtreAction, projets])

  useEffect(() => { setJoursAffiches(JOURS_PAR_PAGE) }, [filtreProjet, filtreAction])

  const parJourTout = useMemo(() => {
    const groupes = {}
    lignes.forEach((e) => {
      const d = new Date(e.timestamp || e.createdAt || 0)
      const cle = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      if (!groupes[cle]) groupes[cle] = []
      groupes[cle].push(e)
    })
    return Object.entries(groupes)
  }, [lignes])

  // lignes est trié du plus récent au plus ancien, donc les clés de jour apparaissent
  // déjà dans cet ordre à l'insertion — trancher les N premières donne les N derniers jours.
  const parJour = parJourTout.slice(0, joursAffiches)
  const joursRestants = parJourTout.length - parJour.length

  const heureStr = (ts) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const estAujourdhui = (label) => {
    const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return label === auj
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
          <option value="">Toutes les actions</option>
          {Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        {lignes.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{lignes.length} événement{lignes.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {!lignes.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <History size={32} className="opacity-30" />
            <p className="text-sm">Aucun historique pour le moment.</p>
            <p className="text-xs">Toute l'activité du module apparaîtra ici au fur et à mesure.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {parJour.map(([jour, evenements]) => (
            <div key={jour}>
              {/* ── En-tête du jour ── */}
              <div className="mb-3 flex items-center gap-3">
                <div className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${estAujourdhui(jour) ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {estAujourdhui(jour) ? "Aujourd'hui" : jour}
                </div>
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[10px] text-gray-400">{evenements.length} action{evenements.length > 1 ? 's' : ''}</span>
              </div>

              {/* ── Timeline du jour ── */}
              <div className="ml-2 border-l-2 border-gray-100 pl-4 space-y-3">
                {evenements.map((e, i) => {
                  const cfg = EVENTS[e.action] || { label: e.action, emoji: '•' }
                  return (
                    <div key={e.id || i} className="relative flex items-start gap-3">
                      {/* point sur la ligne */}
                      <div className="absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />
                      <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{cfg.emoji} {cfg.label}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-gray-400">{heureStr(e.timestamp || e.createdAt)}</span>
                        </div>
                        {e.details && <p className="mt-1 text-sm font-medium text-gray-700">{e.details}</p>}
                        <p className="mt-0.5 text-[11px] text-gray-400">par <span className="font-semibold text-gray-500">{e.userNom || e.userId || 'Système'}</span></p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {joursRestants > 0 && (
            <button onClick={() => setJoursAffiches((n) => n + JOURS_PAR_PAGE)}
              className="mx-auto flex items-center gap-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50">
              Charger {Math.min(joursRestants, JOURS_PAR_PAGE)} jour{Math.min(joursRestants, JOURS_PAR_PAGE) > 1 ? 's' : ''} de plus ({joursRestants} restant{joursRestants > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Journal() {
  const { data: events } = useCollection('audit_global')
  const { data: projets } = useCollection('projets')
  const [onglet, setOnglet] = useState('journal')

  const evenementsProjet = useMemo(() => events.filter((e) => e.module === 'projet'), [events])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'journal',     label: '📰 Journal' },
          { id: 'historique',  label: '🕐 Historique' }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${onglet === o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'journal'
        ? <OngletJournal evenementsProjet={evenementsProjet} />
        : <OngletHistorique evenementsProjet={evenementsProjet} projets={projets} />
      }
    </div>
  )
}
