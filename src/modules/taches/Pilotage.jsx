// E-TACHES : Pilotage. Vue d'ensemble de toute l'entreprise sur une période : indicateurs cliquables, évolution dans le temps,
// charge par département (secteur du destinataire) et tâches les plus en retard. Réservé à la direction générale, comme dans l'ancienne application.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gauge, ListChecks, CheckCircle2, PlayCircle, Clock, AlertTriangle, Hourglass, Timer, CalendarX, TrendingUp, Building2, Flame, Search } from 'lucide-react'
import BandeauVolet, { OngletsBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'
import StatCard from '../../shared/ui/StatCard'
import Modal from '../../shared/ui/Modal'
import EtatVide from '../../shared/ui/EtatVide'
import { glassModalProps } from '../../utils/color'
import { todayStr, formatNumber } from '../../utils/formatters'
import { COULEUR, COULEUR_STATUT, estArchivee, enRetard, niveauTaches, formatJour } from './data'
import { useMoi, useTaches, usePersonnel } from './hooks'
import { MODES_PERIODE, bornesPilotage, filtrerParPeriode, serieEvolution, plafond, joursEntre } from './pilotageCalculs'
import { Tuile, Bento, Barre, PastilleStatut, Pers } from './ui'
import { normaliser } from './outils'

const COULEURS = { creees: '#1a73e8', terminees: '#137333', echues: '#c5221f', tardif: '#f9ab00' }
const LEGENDE = [['creees', 'Créées'], ['terminees', 'Terminées'], ['echues', 'Échues non finies'], ['tardif', 'Démarrage tardif']]

export default function Pilotage() {
  const { role } = useMoi()
  const navigate = useNavigate()
  const { taches } = useTaches()
  const { parUid } = usePersonnel()
  const [mode, setMode] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState(null) // { cle, titre }
  const [recherche, setRecherche] = useState('')
  const [detailOuvert, setDetailOuvert] = useState(false)
  const jour = todayStr()

  const periode = { mode, from, to }
  const bornes = bornesPilotage(periode)
  // Le pilotage couvre toute l'entreprise : les tâches archivées à la main restent comptées.
  const liste = useMemo(() => filtrerParPeriode(taches, periode), [taches, mode, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const secteurDe = (t) => parUid[t.destUid]?.secteur || 'Sans secteur'

  const k = useMemo(() => {
    const terminees = liste.filter((t) => t.statut === 'Terminé')
    const retard = liste.filter((t) => enRetard(t, jour))
    const tardif = liste.filter((t) => t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour)
    const clotures = terminees.filter((t) => t.dateCloture)
    const delai = clotures.length ? Math.round(clotures.reduce((s, t) => s + Math.max(0, joursEntre(t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : t.dateDebut || t.dateCloture, t.dateCloture)), 0) / clotures.length) : 0
    const clotureTardive = clotures.filter((t) => t.dateLimite && t.dateCloture > t.dateLimite).length
    return {
      total: liste.length, terminees, encours: liste.filter((t) => t.statut === 'En cours'), afaire: liste.filter((t) => t.statut === 'À faire'), retard, tardif,
      taux: liste.length ? Math.round((terminees.length * 100) / liste.length) : 0, delai,
      tauxTardif: clotures.length ? Math.round((clotureTardive * 100) / clotures.length) : 0, clotureTardive, nbClotures: clotures.length
    }
  }, [liste, jour])

  const serie = useMemo(() => serieEvolution(liste, periode, jour), [liste, mode, from, to, jour]) // eslint-disable-line react-hooks/exhaustive-deps

  const departements = useMemo(() => {
    const m = {}
    liste.forEach((t) => {
      const d = secteurDe(t)
      const c = m[d] || (m[d] = { nom: d, total: 0, finies: 0, retard: 0 })
      c.total++; if (t.statut === 'Terminé') c.finies++; if (enRetard(t, jour)) c.retard++
    })
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [liste, parUid, jour]) // eslint-disable-line react-hooks/exhaustive-deps

  const pires = useMemo(() => [...k.retard].sort((a, b) => (a.dateLimite < b.dateLimite ? -1 : 1)).slice(0, 6), [k.retard])

  const groupes = {
    all: ['Toutes les tâches', liste], done: ['Tâches terminées', k.terminees], en_cours: ['Tâches en cours', k.encours], todo: ['Tâches à faire', k.afaire],
    overdue: ['Tâches en retard', k.retard], late_start: ['Démarrage tardif', k.tardif]
  }
  const ouvrir = (cle) => { setDetail({ cle, titre: groupes[cle][0] }); setRecherche('') }
  const detailListe = detail ? groupes[detail.cle][1].filter((t) => !recherche || normaliser(`${t.titre} ${t.numero} ${t.destNom}`).includes(normaliser(recherche))) : []

  if (niveauTaches(role) !== 'chef') return <EtatVide icone={Gauge} accent={COULEUR} texte="Le pilotage est réservé à la direction générale" />

  const info = !bornes.from && !bornes.to ? `${liste.length} tâche${liste.length > 1 ? 's' : ''} au total` : `${liste.length} tâche${liste.length > 1 ? 's' : ''} · du ${formatJour(bornes.from) || '...'} au ${formatJour(bornes.to) || '...'}`

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Gauge} surtitre="E-TACHES" titre="Pilotage" sous={`Vue d'ensemble sur toute l'entreprise. ${info}`}
        pied={<>
          <OngletsBande options={MODES_PERIODE} valeur={mode} onChange={setMode} taille="sm" />
          {mode === 'custom' && (
            <>
              <ChampBande label="Du"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={CLASSE_CHAMP_BANDE} /></ChampBande>
              <ChampBande label="Au"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={CLASSE_CHAMP_BANDE} /></ChampBande>
            </>
          )}
        </>} />

      <Bento>
        <StatCard title="Total" value={formatNumber(k.total)} sub="Tâches enregistrées" icon={ListChecks} accent={COULEUR} onClick={() => ouvrir('all')} />
        <StatCard title="Terminées" value={formatNumber(k.terminees.length)} sub={`${k.taux}% de complétion`} icon={CheckCircle2} accent={k.taux >= 70 ? '#16a34a' : k.taux >= 40 ? '#d97706' : '#dc2626'} onClick={() => ouvrir('done')} />
        <StatCard title="En cours" value={formatNumber(k.encours.length)} icon={PlayCircle} accent={COULEUR_STATUT['En cours']} onClick={() => ouvrir('en_cours')} />
        <StatCard title="À faire" value={formatNumber(k.afaire.length)} icon={Clock} accent={COULEUR_STATUT['À faire']} onClick={() => ouvrir('todo')} />
        <StatCard title="En retard" value={formatNumber(k.retard.length)} sub="Échéance dépassée" icon={AlertTriangle} accent="#dc2626" onClick={() => ouvrir('overdue')} />
        <StatCard title="Démarrage tardif" value={formatNumber(k.tardif.length)} sub="Pas commencées à temps" icon={Hourglass} accent="#f59e0b" onClick={() => ouvrir('late_start')} />
        <StatCard title="Délai moyen" value={k.delai ? `${k.delai} j` : '-'} sub={k.delai ? 'Pour terminer' : ''} icon={Timer} accent="#0891b2" />
        <StatCard title="Retard de clôture" value={`${k.tauxTardif}%`} sub={`${k.clotureTardive} livraison(s) en retard sur ${k.nbClotures}`} icon={CalendarX} accent={k.tauxTardif > 30 ? '#d97706' : '#64748b'} />

        <Tuile titre="Évolution dans le temps" icone={TrendingUp} span="sm:col-span-2 lg:col-span-4"
          action={<button type="button" onClick={() => setDetailOuvert((v) => !v)} className="text-xs font-bold" style={{ color: COULEUR }}>{detailOuvert ? 'Masquer le tableau' : 'Voir le tableau détaillé'}</button>}>
          <Evolution serie={serie} />
          {detailOuvert && (
            <div className="mt-3 overflow-x-auto rounded-2xl bg-white/60">
              <table className="w-full min-w-[34rem] text-sm">
                <thead><tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><th className="px-3 py-2">Période</th><th className="px-3 py-2">Créées</th><th className="px-3 py-2">Terminées</th><th className="px-3 py-2">Échues</th><th className="px-3 py-2">Tardif</th><th className="px-3 py-2">Complétion</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {serie.map((s) => (
                    <tr key={s.label}><td className="px-3 py-1.5 font-semibold text-gray-700">{s.label}</td>
                      <Cellule v={s.creees} c={COULEURS.creees} /><Cellule v={s.terminees} c={COULEURS.terminees} /><Cellule v={s.echues} c={COULEURS.echues} /><Cellule v={s.tardif} c={COULEURS.tardif} />
                      <td className="px-3 py-1.5 font-extrabold" style={{ color: s.taux === null ? '#9ca3af' : s.taux >= 70 ? '#16a34a' : s.taux >= 40 ? '#d97706' : '#dc2626' }}>{s.taux === null ? '·' : `${s.taux}%`}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tuile>

        <Tuile titre={`Charge par département (${departements.length})`} icone={Building2} span="sm:col-span-2">
          {departements.length ? (
            <ul className="space-y-3">
              {departements.map((d) => (
                <li key={d.nom} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{d.nom}</span><span className="shrink-0 text-xs text-gray-500">{d.finies}/{d.total} terminées ({d.total ? Math.round((d.finies * 100) / d.total) : 0}%){d.retard > 0 && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 font-extrabold text-red-700">{d.retard} en retard</span>}</span></div>
                  <Barre valeur={(d.total / departements[0].total) * 100} couleur={d.retard ? COULEUR_STATUT['En retard'] : COULEUR} />
                </li>
              ))}
            </ul>
          ) : <p className="py-4 text-sm text-gray-400">Aucune donnée sur cette période.</p>}
        </Tuile>

        <Tuile titre={`Top tâches en retard (${k.retard.length})`} icone={Flame} accent="#dc2626" span="sm:col-span-2">
          {pires.length ? (
            <ul className="divide-y divide-black/5">
              {pires.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate(`/taches/taches?t=${t.id}`)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-white/60">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-800">{t.titre}</span><span className="block truncate text-xs text-gray-500">{t.destNom} · échéance {formatJour(t.dateLimite)}</span></span>
                    <span className="shrink-0 text-sm font-black text-red-600">+{joursEntre(t.dateLimite, jour)} j</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="py-4 text-sm text-gray-400">Aucune tâche en retard, bravo.</p>}
        </Tuile>
      </Bento>

      {detail && (
        <Modal open onClose={() => setDetail(null)} size="xl" title={`${detail.titre} (${detailListe.length})`} {...glassModalProps(COULEUR)}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5"><Search size={14} className="text-gray-400" aria-hidden="true" /><input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher" aria-label="Rechercher" className="w-full bg-transparent text-sm outline-none" /></label>
            {detailListe.length ? (
              <ul className="divide-y divide-black/5 rounded-2xl bg-white/60">
                {detailListe.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => navigate(`/taches/taches?t=${t.id}`)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/80">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-800">{t.titre}</span><span className="block truncate text-xs text-gray-500">{t.numero} · {secteurDe(t)} · échéance {formatJour(t.dateLimite) || '-'}</span></span>
                      <span className="hidden sm:block"><Pers nom={t.destNom} /></span>
                      <PastilleStatut tache={t} jour={jour} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <EtatVide icone={ListChecks} accent={COULEUR} texte="Aucune tâche" />}
          </div>
        </Modal>
      )}
    </div>
  )
}

const Cellule = ({ v, c }) => <td className="px-3 py-1.5 font-extrabold" style={{ color: v ? c : '#cbd5e1' }}>{v || '·'}</td>

// Courbes : créées, terminées, échues non finies, démarrage tardif.
function Evolution({ serie }) {
  if (!serie.length) return <p className="py-4 text-sm text-gray-400">Aucune donnée.</p>
  const max = plafond(Math.max(1, ...serie.flatMap((s) => [s.creees, s.terminees, s.echues, s.tardif])))
  const W = Math.max(600, serie.length * 90), H = 240, gauche = 40, droite = 16, haut = 20, bas = 40
  const largeur = W - gauche - droite, hauteur = H - haut - bas
  const pas = serie.length > 1 ? largeur / (serie.length - 1) : largeur
  const x = (i) => gauche + i * pas
  const y = (v) => haut + hauteur - (v / max) * hauteur
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">{LEGENDE.map(([c, l]) => <span key={c} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEURS[c] }} />{l}</span>)}</div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', minHeight: 240, maxWidth: W }} role="img" aria-label="Évolution des tâches dans le temps">
          {[0, 1, 2, 3, 4].map((i) => { const yy = haut + (hauteur * i) / 4; return <g key={i}><line x1={gauche} y1={yy} x2={W - droite} y2={yy} stroke="rgba(148,163,184,0.3)" /><text x={gauche - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="#9aa0a6">{Math.round(max * (1 - i / 4))}</text></g> })}
          {serie.map((s, i) => <text key={s.label} x={x(i)} y={H - bas + 16} textAnchor="middle" fontSize="10" fill="#5f6368">{s.label}</text>)}
          {Object.keys(COULEURS).map((c) => (
            <g key={c}>
              <polyline points={serie.map((s, i) => `${x(i)},${y(s[c])}`).join(' ')} fill="none" stroke={COULEURS[c]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {serie.map((s, i) => <g key={i}><circle cx={x(i)} cy={y(s[c])} r="3.5" fill={COULEURS[c]} stroke="#fff" strokeWidth="1.5" />{s[c] > 0 && <text x={x(i)} y={y(s[c]) - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill={COULEURS[c]}>{s[c]}</text>}</g>)}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
