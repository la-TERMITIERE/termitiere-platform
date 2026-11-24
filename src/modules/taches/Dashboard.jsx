// E-TACHES : tableau de bord en tuiles « bento » (verre dépoli). Par défaut mes tâches ; la direction peut passer à toute l'entreprise.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TrendingUp, ListChecks, Plus, AlertTriangle, PlayCircle, CheckCircle2, Clock, Target, Repeat, PieChart, Users, MessageSquare, ArrowRight, Flame } from 'lucide-react'
import BandeauVolet, { BoutonBande, OngletsBande } from '../../shared/ui/BandeauVolet'
import StatCard from '../../shared/ui/StatCard'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr, formatNumber } from '../../utils/formatters'
import { COL, COULEUR, COULEUR_STATUT, estDestinataire, estMembre, estArchivee, enRetard, aDemarrer, libelleEcheance, joursAvant, trierParEcheance, voitToutesLesTaches, voitToutesLesEquipes } from './data'
import { useMoi, useTaches } from './hooks'
import { Bento, Tuile, Anneau, Barre, PastillePriorite, Pers, PointStatut, Delta, DeltaTaux, GraphiquePeriodes } from './ui'
import { UNITES, fenetres, creerCalculateur, evenementsActivite } from './analyse'
import { actifs } from './outils'

export default function Dashboard() {
  const { moi, nom, role } = useMoi()
  const navigate = useNavigate()
  const { taches } = useTaches()
  const { data: objectifs } = useCollection(COL.objectifs)
  const { data: routines } = useCollection(COL.routines)
  const { data: suivi } = useCollection(COL.suivi)
  const { data: messages } = useCollection(COL.messages)
  const [portee, setPortee] = useState('moi')
  const [unite, setUnite] = useState('week')
  const { data: rapports } = useCollection(COL.rapports)
  const { data: idees } = useCollection('taches_idees')
  const jour = todayStr()
  const direction = voitToutesLesTaches(role)

  const vivantes = useMemo(() => taches.filter((t) => !estArchivee(t, jour)), [taches, jour])
  const miennes = useMemo(() => vivantes.filter((t) => estDestinataire(t, moi) || estMembre(t, moi)), [vivantes, moi])
  const base = portee === 'tous' && direction ? vivantes : miennes

  const k = useMemo(() => ({
    afaire: base.filter((t) => t.statut === 'À faire' && !enRetard(t, jour)).length,
    encours: base.filter((t) => t.statut === 'En cours' && !enRetard(t, jour)).length,
    retard: base.filter((t) => enRetard(t, jour)).length,
    finies: base.filter((t) => t.statut === 'Terminé').length
  }), [base, jour])
  const total = base.length
  const taux = total ? Math.round((k.finies / total) * 100) : 0

  // À traiter : en retard d'abord, puis à démarrer, puis les échéances les plus proches.
  const atraiter = useMemo(() => base
    .filter((t) => t.statut !== 'Terminé')
    .map((t) => ({ t, score: enRetard(t, jour) ? 0 : aDemarrer(t, jour) ? 1 : 2 }))
    .sort((a, b) => a.score - b.score || trierParEcheance(a.t, b.t))
    .slice(0, 6).map((x) => x.t), [base, jour])

  const repartition = [['À faire', k.afaire], ['En cours', k.encours], ['En retard', k.retard], ['Terminé', k.finies]]

  // Routine du jour (la mienne).
  const mesRoutines = actifs(routines).filter((r) => r.uid === moi)
  const faites = mesRoutines.filter((r) => suivi.some((s) => s.id === `${r.id}_${jour}` && s.fait)).length

  // Objectifs en cours qui me concernent (ou toute l'équipe pour la direction).
  const mesObjectifs = useMemo(() => objectifs
    .filter((o) => o.statut === 'En cours' && (voitToutesLesEquipes(role) && portee === 'tous' ? true : o.type === 'perso' ? o.cibleUid === moi : voitToutesLesEquipes(role)))
    .sort((a, b) => (a.dateFin || '9999') < (b.dateFin || '9999') ? -1 : 1).slice(0, 3), [objectifs, role, moi, portee])

  // Charge par personne (direction) ou dernière discussion (autres).
  const charge = useMemo(() => {
    const m = {}
    vivantes.filter((t) => t.statut !== 'Terminé').forEach((t) => { const c = m[t.destUid] || (m[t.destUid] = { nom: t.destNom, ouvertes: 0, retard: 0 }); c.ouvertes++; if (enRetard(t, jour)) c.retard++ })
    return Object.values(m).sort((a, b) => b.ouvertes - a.ouvertes).slice(0, 6)
  }, [vivantes, jour])
  const ids = useMemo(() => new Set(taches.map((t) => t.id)), [taches])
  const discussions = useMemo(() => messages.filter((m) => ids.has(m.tacheId)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5), [messages, ids])
  const titreDe = (id) => taches.find((t) => t.id === id)?.titre || 'Tâche'

  // Premier mot du nom, sans la civilité (M., Mme, Mlle, Dr…).
  // Mes tâches confiées à d'autres.
  const confiees = useMemo(() => vivantes.filter((t) => t.parUid === moi && t.destUid !== moi), [vivantes, moi])
  const confieesFinies = confiees.filter((t) => t.statut === 'Terminé').length

  // Mon évolution : moi sur la période calendaire en cours comparée à la précédente.
  const wins = useMemo(() => fenetres(unite, 6), [unite])
  const evenements = useMemo(() => evenementsActivite({ messages, objectifs, rapports, idees }), [messages, objectifs, rapports, idees])
  const calcul = useMemo(() => creerCalculateur(taches, evenements, jour), [taches, evenements, jour])
  const cur = wins[wins.length - 1], prev = wins[wins.length - 2]
  const moiCur = calcul(moi, cur), moiPrev = calcul(moi, prev)
  const histo = wins.map((w) => calcul(moi, w))

  const prenom = (nom || '').split(/\s+/).filter((m) => m && !/^(m|mr|mme|mlle|dr|pr)\.?$/i.test(m))[0] || ''
  const heure = new Date().getHours()
  const salut = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={ListChecks} surtitre="E-TACHES" titre={`${salut}${prenom ? `, ${prenom}` : ''}`}
        sous={k.retard ? `${k.retard} tâche${k.retard > 1 ? 's' : ''} en retard à traiter en priorité.` : total ? 'Tout est à jour, bon travail.' : 'Aucune tâche pour le moment.'}>
        {direction && <OngletsBande options={[{ id: 'moi', label: 'Mes tâches' }, { id: 'tous', label: 'Toute l\'entreprise' }]} valeur={portee} onChange={setPortee} />}
        <BoutonBande icone={Plus} anime onClick={() => navigate('/taches/taches?nouvelle=1')}>Nouvelle tâche</BoutonBande>
      </BandeauVolet>

      {miennes.some((t) => enRetard(t, jour)) && (
        <Link to="/taches/taches?statut=En retard" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-800 backdrop-blur-md">
          <AlertTriangle size={18} className="shrink-0" /><span className="flex-1"><strong>{miennes.filter((t) => enRetard(t, jour)).length}</strong> tâche{miennes.filter((t) => enRetard(t, jour)).length > 1 ? 's' : ''} en retard. Voir les tâches</span><ArrowRight size={15} />
        </Link>
      )}
      {miennes.some((t) => aDemarrer(t, jour)) && (
        <Link to="/taches/taches?statut=À faire" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-800 backdrop-blur-md">
          <Clock size={18} className="shrink-0" /><span className="flex-1"><strong>{miennes.filter((t) => aDemarrer(t, jour)).length}</strong> tâche{miennes.filter((t) => aDemarrer(t, jour)).length > 1 ? 's' : ''} à démarrer : la date de début est arrivée</span><ArrowRight size={15} />
        </Link>
      )}

      <Bento>
        <StatCard title="À faire" value={formatNumber(k.afaire)} icon={Clock} accent={COULEUR_STATUT['À faire']} onClick={() => navigate('/taches/taches?statut=À faire')} />
        <StatCard title="En cours" value={formatNumber(k.encours)} icon={PlayCircle} accent={COULEUR_STATUT['En cours']} onClick={() => navigate('/taches/taches?statut=En cours')} />
        <StatCard title="En retard" value={formatNumber(k.retard)} icon={AlertTriangle} accent={COULEUR_STATUT['En retard']} onClick={() => navigate('/taches/taches?statut=En retard')} />
        <StatCard title="Terminées" value={formatNumber(k.finies)} icon={CheckCircle2} accent={COULEUR_STATUT['Terminé']} onClick={() => navigate('/taches/taches?statut=Terminé')} />

        <Tuile titre="À traiter maintenant" icone={Flame} span="sm:col-span-2 lg:row-span-2" action={<Link to="/taches/taches" className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: COULEUR }}>Tout voir <ArrowRight size={13} /></Link>}>
          {atraiter.length ? (
            <ul className="divide-y divide-black/5">
              {atraiter.map((t) => {
                const retard = enRetard(t, jour)
                return (
                  <li key={t.id}>
                    <Link to={`/taches/taches?t=${t.id}`} className="flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-white/60">
                      <PointStatut statut={retard ? 'En retard' : t.statut} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-gray-800 dark:text-gray-100">{t.titre}</span>
                        <span className={`block truncate text-xs ${retard ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{libelleEcheance(t, jour)}{portee === 'tous' && t.destNom ? ` · ${t.destNom}` : ''}</span>
                      </span>
                      <PastillePriorite priorite={t.priorite} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <EtatVide icone={CheckCircle2} texte="Rien d'urgent à traiter" accent={COULEUR} />}
        </Tuile>

        <Tuile titre="Réalisation" icone={Target} className="flex flex-col items-center">
          <div className="flex flex-col items-center gap-2 py-1">
            <Anneau valeur={taux} />
            <p className="text-center text-xs text-gray-500">{k.finies} terminée{k.finies > 1 ? 's' : ''} sur {total}</p>
          </div>
        </Tuile>

        <Tuile titre="Routine du jour" icone={Repeat} action={<Link to="/taches/routine" className="text-xs font-bold" style={{ color: COULEUR }}>Ouvrir</Link>}>
          {mesRoutines.length ? (
            <div className="space-y-2">
              <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{faites}<span className="text-base font-bold text-gray-400"> / {mesRoutines.length}</span></p>
              <Barre valeur={(faites / mesRoutines.length) * 100} couleur="#16a34a" />
              <p className="text-xs text-gray-500">{faites === mesRoutines.length ? 'Routine terminée, bravo.' : `${mesRoutines.length - faites} à cocher aujourd'hui`}</p>
            </div>
          ) : <p className="py-3 text-sm text-gray-400">Aucune routine définie.</p>}
        </Tuile>

        <Tuile titre="Répartition" icone={PieChart} span="sm:col-span-2">
          {total ? (
            <div className="space-y-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/5">
                {repartition.map(([s, n]) => n > 0 && <div key={s} title={`${s} : ${n}`} style={{ width: `${(n / total) * 100}%`, background: COULEUR_STATUT[s] }} />)}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                {repartition.map(([s, n]) => (
                  <div key={s} className="flex items-center gap-1.5 text-xs"><PointStatut statut={s} /><span className="font-semibold text-gray-600 dark:text-gray-300">{s}</span><span className="ml-auto font-extrabold text-gray-800 dark:text-gray-100">{n}</span></div>
                ))}
              </div>
            </div>
          ) : <p className="py-3 text-sm text-gray-400">Aucune tâche à répartir.</p>}
        </Tuile>

        <Tuile titre="Objectifs en cours" icone={Target} span="sm:col-span-2" action={<Link to="/taches/objectifs" className="text-xs font-bold" style={{ color: COULEUR }}>Voir</Link>}>
          {mesObjectifs.length ? (
            <ul className="space-y-3">
              {mesObjectifs.map((o) => {
                const reste = joursAvant(o.dateFin, jour)
                return (
                  <li key={o.id} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{o.titre}</span><span className="shrink-0 text-xs font-extrabold" style={{ color: COULEUR }}>{o.progression || 0}%</span></div>
                    <Barre valeur={o.progression} />
                    {reste !== null && <p className="text-[11px] text-gray-400">{reste < 0 ? `Échu depuis ${-reste} j` : reste === 0 ? "Se termine aujourd'hui" : `${reste} j restants`}</p>}
                  </li>
                )
              })}
            </ul>
          ) : <p className="py-3 text-sm text-gray-400">Aucun objectif en cours.</p>}
        </Tuile>

        {direction ? (
          <Tuile titre="Charge par personne" icone={Users} span="sm:col-span-2">
            {charge.length ? (
              <ul className="space-y-2.5">
                {charge.map((c) => (
                  <li key={c.nom} className="flex items-center gap-3"><Pers nom={c.nom} /><span className="ml-auto flex w-40 shrink-0 items-center gap-2"><Barre valeur={(c.ouvertes / Math.max(1, charge[0].ouvertes)) * 100} couleur={c.retard ? COULEUR_STATUT['En retard'] : COULEUR} /><span className="w-8 text-right text-xs font-extrabold text-gray-700 dark:text-gray-200">{c.ouvertes}</span></span></li>
                ))}
              </ul>
            ) : <p className="py-3 text-sm text-gray-400">Aucune tâche ouverte.</p>}
          </Tuile>
        ) : (
          <Tuile titre="Dernières discussions" icone={MessageSquare} span="sm:col-span-2">
            {discussions.length ? (
              <ul className="space-y-2">
                {discussions.map((m) => (
                  <li key={m.id}><Link to={`/taches/taches?t=${m.tacheId}`} className="block rounded-xl px-1 py-1 hover:bg-white/60"><span className="block truncate text-xs font-bold text-gray-700 dark:text-gray-200">{titreDe(m.tacheId)}</span><span className="block truncate text-xs text-gray-500">{m.nom} : {m.texte}</span></Link></li>
                ))}
              </ul>
            ) : <p className="py-3 text-sm text-gray-400">Aucune discussion récente.</p>}
          </Tuile>
        )}

        {confiees.length > 0 && (
          <Tuile titre="Confiées par moi" icone={Users} span="sm:col-span-2">
            <div className="flex items-center gap-4">
              <Anneau valeur={confiees.length ? (confieesFinies * 100) / confiees.length : 0} taille={76} epaisseur={9} couleur="#16a34a" />
              <p className="text-sm text-gray-600"><strong className="text-gray-800">{confiees.length}</strong> tâche{confiees.length > 1 ? 's' : ''} confiée{confiees.length > 1 ? 's' : ''} à d'autres, dont <strong className="text-gray-800">{confieesFinies}</strong> terminée{confieesFinies > 1 ? 's' : ''}{confiees.filter((t) => enRetard(t, jour)).length > 0 && <span className="font-semibold text-red-600"> et {confiees.filter((t) => enRetard(t, jour)).length} en retard</span>}.</p>
            </div>
          </Tuile>
        )}

        <Tuile titre="Mon évolution" icone={TrendingUp} span="sm:col-span-2 lg:col-span-4"
          action={
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500">Comparer par
              <select value={unite} onChange={(e) => setUnite(e.target.value)} className="input-base !w-auto !rounded-full !py-1 text-xs font-bold">{Object.entries(UNITES).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}</select>
            </label>
          }>
          <p className="mb-3 text-xs text-gray-500">{prev.longLabel} → <strong style={{ color: COULEUR }}>{cur.longLabel}</strong></p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Reçues', moiCur.recues, <Delta cur={moiCur.recues} prev={moiPrev.recues} />],
              ['Livrées', moiCur.livrees, <Delta cur={moiCur.livrees} prev={moiPrev.livrees} />],
              ['Taux', moiCur.recues ? `${moiCur.taux}%` : '-', <DeltaTaux cur={moiCur.taux} prev={moiPrev.taux} baseCur={moiCur.recues} basePrev={moiPrev.recues} />],
              ['Ponctualité', moiCur.livrees ? `${moiCur.ponctualite}%` : '-', <DeltaTaux cur={moiCur.ponctualite} prev={moiPrev.ponctualite} baseCur={moiCur.livrees} basePrev={moiPrev.livrees} />],
              ['Manquées', moiCur.manquees, <Delta cur={moiCur.manquees} prev={moiPrev.manquees} inverse />],
              ['Réflexion', moiCur.reflexion, <Delta cur={moiCur.reflexion} prev={moiPrev.reflexion} />]
            ].map(([l, v, d]) => (
              <div key={l} className="rounded-2xl bg-white/60 px-3 py-2.5"><p className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{l}</p><p className="text-2xl font-black text-gray-800">{v}</p><p className="min-h-[1rem]">{d}</p></div>
            ))}
          </div>
          <div className="mt-4"><GraphiquePeriodes fenetres={wins} series={[{ label: 'Reçues', couleur: '#1a73e8', valeurs: histo.map((s) => s.recues) }, { label: 'Livrées', couleur: '#137333', valeurs: histo.map((s) => s.livrees) }, { label: 'Manquées', couleur: '#c5221f', valeurs: histo.map((s) => s.manquees) }]} /></div>
        </Tuile>
      </Bento>
    </div>
  )
}
