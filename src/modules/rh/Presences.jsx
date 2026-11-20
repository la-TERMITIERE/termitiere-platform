// RH : Présences & Pointages.
//  - Jour : devant chaque employé, un interrupteur dit s'il doit être pointé ou non. S'il l'est, il a un bouton « Pointer l'arrivée » ; passé son heure d'arrivée,
//    le bouton « Absent » apparaît et ouvre une fenêtre de justification (motif obligatoire), comme pour les coachs de MAXI-GYM.
//    Les employés et les directeurs n'arrivent pas à la même heure : chacun suit les horaires de son profil (réglés dans RH, Paramètres, Présences).
//  - Mois et Plage : synthèse par employé (présent, retard, absent, congé, mission) et liste des absences avec leur motif.
import { useEffect, useMemo, useState } from 'react'
import { UserX, CalendarCheck as IconePresences, CalendarDays, Clock3, TriangleAlert, Check, Users, FileText, LogOut, Crown, UserRound, ShieldCheck, ShieldAlert, Pencil, LogIn, Briefcase } from 'lucide-react'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Badge from '../../shared/ui/Badge'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, formatDateShort } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { TYPES_PRESENCE, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh } from './rhui'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import { lireHoraires, lireRegles, horairesDe, enMinutes as minutes, heureTexte } from './horaires'
import { canExportExcel } from '../../core/roles'
import CalendrierPresence from './CalendrierPresence'
import { BoutonPointerMini, BoutonAbsentMini, CoachBoutonsStyles } from '../gym/CoachBoutons'

const MOTIFS_RAPIDES = ['Maladie', 'Congé', 'Raison familiale', 'Problème de transport', 'Sans nouvelles']

// Interrupteur « cet employé est pointé ou non »
function InterrupteurPointage({ actif, onChange, nom }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={onChange}
      aria-label={`${actif ? 'Ne plus pointer' : 'Pointer'} ${nom}`}
      title={actif ? 'Cet employé est pointé : touchez pour ne plus le pointer' : "Cet employé n'est pas pointé : touchez pour activer le pointage"}
      className="group inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 py-1 pl-1 pr-2.5 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:bg-white active:scale-95">
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${actif ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${actif ? 'translate-x-[1.1rem]' : 'translate-x-0.5'}`} />
      </span>
      <span className={actif ? 'text-emerald-700' : 'text-slate-500'}>{actif ? 'Pointé' : 'Non pointé'}</span>
    </button>
  )
}

export default function Presences() {
  const user = useAuth((s) => s.user)
  const { data: employes } = useCollection(COL.employes)
  const { data: postes } = useCollection(COL.postes)
  const { data: presences } = useCollection(COL.presences)
  const { data: configs } = useCollection(COL.config)
  const [recherche, setRecherche] = useState('')
  const [maintenant, setMaintenant] = useState(() => nowHM())
  useEffect(() => { const t = setInterval(() => setMaintenant(nowHM()), 30000); return () => clearInterval(t) }, [])

  // Période : jour (pointage), mois ou plage (synthèse).
  const [mode, setMode] = useState('jour')
  const [jour, setJour] = useState(todayStr())
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const aujourdhui = todayStr()
  const date = jour || aujourdhui
  const dansPeriode = (d) => {
    const x = d || ''
    if (mode === 'mois') return x.startsWith(mois || aujourdhui.slice(0, 7))
    if (mode === 'plage') return (!debut || x >= debut) && (!fin || x <= fin)
    return x === date
  }

  // Horaires : réglés dans RH, Paramètres, Présences. Chaque employé suit ceux de son profil (employé ou direction).
  const horaires = lireHoraires(configs)
  const regles = lireRegles(configs)
  const peutVoirArgent = canExportExcel(useAuth((s) => s.roleReel))
  const horairesPour = (emp) => horairesDe(emp, horaires, postes)
  const limiteRetard = (emp) => minutes(horairesPour(emp).arrivee) + horaires.tolerance
  const estPointe = (emp) => emp.pointe !== false

  const visibles = useMemo(() => employes.filter((e) => correspond(recherche, e.nom, e.prenom)), [employes, recherche])
  const duJour = useMemo(() => { const m = {}; presences.filter((p) => p.date === date).forEach((p) => { m[p.employeId] = p }); return m }, [presences, date])

  async function enregistrer(emp, champs) {
    // id déterministe : date_employé, un seul enregistrement par jour et par employé
    await setItem(COL.presences, `${date}_${emp.id}`, { date, employeId: emp.id, employeNom: emp.nom, ...champs })
  }
  async function pointer(emp) {
    const estAujourdhui = date === aujourdhui
    const heure = estAujourdhui ? nowHM() : ''
    const h = horairesPour(emp)
    const enRetard = estAujourdhui && minutes(heure) > limiteRetard(emp)
    await enregistrer(emp, { statut: enRetard ? 'retard' : 'present', heure, motif: '', par: user?.nom || '' })
    toast.success(enRetard ? `${emp.nom} : retard de ${minutes(heure) - minutes(h.arrivee)} min` : `${emp.nom} : arrivée pointée${heure ? ` à ${heure}` : ''}`)
  }
  async function pointerDepart(emp) {
    const heure = nowHM()
    await enregistrer(emp, { ...duJour[emp.id], heureDepart: heure })
    toast.success(`${emp.nom} : départ pointé à ${heure}${minutes(heure) < minutes(horairesPour(emp).depart) ? " (avant l'heure prévue)" : ''}`)
  }
  async function corriger(emp, statut) {
    if (statut === 'absent') return ouvrirAbsence(emp)
    await enregistrer(emp, { statut, heure: duJour[emp.id]?.heure || '', motif: '', par: user?.nom || '' })
    toast.success(`${emp.nom} : ${TYPES_PRESENCE[statut].label}`)
  }
  // Réglages par employé : pointé ou non, profil d'horaire.
  async function basculerPointage(emp) {
    await updateItem(COL.employes, emp.id, { pointe: !estPointe(emp) })
    toast.success(estPointe(emp) ? `${emp.nom} n'est plus pointé` : `${emp.nom} sera pointé`)
  }
  async function changerProfil(emp) {
    const suivant = horairesPour(emp).profil === 'direction' ? 'employe' : 'direction'
    await updateItem(COL.employes, emp.id, { profilHoraire: suivant })
    toast.success(`${emp.nom} : horaires ${suivant === 'direction' ? 'de la direction' : 'des employés'}`)
  }

  // Fenêtre de justification d'une absence
  const [absent, setAbsent] = useState(null)
  const [motif, setMotif] = useState('')
  const [tente, setTente] = useState(false)
  const [justifie, setJustifie] = useState(true)
  const [calendrierDe, setCalendrierDe] = useState(null) // employé dont on ouvre le calendrier de présence
  const ouvrirAbsence = (emp) => { setMotif(''); setJustifie(true); setTente(false); setAbsent(emp) }
  async function confirmerAbsence() {
    if (!motif.trim()) { setTente(true); return toast.error("Indiquez le motif de l'absence") }
    await enregistrer(absent, { statut: 'absent', heure: '', motif: motif.trim(), justifie, par: user?.nom || '' })
    toast.success(`${absent.nom} : absence ${justifie ? 'justifiée' : 'non justifiée'} enregistrée`)
    setAbsent(null)
  }
  // Saisie manuelle : renseigner à la main l'état d'un jour (heure d'arrivée et de départ, absence, congé, mission), pour aujourd'hui ou un jour passé.
  // Le retard se calcule tout seul d'après l'heure d'arrivée saisie, la tolérance et les horaires du profil de l'employé.
  const [manuel, setManuel] = useState(null)
  function chargerManuel(emp, d) {
    const rec = presences.find((p) => p.date === d && p.employeId === emp.id)
    setManuel({ emp, date: d, statut: rec ? (rec.statut === 'retard' ? 'present' : rec.statut) : 'present', heure: rec?.heure || '', heureDepart: rec?.heureDepart || '', motif: rec?.motif || '', justifie: rec?.justifie !== false, tente: false })
  }
  const ouvrirManuel = (emp) => chargerManuel(emp, mode === 'jour' && date <= aujourdhui ? date : aujourdhui)
  async function enregistrerManuel() {
    const m = manuel
    if (m.date > aujourdhui) return toast.error('Impossible de saisir un jour à venir')
    const emp = m.emp
    const base = { date: m.date, employeId: emp.id, employeNom: emp.nom, par: user?.nom || '', saisieManuelle: true }
    let champs
    if (m.statut === 'present') {
      if (!m.heure) return setManuel({ ...m, tente: true }) || toast.error("Indiquez l'heure d'arrivée")
      if (m.heureDepart && minutes(m.heureDepart) <= minutes(m.heure)) return toast.error("Le départ doit être après l'arrivée")
      const retard = minutes(m.heure) > limiteRetard(emp)
      champs = { statut: retard ? 'retard' : 'present', heure: m.heure, ...(m.heureDepart ? { heureDepart: m.heureDepart } : {}), motif: '' }
    } else if (m.statut === 'absent') {
      if (!m.motif.trim()) return setManuel({ ...m, tente: true }) || toast.error("Indiquez le motif de l'absence")
      champs = { statut: 'absent', heure: '', motif: m.motif.trim(), justifie: m.justifie }
    } else {
      champs = { statut: m.statut, heure: '', motif: m.motif.trim() }
    }
    await setItem(COL.presences, `${m.date}_${emp.id}`, { ...base, ...champs })
    toast.success(`${emp.nom} : ${TYPES_PRESENCE[champs.statut].label.toLowerCase()} enregistré pour le ${formatDateShort(m.date)} ✓`)
    setManuel(null)
  }
  // Une absence non justifiée retient une part du salaire : on peut la rendre justifiée (justificatif rapporté) ou l'inverse.
  async function basculerJustification(emp, rec) {
    const suivant = rec.justifie === false
    // On modifie l'enregistrement de CE jour-là (la date de l'absence), pas celui du jour affiché à l'écran.
    await updateItem(COL.presences, rec.id || `${rec.date}_${emp.id}`, { justifie: suivant })
    toast.success(`${emp.nom} : absence ${suivant ? 'justifiée' : 'non justifiée'}`)
  }

  // Compteurs du jour (seuls les employés à pointer sont attendus)
  const comptes = useMemo(() => {
    const c = { present: 0, retard: 0, absent: 0, absentNonJustifie: 0, autres: 0, apointer: 0 }
    visibles.forEach((e) => {
      const s = duJour[e.id]?.statut
      if (s === 'present') c.present++; else if (s === 'retard') c.retard++; else if (s === 'absent') { c.absent++; if (duJour[e.id].justifie === false) c.absentNonJustifie++ } else if (s) c.autres++
      else if (e.pointe !== false) c.apointer++
    })
    return c
  }, [visibles, duJour])

  // Synthèse d'une période (mois ou plage)
  const synthese = useMemo(() => {
    if (mode === 'jour') return null
    const lignes = visibles.map((e) => {
      const mine = presences.filter((p) => p.employeId === e.id && dansPeriode(p.date))
      const n = (s) => mine.filter((p) => p.statut === s).length
      return { emp: e, present: n('present'), retard: n('retard'), absent: n('absent'), nonJustifie: mine.filter((p) => p.statut === 'absent' && p.justifie === false).length, conge: n('conge'), mission: n('mission'), total: mine.length }
    }).filter((l) => l.total > 0)
    const absences = presences.filter((p) => p.statut === 'absent' && dansPeriode(p.date) && visibles.some((e) => e.id === p.employeId)).sort((a, b) => (a.date < b.date ? 1 : -1))
    const tot = (k) => lignes.reduce((s, l) => s + l[k], 0)
    return { lignes, absences, present: tot('present'), retard: tot('retard'), absent: tot('absent') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mois, debut, fin, presences, visibles])

  const futur = date > aujourdhui
  const aPasseSonHeure = (emp) => date < aujourdhui || (date === aujourdhui && minutes(maintenant) >= limiteRetard(emp))
  const memeHoraires = horaires.heureArriveeDirection === horaires.heureArrivee && horaires.heureDepartDirection === horaires.heureDepart

  const Capsule = ({ couleur, icone: Ic, children }) => (
    <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-1 pr-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_3px_6px_-2px_rgba(0,0,0,0.35)] ${couleur}`}><Ic size={11} aria-hidden="true" /></span>
      {children}
    </span>
  )

  return (
    <div className="space-y-4">
      <CoachBoutonsStyles />
      <PageHeader icon={IconePresences} sousModule="Temps & Paie" titre="Présences & Pointages" sousTitre="Pointage de chaque employé, absences justifiées et synthèse par période."
        action={<>
          <FiltrePeriode variant="glass" label="" mode={mode} onModeChange={setMode}
            valeurJour={jour} onJourChange={setJour} valeurMois={mois} onMoisChange={setMois}
            avecPlage valeurDebut={debut} onDebutChange={setDebut} valeurFin={fin} onFinChange={setFin} />
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
        </>} />

      {/* Horaires : pastille de verre compacte, un profil pour les employés et un pour la direction (réglés dans RH, Paramètres, Présences) */}
      <div className="ed-entree relative flex w-fit max-w-full flex-wrap items-center gap-x-1 gap-y-1 overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white/75 via-sky-50/60 to-white/40 p-1 text-[11px] font-bold text-slate-700 shadow-[0_10px_22px_-14px_rgba(2,132,199,0.6),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl"
        title="Horaires réglés dans RH, Paramètres, Présences">
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent" />
        <Capsule couleur="bg-emerald-500" icone={UserRound}>
          {memeHoraires ? 'Tous' : 'Employés'} <span className="tabular-nums text-slate-900">{horaires.heureArrivee}</span><span className="text-slate-400">→</span><span className="tabular-nums text-slate-900">{horaires.heureDepart}</span>
          {horaires.tolerance ? <span className="font-semibold text-slate-500">(+{horaires.tolerance} min)</span> : null}
        </Capsule>
        {!memeHoraires && (
          <Capsule couleur="bg-violet-500" icone={Crown}>
            Direction <span className="tabular-nums text-slate-900">{horaires.heureArriveeDirection}</span><span className="text-slate-400">→</span><span className="tabular-nums text-slate-900">{horaires.heureDepartDirection}</span>
          </Capsule>
        )}
      </div>

      {employes.length === 0 ? (
        <div className="ed-entree rounded-3xl border border-white/80 bg-white/60 px-6 py-10 text-center text-sm text-gray-500 backdrop-blur-xl">Ajoutez d'abord des employés dans l'onglet Équipe.</div>
      ) : mode === 'jour' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TuileVerre icone={Check} couleur="#16a34a" titre="Présents" valeur={comptes.present} sous={formatDateShort(date)} />
            <TuileVerre icone={Clock3} couleur="#f59e0b" titre="Retards" valeur={comptes.retard} sous="après leur heure" />
            <TuileVerre icone={UserX} couleur="#dc2626" titre="Absents" valeur={comptes.absent} sous={comptes.absentNonJustifie ? `dont ${comptes.absentNonJustifie} non justifié(s)` : 'justifiés'} />
            <TuileVerre icone={Users} couleur="#0284c7" titre="À pointer" valeur={comptes.apointer} sous={`sur ${visibles.filter(estPointe).length} pointé(s)`} />
          </div>

          <ul className="space-y-2">
            {visibles.map((emp, i) => {
              const rec = duJour[emp.id]
              const s = rec?.statut
              const h = horairesPour(emp)
              const pointe = estPointe(emp)
              const retardMin = rec?.heure && s === 'retard' ? minutes(rec.heure) - minutes(h.arrivee) : 0
              const peutPointerDepart = pointe && date === aujourdhui && (s === 'present' || s === 'retard') && !rec?.heureDepart
              // Saisie manuelle : à côté du bouton Pointer (ou de la correction), pour renseigner les heures, une absence, un congé ou une mission à la main.
              const boutonManuel = (
                <button type="button" onClick={() => ouvrirManuel(emp)} title={`Saisie manuelle pour ${emp.nom} : heures, absence, congé, mission`} aria-label={`Saisie manuelle pour ${emp.nom}`}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50/90 px-2.5 py-1 text-xs font-bold text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white active:scale-95">
                  <Pencil size={12} aria-hidden="true" /> Saisie manuelle
                </button>
              )
              return (
                <li key={emp.id} className={`ed-entree flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 px-3.5 py-2.5 shadow-[0_10px_22px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md ${pointe || s ? 'bg-white/65' : 'bg-white/35'}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${pointe ? '' : 'opacity-50 grayscale'}`} style={{ background: avatarGradient(emp.nom) }} aria-hidden="true">{(emp.nom || '?').trim().charAt(0).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-800">{emp.nom}</p>
                      <p className="truncate text-xs text-gray-500">{[emp.poste, emp.departement, emp.localite].filter(Boolean).join(' · ') || 'Poste non défini'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={() => setCalendrierDe(emp)} title={`Calendrier de présence de ${emp.nom}`} aria-label={`Calendrier de présence de ${emp.nom}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white active:scale-95">
                      <CalendarDays size={15} aria-hidden="true" />
                    </button>
                    <InterrupteurPointage actif={pointe} onChange={() => basculerPointage(emp)} nom={emp.nom} />
                    <button type="button" onClick={() => changerProfil(emp)} title={`Horaires ${h.profil === 'direction' ? 'de la direction' : 'des employés'} : arrivée ${h.arrivee}, départ ${h.depart}. Touchez pour changer de profil.`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 active:scale-95 ${h.profil === 'direction' ? 'border-violet-200 bg-violet-50/90 text-violet-700' : 'border-white/80 bg-white/70 text-slate-600'}`}>
                      {h.profil === 'direction' ? <Crown size={11} aria-hidden="true" /> : <UserRound size={11} aria-hidden="true" />}
                      <span className="tabular-nums">{h.arrivee}</span>
                    </button>

                    {s ? (
                      <>
                        <Badge tone={TYPES_PRESENCE[s]?.tone}>
                          {TYPES_PRESENCE[s]?.label}{rec.heure ? ` · ${rec.heure}` : ''}{retardMin > 0 ? ` (+${retardMin} min)` : ''}
                        </Badge>
                        {rec.heureDepart && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700"><LogOut size={11} aria-hidden="true" />Départ {rec.heureDepart}</span>}
                        {peutPointerDepart && (
                          <button type="button" onClick={() => pointerDepart(emp)} title="Pointer le départ"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white active:scale-95">
                            <LogOut size={12} aria-hidden="true" /> Pointer le départ
                          </button>
                        )}
                        {s === 'absent' && (
                          <button type="button" onClick={() => basculerJustification(emp, rec)} aria-label={rec.justifie === false ? 'Absence non justifiée : la marquer justifiée' : 'Absence justifiée : la marquer non justifiée'}
                            title={rec.justifie === false ? `Non justifiée : ${regles.pctAbsence} % d'une journée retenus sur le salaire. Touchez si un justificatif est rapporté.` : 'Justifiée : aucune retenue. Touchez pour la marquer non justifiée.'}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold transition-all hover:-translate-y-0.5 active:scale-95 ${rec.justifie === false ? 'border-red-300 bg-red-100 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                            {rec.justifie === false ? 'Non justifiée' : 'Justifiée'}
                          </button>
                        )}
                        {s === 'absent' && rec.motif && <span className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700" title={rec.motif}><FileText size={11} aria-hidden="true" />{rec.motif}</span>}
                        <select value="" onChange={(e) => e.target.value && corriger(emp, e.target.value)} aria-label={`Corriger le pointage de ${emp.nom}`}
                          className="rounded-xl border border-white/80 bg-white/70 px-2 py-1 text-xs font-bold text-gray-600 shadow-sm backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-sky-300">
                          <option value="">Corriger…</option>
                          {Object.entries(TYPES_PRESENCE).filter(([v]) => v !== s).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
                        </select>
                        {boutonManuel}
                      </>
                    ) : !pointe ? (
                      <><span className="text-[11px] font-semibold text-gray-400">Pas de pointage</span>{!futur && boutonManuel}</>
                    ) : futur ? (
                      <span className="text-xs font-semibold text-gray-400">Jour à venir</span>
                    ) : (
                      <>
                        <BoutonPointerMini onClick={() => pointer(emp)} title={date === aujourdhui ? "Pointer l'arrivée" : 'Marquer présent'} />
                        {aPasseSonHeure(emp) && <BoutonAbsentMini onClick={() => ouvrirAbsence(emp)} />}
                        {boutonManuel}
                        {date === aujourdhui && !aPasseSonHeure(emp) && <span className="text-[11px] font-semibold text-gray-400">Absent possible dès {heureTexte(limiteRetard(emp))}</span>}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
            {visibles.length === 0 && <li className="rounded-2xl border border-white/80 bg-white/60 py-8 text-center text-sm text-gray-400">Aucun employé ne correspond.</li>}
          </ul>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <TuileVerre icone={Check} couleur="#16a34a" titre="Présences" valeur={synthese.present} sous="sur la période" />
            <TuileVerre icone={Clock3} couleur="#f59e0b" titre="Retards" valeur={synthese.retard} sous="sur la période" />
            <TuileVerre icone={UserX} couleur="#dc2626" titre="Absences" valeur={synthese.absent} sous="sur la période" />
          </div>

          <div className="overflow-x-auto rounded-3xl border border-white/80 bg-white/65 shadow-[0_14px_28px_-20px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Employé</th>
                  {Object.entries(TYPES_PRESENCE).map(([v, o]) => <th key={v} className="px-3 py-3 text-center">{o.label}</th>)}
                  <th className="px-3 py-3 text-center">Non justifiées</th>
                  <th className="px-3 py-3 text-center">Jours pointés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/70">
                {synthese.lignes.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucun pointage sur cette période.</td></tr>}
                {synthese.lignes.map((l) => (
                  <tr key={l.emp.id} className="hover:bg-white/50">
                    <td className="px-4 py-2.5"><p className="font-bold text-gray-800">{l.emp.nom}</p><p className="text-xs text-gray-500">{[l.emp.poste, l.emp.localite].filter(Boolean).join(' · ')}</p></td>
                    {['present', 'retard', 'absent', 'conge', 'mission'].map((k) => <td key={k} className={`px-3 py-2.5 text-center font-bold tabular-nums ${l[k] ? 'text-gray-800' : 'text-gray-300'}`}>{l[k]}</td>)}
                    <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${l.nonJustifie ? 'text-red-600' : 'text-gray-300'}`}>{l.nonJustifie}</td>
                    <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-sky-700">{l.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {synthese.absences.length > 0 && (
            <div className="rounded-3xl border border-white/80 bg-white/65 p-4 backdrop-blur-xl">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-red-600"><TriangleAlert size={13} aria-hidden="true" /> Absences et motifs ({synthese.absences.length})</p>
              <ul className="space-y-1.5">
                {synthese.absences.slice(0, 30).map((p) => (
                  <li key={p.id || `${p.date}_${p.employeId}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-gray-800">{p.employeNom}<span className="ml-2 text-xs font-normal text-gray-400">{formatDateShort(p.date)}</span></span>
                    <span className="shrink-0 text-xs text-gray-600">{p.justifie === false && <span className="mr-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-extrabold text-red-700">Non justifiée</span>}{p.motif || 'Sans motif'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Calendrier de présence d'un employé : jours pointés, absents, en retard, non pointés. */}
      <CalendrierPresence employe={calendrierDe} presences={presences} regles={regles} avecArgent={peutVoirArgent} onClose={() => setCalendrierDe(null)}
        onBasculerJustification={basculerJustification} moisInitial={(mode === 'mois' ? mois : date).slice(0, 7)} />

      {/* Saisie manuelle d'un jour : statut, heures d'arrivée et de départ, motif. */}
      <ModalRh open={!!manuel} onClose={() => setManuel(null)} title="Saisie manuelle" titreHero={manuel?.emp.nom} icone={Pencil}
        intro={manuel ? `${formatDateShort(manuel.date)} : arrivée ${horairesPour(manuel.emp).arrivee}, départ ${horairesPour(manuel.emp).depart}` : ''} onSave={enregistrerManuel}>
        {manuel && (() => {
          const h = horairesPour(manuel.emp)
          const retardMin = manuel.heure ? minutes(manuel.heure) - minutes(h.arrivee) : 0
          const enRetard = manuel.heure && minutes(manuel.heure) > limiteRetard(manuel.emp)
          const maj = (k, v) => setManuel({ ...manuel, [k]: v })
          const STATUTS = [{ v: 'present', label: 'Présent', icone: Check, ton: 'border-emerald-400 bg-emerald-50 text-emerald-800' }, { v: 'absent', label: 'Absent', icone: UserX, ton: 'border-red-400 bg-red-50 text-red-800' },
            { v: 'conge', label: 'Congé', icone: CalendarDays, ton: 'border-sky-400 bg-sky-50 text-sky-800' }, { v: 'mission', label: 'Mission', icone: Briefcase, ton: 'border-violet-400 bg-violet-50 text-violet-800' }]
          return (<>
            <Champ label="Jour" icone={CalendarDays} iconeLabel>
              <input type="date" value={manuel.date} max={aujourdhui} onChange={(e) => e.target.value && chargerManuel(manuel.emp, e.target.value)} className="input-base" />
            </Champ>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="État du jour">
              {STATUTS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={manuel.statut === o.v} onClick={() => maj('statut', o.v)}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-extrabold transition-all active:scale-[0.98] ${manuel.statut === o.v ? o.ton : 'border-white/80 bg-white/60 text-gray-500 hover:bg-white'}`}>
                  <o.icone size={15} aria-hidden="true" />{o.label}
                </button>
              ))}
            </div>
            {manuel.statut === 'present' && (<>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Heure d'arrivée" icone={LogIn} iconeLabel required erreur={manuel.tente && !manuel.heure ? "L'heure d'arrivée est obligatoire." : undefined}>
                  <input type="time" value={manuel.heure} onChange={(e) => maj('heure', e.target.value)} className="input-base" autoFocus />
                </Champ>
                <Champ label="Heure de départ" icone={LogOut} iconeLabel aide="Laissez vide si la personne n'est pas encore partie.">
                  <input type="time" value={manuel.heureDepart} onChange={(e) => maj('heureDepart', e.target.value)} className="input-base" />
                </Champ>
              </div>
              {manuel.heure && (
                <p className={`rounded-2xl border px-3 py-2 text-xs font-bold ${enRetard ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                  {enRetard ? `Retard de ${retardMin} min : compté comme retard` : 'À l\'heure : aucun retard'}
                </p>
              )}
            </>)}
            {manuel.statut === 'absent' && (<>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="L'absence est-elle justifiée ?">
                {[{ v: true, label: 'Justifiée', sous: 'Aucune retenue', icone: ShieldCheck, ton: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
                  { v: false, label: 'Non justifiée', sous: regles.pctAbsence > 0 ? `${regles.pctAbsence} % d'une journée retenus` : 'Aucune retenue réglée', icone: ShieldAlert, ton: 'border-red-400 bg-red-50 text-red-800' }].map((o) => (
                  <button key={String(o.v)} type="button" role="radio" aria-checked={manuel.justifie === o.v} onClick={() => maj('justifie', o.v)}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${manuel.justifie === o.v ? o.ton : 'border-white/80 bg-white/60 text-gray-500 hover:bg-white'}`}>
                    <span className="flex items-center gap-1.5 text-sm font-extrabold"><o.icone size={15} aria-hidden="true" />{o.label}</span>
                    <span className="text-[11px] font-semibold opacity-80">{o.sous}</span>
                  </button>
                ))}
              </div>
              <Champ label="Motif de l'absence" icone={FileText} required erreur={manuel.tente && !manuel.motif.trim() ? 'Le motif est obligatoire.' : undefined}>
                <input value={manuel.motif} onChange={(e) => maj('motif', e.target.value)} className="input-base" placeholder="Ex. malade, raison familiale" />
              </Champ>
            </>)}
            {(manuel.statut === 'conge' || manuel.statut === 'mission') && (
              <Champ label="Précision (facultatif)" icone={FileText} iconeLabel>
                <input value={manuel.motif} onChange={(e) => maj('motif', e.target.value)} className="input-base" placeholder={manuel.statut === 'mission' ? 'Ex. mission à Kara' : 'Ex. congé annuel'} />
              </Champ>
            )}
          </>)
        })()}
      </ModalRh>

      {/* Justification d'une absence : le motif est obligatoire. */}
      <ModalRh open={!!absent} onClose={() => setAbsent(null)} title="Marquer absent" titreHero={absent?.nom} icone={UserX}
        intro={absent ? `${formatDateShort(date)} : pas pointé avant ${horairesPour(absent).arrivee}` : ''} libelleSave="Confirmer l'absence" onSave={confirmerAbsence}>
        {absent && (<>
          {/* Justifiée ou non : une absence non justifiée retient une part du salaire du mois (pourcentage réglé dans RH, Paramètres, Présences). */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="L'absence est-elle justifiée ?">
            {[{ v: true, label: 'Justifiée', sous: 'Aucune retenue', icone: ShieldCheck, ton: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
              { v: false, label: 'Non justifiée', sous: regles.pctAbsence > 0 ? `${regles.pctAbsence} % d'une journée retenus` : 'Aucune retenue réglée', icone: ShieldAlert, ton: 'border-red-400 bg-red-50 text-red-800' }].map((o) => (
              <button key={String(o.v)} type="button" role="radio" aria-checked={justifie === o.v} onClick={() => setJustifie(o.v)}
                className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${justifie === o.v ? `${o.ton} shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]` : 'border-white/80 bg-white/60 text-gray-500 hover:bg-white'}`}>
                <span className="flex items-center gap-1.5 text-sm font-extrabold"><o.icone size={15} aria-hidden="true" />{o.label}</span>
                <span className="text-[11px] font-semibold opacity-80">{o.sous}</span>
              </button>
            ))}
          </div>
          <Champ label="Motif de l'absence" icone={FileText} required erreur={tente && !motif.trim() ? 'Le motif est obligatoire.' : undefined}
            aide="Dites pourquoi la personne est absente : cette justification est conservée.">
            <input value={motif} onChange={(e) => setMotif(e.target.value)} className="input-base" placeholder="Ex. malade, congé, raison familiale" autoFocus />
          </Champ>
          <div className="flex flex-wrap gap-1.5">
            {MOTIFS_RAPIDES.map((m) => (
              <button key={m} type="button" onClick={() => { setMotif(m); if (m === 'Sans nouvelles') setJustifie(false) }} aria-pressed={motif === m}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-95 ${motif === m ? 'border-red-400 bg-red-100 text-red-700' : 'border-white/80 bg-white/70 text-gray-600 hover:bg-white'}`}>{m}</button>
            ))}
          </div>
        </>)}
      </ModalRh>
    </div>
  )
}
