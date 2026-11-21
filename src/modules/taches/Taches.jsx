// E-TACHES : liste des tâches (mes tâches, confiées par moi, toute l'entreprise pour la direction) avec filtres, création et fiche détaillée.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListChecks, Plus, Search, Users, MessageSquare, Paperclip } from 'lucide-react'
import BandeauVolet, { BoutonBande, OngletsBande } from '../../shared/ui/BandeauVolet'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr } from '../../utils/formatters'
import { COL, COULEUR, STATUTS, COULEUR_STATUT, PRIORITES, estArchivee, estDestinataire, estMembre, estAuteur, statutAffiche, libelleEcheance, enRetard, trierParEcheance, voitToutesLesTaches, formatJour } from './data'
import { useMoi, useTaches, usePersonnel } from './hooks'
import { PastilleStatut, PastillePriorite, Barre, Pers, PileAvatars } from './ui'
import { categoriesUtilisees, normaliser } from './outils'
import { usePeriode } from './Periode'
import { filtrerParPeriode } from './pilotageCalculs'
import TacheForm from './TacheForm'
import TacheDetail from './TacheDetail'

const FILTRES_STATUT = ['Tous', 'À faire', 'En cours', 'En retard', 'Terminé']

export default function Taches() {
  const { moi, role } = useMoi()
  const direction = voitToutesLesTaches(role)
  const { taches: toutes } = useTaches()
  const { personnel } = usePersonnel()
  const { data: messages } = useCollection(COL.messages)
  const [params, setParams] = useSearchParams()
  const [portee, setPortee] = useState('miennes')
  const [priorite, setPriorite] = useState('')
  const [personne, setPersonne] = useState('')
  const [secteur, setSecteur] = useState('')
  const { periode, selecteur } = usePeriode('all')
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState(null) // tâche en cours de modification
  const jour = todayStr()

  const statut = FILTRES_STATUT.includes(params.get('statut')) ? params.get('statut') : 'Tous'
  const ouverte = params.get('t')
  const creation = params.get('nouvelle') === '1'
  const majParams = (modif) => { const p = new URLSearchParams(params); modif(p); setParams(p, { replace: true }) }
  const fermer = () => majParams((p) => { p.delete('t'); p.delete('nouvelle') })

  const vivantes = useMemo(() => toutes.filter((t) => !estArchivee(t, jour)), [toutes, jour])
  const duSecteur = (t) => !secteur || personnel.find((p) => p.uid === t.destUid)?.secteur === secteur
  const secteurs = useMemo(() => [...new Set(personnel.map((p) => p.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [personnel])
  const dansPortee = useMemo(() => filtrerParPeriode(vivantes, periode).filter(duSecteur).filter((t) => portee === 'toutes' ? direction : portee === 'confiees' ? estAuteur(t, moi) : (estDestinataire(t, moi) || estMembre(t, moi))), [vivantes, portee, direction, moi, periode.mode, periode.from, periode.to, secteur, personnel])
  const compteurs = useMemo(() => Object.fromEntries(FILTRES_STATUT.map((s) => [s, s === 'Tous' ? dansPortee.length : dansPortee.filter((t) => statutAffiche(t, jour) === s).length])), [dansPortee, jour])

  const liste = useMemo(() => {
    const q = normaliser(recherche)
    return dansPortee
      .filter((t) => statut === 'Tous' || statutAffiche(t, jour) === statut)
      .filter((t) => !priorite || t.priorite === priorite)
      .filter((t) => !personne || t.destUid === personne || estMembreDe(t, personne))
      .filter((t) => !q || normaliser(`${t.titre} ${t.numero} ${t.destNom} ${t.parNom} ${t.categorie} ${t.description}`).includes(q))
      .sort((a, b) => (enRetard(b, jour) - enRetard(a, jour)) || (a.statut === 'Terminé') - (b.statut === 'Terminé') || trierParEcheance(a, b))
  }, [dansPortee, statut, priorite, personne, recherche, jour])

  const nbMessages = useMemo(() => { const m = {}; messages.forEach((x) => { m[x.tacheId] = (m[x.tacheId] || 0) + 1 }); return m }, [messages])
  const tacheOuverte = ouverte ? toutes.find((t) => t.id === ouverte) : null
  const categories = useMemo(() => categoriesUtilisees(toutes), [toutes])

  const options = [{ id: 'miennes', label: 'Mes tâches' }, { id: 'confiees', label: 'Confiées par moi' }, ...(direction ? [{ id: 'toutes', label: 'Toute l\'entreprise' }] : [])]

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={ListChecks} surtitre="E-TACHES" titre="Tâches" sous="Confiez, suivez et terminez les tâches de l'équipe."
        pied={<>
          <OngletsBande options={options} valeur={portee} onChange={setPortee} />
          <label className="ml-auto flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-white sm:max-w-xs">
            <Search size={14} aria-hidden="true" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une tâche" className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-white/70" />
          </label>
        </>}>
        <BoutonBande icone={Plus} anime onClick={() => majParams((p) => p.set('nouvelle', '1'))}>Nouvelle tâche</BoutonBande>
      </BandeauVolet>

      <div className="flex flex-wrap items-center gap-2">
        {FILTRES_STATUT.map((s) => {
          const actif = statut === s
          const c = COULEUR_STATUT[s] || COULEUR
          return (
            <button key={s} type="button" aria-pressed={actif} onClick={() => majParams((p) => (s === 'Tous' ? p.delete('statut') : p.set('statut', s)))}
              className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" data-actif={actif} style={{ '--puce': c }}>
              {s}<span className="rounded-full bg-black/5 px-1.5 text-[10px]">{compteurs[s]}</span>
            </button>
          )
        })}
        <span className="flex-1" />
        {selecteur}
        {secteurs.length > 0 && (
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)} aria-label="Département" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold">
            <option value="">Tous les départements</option>{secteurs.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <select value={priorite} onChange={(e) => setPriorite(e.target.value)} aria-label="Priorité" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold">
          <option value="">Toutes priorités</option>{PRIORITES.map((p) => <option key={p}>{p}</option>)}
        </select>
        {direction && portee === 'toutes' && (
          <select value={personne} onChange={(e) => setPersonne(e.target.value)} aria-label="Personne" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold">
            <option value="">Tout le monde</option>{personnel.map((p) => <option key={p.uid} value={p.uid}>{p.nom}</option>)}
          </select>
        )}
      </div>

      {liste.length ? (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
          {liste.map((t) => {
            const retard = enRetard(t, jour)
            return (
              <li key={t.id} className="min-w-0">
                <button type="button" onClick={() => majParams((p) => p.set('t', t.id))}
                  className="card group relative block w-full overflow-hidden border-white/60 p-4 text-left backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ background: `linear-gradient(160deg, rgba(255,255,255,0.8), ${COULEUR_STATUT[retard ? 'En retard' : t.statut]}12)` }}>
                  <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: COULEUR_STATUT[retard ? 'En retard' : t.statut] }} />
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold text-gray-400">{t.numero}{t.categorie ? ` · ${t.categorie}` : ''}</span>
                      <span className="block truncate text-sm font-extrabold text-gray-800 dark:text-gray-100">{t.titre}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1"><PastilleStatut tache={t} jour={jour} /><PastillePriorite priorite={t.priorite} /></span>
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-2">
                    <Pers nom={t.destNom} />
                    <span className={`shrink-0 text-xs font-semibold ${retard ? 'text-red-600' : 'text-gray-500'}`}>{libelleEcheance(t, jour)}</span>
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="flex-1"><Barre valeur={t.progression} /></span>
                    <span className="w-9 text-right text-[11px] font-extrabold text-gray-500">{t.progression || 0}%</span>
                  </span>
                  <span className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                    {(t.membres || []).length > 0 && <span className="inline-flex items-center gap-1.5"><Users size={12} /><PileAvatars noms={t.membres.map((m) => m.nom)} max={3} /></span>}
                    {nbMessages[t.id] > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={12} />{nbMessages[t.id]}</span>}
                    {(t.pieces || []).length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} />{t.pieces.length}</span>}
                    {t.dateLimite && <span className="ml-auto">Limite {formatJour(t.dateLimite)}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : <EtatVide icone={ListChecks} accent={COULEUR} texte={recherche || statut !== 'Tous' || priorite ? 'Aucune tâche ne correspond à ces filtres' : 'Aucune tâche pour le moment'} />}

      {creation && <TacheForm categories={categories} nbExistantes={toutes.length} onClose={fermer} />}
      {edition && <TacheForm tache={edition} categories={categories} onClose={() => setEdition(null)} />}
      {tacheOuverte && !edition && <TacheDetail tache={tacheOuverte} onClose={fermer} onModifier={(t) => setEdition(t)} />}
    </div>
  )
}

const estMembreDe = (t, uid) => (t.membres || []).some((m) => m.uid === uid)
