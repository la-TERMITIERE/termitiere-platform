// Fenêtre d'export du rapport global (Excel ou PDF) : on choisit la période (jour, mois, année ou plage) et les secteurs (un, plusieurs ou tous),
// puis le fichier est généré à partir des données de l'application (cf. rapportGlobal.js).
import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, CalendarRange, Layers, Check, Download, ListChecks } from 'lucide-react'
import Modal from '../shared/ui/Modal'
import Button from '../shared/ui/Button'
import FiltrePeriode from '../shared/ui/FiltrePeriode'
import { useAuth } from '../hooks/useAuth'
import { toast } from '../core/notifications'
import { glassModalProps, icone3D } from '../utils/color'
import { SECTEURS_RAPPORT, TOUS_LES_SECTEURS, chargerDonnees, calculerRapport, libellePeriode, bornesPeriode, todayStr } from './rapportGlobal'

const ROUGE = '#BC3C31'
const FORMATS = {
  pdf: { titre: 'Rapport en PDF', Icone: FileText, couleur: '#dc2626', verbe: 'Générer le PDF', ext: 'pdf' },
  excel: { titre: 'Rapport en Excel', Icone: FileSpreadsheet, couleur: '#16a34a', verbe: 'Générer le fichier Excel', ext: 'xlsx' }
}

export default function ExportRapportModal({ format = 'pdf', periode, onClose }) {
  const user = useAuth((s) => s.user)
  const f = FORMATS[format] || FORMATS.pdf
  const [mode, setMode] = useState(periode?.mode || 'mois')
  const [jour, setJour] = useState(periode?.jour || todayStr())
  const [mois, setMois] = useState(periode?.mois || todayStr().slice(0, 7))
  const [annee, setAnnee] = useState(periode?.annee || todayStr().slice(0, 4))
  const [debut, setDebut] = useState(periode?.debut || '')
  const [fin, setFin] = useState(periode?.fin || '')
  const [ids, setIds] = useState(TOUS_LES_SECTEURS)
  const [details, setDetails] = useState(true)
  const [enCours, setEnCours] = useState(false)

  const bornes = useMemo(() => bornesPeriode(mode, { jour, mois, annee, debut, fin }), [mode, jour, mois, annee, debut, fin])
  const libelle = libellePeriode(mode, bornes)
  const tous = ids.length === TOUS_LES_SECTEURS.length
  const plageInvalide = bornes.start > bornes.end
  const bascule = (id) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function generer() {
    if (!ids.length) return toast.error('Choisissez au moins un secteur')
    if (plageInvalide) return toast.error('La date de fin doit être après la date de début')
    setEnCours(true)
    try {
      const donnees = await chargerDonnees()
      const rapport = calculerRapport(donnees, { ids, mode, bornes })
      const nomFichier = `rapport-global_${bornes.start === bornes.end ? bornes.start : `${bornes.start}_${bornes.end}`}`
      // Les générateurs (jsPDF, xlsx) sont lourds : chargés seulement au moment d'exporter, pas avec le tableau de bord.
      if (format === 'pdf') await (await import('./rapportGlobalPDF')).genererRapportGlobalPDF({ rapport, libelle, par: user?.nom || '', avecDetails: details, tousLesSecteurs: tous, fichier: `${nomFichier}.pdf` })
      else (await import('./rapportGlobalExcel')).genererRapportGlobalExcel({ rapport, libelle, par: user?.nom || '', avecDetails: details, fichier: `${nomFichier}.xlsx` })
      toast.success(`Rapport ${format === 'pdf' ? 'PDF' : 'Excel'} généré ✓`)
      onClose()
    } catch (e) {
      console.error('[rapport global]', e)
      toast.error('Impossible de générer le rapport. Réessayez dans un instant.')
    } finally { setEnCours(false) }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={f.titre} {...glassModalProps(ROUGE)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={generer} loading={enCours} disabled={!ids.length || plageInvalide} style={{ backgroundColor: f.couleur }}><Download size={16} /> {f.verbe}</Button>
      </>}>
      <div className="params-verre space-y-3" style={{ '--p-accent': ROUGE }}>
        <div className="ed-entree relative flex items-center gap-3.5 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(188,60,49,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${f.couleur} 92%, transparent) 0%, color-mix(in srgb, ${f.couleur} 45%, #1f0a08) 100%)` }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md"><f.Icone size={26} /></span>
          <div className="relative min-w-0">
            <p className="text-lg font-extrabold leading-tight">{f.titre}</p>
            <p className="text-sm text-white/85">Choisissez la période et les secteurs à inclure.</p>
          </div>
        </div>

        <div className="fg-tuile">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><CalendarRange size={14} className="text-sky-500" aria-hidden="true" /> Période du rapport</p>
          <FiltrePeriode label="" mode={mode} onModeChange={setMode} valeurJour={jour} onJourChange={setJour} valeurMois={mois} onMoisChange={setMois}
            avecAnnee valeurAnnee={annee} onAnneeChange={setAnnee} avecPlage valeurDebut={debut} onDebutChange={setDebut} valeurFin={fin} onFinChange={setFin} />
          <p className={`mt-2 text-xs font-semibold ${plageInvalide ? 'text-red-600' : 'text-gray-500'}`}>
            {plageInvalide ? 'La date de fin doit être après la date de début.' : `Rapport ${mode === 'jour' ? 'journalier' : mode === 'mois' ? 'mensuel' : mode === 'annee' ? 'annuel' : 'sur une plage'} : ${libelle}`}
          </p>
        </div>

        <div className="fg-tuile">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><Layers size={14} className="text-sky-500" aria-hidden="true" /> Secteurs ({ids.length} sur {TOUS_LES_SECTEURS.length})</p>
            <button type="button" aria-pressed={tous} data-actif={tous} onClick={() => setIds(tous ? [] : TOUS_LES_SECTEURS)}
              className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ '--puce': ROUGE }}>
              <ListChecks size={13} aria-hidden="true" />{tous ? 'Tout retirer' : 'Tous les secteurs'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Secteurs du rapport">
            {SECTEURS_RAPPORT.map((s) => {
              const actif = ids.includes(s.id)
              return (
                <button key={s.id} type="button" aria-pressed={actif} data-actif={actif} onClick={() => bascule(s.id)}
                  className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ '--puce': s.couleur }}>
                  {actif ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: s.couleur }} />}{s.label}
                </button>
              )
            })}
          </div>
          {!ids.length && <p className="mt-2 text-xs font-semibold text-red-600">Choisissez au moins un secteur.</p>}
        </div>

        <button type="button" role="switch" aria-checked={details} onClick={() => setDetails(!details)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-all hover:bg-white/80">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#7c3aed')}><ListChecks size={15} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-gray-800">Inclure le détail des opérations</span>
              <span className="block text-[11px] text-gray-500">{format === 'pdf' ? 'Chaque recette et chaque dépense, secteur par secteur.' : 'Une feuille par secteur avec chaque recette et chaque dépense.'}</span>
            </span>
          </span>
          <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-white/70 transition-colors"
            style={{ background: details ? `linear-gradient(135deg, #e0685c, ${ROUGE})` : 'rgba(148,163,184,0.45)', boxShadow: details ? `0 6px 12px -6px ${ROUGE}` : 'inset 0 1px 3px rgba(0,0,0,0.15)' }}>
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] transition-all" style={{ left: details ? '1.35rem' : '0.12rem' }} />
          </span>
        </button>
      </div>
    </Modal>
  )
}
