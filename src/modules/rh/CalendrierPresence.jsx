// RH : calendrier de présence d'un employé (ouvert depuis la liste des présences). Un mois à la fois : chaque jour dit s'il a été pointé
// (présent, retard), s'il est absent (justifié ou non), en congé ou en mission, ou s'il n'a PAS été pointé alors qu'il fallait. Les jours de repos
// de la semaine (réglés dans Paramètres, Présences), les jours à venir et ceux d'avant l'embauche restent discrets.
// Au clic sur un jour : le détail (heure, motif) et, pour une absence, le bouton pour la rendre justifiée ou non justifiée.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Check, Clock3, UserX, Plane, Briefcase, CircleHelp, Wallet } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { glassModalProps, icone3D, avatarGradient } from '../../utils/color'
import { todayStr, formatDateShort, formatMoney } from '../../utils/formatters'
import { MOIS_LABELS, TYPES_PRESENCE } from './store/rhStore'
import { dateIso, jourSemaine, nbJoursDuMois, calculerRetenuePresence } from './retenuesPresence'

const BLEU = '#0284c7'
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// Aspect de chaque état de jour : fond, texte, marque (la couleur ne porte jamais seule le sens : la marque et la légende disent la même chose).
const ETATS = {
  present:    { label: 'Présent',            cellule: 'bg-emerald-100 text-emerald-800 border-emerald-200', marque: Check,  point: 'bg-emerald-500' },
  retard:     { label: 'En retard',          cellule: 'bg-amber-100 text-amber-800 border-amber-200',       marque: Clock3, point: 'bg-amber-500' },
  absentJ:    { label: 'Absent justifié',    cellule: 'bg-rose-50 text-rose-700 border-rose-200',           marque: UserX,  point: 'bg-rose-300' },
  absentNJ:   { label: 'Absent non justifié', cellule: 'bg-red-600 text-white border-red-700',              marque: UserX,  point: 'bg-red-600' },
  conge:      { label: 'Congé',              cellule: 'bg-sky-100 text-sky-800 border-sky-200',             marque: Plane,  point: 'bg-sky-500' },
  mission:    { label: 'Mission',            cellule: 'bg-violet-100 text-violet-800 border-violet-200',    marque: Briefcase, point: 'bg-violet-500' },
  nonPointe:  { label: 'Non pointé',         cellule: 'bg-white text-gray-500 border-dashed border-gray-400', marque: CircleHelp, point: 'bg-gray-400' },
  repos:      { label: 'Repos',              cellule: 'bg-transparent text-gray-300 border-transparent',    marque: null,   point: '' },
  futur:      { label: 'À venir',            cellule: 'bg-white/40 text-gray-400 border-white/70',          marque: null,   point: '' },
  aujourdhui: { label: "Aujourd'hui, à pointer", cellule: 'bg-white text-gray-700 border-sky-300',          marque: null,   point: '' },
  avant:      { label: "Avant l'embauche",   cellule: 'bg-transparent text-gray-300 border-transparent',    marque: null,   point: '' }
}

function etatDuJour({ iso, rec, aujourdhui, travaille, embauche, pointe }) {
  if (rec) {
    if (rec.statut === 'absent') return rec.justifie === false ? 'absentNJ' : 'absentJ'
    return ETATS[rec.statut] ? rec.statut : 'present'
  }
  if (embauche && iso < embauche) return 'avant'
  if (!travaille) return 'repos'
  if (iso > aujourdhui) return 'futur'
  if (iso === aujourdhui) return 'aujourdhui'
  return pointe ? 'nonPointe' : 'repos'
}

export default function CalendrierPresence({ employe, presences, regles, avecArgent, onClose, onBasculerJustification, moisInitial }) {
  const aujourdhui = todayStr()
  const [mois, setMois] = useState(moisInitial || aujourdhui.slice(0, 7))
  const [choisi, setChoisi] = useState(null)
  useEffect(() => { if (employe) { setMois(moisInitial || aujourdhui.slice(0, 7)); setChoisi(null) } }, [employe?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pointe = employe?.pointe !== false
  const parDate = useMemo(() => {
    const m = {}
    if (employe) presences.filter((p) => p.employeId === employe.id).forEach((p) => { m[p.date] = p })
    return m
  }, [presences, employe])

  const { cases, comptes } = useMemo(() => {
    if (!employe) return { cases: [], comptes: {} }
    const [a, m] = mois.split('-').map(Number)
    const decalage = (jourSemaine(dateIso(a, m, 1)) + 6) % 7 // lundi = 0
    const liste = Array.from({ length: decalage }, () => null)
    const c = { present: 0, retard: 0, absentJ: 0, absentNJ: 0, conge: 0, mission: 0, nonPointe: 0 }
    for (let j = 1; j <= nbJoursDuMois(mois); j++) {
      const iso = dateIso(a, m, j)
      const rec = parDate[iso]
      const etat = etatDuJour({ iso, rec, aujourdhui, travaille: regles.jours.includes(jourSemaine(iso)), embauche: employe.dateEmbauche, pointe })
      if (c[etat] !== undefined) c[etat]++
      liste.push({ iso, j, etat, rec })
    }
    return { cases: liste, comptes: c }
  }, [employe, mois, parDate, regles, pointe, aujourdhui])

  if (!employe) return null
  const [annee, numMois] = mois.split('-').map(Number)
  const decale = (delta) => { const d = new Date(annee, numMois - 1 + delta, 1); setMois(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); setChoisi(null) }
  const retenue = calculerRetenuePresence({ presences, employe, mois, regles })
  const jourChoisi = choisi ? cases.find((c) => c && c.iso === choisi) : null
  const pointes = comptes.present + comptes.retard

  const resume = [
    { cle: 'present', icone: Check, couleur: '#16a34a', titre: 'Pointés', valeur: pointes, sous: comptes.retard ? `dont ${comptes.retard} retard(s)` : 'à l\'heure' },
    { cle: 'absent', icone: UserX, couleur: '#dc2626', titre: 'Absences', valeur: comptes.absentJ + comptes.absentNJ, sous: comptes.absentNJ ? `${comptes.absentNJ} non justifiée(s)` : 'justifiées' },
    { cle: 'non', icone: CircleHelp, couleur: '#6b7280', titre: 'Non pointés', valeur: comptes.nonPointe, sous: 'jours sans pointage' }
  ]

  return (
    <Modal open onClose={onClose} size="lg" title="Calendrier de présence" {...glassModalProps(BLEU)}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white" style={{ background: avatarGradient(employe.nom) }} aria-hidden="true">{(employe.nom || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-gray-800">{employe.nom}</p>
            <p className="truncate text-xs text-gray-500">{[employe.poste, employe.departement].filter(Boolean).join(' · ') || 'Poste non défini'}</p>
          </div>
        </div>

        {!pointe && <p className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">Cet employé n'est pas pointé : aucun jour n'est attendu.</p>}

        {/* Navigation de mois */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
          <button type="button" onClick={() => decale(-1)} aria-label="Mois précédent" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-all hover:bg-white active:scale-90"><ChevronLeft size={18} /></button>
          <p className="flex items-center gap-2 text-sm font-extrabold text-gray-800"><CalendarDays size={15} className="text-sky-600" aria-hidden="true" />{MOIS_LABELS[numMois - 1]} {annee}</p>
          <button type="button" onClick={() => decale(1)} aria-label="Mois suivant" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-all hover:bg-white active:scale-90"><ChevronRight size={18} /></button>
        </div>

        {/* Grille du mois : lundi en premier */}
        <div className="rounded-3xl border border-white/80 bg-white/60 p-2.5 backdrop-blur-xl sm:p-3">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
            {JOURS.map((j) => <span key={j}>{j}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cases.map((c, i) => {
              if (!c) return <span key={`v${i}`} aria-hidden="true" />
              const e = ETATS[c.etat]
              const Marque = e.marque
              const aujourdhuiCase = c.iso === aujourdhui
              return (
                <button key={c.iso} type="button" onClick={() => setChoisi(c.iso === choisi ? null : c.iso)}
                  aria-label={`${formatDateShort(c.iso)} : ${e.label}`} aria-pressed={choisi === c.iso}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-xs font-bold tabular-nums transition-all active:scale-95 ${e.cellule} ${choisi === c.iso ? 'ring-2 ring-sky-500 ring-offset-1' : ''} ${aujourdhuiCase ? 'shadow-[0_0_0_2px_rgba(2,132,199,0.35)]' : ''}`}>
                  <span className="leading-none">{c.j}</span>
                  {Marque && <Marque size={11} className="mt-0.5" aria-hidden="true" strokeWidth={2.6} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Légende */}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-gray-500">
          {['present', 'retard', 'absentJ', 'absentNJ', 'conge', 'mission', 'nonPointe'].map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${ETATS[k].point}`} aria-hidden="true" />{ETATS[k].label}</li>
          ))}
        </ul>

        {/* Détail du jour choisi */}
        {jourChoisi && (
          <div className="ed-entree rounded-2xl border border-white/80 bg-white/75 px-3.5 py-3 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
            <p className="text-sm font-extrabold capitalize text-gray-800">{new Date(`${jourChoisi.iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="mt-0.5 text-xs font-semibold text-gray-600">
              {ETATS[jourChoisi.etat].label}
              {jourChoisi.rec?.heure ? ` · arrivée à ${jourChoisi.rec.heure}` : ''}
              {jourChoisi.rec?.heureDepart ? ` · départ à ${jourChoisi.rec.heureDepart}` : ''}
            </p>
            {jourChoisi.rec?.motif && <p className="mt-1 text-xs text-gray-600">Motif : {jourChoisi.rec.motif}</p>}
            {jourChoisi.rec?.statut === 'absent' && onBasculerJustification && (
              <button type="button" onClick={() => onBasculerJustification(employe, jourChoisi.rec)}
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-all active:scale-95 ${jourChoisi.rec.justifie === false ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
                {jourChoisi.rec.justifie === false ? 'Un justificatif est rapporté : marquer justifiée' : 'Marquer non justifiée'}
              </button>
            )}
          </div>
        )}

        {/* Bilan du mois */}
        <div className="grid grid-cols-3 gap-2">
          {resume.map((r) => (
            <div key={r.cle} className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-2.5 py-2 backdrop-blur-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D(r.couleur)}><r.icone size={15} aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block text-lg font-black leading-none tabular-nums text-gray-800">{r.valeur}</span><span className="block truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">{r.titre}</span><span className="block truncate text-[10px] text-gray-500">{r.sous}</span></span>
            </div>
          ))}
        </div>

        {avecArgent && retenue.total > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-xs font-semibold text-red-800">
            <Wallet size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Retenue sur le salaire de {MOIS_LABELS[numMois - 1].toLowerCase()} : {formatMoney(retenue.total)} ({retenue.absencesNonJustifiees} absence(s) non justifiée(s), {retenue.retards} retard(s)).
          </p>
        )}
      </div>
    </Modal>
  )
}
