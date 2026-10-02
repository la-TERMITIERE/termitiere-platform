// Journal d'activité Logistique — événements filtrés sur module === 'logistique'.
// Deux vues complémentaires : « Journal » = recherche par période/type/utilisateur
// avec export Excel (existant, inchangé) ; « Historique » = archive complète en
// timeline par jour, sans limite de période.
import { Fragment, useMemo, useState } from 'react'
import { FileSpreadsheet, ChevronRight, ChevronDown, ScrollText } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import HistoriqueTimeline from '../../shared/ui/HistoriqueTimeline'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateTime, formatDateShort, extraireMontantFCFA, todayStr } from '../../utils/formatters'
import { COULEUR_MODULE } from '../../utils/color'

const EVENTS = {
  SAISIE_MAGASIN: { label: 'Saisie magasin', emoji: '📦' },
  FACTURE:        { label: 'Facture émise', emoji: '🧾' },
  FACTURE_EDIT:   { label: 'Facture modifiée', emoji: '✏️' },
  FACTURE_DELETE: { label: 'Facture supprimée', emoji: '🗑️' },
  PRESTATION:     { label: 'Prestation créée', emoji: '🎪' },
  DEMANDE:        { label: 'Autorisation demandée', emoji: '📤' },
  APPROBATION:    { label: 'Autorisation approuvée', emoji: '✅' },
  REFUS:          { label: 'Autorisation refusée', emoji: '⛔' },
  RETOUR:         { label: 'Retour matériel', emoji: '🔄' },
  RESET:          { label: 'Réinitialisation', emoji: '♻️' },
  VEHICULE:       { label: 'Véhicule', emoji: '🚚' },
  LIVRAISON:      { label: 'Livraison', emoji: '📦' },
  STATUT:         { label: 'Changement de statut', emoji: '🔁' },
  BANQUE_MOUVEMENT_CREATE: { label: 'Mouvement bancaire enregistré', emoji: '🏦' },
  BANQUE_MOUVEMENT_EDIT:   { label: 'Mouvement bancaire modifié',    emoji: '✏️' },
  BANQUE_MOUVEMENT_DELETE: { label: 'Mouvement bancaire supprimé',   emoji: '🗑️' },
  BANQUE_SOLDE_INITIAL:    { label: 'Solde d\'ouverture modifié',    emoji: '🏦' }
}
const evInfo = (a) => EVENTS[a] || { label: a || 'Action', emoji: '•' }
const tsOf = (e) => (typeof e.timestamp === 'number' ? e.timestamp : (e.createdAt || 0))
const dayOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')

function TableJournal({ lignes, openRow, setOpenRow }) {
  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-6 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">Date / heure</th>
              <th className="px-3 py-2 text-left">Événement</th>
              <th className="px-3 py-2 text-left">Utilisateur</th>
              <th className="px-3 py-2 text-left">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Aucun événement sur la période.</td></tr>
            )}
            {lignes.map((r) => {
              const hasMeta = r.meta && Object.keys(r.meta).length > 0
              const isOpen = openRow === r.id
              return (
                <Fragment key={r.id}>
                  <tr className={hasMeta ? 'cursor-pointer hover:bg-gray-50' : ''} onClick={() => hasMeta && setOpenRow(isOpen ? null : r.id)}>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {hasMeta && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatDateTime(r._ms)}</td>
                    <td className="px-3 py-2 font-semibold">{evInfo(r.action).emoji} {evInfo(r.action).label}</td>
                    <td className="px-3 py-2">
                      {r.userNom || '—'}
                      {r.userRole && <span className="ml-1 text-xs capitalize text-gray-400">· {r.userRole}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.details || '—'}</td>
                  </tr>
                  {hasMeta && isOpen && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={4} className="px-3 py-2"><MetaDetail meta={r.meta} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function MetaDetail({ meta }) {
  return (
    <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-xs">
      {Object.entries(meta).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="min-w-[120px] font-semibold capitalize text-gray-500">{k}</span>
          <span className="text-gray-700">
            {v && typeof v === 'object'
              ? <span className="space-y-0.5">{Object.entries(v).map(([k2, v2]) => <span key={k2} className="block">• <strong>{k2}</strong> : {String(v2)}</span>)}</span>
              : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

function metaToText(meta) {
  if (!meta || typeof meta !== 'object') return ''
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${v && typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a}=${b}`).join('; ') : v}`)
    .join(' | ')
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Journal() {
  const { data: events } = useCollection('audit_global')
  const [onglet, setOnglet] = useState('journal')
  const [type, setType] = useState('')
  const [who, setWho] = useState('')
  const [openRow, setOpenRow] = useState(null)
  // Filtre de période — même format Jour/Mois/Année/Plage que le reste de la
  // plateforme, posé en glassmorphism directement sur la bande (onglet Journal
  // uniquement — l'Historique n'a pas de limite de période).
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const { start, end } = useMemo(() => {
    const auj = todayStr()
    if (modePeriode === 'jour') {
      const j = filtreJour || auj
      return { start: j, end: j }
    }
    if (modePeriode === 'annee') {
      const an = filtreAnnee || auj.slice(0, 4)
      return { start: `${an}-01-01`, end: an === auj.slice(0, 4) ? auj : `${an}-12-31` }
    }
    if (modePeriode === 'plage') {
      return { start: filtreDebut || auj, end: filtreFin || auj }
    }
    const mois = filtreMois || auj.slice(0, 7)
    const finMois = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0).toISOString().slice(0, 10)
    return { start: `${mois}-01`, end: mois === auj.slice(0, 7) ? auj : finMois }
  }, [modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])

  const evenements = useMemo(
    () => events.filter((e) => e.module === 'logistique' && e.action !== 'CONNEXION'),
    [events]
  )

  const typesPresents = useMemo(
    () => [...new Set(evenements.map((e) => e.action).filter(Boolean))].sort(),
    [evenements]
  )
  const usersPresents = useMemo(
    () => [...new Set(evenements.map((e) => e.userNom).filter(Boolean))].sort(),
    [evenements]
  )

  const lignes = useMemo(() => {
    return evenements
      .map((e) => ({ ...e, _ms: tsOf(e), _day: dayOf(tsOf(e)) }))
      .filter((e) =>
        (e._day >= start && e._day <= end) &&
        (!type || e.action === type) &&
        (!who || e.userNom === who)
      )
      .sort((a, b) => b._ms - a._ms)
  }, [evenements, start, end, type, who])

  function exportXLSX() {
    const rows = lignes.map((l) => ({
      'Date / Heure': formatDateTime(l._ms),
      Utilisateur: l.userNom || '—',
      Rôle: l.userRole || '—',
      Événement: evInfo(l.action).label,
      Détails: l.details || '—',
      'Montant (FCFA)': extraireMontantFCFA(l.details),
      Métadonnées: metaToText(l.meta)
    }))
    exportRapportExcel({
      filename: `journal-logistique-${start}_${end}.xlsx`,
      sections: [{
        id: 'journal', name: 'Journal Logistique',
        title: 'Journal d\'activité : Logistique & Événementiel',
        subtitle: `Période : du ${formatDateShort(start)} au ${formatDateShort(end)} · ${lignes.length} événement(s)`,
        columns: [
          { key: 'Date / Heure', label: 'Date / Heure', width: 20 },
          { key: 'Utilisateur', label: 'Utilisateur', width: 20 },
          { key: 'Rôle', label: 'Rôle', width: 14 },
          { key: 'Événement', label: 'Événement', width: 26 },
          { key: 'Détails', label: 'Détails', width: 40 },
          { key: 'Montant (FCFA)', label: 'Montant (FCFA)', width: 16, type: 'number' },
          { key: 'Métadonnées', label: 'Métadonnées', width: 50 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-4">
      {/* Bandeau héro — tri (période), filtres (type, utilisateur) et export
          regroupés en glassmorphism sur la bande, comme les autres volets. */}
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <ScrollText size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Journal d'activité</h2>
          <p className="text-sm text-white/80">{onglet === 'journal' ? `${lignes.length} / ` : ''}{evenements.length} événement(s)</p>
        </div>
        {onglet === 'journal' && (
          <>
            <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
              valeurJour={filtreJour} onJourChange={setFiltreJour}
              valeurMois={filtreMois} onMoisChange={setFiltreMois}
              avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
              avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
              valeurFin={filtreFin} onFinChange={setFiltreFin} />
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-800">
              <option value="">Tous les événements</option>
              {typesPresents.map((t) => <option key={t} value={t}>{evInfo(t).emoji} {evInfo(t).label}</option>)}
            </select>
            <select value={who} onChange={(e) => setWho(e.target.value)}
              className="rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-800">
              <option value="">Tous les utilisateurs</option>
              {usersPresents.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={exportXLSX}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
              <FileSpreadsheet size={14} /> Excel
            </button>
          </>
        )}
      </div>
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
        ? <TableJournal lignes={lignes} openRow={openRow} setOpenRow={setOpenRow} />
        : <HistoriqueTimeline evenements={evenements} evInfo={evInfo} />
      }
    </div>
  )
}
