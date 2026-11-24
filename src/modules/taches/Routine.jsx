// E-TACHES : routine journalière. Chacun coche ses tâches récurrentes du jour (la liste repart vierge chaque matin) et peut les gérer ; l'encadrement suit
// l'équipe sur une période (taux du jour et de la période, détail jour par jour hors dimanches et jours fériés) et tient la liste des jours fériés.
import { useMemo, useState } from 'react'
import { Repeat, Plus, X, CheckCircle2, Users, Settings2, CalendarOff, Pencil, Trash2, ChevronDown, Clock3 } from 'lucide-react'
import BandeauVolet, { OngletsBande, BoutonBande } from '../../shared/ui/BandeauVolet'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Input from '../../shared/forms/Input'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { toast } from '../../core/notifications'
import { glassModalProps } from '../../utils/color'
import { todayStr, addDays, formatDateShort, formatNumber } from '../../utils/formatters'
import { COL, COULEUR, voitToutesLesEquipes, niveauTaches } from './data'
import { actifs } from './outils'
import { ajouterRoutine, retirerRoutine, modifierRoutine, cocherRoutine, ajouterFerie, retirerFerie } from './actions'
import { useMoi, usePersonnel } from './hooks'
import { usePeriode } from './Periode'
import { bornesPilotage } from './pilotageCalculs'
import { suiviEquipe, detailPersonne } from './routineCalculs'
import { Tuile, Bento, Barre, Anneau, Pers } from './ui'
import StatCard from '../../shared/ui/StatCard'

const NB_JOURS = 14
const JOURS_COURTS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const teinte = (t) => (t == null ? '#9ca3af' : t >= 70 ? '#16a34a' : t >= 40 ? '#d97706' : '#dc2626')

export default function Routine() {
  const { moi, nom, role } = useMoi()
  const equipe = voitToutesLesEquipes(role)
  const { personnel } = usePersonnel()
  const { data: routines } = useCollection(COL.routines)
  const { data: suivi } = useCollection(COL.suivi)
  const { data: feries } = useCollection(COL.feries)
  const [mode, setMode] = useState('mine')
  const [choix, setChoix] = useState(moi)
  const [gerer, setGerer] = useState(false)
  const [joursFeries, setJoursFeries] = useState(false)
  const [detail, setDetail] = useState(null)
  const { periode, bande } = usePeriode('week')
  const jour = todayStr()
  const cible = equipe ? choix : moi
  const personne = personnel.find((p) => p.uid === cible) || { uid: moi, nom }

  const faits = useMemo(() => new Set(suivi.filter((s) => s.fait).map((s) => s.id)), [suivi])
  const heures = useMemo(() => Object.fromEntries(suivi.filter((s) => s.fait && s.heure).map((s) => [s.id, s.heure])), [suivi])
  const vivantes = useMemo(() => actifs(routines), [routines])
  const miennes = vivantes.filter((r) => r.uid === cible)
  const jours = useMemo(() => Array.from({ length: NB_JOURS }, (_, i) => addDays(jour, i - (NB_JOURS - 1))), [jour])
  const faitesAujourdhui = miennes.filter((r) => faits.has(`${r.id}_${jour}`)).length
  const pct = miennes.length ? (faitesAujourdhui / miennes.length) * 100 : 0
  const cocher = (r) => cocherRoutine(r, jour, !faits.has(`${r.id}_${jour}`), { uid: moi, nom }).catch((err) => toast.error(err?.message || 'Action impossible'))

  // Suivi de l'équipe sur la période choisie.
  const bornes = bornesPilotage(periode)
  const debut = bornes.from || jour, fin = bornes.to || jour
  const equipeCalcul = useMemo(() => suiviEquipe({ personnel, routines: vivantes, suivi, from: debut, to: fin, feries, jour }), [personnel, vivantes, suivi, debut, fin, feries, jour])
  const suivies = equipeCalcul.lignes.filter((l) => l.nbRoutines > 0)
  const moyenne = suivies.length ? Math.round(suivies.reduce((s, l) => s + (l.tauxAujourdhui || 0), 0) / suivies.length) : 0
  const complets = suivies.filter((l) => l.tauxAujourdhui === 100).length
  const rienFait = suivies.filter((l) => l.faitAujourdhui === 0).length
  const peutFeries = ['chef', 'rh'].includes(niveauTaches(role))

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Repeat} surtitre="E-TACHES" titre="Routine journalière"
        sous={mode === 'equipe' ? `Suivi de l'équipe du ${formatDateShort(debut)} au ${formatDateShort(fin)} · ${equipeCalcul.joursTravailles} jour${equipeCalcul.joursTravailles > 1 ? 's' : ''} travaillé${equipeCalcul.joursTravailles > 1 ? 's' : ''} (hors dimanches et jours fériés)` : 'Vos tâches récurrentes du jour : cochez-les au fur et à mesure, la liste repart vierge chaque matin.'}
        pied={mode === 'equipe' ? bande : null}>
        {equipe && <OngletsBande options={[{ id: 'mine', label: 'Ma routine' }, { id: 'equipe', label: 'Suivi de l\'équipe' }]} valeur={mode} onChange={setMode} />}
        {mode === 'mine' && equipe && (
          <select value={cible} onChange={(e) => setChoix(e.target.value)} aria-label="Personne" className="rounded-full border border-white/40 bg-white/15 px-3 py-2 text-xs font-bold text-white outline-none [&>option]:text-gray-800">
            <option value={moi}>Ma routine</option>
            {personnel.filter((p) => p.uid !== moi).map((p) => <option key={p.uid} value={p.uid}>{p.nom}</option>)}
          </select>
        )}
        {mode === 'equipe' && peutFeries && <BoutonBande icone={CalendarOff} plein={false} onClick={() => setJoursFeries(true)}>Jours fériés</BoutonBande>}
        {mode === 'mine' && <BoutonBande icone={Settings2} onClick={() => setGerer(true)}>{cible === moi ? 'Gérer mes tâches' : `Gérer sa routine`}</BoutonBande>}
      </BandeauVolet>

      {mode === 'mine' ? (
        <Bento>
          <Tuile titre={cible === moi ? 'Aujourd\'hui' : `Aujourd'hui : ${personne.nom}`} icone={CheckCircle2} accent="#16a34a" span="sm:col-span-2 lg:row-span-2">
            {miennes.length ? (
              <>
                <div className="mb-3 flex items-center gap-4">
                  <Anneau valeur={pct} couleur="#16a34a" taille={84} epaisseur={9} texte={`${faitesAujourdhui}/${miennes.length}`} />
                  <p className="text-sm text-gray-500">{faitesAujourdhui === miennes.length ? 'Routine terminée, bravo.' : `${miennes.length - faitesAujourdhui} restante${miennes.length - faitesAujourdhui > 1 ? 's' : ''}.`}</p>
                </div>
                <ul className="space-y-1.5">
                  {miennes.map((r) => {
                    const fait = faits.has(`${r.id}_${jour}`)
                    return (
                      <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5">
                        <input type="checkbox" checked={fait} onChange={() => cocher(r)} aria-label={r.libelle} className="h-5 w-5 shrink-0 rounded accent-green-600" />
                        <span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${fait ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{r.libelle}</span>{r.description && <span className="block text-xs text-gray-500">{r.description}</span>}</span>
                        {fait && heures[`${r.id}_${jour}`] && <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gray-400"><Clock3 size={11} aria-hidden="true" />{heures[`${r.id}_${jour}`]}</span>}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <EtatVide icone={Repeat} accent={COULEUR} texte="Aucune routine définie. Définissez-la une fois, elle réapparaîtra chaque jour." />
                <Button onClick={() => setGerer(true)} style={{ backgroundColor: COULEUR }}><Settings2 size={15} /> Configurer la routine</Button>
              </div>
            )}
          </Tuile>

          <Tuile titre={`Historique, ${NB_JOURS} derniers jours`} icone={Repeat} span="sm:col-span-2 lg:col-span-2">
            {miennes.length ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1 pl-[7.5rem]" aria-hidden="true">
                  {jours.map((j) => <span key={j} className={`flex-1 text-center text-[10px] font-bold ${j === jour ? 'text-violet-700' : 'text-gray-400'}`}>{JOURS_COURTS[new Date(j + 'T00:00:00').getDay()]}</span>)}
                </div>
                {miennes.map((r) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <span className="w-[7rem] shrink-0 truncate pr-2 text-xs font-semibold text-gray-600" title={r.libelle}>{r.libelle}</span>
                    {jours.map((j) => {
                      const fait = faits.has(`${r.id}_${j}`)
                      const ferie = feries.some((f) => f.id === j), dim = new Date(j + 'T00:00:00').getDay() === 0
                      return <span key={j} title={`${j.split('-').reverse().join('/')} : ${dim ? 'dimanche' : ferie ? 'férié' : fait ? 'fait' : 'non fait'}`} className="aspect-square flex-1 rounded-md" style={{ background: fait ? '#16a34a' : dim || ferie ? 'rgba(148,163,184,0.1)' : j > jour ? 'transparent' : 'rgba(148,163,184,0.25)', outline: j === jour ? `2px solid ${COULEUR}` : 'none' }} />
                    })}
                  </div>
                ))}
              </div>
            ) : <p className="py-3 text-sm text-gray-400">Pas encore d'historique.</p>}
          </Tuile>
        </Bento>
      ) : (
        <>
          <Bento>
            <StatCard title="Collaborateurs suivis" value={formatNumber(suivies.length)} icon={Users} accent={COULEUR} />
            <StatCard title="Taux moyen aujourd'hui" value={`${moyenne}%`} icon={CheckCircle2} accent={teinte(moyenne)} />
            <StatCard title="Routine complète" value={formatNumber(complets)} icon={CheckCircle2} accent="#16a34a" />
            <StatCard title="Rien fait aujourd'hui" value={formatNumber(rienFait)} icon={Repeat} accent={rienFait ? '#dc2626' : '#16a34a'} />
          </Bento>
          <Tuile titre={`Suivi par collaborateur (${equipeCalcul.lignes.length})`} icone={Users} pad="p-0">
            {equipeCalcul.lignes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead><tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><th className="px-4 py-2.5">Collaborateur</th><th className="px-3 py-2.5">Département</th><th className="px-3 py-2.5">Tâches</th><th className="px-3 py-2.5">Aujourd'hui</th><th className="px-3 py-2.5">Sur la période</th><th className="px-2" /></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {equipeCalcul.lignes.map((l) => l.nbRoutines ? (
                      <tr key={l.uid} onClick={() => setDetail(l)} className="cursor-pointer transition-colors hover:bg-white/70" title="Voir le détail jour par jour">
                        <td className="px-4 py-2.5 font-bold text-gray-800">{l.nom}</td>
                        <td className="px-3 py-2.5 text-gray-500">{l.secteur || '-'}</td>
                        <td className="px-3 py-2.5">{l.nbRoutines}</td>
                        <td className="w-48 px-3 py-2.5"><Jauge fait={l.faitAujourdhui} attendu={l.nbRoutines} taux={l.tauxAujourdhui} /></td>
                        <td className="w-48 px-3 py-2.5"><Jauge fait={l.fait} attendu={l.attendu} taux={l.tauxPeriode} /></td>
                        <td className="px-2 text-gray-300">›</td>
                      </tr>
                    ) : (
                      <tr key={l.uid} className="opacity-60"><td className="px-4 py-2.5 text-gray-700">{l.nom}</td><td className="px-3 py-2.5 text-gray-500">{l.secteur || '-'}</td><td colSpan={4} className="px-3 py-2.5 text-xs italic text-gray-400">Aucune routine définie</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-4"><EtatVide icone={Users} accent={COULEUR} texte="Aucun collaborateur dans votre périmètre" /></div>}
          </Tuile>
        </>
      )}

      {gerer && <GererRoutine personne={personne} routines={miennes} onClose={() => setGerer(false)} />}
      {joursFeries && <JoursFeries feries={feries} onClose={() => setJoursFeries(false)} />}
      {detail && <DetailRoutine personne={detail} routines={vivantes} suivi={suivi} feries={feries} from={debut} to={fin} onClose={() => setDetail(null)} />}
    </div>
  )
}

function Jauge({ fait, attendu, taux }) {
  return <span className="flex items-center gap-2"><span className="flex-1"><Barre valeur={taux || 0} couleur={teinte(taux)} /></span><span className="w-20 text-right text-xs font-extrabold" style={{ color: teinte(taux) }}>{fait}/{attendu} · {taux == null ? '-' : `${taux}%`}</span></span>
}

// Gérer la routine d'une personne : ajouter, renommer, préciser, retirer.
function GererRoutine({ personne, routines, onClose }) {
  const [libelle, setLibelle] = useState('')
  const [description, setDescription] = useState('')
  const [edition, setEdition] = useState(null) // { id, libelle, description }
  const { role } = useMoi()
  const erreur = (e) => toast.error(e?.message || 'Action impossible')
  const ajouter = async (e) => { e.preventDefault(); if (!libelle.trim()) return; try { await ajouterRoutine(libelle, personne, description); setLibelle(''); setDescription('') } catch (x) { erreur(x) } }
  const enregistrer = async () => { if (!edition.libelle.trim()) return toast.error('Donnez un intitulé'); try { await modifierRoutine({ id: edition.id }, { libelle: edition.libelle.trim(), description: edition.description.trim() }); setEdition(null) } catch (x) { erreur(x) } }
  return (
    <Modal open onClose={onClose} size="lg" title={`Routine de ${personne.nom}`} {...glassModalProps(COULEUR)} footer={<Button onClick={onClose} style={{ backgroundColor: COULEUR }}>Terminé</Button>}>
      <div className="params-verre space-y-3" style={{ '--p-accent': COULEUR }}>
        {routines.length ? (
          <ul className="space-y-1.5">
            {routines.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white/60 px-3 py-2.5">
                {edition?.id === r.id ? (
                  <div className="space-y-2">
                    <Input value={edition.libelle} onChange={(e) => setEdition({ ...edition, libelle: e.target.value })} aria-label="Intitulé" autoFocus />
                    <Input value={edition.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} placeholder="Précision (facultatif)" aria-label="Précision" />
                    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdition(null)}>Annuler</Button><Button onClick={enregistrer} style={{ backgroundColor: COULEUR }}>Enregistrer</Button></div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-800">{r.libelle}</span>{r.description && <span className="block text-xs text-gray-500">{r.description}</span>}</span>
                    <button type="button" onClick={() => setEdition({ id: r.id, libelle: r.libelle, description: r.description || '' })} aria-label={`Modifier ${r.libelle}`} className="rounded-full p-1.5 text-gray-400 hover:text-violet-700"><Pencil size={15} /></button>
                    {role !== 'agent' && <button type="button" onClick={() => retirerRoutine(r).catch(erreur)} aria-label={`Retirer ${r.libelle}`} className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><X size={15} /></button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="py-3 text-center text-sm text-gray-400">Aucune tâche de routine pour le moment.</p>}
        <form onSubmit={ajouter} className="fg-tuile space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Ajouter une tâche de routine</p>
          <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex : Vérifier la caisse" aria-label="Intitulé" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Précision (facultatif)" aria-label="Précision" />
          <div className="flex justify-end"><Button type="submit" disabled={!libelle.trim()} style={{ backgroundColor: COULEUR }}><Plus size={15} /> Ajouter</Button></div>
        </form>
      </div>
    </Modal>
  )
}

// Jours fériés : ils ne comptent pas dans le suivi, comme les dimanches. Tenus par la direction générale et la RH.
function JoursFeries({ feries, onClose }) {
  const [date, setDate] = useState('')
  const [nomFerie, setNomFerie] = useState('')
  const tries = [...feries].sort((a, b) => (a.date < b.date ? 1 : -1))
  const ajouter = async (e) => { e.preventDefault(); if (!date) return toast.error('Choisissez la date'); try { await ajouterFerie(date, nomFerie); setDate(''); setNomFerie(''); toast.success('Jour férié ajouté ✓') } catch (x) { toast.error(x?.message || 'Ajout impossible') } }
  return (
    <Modal open onClose={onClose} size="md" title="Jours fériés" {...glassModalProps(COULEUR)} footer={<Button onClick={onClose} style={{ backgroundColor: COULEUR }}>Fermer</Button>}>
      <div className="params-verre space-y-3" style={{ '--p-accent': COULEUR }}>
        <p className="text-xs text-gray-500">Ces jours, comme les dimanches, ne comptent pas dans le suivi de la routine.</p>
        <form onSubmit={ajouter} className="fg-tuile grid gap-2 sm:grid-cols-[auto_1fr_auto]">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <Input value={nomFerie} onChange={(e) => setNomFerie(e.target.value)} placeholder="Nom (ex : Fête de l'indépendance)" aria-label="Nom du jour férié" />
          <Button type="submit" style={{ backgroundColor: COULEUR }}><Plus size={15} /> Ajouter</Button>
        </form>
        {tries.length ? (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {tries.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 text-sm"><span className="font-bold text-gray-800">{formatDateShort(f.date)}</span><span className="min-w-0 flex-1 truncate text-gray-600">{f.nom}</span>
                <button type="button" onClick={() => retirerFerie(f).catch((x) => toast.error(x?.message || 'Action impossible'))} aria-label={`Retirer le ${formatDateShort(f.date)}`} className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button></li>
            ))}
          </ul>
        ) : <p className="py-3 text-center text-sm text-gray-400">Aucun jour férié enregistré.</p>}
      </div>
    </Modal>
  )
}

// Détail jour par jour d'un collaborateur sur la période.
function DetailRoutine({ personne, routines, suivi, feries, from, to, onClose }) {
  const d = useMemo(() => detailPersonne({ uid: personne.uid, routines, suivi, from, to, feries }), [personne.uid, routines, suivi, from, to, feries])
  const [ouvert, setOuvert] = useState(null)
  return (
    <Modal open onClose={onClose} size="lg" title={`${personne.nom} : détail de la routine`} {...glassModalProps(COULEUR)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white/60 px-4 py-3">
          <span className="text-3xl font-black" style={{ color: teinte(d.taux) }}>{d.taux == null ? '-' : `${d.taux}%`}</span>
          <span className="text-sm text-gray-600">{d.fait}/{d.attendu} cochages · {d.actives.length} tâche{d.actives.length > 1 ? 's' : ''} active{d.actives.length > 1 ? 's' : ''}<br /><span className="text-xs text-gray-400">du {formatDateShort(from)} au {formatDateShort(to)}</span></span>
        </div>
        {d.actives.length > 0 && <ol className="list-inside list-decimal rounded-2xl bg-white/50 px-4 py-2 text-sm text-gray-700">{d.actives.map((r) => <li key={r.id}>{r.libelle}</li>)}</ol>}
        {d.jours.length ? (
          <ul className="space-y-1.5">
            {d.jours.map((j) => j.type !== 'travail' ? (
              <li key={j.date} className="flex items-center gap-2 rounded-2xl bg-white/40 px-3 py-2 text-sm text-gray-400"><CalendarOff size={14} aria-hidden="true" />{j.jourSemaine} {formatDateShort(j.date)} : {j.type === 'dimanche' ? 'dimanche' : `férié${j.nomFerie ? ` (${j.nomFerie})` : ''}`}, non compté</li>
            ) : (
              <li key={j.date} className="rounded-2xl bg-white/60">
                <button type="button" onClick={() => setOuvert(ouvert === j.date ? null : j.date)} aria-expanded={ouvert === j.date} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                  <span className="w-36 shrink-0 text-sm font-semibold text-gray-700">{j.jourSemaine} {formatDateShort(j.date)}{j.aujourdhui && <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">aujourd'hui</span>}</span>
                  <span className="flex-1"><Barre valeur={j.pct} couleur={teinte(j.pct)} /></span>
                  <span className="w-24 text-right text-xs font-extrabold" style={{ color: teinte(j.pct) }}>{j.faites}/{j.total} · {j.pct}%</span>
                  <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${ouvert === j.date ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {ouvert === j.date && (
                  <ul className="space-y-1 px-3 pb-2.5">{d.actives.map((r) => { const ok = j.idsFaits.has(r.id); return <li key={r.id} className={`text-sm ${ok ? 'text-green-700' : 'text-red-600'}`}>{ok ? '✓' : '✗'} {r.libelle}</li> })}</ul>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="py-3 text-center text-sm text-gray-400">Aucun jour dans la période.</p>}
      </div>
    </Modal>
  )
}
