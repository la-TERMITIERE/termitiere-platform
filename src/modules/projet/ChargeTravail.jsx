// Charge de travail — qui porte quoi, tous secteurs/projets confondus. Regroupe les
// tâches ACTIVES (ni terminées ni annulées) par personne assignée, pour repérer d'un
// coup d'œil les surcharges (beaucoup de tâches, retards, priorités urgentes) sans
// avoir à ouvrir chaque projet un par un. Vue d'ensemble en lecture seule — la
// modification d'une tâche se fait toujours depuis Tâches/Projets.
import { useMemo, useState } from 'react'
import { Users, ListChecks, AlertTriangle, Flame, FolderKanban } from 'lucide-react'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateShort } from '../../utils/formatters'
import { glassModalProps } from '../../utils/color'
import { SECTEURS } from '../depense/data'
import { STATUTS_TACHE, PRIORITES } from './data'
import { secteurEffectif, tachesEnRetard, SECTEURS_PROJET } from './logic'

const COULEUR_EGPRO = '#0d9488'
const NON_ASSIGNE = '__non_assigne__'

export default function ChargeTravail() {
  const { data: projetsTous } = useCollection('projets')
  const { data: tachesTous }  = useCollection('projet_taches')

  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [personneOuverte, setPersonneOuverte] = useState(null)

  const tachesActives = useMemo(
    () => tachesTous.filter((t) => !['terminee', 'annulee'].includes(t.statut)),
    [tachesTous]
  )

  const projetsParId = useMemo(() => {
    const map = new Map()
    projetsTous.forEach((p) => map.set(p.id, p))
    return map
  }, [projetsTous])

  const enRetardIds = useMemo(() => new Set(tachesEnRetard(tachesActives).map((t) => t.id)), [tachesActives])

  const parPersonne = useMemo(() => {
    const groupes = new Map()
    tachesActives.forEach((t) => {
      const projet = projetsParId.get(t.projetId)
      const secteur = projet ? secteurEffectif(projet) : null
      if (filtreSecteur && secteur?.id !== filtreSecteur) return
      const cle = (t.assignee || '').trim() || NON_ASSIGNE
      if (!groupes.has(cle)) groupes.set(cle, { nom: cle === NON_ASSIGNE ? 'Non assigné' : cle, taches: [], secteurs: new Set() })
      const g = groupes.get(cle)
      g.taches.push({ ...t, projetNom: projet?.nom || '—', projetLieu: projet?.lieu || '', secteur })
      if (secteur) g.secteurs.add(secteur.id)
    })
    return [...groupes.values()].map((g) => ({
      ...g,
      nbActives: g.taches.length,
      nbRetard: g.taches.filter((t) => enRetardIds.has(t.id)).length,
      nbUrgentes: g.taches.filter((t) => t.priorite === 'urgente' || t.priorite === 'haute').length,
      secteursListe: [...g.secteurs].map((id) => SECTEURS.find((s) => s.id === id)).filter(Boolean),
      taches: g.taches.sort((a, b) => (a.echeance || Infinity) - (b.echeance || Infinity))
    })).sort((a, b) => b.nbActives - a.nbActives || a.nom.localeCompare(b.nom))
  }, [tachesActives, projetsParId, enRetardIds, filtreSecteur])

  const totalActives = parPersonne.reduce((s, g) => s + g.nbActives, 0)
  const totalRetard  = parPersonne.reduce((s, g) => s + g.nbRetard, 0)
  const totalPersonnes = parPersonne.filter((g) => g.nom !== 'Non assigné').length

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR_EGPRO}e6 0%, rgba(26,26,26,0.88) 100%)` }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Users size={26} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Charge de travail</h2>
          <p className="text-sm text-white/80">Qui porte quoi, tous secteurs confondus — tâches actives par personne, pour repérer les surcharges.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Secteur</label>
          <select value={filtreSecteur} onChange={(e) => setFiltreSecteur(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option value="">Tous les secteurs</option>
            {SECTEURS_PROJET.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {totalPersonnes} personne{totalPersonnes > 1 ? 's' : ''} · {totalActives} tâche{totalActives > 1 ? 's' : ''} active{totalActives > 1 ? 's' : ''}
          {totalRetard > 0 && <span className="text-red-500"> · {totalRetard} en retard</span>}
        </span>
      </div>

      {parPersonne.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          Aucune tâche active {filtreSecteur ? 'pour ce secteur' : ''} pour l'instant.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {parPersonne.map((g) => {
            const surcharge = g.nbRetard > 0 || g.nbActives >= 8
            return (
              <button key={g.nom} onClick={() => setPersonneOuverte(g)}
                className={`group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  g.nom === 'Non assigné' ? 'border-dashed border-gray-300' : surcharge ? 'border-red-200' : 'border-gray-200'
                }`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${
                    g.nom === 'Non assigné' ? 'bg-gray-400' : surcharge ? 'bg-red-500' : 'bg-teal-600'
                  }`}>
                    {g.nom === 'Non assigné' ? '?' : g.nom.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900">{g.nom}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {g.secteursListe.map((s) => (
                        <span key={s.id} className="h-2 w-2 rounded-full" style={{ background: s.color }} title={s.label} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                    <ListChecks size={11} /> {g.nbActives} active{g.nbActives > 1 ? 's' : ''}
                  </span>
                  {g.nbRetard > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                      <AlertTriangle size={11} /> {g.nbRetard} en retard
                    </span>
                  )}
                  {g.nbUrgentes > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      <Flame size={11} /> {g.nbUrgentes} prioritaire{g.nbUrgentes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Modal open={!!personneOuverte} onClose={() => setPersonneOuverte(null)} size="lg" {...glassModalProps(COULEUR_EGPRO)}
        title={personneOuverte?.nom || ''}>
        {personneOuverte && (
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {personneOuverte.taches.map((t) => {
              const statut = STATUTS_TACHE[t.statut] || STATUTS_TACHE.a_faire
              const priorite = PRIORITES[t.priorite] || PRIORITES.normale
              const retard = enRetardIds.has(t.id)
              return (
                <div key={t.id} className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-gray-800">{t.titre}</p>
                    <Badge tone={statut.tone}>{statut.label}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><FolderKanban size={11} /> {t.projetNom}{t.projetLieu ? ` — ${t.projetLieu}` : ''}</span>
                    {t.secteur && (
                      <span className="rounded-full px-1.5 py-0.5 font-bold" style={{ background: t.secteur.color + '1a', color: t.secteur.color }}>
                        {t.secteur.label}
                      </span>
                    )}
                    <Badge tone={priorite.tone}>{priorite.label}</Badge>
                    {t.echeance && (
                      <span className={retard ? 'font-bold text-red-600' : ''}>
                        {retard ? '⏰ ' : ''}Échéance {formatDateShort(t.echeance)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
