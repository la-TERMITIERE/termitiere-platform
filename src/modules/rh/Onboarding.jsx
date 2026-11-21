// RH : Arrivées et départs (onboarding / offboarding). La RH programme un parcours à une date précise (ex. l'employé arrive lundi) :
// les étapes types sont proposées avec leurs dates (J-3, J0, J+7…), modifiables, puis suivies une à une (À faire, En cours, Fait).
// Les étapes du jour et en retard sont signalées à la RH ici et sur le tableau de bord.
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useMemo, useState } from 'react'
import { Repeat, Plus, CalendarPlus, LogIn, LogOut, Trash2, Check, Clock3, CalendarClock, AlertTriangle, ListChecks, UserRound, FileText, CalendarDays } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { todayStr, addDays, formatDateShort } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh } from './rhui'
import { usePeutSupprimerRh } from './suppression'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { TuileVerre } from '../../shared/ui/ParamsVerre'

const TYPES = {
  onboarding: { label: 'Arrivée', icone: LogIn, couleur: '#16a34a' },
  offboarding: { label: 'Départ', icone: LogOut, couleur: '#dc2626' }
}
const STATUTS = {
  a_faire: { label: 'À faire', classe: 'border-slate-200 bg-white/80 text-slate-600' },
  en_cours: { label: 'En cours', classe: 'border-amber-300 bg-amber-100 text-amber-800' },
  fait: { label: 'Fait', classe: 'border-emerald-300 bg-emerald-100 text-emerald-800' }
}
const SUIVANT = { a_faire: 'en_cours', en_cours: 'fait', fait: 'a_faire' }

// Étapes types : j = décalage en jours par rapport à la date d'arrivée (ou de départ).
const MODELES = {
  onboarding: [
    { j: -3, etape: 'Préparer le poste de travail et le matériel' },
    { j: -2, etape: 'Créer les accès et le compte' },
    { j: -1, etape: 'Préparer le contrat et les documents à signer' },
    { j: 0, etape: "Accueil et arrivée de l'employé" },
    { j: 0, etape: 'Signature du contrat et des documents' },
    { j: 0, etape: 'Remise du matériel' },
    { j: 0, etape: "Présentation à l'équipe" },
    { j: 7, etape: 'Point de la première semaine' },
    { j: 30, etape: 'Bilan du premier mois' }
  ],
  offboarding: [
    { j: -14, etape: 'Notification et préavis' },
    { j: -7, etape: 'Transmission des dossiers en cours' },
    { j: 0, etape: 'Restitution du matériel et des clés' },
    { j: 0, etape: 'Retrait des accès' },
    { j: 0, etape: 'Entretien de départ' },
    { j: 0, etape: 'Solde de tout compte et certificat de travail' }
  ]
}
const lignesModele = (type, date) => MODELES[type].map((m) => ({ etape: m.etape, date: addDays(date, m.j), coche: true }))

const jourLong = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '')
const jourCourt = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sans date')

export default function Onboarding() {
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration
  const { data: employes } = useCollection(COL.employes)
  // Personnes proposées pour « Responsable » : les employés de l'annuaire RH.
  const personnes = useMemo(() => employes.filter((e) => (e.statut || 'actif') !== 'sorti').map((e) => ({ nom: e.nom, detail: [e.poste, e.departement].filter(Boolean).join(' · ') })), [employes])
  const { data: etapes } = useCollection(COL.onboarding)
  const aujourdhui = todayStr()
  const [filtreType, setFiltreType] = useState('')
  const [filtreEtat, setFiltreEtat] = useState('en_cours') // en_cours = parcours non terminés
  const [programme, setProgramme] = useState(null) // fenêtre « Programmer un parcours »
  const [simple, setSimple] = useState(null) // fenêtre « Nouvelle étape »
  const [tente, setTente] = useState(false)

  const etat = (e) => {
    if (e.statut === 'fait') return 'fait'
    if (!e.datePrevue) return 'sans_date'
    if (e.datePrevue < aujourdhui) return 'retard'
    if (e.datePrevue === aujourdhui) return 'aujourdhui'
    return 'avenir'
  }

  // Parcours : les étapes d'un même employé et d'un même type (et d'une même date de parcours), triées par date.
  const parcours = useMemo(() => {
    const m = new Map()
    etapes.forEach((e) => {
      const cle = `${e.employeId || e.employeNom}|${e.type}|${e.dateParcours || ''}`
      if (!m.has(cle)) m.set(cle, { cle, employeId: e.employeId, nom: e.employeNom || employes.find((x) => x.id === e.employeId)?.nom || 'Employé', type: e.type, date: e.dateParcours || '', etapes: [] })
      m.get(cle).etapes.push(e)
    })
    return [...m.values()].map((p) => {
      p.etapes.sort((a, b) => (a.datePrevue || '9999') < (b.datePrevue || '9999') ? -1 : 1)
      const faites = p.etapes.filter((e) => e.statut === 'fait').length
      return { ...p, faites, total: p.etapes.length, termine: faites === p.etapes.length, date: p.date || p.etapes[0]?.datePrevue || '' }
    }).sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1)
  }, [etapes, employes])

  const affiches = parcours.filter((p) => (!filtreType || p.type === filtreType) && (filtreEtat === 'tous' || (filtreEtat === 'termines' ? p.termine : !p.termine)))

  // Chiffres et alertes pour la RH
  const compteurs = useMemo(() => {
    const dans7 = addDays(aujourdhui, 7)
    const ouvertes = etapes.filter((e) => e.statut !== 'fait')
    return {
      retard: ouvertes.filter((e) => e.datePrevue && e.datePrevue < aujourdhui),
      aujourdhui: ouvertes.filter((e) => e.datePrevue === aujourdhui),
      semaine: ouvertes.filter((e) => e.datePrevue && e.datePrevue > aujourdhui && e.datePrevue <= dans7),
      faites: etapes.filter((e) => e.statut === 'fait').length
    }
  }, [etapes, aujourdhui])
  const alertes = [...compteurs.retard, ...compteurs.aujourdhui].slice(0, 4)

  async function changerStatut(e) {
    const statut = SUIVANT[e.statut || 'a_faire']
    await updateItem(COL.onboarding, e.id, { statut, ...(statut === 'fait' ? { faitLe: aujourdhui } : { faitLe: '' }) })
  }
  async function supprimer(e) {
    try { await removeItem(COL.onboarding, e.id); toast.success('Étape supprimée') }
    catch (err) { if (err?.name === 'SuppressionAnnulee' || err?.code === 'SUPPRESSION_ANNULEE') return; toast.error(err?.message || 'Suppression impossible') }
  }

  // ----- Programmer un parcours -----
  const ouvrirProgramme = () => { setTente(false); setProgramme({ employeId: '', type: 'onboarding', date: addDays(aujourdhui, 1), responsable: '', lignes: lignesModele('onboarding', addDays(aujourdhui, 1)) }) }
  const majProgramme = (champs) => setProgramme((p) => {
    const suivant = { ...p, ...champs }
    // changer le parcours ou la date recalcule les dates des étapes types
    return ('type' in champs || 'date' in champs) && suivant.date ? { ...suivant, lignes: lignesModele(suivant.type, suivant.date) } : suivant
  })
  const majLigne = (i, champs) => setProgramme((p) => ({ ...p, lignes: p.lignes.map((l, k) => (k === i ? { ...l, ...champs } : l)) }))
  async function enregistrerProgramme() {
    const emp = employes.find((x) => x.id === programme.employeId)
    const retenues = programme.lignes.filter((l) => l.coche && l.etape.trim())
    if (!emp || !programme.date || !retenues.length) { setTente(true); return toast.error(!emp ? "Choisissez l'employé" : !programme.date ? 'Indiquez la date' : 'Gardez au moins une étape') }
    await Promise.all(retenues.map((l) => addItem(COL.onboarding, {
      employeId: emp.id, employeNom: emp.nom, type: programme.type, etape: l.etape.trim(), responsable: programme.responsable.trim(),
      statut: 'a_faire', datePrevue: l.date || programme.date, dateParcours: programme.date
    })))
    toast.success(`${retenues.length} étape(s) programmée(s) pour ${emp.nom}`)
    setProgramme(null)
  }

  // ----- Une étape isolée -----
  async function enregistrerSimple() {
    const emp = employes.find((x) => x.id === simple.employeId)
    if (!emp || !simple.etape.trim()) { setTente(true); return toast.error(!emp ? "Choisissez l'employé" : "Indiquez l'étape") }
    await addItem(COL.onboarding, { employeId: emp.id, employeNom: emp.nom, type: simple.type, etape: simple.etape.trim(), responsable: simple.responsable.trim(), statut: simple.statut, datePrevue: simple.datePrevue || '' })
    toast.success('Étape ajoutée ✓')
    setSimple(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Repeat} sousModule="Collaborateurs & Contrats" titre="Onboarding / Offboarding" sousTitre="Parcours d'intégration des nouveaux et de départ des sortants."
        action={<>
          <BoutonBande anime icone={CalendarPlus} onClick={ouvrirProgramme}>Programmer un parcours</BoutonBande>
          <BoutonBande plein={false} icone={Plus} onClick={() => { setTente(false); setSimple({ employeId: '', type: 'onboarding', etape: '', datePrevue: aujourdhui, responsable: '', statut: 'a_faire' }) }}>Nouvelle étape</BoutonBande>
        </>} />

      {alertes.length > 0 && (
        <div className="ed-entree flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 to-white/70 p-3.5 backdrop-blur-md" role="status">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_6px_12px_-6px_rgba(245,158,11,0.8)]"><AlertTriangle size={17} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-amber-900">
              {compteurs.retard.length > 0 && `${compteurs.retard.length} étape(s) en retard`}{compteurs.retard.length > 0 && compteurs.aujourdhui.length > 0 && ' · '}{compteurs.aujourdhui.length > 0 && `${compteurs.aujourdhui.length} à faire aujourd'hui`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {alertes.map((e) => (
                <li key={e.id} className="truncate text-xs text-amber-900/80"><strong>{e.employeNom}</strong> : {e.etape} <span className="text-amber-700">({e.datePrevue < aujourdhui ? `prévu le ${formatDateShort(e.datePrevue)}` : "aujourd'hui"})</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TuileVerre icone={CalendarClock} couleur="#f59e0b" titre="Aujourd'hui" valeur={compteurs.aujourdhui.length} sous="étape(s) à faire" />
        <TuileVerre icone={AlertTriangle} couleur="#dc2626" titre="En retard" valeur={compteurs.retard.length} sous="date dépassée" />
        <TuileVerre icone={CalendarDays} couleur="#0284c7" titre="7 prochains jours" valeur={compteurs.semaine.length} sous="à préparer" />
        <TuileVerre icone={Check} couleur="#16a34a" titre="Faites" valeur={compteurs.faites} sous="étape(s) terminées" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[['', 'Tous'], ['onboarding', 'Arrivées'], ['offboarding', 'Départs']].map(([v, l]) => (
          <button key={v || 'tous'} type="button" onClick={() => setFiltreType(v)} data-actif={filtreType === v} aria-pressed={filtreType === v}
            className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': v ? TYPES[v].couleur : '#0284c7' }}>{l}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/70" aria-hidden="true" />
        {[['en_cours', 'En cours'], ['termines', 'Terminés'], ['tous', 'Tous']].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFiltreEtat(v)} data-actif={filtreEtat === v} aria-pressed={filtreEtat === v}
            className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': '#475569' }}>{l}</button>
        ))}
      </div>

      {affiches.length === 0 ? (
        <div className="ed-entree flex flex-col items-center gap-3 rounded-3xl border border-white/80 bg-white/60 px-6 py-12 text-center backdrop-blur-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#0284c7,#0369a1)' }}><ListChecks size={26} /></span>
          <p className="text-base font-bold text-gray-800">{etapes.length ? 'Aucun parcours dans ce filtre' : 'Aucun parcours programmé'}</p>
          <p className="max-w-sm text-sm text-gray-500">Programmez l'arrivée ou le départ d'un employé : les étapes types sont proposées avec leurs dates, que vous pouvez adapter.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {affiches.map((p, i) => {
            const t = TYPES[p.type] || TYPES.onboarding
            const Ic = t.icone
            const pct = p.total ? Math.round((p.faites / p.total) * 100) : 0
            return (
              <section key={p.cle} className="ed-entree relative overflow-hidden rounded-[1.75rem] border p-4 backdrop-blur-2xl sm:p-5"
                style={{ background: `linear-gradient(150deg, ${t.couleur}26 0%, rgba(255,255,255,0.66) 55%, ${t.couleur}0d 100%)`, borderColor: `${t.couleur}45`, boxShadow: `0 20px 38px -26px ${t.couleur}, inset 0 1px 0 rgba(255,255,255,0.9)`, animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-25 blur-3xl" style={{ background: t.couleur }} />
                <div className="relative flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: avatarGradient(p.nom) }} aria-hidden="true">{(p.nom || '?').trim().charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-black tracking-tight text-gray-900">{p.nom}</h3>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600"><CalendarDays size={12} aria-hidden="true" /> {p.date ? <span className="capitalize">{jourLong(p.date)}</span> : 'Date non précisée'}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]" style={{ color: t.couleur }}><Ic size={12} aria-hidden="true" />{t.label}</span>
                </div>

                <div className="relative mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5"><div className="agro-barre h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${t.couleur}, ${t.couleur}aa)` }} /></div>
                  <span className="text-[11px] font-extrabold tabular-nums text-gray-600">{p.faites}/{p.total}</span>
                </div>

                <ol className="relative mt-3 space-y-1.5">
                  {p.etapes.map((e) => {
                    const es = etat(e)
                    const st = STATUTS[e.statut || 'a_faire'] || STATUTS.a_faire
                    const dateClasse = es === 'retard' ? 'bg-red-100 text-red-700' : es === 'aujourdhui' ? 'bg-amber-100 text-amber-800' : es === 'fait' ? 'bg-emerald-50 text-emerald-700' : 'bg-white/80 text-slate-600'
                    return (
                      <li key={e.id} className="group flex flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
                        <span className={`inline-flex w-[5.6rem] shrink-0 items-center justify-center gap-1 rounded-xl px-1.5 py-1 text-[11px] font-extrabold capitalize ${dateClasse}`}>
                          {es === 'retard' ? <AlertTriangle size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}{jourCourt(e.datePrevue)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold leading-tight ${e.statut === 'fait' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{e.etape}</span>
                          {e.responsable && <span className="block text-[11px] text-gray-500">Responsable : {e.responsable}</span>}
                        </span>
                        <button type="button" onClick={() => changerStatut(e)} title="Changer le statut"
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold transition-all hover:-translate-y-0.5 active:scale-95 ${st.classe}`}>
                          {e.statut === 'fait' && <Check size={11} className="mr-0.5 inline" aria-hidden="true" />}{st.label}
                        </button>
                        {peutSupprimer && <button type="button" onClick={() => supprimer(e)} aria-label={`Supprimer l'étape ${e.etape}`} title="Supprimer"
                          className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>}
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}
        </div>
      )}

      {/* Programmer un parcours : l'employé, le type, la date, puis les étapes types avec leurs dates (modifiables) */}
      <ModalRh open={!!programme} onClose={() => setProgramme(null)} title="Programmer un parcours" titreHero={programme ? (employes.find((x) => x.id === programme.employeId)?.nom || 'Programmer un parcours') : ''}
        icone={CalendarPlus} intro={programme ? `${TYPES[programme.type].label} le ${jourLong(programme.date)}` : ''} libelleSave="Programmer les étapes" onSave={enregistrerProgramme} size="lg">
        {programme && (<>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Employé" icone={UserRound} required erreur={tente && !programme.employeId ? "Choisissez l'employé." : undefined}>
              <select value={programme.employeId} onChange={(e) => majProgramme({ employeId: e.target.value })} className="input-base">
                <option value="">Choisissez l'employé concerné</option>
                {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </Champ>
            <Champ label={programme.type === 'onboarding' ? "Date d'arrivée" : 'Date de départ'} icone={CalendarDays} required aide={programme.date ? jourLong(programme.date) : undefined}>
              <input type="date" value={programme.date} onChange={(e) => majProgramme({ date: e.target.value })} className="input-base" />
            </Champ>
          </div>
          <Champ label="Parcours" icone={Repeat} iconeLabel>
            <div className="flex gap-2" role="group">
              {Object.entries(TYPES).map(([v, t]) => {
                const Ic = t.icone
                return (
                  <button key={v} type="button" aria-pressed={programme.type === v} onClick={() => majProgramme({ type: v })} data-actif={programme.type === v}
                    className="puce-verre inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold" style={{ '--puce': t.couleur }}><Ic size={13} aria-hidden="true" />{t.label}</button>
                )
              })}
            </div>
          </Champ>
          <Champ label="Responsable RH" icone={UserRound} aide="Facultatif : la personne chargée de suivre ces étapes.">
            <ChampAutocomplete accent="sky" className="input-base" value={programme.responsable} onChange={(v) => setProgramme({ ...programme, responsable: v })} suggestions={personnes} getLabel={(e) => e.nom} getDetail={(e) => e.detail} maxSuggestions={10} placeholder="Choisissez un employé de l'Annuaire" emptyLabel="Aucun employé correspondant : votre saisie sera utilisée." />
          </Champ>
          <div className="fg-tuile">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><ListChecks size={13} aria-hidden="true" /> Étapes proposées : décochez, renommez ou changez la date</p>
            <ul className="space-y-1.5">
              {programme.lignes.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={l.coche} onChange={(e) => majLigne(i, { coche: e.target.checked })} className="h-4 w-4 shrink-0 accent-sky-600" aria-label={`Garder l'étape ${l.etape}`} />
                  <input value={l.etape} onChange={(e) => majLigne(i, { etape: e.target.value })} className={`input-base !py-1.5 min-w-0 flex-1 text-sm ${l.coche ? '' : 'opacity-50'}`} />
                  <input type="date" value={l.date} onChange={(e) => majLigne(i, { date: e.target.value })} className={`input-base !w-auto !py-1.5 text-sm ${l.coche ? '' : 'opacity-50'}`} />
                </li>
              ))}
            </ul>
          </div>
        </>)}
      </ModalRh>

      {/* Une étape isolée */}
      <ModalRh open={!!simple} onClose={() => setSimple(null)} title="Nouvelle étape" icone={Plus} intro="Une étape à ajouter à un parcours, avec sa date prévue." onSave={enregistrerSimple}>
        {simple && (<>
          <Champ label="Employé" icone={UserRound} required erreur={tente && !simple.employeId ? "Choisissez l'employé." : undefined}>
            <select value={simple.employeId} onChange={(e) => setSimple({ ...simple, employeId: e.target.value })} className="input-base">
              <option value="">Choisissez l'employé concerné</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Parcours" icone={Repeat} iconeLabel>
            <div className="flex gap-2" role="group">
              {Object.entries(TYPES).map(([v, t]) => {
                const Ic = t.icone
                return <button key={v} type="button" aria-pressed={simple.type === v} onClick={() => setSimple({ ...simple, type: v })} data-actif={simple.type === v}
                  className="puce-verre inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold" style={{ '--puce': t.couleur }}><Ic size={13} aria-hidden="true" />{t.label}</button>
              })}
            </div>
          </Champ>
          <Champ label="Étape" icone={FileText} required erreur={tente && !simple.etape.trim() ? "Indiquez l'étape." : undefined}>
            <input value={simple.etape} onChange={(e) => setSimple({ ...simple, etape: e.target.value })} className="input-base" placeholder="Ex. Remise du matériel, Création des accès" autoFocus />
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Date prévue" icone={CalendarDays}>
              <input type="date" value={simple.datePrevue} onChange={(e) => setSimple({ ...simple, datePrevue: e.target.value })} className="input-base" />
            </Champ>
            <Champ label="Responsable" icone={UserRound}>
              <ChampAutocomplete accent="sky" className="input-base" value={simple.responsable} onChange={(v) => setSimple({ ...simple, responsable: v })} suggestions={personnes} getLabel={(e) => e.nom} getDetail={(e) => e.detail} maxSuggestions={10} placeholder="Choisissez un employé de l'Annuaire" emptyLabel="Aucun employé correspondant : votre saisie sera utilisée." />
            </Champ>
          </div>
        </>)}
      </ModalRh>
    </div>
  )
}
