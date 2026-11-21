// E-TACHES : évaluation par niveau hiérarchique. Les tâches lues par strate d'attribution (PAU, GE, directeurs, responsables de pôle, autres, stagiaires)
// et l'évolution de chaque acteur d'une période calendaire à l'autre. Réservé à la direction générale, aux directeurs et à la RH.
import { useMemo, useState } from 'react'
import { Layers } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import StatCard from '../../shared/ui/StatCard'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { todayStr } from '../../utils/formatters'
import { COL, COULEUR, niveauTaches } from './data'
import { useMoi, useTaches, usePersonnel } from './hooks'
import { NIVEAUX, UNITES, niveauDef, niveauAuto, niveauDe, fenetres, sommeStats, evenementsActivite, creerCalculateur } from './analyse'
import { Tuile, Bento, Delta, DeltaTaux, Spark, GraphiquePeriodes, Pers } from './ui'
import FicheActeur from './FicheActeur'
import { filtrerParPeriode } from './pilotageCalculs'

const HISTORIQUE = 6
const cellTaux = (taux, base) => (!base ? '·' : `${taux}%`)
const teinte = (taux, base) => (!base ? 'text-gray-300' : taux >= 70 ? 'text-green-600' : taux >= 40 ? 'text-amber-600' : 'text-red-600')

export default function ParNiveau() {
  const { role } = useMoi()
  const niveauMoi = niveauTaches(role)
  const { taches } = useTaches()
  const { personnel } = usePersonnel()
  const { data: messages } = useCollection(COL.messages)
  const { data: objectifs } = useCollection(COL.objectifs)
  const { data: rapports } = useCollection(COL.rapports)
  const { data: idees } = useCollection('taches_idees')
  const { data: corrections } = useCollection('taches_niveaux')
  const [unite, setUnite] = useState('week')
  const [onglet, setOnglet] = useState('all')
  const [ouvert, setOuvert] = useState(null)
  const jour = todayStr()
  const peutCorriger = niveauMoi === 'chef' || niveauMoi === 'rh'

  const parUid = useMemo(() => Object.fromEntries(corrections.map((c) => [c.id, c.niveau])), [corrections])
  const wins = useMemo(() => fenetres(unite, HISTORIQUE), [unite])
  const cur = wins[wins.length - 1], prev = wins[wins.length - 2]
  const evenements = useMemo(() => evenementsActivite({ messages, objectifs, rapports, idees }), [messages, objectifs, rapports, idees])
  const calcul = useMemo(() => creerCalculateur(taches, evenements, jour), [taches, evenements, jour])
  const niveauDeLui = (p) => niveauDe(p, parUid)
  const effectifs = useMemo(() => { const m = {}; personnel.forEach((p) => { const n = niveauDe(p, parUid); m[n] = (m[n] || 0) + 1 }); return m }, [personnel, parUid])

  const statsGroupe = (membres, w) => sommeStats(membres.map((p) => calcul(p.uid, w)))
  const dePersonnes = (n) => personnel.filter((p) => niveauDeLui(p) === n)

  if (!['chef', 'dir', 'rh'].includes(niveauMoi)) return <EtatVide icone={Layers} accent={COULEUR} texte="Cette vue est réservée à la direction" />

  async function corriger(p, valeur) {
    try {
      if (valeur === '') await removeItem('taches_niveaux', p.uid, { sansMotif: true })
      else await setItem('taches_niveaux', p.uid, { niveau: Number(valeur), parUid: p.uid })
      toast.success('Niveau mis à jour ✓')
    } catch (e) { toast.error(e?.message || 'Modification impossible') }
  }

  const tousTot = statsGroupe(personnel, cur), tousPrev = statsGroupe(personnel, prev)

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Layers} surtitre="E-TACHES" titre="Évaluation par niveau hiérarchique" sous="Les tâches lues par strate d'attribution, et l'évolution de chaque acteur d'une période à l'autre."
        pied={
          <>
            <label className="flex items-center gap-2 text-xs font-bold text-white/90">Comparer par
              <select value={unite} onChange={(e) => setUnite(e.target.value)} className="rounded-xl border border-white/40 bg-white/20 px-2.5 py-1.5 text-xs font-bold text-white outline-none [&>option]:bg-white [&>option]:text-gray-900">
                {Object.entries(UNITES).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
              </select>
            </label>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/80">{prev.longLabel}</span><span className="text-white/70">→</span><span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold" style={{ color: COULEUR }}>{cur.longLabel}</span>
          </>
        } />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Niveaux">
        <button type="button" role="tab" aria-selected={onglet === 'all'} onClick={() => setOnglet('all')} data-actif={onglet === 'all'} className="puce-verre rounded-full px-4 py-2 text-xs font-bold" style={{ '--puce': COULEUR }}>
          Vue d'ensemble <span className="ml-1 rounded-full bg-black/5 px-1.5 text-[10px]">{personnel.length}</span>
        </button>
        {NIVEAUX.map((L) => (
          <button key={L.n} type="button" role="tab" aria-selected={onglet === L.n} onClick={() => setOnglet(L.n)} data-actif={onglet === L.n} title={`${L.full} : ${L.desc}`} className="puce-verre rounded-full px-4 py-2 text-xs font-bold" style={{ '--puce': L.color }}>
            N{L.n} · {L.label} <span className="ml-1 rounded-full bg-black/5 px-1.5 text-[10px]">{effectifs[L.n] || 0}</span>
          </button>
        ))}
      </div>

      {onglet === 'all' ? (
        <>
          <Bento>
            <StatCard title="Tâches reçues" value={tousTot.recues} sub="confiées pendant la période" icon={Layers} accent="#0284c7" pied={<Delta cur={tousTot.recues} prev={tousPrev.recues} />} />
            <StatCard title="Livrées" value={tousTot.livrees} sub="clôturées pendant la période" icon={Layers} accent="#16a34a" pied={<Delta cur={tousTot.livrees} prev={tousPrev.livrees} />} />
            <StatCard title="Taux de complétion" value={cellTaux(tousTot.taux, tousTot.recues)} sub="sur la charge de la période" icon={Layers} accent={COULEUR} pied={<DeltaTaux cur={tousTot.taux} prev={tousPrev.taux} baseCur={tousTot.recues} basePrev={tousPrev.recues} />} />
            <StatCard title="Ponctualité" value={cellTaux(tousTot.ponctualite, tousTot.livrees)} sub="livraisons dans les délais" icon={Layers} accent="#0891b2" pied={<DeltaTaux cur={tousTot.ponctualite} prev={tousPrev.ponctualite} baseCur={tousTot.livrees} basePrev={tousPrev.livrees} />} />
            <StatCard title="Échéances manquées" value={tousTot.manquees} sub="dates limites non tenues" icon={Layers} accent={tousTot.manquees ? '#dc2626' : '#16a34a'} pied={<Delta cur={tousTot.manquees} prev={tousPrev.manquees} inverse />} />
            <StatCard title="Délai moyen" value={tousTot.delai ? `${tousTot.delai} j` : '-'} sub="de l'attribution à la clôture" icon={Layers} accent="#64748b" pied={tousTot.delai || tousPrev.delai ? <Delta cur={tousTot.delai} prev={tousPrev.delai} unite=" j" inverse /> : null} />
            <StatCard title="Innovation" value={tousTot.innovation} sub={`${tousTot.idees} idée(s) déposée(s)`} icon={Layers} accent="#d97706" pied={<Delta cur={tousTot.innovation} prev={tousPrev.innovation} />} />
            <StatCard title="Réflexion" value={tousTot.reflexion} sub={`${tousTot.traces} contribution(s) écrite(s)`} icon={Layers} accent="#7c3aed" pied={<Delta cur={tousTot.reflexion} prev={tousPrev.reflexion} />} />
          </Bento>

          <Tuile titre="Comparaison des niveaux" icone={Layers} pad="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead><tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><th className="px-4 py-2.5">Niveau</th><th className="px-3 py-2.5">Effectif</th><th className="px-3 py-2.5">Reçues</th><th className="px-3 py-2.5">Livrées</th><th className="px-3 py-2.5">Évolution</th><th className="px-3 py-2.5">Taux</th><th className="px-3 py-2.5">Ponctualité</th><th className="px-3 py-2.5">Manquées</th><th className="px-3 py-2.5">Délai</th><th className="px-3 py-2.5">Innov.</th><th className="px-3 py-2.5">Réflex.</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {NIVEAUX.map((L) => {
                    const membres = dePersonnes(L.n)
                    const c = statsGroupe(membres, cur), p = statsGroupe(membres, prev)
                    const hist = wins.map((w) => statsGroupe(membres, w).livrees)
                    return (
                      <tr key={L.n} onClick={() => setOnglet(L.n)} className="cursor-pointer transition-colors hover:bg-white/70">
                        <td className="px-4 py-2.5 font-extrabold" style={{ color: L.color }}>N{L.n} · {L.label}</td>
                        <td className="px-3 py-2.5">{membres.length}</td>
                        <td className="px-3 py-2.5">{c.recues} <Delta cur={c.recues} prev={p.recues} /></td>
                        <td className="px-3 py-2.5"><strong>{c.livrees}</strong> <Delta cur={c.livrees} prev={p.livrees} /></td>
                        <td className="px-3 py-2.5"><Spark valeurs={hist} couleur={L.color} /></td>
                        <td className={`px-3 py-2.5 font-extrabold ${teinte(c.taux, c.recues)}`}>{cellTaux(c.taux, c.recues)} {c.recues && p.recues ? <Delta cur={c.taux} prev={p.taux} unite=" pts" points /> : null}</td>
                        <td className="px-3 py-2.5">{c.livrees ? `${c.ponctualite}%` : '·'}</td>
                        <td className="px-3 py-2.5">{c.manquees ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-700">{c.manquees}</span> : '-'}</td>
                        <td className="px-3 py-2.5">{c.delai ? `${c.delai} j` : '-'}</td>
                        <td className="px-3 py-2.5">{c.innovation || '·'} {c.innovation || p.innovation ? <Delta cur={c.innovation} prev={p.innovation} /> : null}</td>
                        <td className="px-3 py-2.5">{c.reflexion || '·'} {c.reflexion || p.reflexion ? <Delta cur={c.reflexion} prev={p.reflexion} /> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tuile>

          <Tuile titre={`Évolution de l'entreprise sur ${HISTORIQUE} ${UNITES[unite].label.toLowerCase()}s`} icone={Layers}>
            {(() => { const h = wins.map((w) => statsGroupe(personnel, w)); return <GraphiquePeriodes fenetres={wins} series={[{ label: 'Reçues', couleur: '#1a73e8', valeurs: h.map((s) => s.recues) }, { label: 'Livrées', couleur: '#137333', valeurs: h.map((s) => s.livrees) }, { label: 'Échéances manquées', couleur: '#c5221f', valeurs: h.map((s) => s.manquees) }] }  /> })()}
          </Tuile>
        </>
      ) : (
        <Detail n={onglet} membres={dePersonnes(onglet)} wins={wins} cur={cur} prev={prev} calcul={calcul} statsGroupe={statsGroupe} peutCorriger={peutCorriger} corriger={corriger} corrections={parUid} onOuvrir={setOuvert} />
      )}

      <Methode />
      {ouvert && <FicheActeur acteur={ouvert} taches={filtrerParPeriode(taches, { mode: 'custom', from: cur.from, to: cur.to })} onClose={() => setOuvert(null)} />}
    </div>
  )
}

function Detail({ n, membres, wins, cur, prev, calcul, statsGroupe, peutCorriger, corriger, corrections, onOuvrir }) {
  const L = niveauDef(n)
  if (!membres.length) return <><div className="rounded-3xl p-4 text-white" style={{ background: L.color }}><h2 className="font-extrabold">Niveau {L.n} : {L.full}</h2><p className="text-sm text-white/85">{L.desc}</p></div><EtatVide icone={Layers} accent={L.color} texte="Personne à ce niveau pour l'instant" /></>
  const c = statsGroupe(membres, cur), p = statsGroupe(membres, prev)
  const hist = wins.map((w) => statsGroupe(membres, w))
  const acteurs = membres.map((m) => ({ m, s: calcul(m.uid, cur), pv: calcul(m.uid, prev) })).sort((a, b) => (b.s.livrees - a.s.livrees) || (b.s.recues - a.s.recues) || a.m.nom.localeCompare(b.m.nom, 'fr'))
  return (
    <>
      <div className="rounded-3xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${L.color}, ${L.color}bb)` }}>
        <h2 className="text-base font-extrabold">Niveau {L.n} : {L.full}</h2>
        <p className="text-sm text-white/85">{L.desc} · {membres.length} personne{membres.length > 1 ? 's' : ''} · {cur.longLabel}</p>
      </div>
      <Bento>
        <StatCard title="Reçues" value={c.recues} icon={Layers} accent={L.color} pied={<Delta cur={c.recues} prev={p.recues} />} />
        <StatCard title="Livrées" value={c.livrees} icon={Layers} accent="#16a34a" pied={<Delta cur={c.livrees} prev={p.livrees} />} />
        <StatCard title="Taux" value={cellTaux(c.taux, c.recues)} sub="de la charge terminée" icon={Layers} accent={L.color} pied={<DeltaTaux cur={c.taux} prev={p.taux} baseCur={c.recues} basePrev={p.recues} />} />
        <StatCard title="Ponctualité" value={cellTaux(c.ponctualite, c.livrees)} sub="livrées dans les délais" icon={Layers} accent="#0891b2" pied={<DeltaTaux cur={c.ponctualite} prev={p.ponctualite} baseCur={c.livrees} basePrev={p.livrees} />} />
        <StatCard title="Manquées" value={c.manquees} icon={Layers} accent={c.manquees ? '#dc2626' : '#16a34a'} pied={<Delta cur={c.manquees} prev={p.manquees} inverse />} />
        <StatCard title="Pilotage" value={c.pilotees} sub="tâches confiées à d'autres" icon={Layers} accent="#64748b" pied={<Delta cur={c.pilotees} prev={p.pilotees} />} />
        <StatCard title="Innovation" value={c.innovation} sub={`${c.idees} idée(s)`} icon={Layers} accent="#d97706" pied={<Delta cur={c.innovation} prev={p.innovation} />} />
        <StatCard title="Réflexion" value={c.reflexion} sub={`${c.traces} contribution(s)`} icon={Layers} accent="#7c3aed" pied={<Delta cur={c.reflexion} prev={p.reflexion} />} />
      </Bento>
      <Tuile titre={`Évolution du niveau ${L.n}`} icone={Layers}>
        <GraphiquePeriodes fenetres={wins} series={[{ label: 'Reçues', couleur: '#1a73e8', valeurs: hist.map((s) => s.recues) }, { label: 'Livrées', couleur: L.color, valeurs: hist.map((s) => s.livrees) }, { label: 'Manquées', couleur: '#c5221f', valeurs: hist.map((s) => s.manquees) }]} />
      </Tuile>
      <Tuile titre={`Acteurs du niveau ${L.n} (${membres.length})`} icone={Layers} pad="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead><tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><th className="px-4 py-2.5">Acteur</th><th className="px-3 py-2.5">Reçues</th><th className="px-3 py-2.5">Livrées</th><th className="px-3 py-2.5">Courbe</th><th className="px-3 py-2.5">Taux</th><th className="px-3 py-2.5">Ponctualité</th><th className="px-3 py-2.5">Manquées</th><th className="px-3 py-2.5">Délai</th><th className="px-3 py-2.5">Pilotage</th><th className="px-3 py-2.5">Innov.</th><th className="px-3 py-2.5">Réflex.</th>{peutCorriger && <th className="px-3 py-2.5">Niveau</th>}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {acteurs.map(({ m, s, pv }) => (
                <tr key={m.uid}>
                  <td className="px-4 py-2.5"><button type="button" onClick={() => onOuvrir(m)} className="text-left"><span className="block font-bold text-violet-700 underline-offset-2 hover:underline">{m.nom}</span><span className="block text-xs text-gray-500">{[m.poste, m.secteur].filter(Boolean).join(' · ') || '-'}</span></button></td>
                  <td className="px-3 py-2.5">{s.recues} <Delta cur={s.recues} prev={pv.recues} /></td>
                  <td className="px-3 py-2.5"><strong>{s.livrees}</strong> <Delta cur={s.livrees} prev={pv.livrees} /></td>
                  <td className="px-3 py-2.5"><Spark valeurs={wins.map((w) => calcul(m.uid, w).livrees)} couleur={L.color} /></td>
                  <td className={`px-3 py-2.5 font-extrabold ${teinte(s.taux, s.recues)}`}>{cellTaux(s.taux, s.recues)}</td>
                  <td className="px-3 py-2.5">{s.livrees ? `${s.ponctualite}%` : '·'}</td>
                  <td className="px-3 py-2.5">{s.manquees ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-700">{s.manquees}</span> : '-'}</td>
                  <td className="px-3 py-2.5">{s.delai ? `${s.delai} j` : '-'}</td>
                  <td className="px-3 py-2.5">{s.pilotees || '-'}</td>
                  <td className="px-3 py-2.5">{s.innovation || '·'}</td>
                  <td className="px-3 py-2.5">{s.reflexion || '·'}</td>
                  {peutCorriger && (
                    <td className="px-3 py-2.5">
                      <select value={corrections[m.uid] || ''} onChange={(e) => corriger(m, e.target.value)} aria-label={`Niveau de ${m.nom}`} title="Corriger le niveau ; Auto revient à la déduction depuis le rôle et le poste" className="input-base !w-auto !rounded-full !py-1 text-xs font-bold">
                        <option value="">Auto (N{niveauAuto(m)})</option>
                        {NIVEAUX.map((x) => <option key={x.n} value={x.n}>N{x.n} · {x.label}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tuile>
    </>
  )
}

function Methode() {
  return (
    <p className="rounded-2xl border border-white/70 bg-white/50 px-4 py-3 text-xs leading-relaxed text-gray-500 backdrop-blur-md">
      <strong>Comment ces chiffres sont calculés.</strong> <strong>Reçues</strong> : tâches confiées à la personne pendant la période. <strong>Livrées</strong> : tâches qu'elle a clôturées pendant la période. <strong>Taux</strong> : part des reçues déjà terminées.
      <strong> Ponctualité</strong> : part des livraisons faites au plus tard à l'échéance. <strong>Manquées</strong> : échéances tombées dans la période sans que la tâche soit terminée. <strong>Pilotage</strong> : tâches confiées à d'autres.
      <strong> Innovation</strong> = 4 × idée retenue + 2 × idée à l'étude + 1 × idée nouvelle ou écartée. <strong>Réflexion</strong> = 4 × rapport + 2 × objectif posé + 1 × commentaire (tâche, idée, objectif).
      Les périodes sont calendaires (semaine du lundi au dimanche, mois, trimestre, semestre, année civile) : la période en cours est forcément incomplète, d'où sa teinte grisée sur les courbes.
      Le niveau est déduit du rôle et du poste ; la direction générale et la RH peuvent le corriger personne par personne.
    </p>
  )
}
