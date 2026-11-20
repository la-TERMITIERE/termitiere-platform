import { useState } from 'react'
import { Check, Plus, X, Users } from 'lucide-react'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { glassModalProps, icone3D } from '../../utils/color'

const BLEU_RH = '#0284c7'

// Petits composants partagés des écrans RH (en-tête en bandeau, champ de formulaire, fenêtre de saisie).
export function PageHeader({ icon, sousModule, titre, sousTitre, action, children }) {
  return (
    <BandeauVolet couleur={BLEU_RH} icone={icon} surtitre={sousModule} titre={titre} sous={sousTitre}>
      {children}
      {action}
    </BandeauVolet>
  )
}

// Champ de formulaire : tuile de verre avec son libellé, une icône discrète à gauche du champ (`icone`), un message d'aide ou d'erreur.
// `haut` : l'icône se place en haut d'une zone de texte. Le champ lui-même (input, select, textarea) garde la classe `input-base`.
// `iconeLabel` : l'icône se place à côté du libellé au lieu de se poser sur le champ (pour les boutons à toucher, qui ne sont pas un champ de saisie).
export function Champ({ label, icone: Icone, haut = false, iconeLabel = false, required = false, aide, erreur, children }) {
  return (
    <div className="fg-tuile min-w-0">
      <label className={`mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 ${iconeLabel ? 'flex items-center gap-1.5' : 'block'}`}>
        {iconeLabel && Icone && <Icone size={14} aria-hidden="true" className="shrink-0 text-sky-500" />}
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {Icone && !iconeLabel ? (
        <div className="rh-champ-icone relative">
          <Icone size={16} aria-hidden="true" className={`pointer-events-none absolute left-3.5 z-10 text-sky-500 ${haut ? 'top-3.5' : 'top-1/2 -translate-y-1/2'}`} />
          {children}
        </div>
      ) : children}
      {aide && !erreur && <p className="mt-1 text-xs text-gray-400">{aide}</p>}
      {erreur && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{erreur}</p>}
    </div>
  )
}

// Choix par boutons (toucher à nouveau le bouton choisi annule le choix) : les suggestions s'affichent en pastilles à toucher, plus un bouton « Autre » qui ouvre une saisie libre quand la valeur
// n'est pas dans la liste. `value` est le texte choisi ou saisi ; une valeur absente des suggestions ouvre automatiquement « Autre ».
const PASTILLE = 'rh-pastille inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

export function ChoixBoutons({ options, value, onChange, autre = 'Autre', placeholderAutre = 'Précisez', vide, iconeOption }) {
  const estSuggestion = options.includes(value)
  const [autreOuvert, setAutreOuvert] = useState(false)
  const modeAutre = autreOuvert || (!!value && !estSuggestion)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group">
        {options.map((o) => {
          const actif = value === o && !modeAutre
          return (
            <button key={o} type="button" aria-pressed={actif} data-actif={actif} onClick={() => { setAutreOuvert(false); onChange(actif ? '' : o) }} className={PASTILLE}>
              {actif && <Check size={13} strokeWidth={3} aria-hidden="true" />}{iconeOption?.(o)}{o}
            </button>
          )
        })}
        <button type="button" aria-pressed={modeAutre} data-actif={modeAutre} onClick={() => { if (modeAutre) { setAutreOuvert(false); onChange('') } else { setAutreOuvert(true); if (estSuggestion) onChange('') } }} className={PASTILLE}>
          <Plus size={13} strokeWidth={3} aria-hidden="true" />{autre}
        </button>
      </div>
      {options.length === 0 && !modeAutre && vide && <p className="mt-1.5 text-xs text-gray-400">{vide}</p>}
      {modeAutre && (
        <input value={estSuggestion ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder={placeholderAutre} autoFocus
          className="input-base ed-entree mt-2 !rounded-2xl" />
      )}
    </div>
  )
}

// Période d'une évaluation : un mois, un trimestre ou une année. `value` : { type: 'mois' | 'trimestre' | 'annee', mois: 'AAAA-MM', trimestre: 'T1' à 'T4', annee: 'AAAA' }.
// Le libellé lisible (« Novembre 2026 », « T3 2026 », « 2026 ») s'écrit avec `libellePeriodeEval` ; `periodeDepuisTexte` relit un ancien libellé.
const MOIS_NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
export const periodeParDefaut = () => ({ type: 'annee', annee: String(new Date().getFullYear()), trimestre: `T${Math.floor(new Date().getMonth() / 3) + 1}`, mois: new Date().toISOString().slice(0, 7) })
export function libellePeriodeEval(v) {
  if (!v) return ''
  if (v.type === 'mois') { const [a, m] = String(v.mois || '').split('-'); return m ? `${MOIS_NOMS[Number(m) - 1]} ${a}` : '' }
  if (v.type === 'trimestre') return v.trimestre && v.annee ? `${v.trimestre} ${v.annee}` : ''
  return v.annee ? String(v.annee) : ''
}
export function periodeDepuisTexte(texte) {
  const base = periodeParDefaut(), t = String(texte || '').trim()
  let m
  if ((m = t.match(/^T([1-4])\s+(\d{4})$/i))) return { ...base, type: 'trimestre', trimestre: `T${m[1]}`, annee: m[2] }
  if ((m = t.match(/^(\d{4})$/))) return { ...base, type: 'annee', annee: m[1] }
  const i = MOIS_NOMS.findIndex((n) => t.toLowerCase().startsWith(n.toLowerCase()))
  if (i >= 0 && (m = t.match(/(\d{4})/))) return { ...base, type: 'mois', mois: `${m[1]}-${String(i + 1).padStart(2, '0')}` }
  return base
}
export function ChoixPeriode({ value, onChange }) {
  const v = { ...periodeParDefaut(), ...(value || {}) }
  const maj = (champs) => onChange({ ...v, ...champs })
  return (
    <div className="space-y-2">
      <ChoixSimple value={v.type} onChange={(type) => maj({ type })} options={[{ value: 'mois', label: 'Un mois' }, { value: 'trimestre', label: 'Un trimestre' }, { value: 'annee', label: 'Une année' }]} />
      {v.type === 'mois' && <input type="month" value={v.mois} onChange={(e) => maj({ mois: e.target.value })} className="input-base" />}
      {v.type === 'trimestre' && (
        <div className="space-y-2">
          <ChoixSimple value={v.trimestre} onChange={(trimestre) => maj({ trimestre })} options={[{ value: 'T1', label: 'T1 : janv. à mars' }, { value: 'T2', label: 'T2 : avril à juin' }, { value: 'T3', label: 'T3 : juil. à sept.' }, { value: 'T4', label: 'T4 : oct. à déc.' }]} />
          <input type="number" min="2000" max="2100" value={v.annee} onChange={(e) => maj({ annee: e.target.value })} className="input-base" placeholder="Année, ex. 2026" />
        </div>
      )}
      {v.type === 'annee' && <input type="number" min="2000" max="2100" value={v.annee} onChange={(e) => maj({ annee: e.target.value })} className="input-base" placeholder="Année, ex. 2026" />}
    </div>
  )
}

// Grille de critères notés de 1 à 5 (évaluation d'un employé). `criteres` : [{ id, label }] ; `value` : { [id]: 1 à 5 } ; toucher la note déjà choisie l'efface.
// La couleur de chaque note va du rouge (1) au vert (5) ; la moyenne et la lettre correspondante s'affichent en bas, mises à jour à chaque touche.
export const COULEURS_NOTE = ['#dc2626', '#f97316', '#eab308', '#65a30d', '#16a34a']
export const moyenneCriteres = (value = {}, criteres = []) => {
  const notes = criteres.map((c) => Number(value[c.id])).filter((n) => n >= 1 && n <= 5)
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null
}
// Lettre de l'appréciation globale selon la moyenne : A 4,5 et plus, B 3,5 et plus, C 2,5 et plus, D en dessous.
export const lettreDeMoyenne = (m) => (m == null ? '' : m >= 4.5 ? 'A' : m >= 3.5 ? 'B' : m >= 2.5 ? 'C' : 'D')
export const formatMoyenne = (m) => (m == null ? '-' : m.toFixed(1).replace('.', ','))
const LETTRES_LIBELLE = { A: 'Excellent', B: 'Bon', C: 'Satisfaisant', D: 'À améliorer' }

export function GrilleCriteres({ criteres, value = {}, onChange }) {
  const moyenne = moyenneCriteres(value, criteres)
  const lettre = lettreDeMoyenne(moyenne)
  const nbNotes = criteres.filter((c) => value[c.id]).length
  return (
    <div className="space-y-1.5">
      {criteres.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2xl border border-white/80 bg-white/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
          <span className="min-w-0 text-sm font-bold text-gray-700">{c.label}</span>
          <div className="flex gap-1" role="group" aria-label={`Note pour ${c.label}`}>
            {[1, 2, 3, 4, 5].map((n) => {
              const actif = Number(value[c.id]) === n
              const col = COULEURS_NOTE[n - 1]
              return (
                <button key={n} type="button" aria-pressed={actif} onClick={() => onChange({ ...value, [c.id]: actif ? 0 : n })} title={`${n} sur 5`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  style={actif ? { background: `linear-gradient(145deg, color-mix(in srgb, ${col} 70%, white), ${col})`, color: '#fff', borderColor: 'rgba(255,255,255,0.8)', boxShadow: `0 6px 12px -5px ${col}, inset 0 1px 1px rgba(255,255,255,0.6)` } : { background: 'rgba(255,255,255,0.7)', color: '#64748b', borderColor: 'rgba(255,255,255,0.9)' }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/80 px-3.5 py-2.5 backdrop-blur-md" style={{ background: moyenne == null ? 'rgba(255,255,255,0.6)' : `linear-gradient(135deg, ${COULEURS_NOTE[Math.min(4, Math.max(0, Math.round(moyenne) - 1))]}22, rgba(255,255,255,0.7))` }}>
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Moyenne ({nbNotes}/{criteres.length} critères notés)</span>
        <span className="flex items-center gap-2">
          <span className="text-lg font-black tabular-nums text-gray-800">{formatMoyenne(moyenne)}<span className="text-xs font-semibold text-gray-500"> / 5</span></span>
          {lettre && <span className="rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white" style={{ background: COULEURS_NOTE[Math.min(4, Math.max(0, Math.round(moyenne) - 1))] }}>{lettre} : {LETTRES_LIBELLE[lettre]}</span>}
        </span>
      </div>
    </div>
  )
}

// Résumé d'une évaluation (détail au clic) : une barre par critère, puis la moyenne.
export function ResumeCriteres({ criteres, value = {} }) {
  const notes = criteres.filter((c) => Number(value[c.id]) >= 1)
  if (!notes.length) return null
  const moyenne = moyenneCriteres(value, criteres)
  return (
    <div className="space-y-1.5">
      {notes.map((c) => {
        const n = Number(value[c.id]), col = COULEURS_NOTE[n - 1]
        return (
          <div key={c.id} className="flex items-center gap-2.5 text-xs">
            <span className="w-40 shrink-0 truncate font-semibold text-gray-600" title={c.label}>{c.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200/80"><span className="block h-full rounded-full" style={{ width: `${(n / 5) * 100}%`, background: col }} /></span>
            <span className="w-8 shrink-0 text-right font-black tabular-nums" style={{ color: col }}>{n}/5</span>
          </div>
        )
      })}
      <p className="pt-1 text-xs font-bold text-gray-700">Moyenne : {formatMoyenne(moyenne)} / 5 ({lettreDeMoyenne(moyenne)} : {LETTRES_LIBELLE[lettreDeMoyenne(moyenne)]})</p>
    </div>
  )
}

// Choix de plusieurs employés (participants d'une formation…) : on touche le champ, la liste des employés s'ouvre et se filtre à mesure qu'on tape ;
// chaque employé choisi devient une pastille qu'on retire d'un toucher. Le bouton « Tout le personnel » désigne l'ensemble de l'équipe, y compris les
// futurs arrivants (la valeur est alors ['*']). `employes` : [{ id, nom, poste }] ; `value` : liste d'identifiants.
export const TOUT_LE_PERSONNEL = '*'
export function ChoixEmployes({ employes, value = [], onChange }) {
  const [q, setQ] = useState('')
  const tous = value.includes(TOUT_LE_PERSONNEL)
  const choisis = employes.filter((e) => value.includes(e.id))
  const restants = employes.filter((e) => !value.includes(e.id))
  const ajouter = (e) => { onChange([...value.filter((x) => x !== TOUT_LE_PERSONNEL), e.id]); setQ('') }
  const retirer = (id) => onChange(value.filter((x) => x !== id))
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={tous} data-actif={tous} onClick={() => onChange(tous ? [] : [TOUT_LE_PERSONNEL])} className={PASTILLE}>
          {tous ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <Users size={13} aria-hidden="true" />}Tout le personnel
        </button>
        {!tous && <span className="text-xs font-semibold text-gray-500">{choisis.length ? `${choisis.length} employé(s) choisi(s)` : 'ou choisissez des employés ci-dessous'}</span>}
      </div>
      {tous ? (
        <p className="ed-entree flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-sm text-gray-700 backdrop-blur-md">
          <Users size={16} className="shrink-0 text-sky-600" aria-hidden="true" />
          Toute l'équipe est concernée ({employes.length} employé(s)), y compris les prochains arrivants.
        </p>
      ) : (<>
        <ChampAutocomplete accent="sky" className="input-base" value={q} onChange={setQ} suggestions={restants} maxSuggestions={60}
          getLabel={(e) => e.nom} getDetail={(e) => e.poste || ''} onSelect={ajouter}
          placeholder={employes.length ? 'Touchez ici et écrivez un nom…' : 'Aucun employé : ajoutez-en dans Équipe, Annuaire.'} emptyLabel="Aucun employé correspondant." />
        {choisis.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Employés choisis">
            {choisis.map((e) => (
              <button key={e.id} type="button" onClick={() => retirer(e.id)} data-actif="true" title="Retirer" className={PASTILLE}>
                <Check size={13} strokeWidth={3} aria-hidden="true" />{e.nom}<X size={12} strokeWidth={3} aria-hidden="true" className="opacity-80" />
              </button>
            ))}
          </div>
        )}
      </>)}
    </div>
  )
}

// Choix par boutons parmi une liste fermée (type de contrat, statut, étape) : un seul bouton est actif, toucher un autre le remplace.
// `options` : [{ value, label }].
export function ChoixSimple({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((o) => {
        const actif = value === o.value
        return (
          <button key={o.value} type="button" aria-pressed={actif} data-actif={actif} onClick={() => onChange(o.value)} className={PASTILLE}>
            {actif && <Check size={13} strokeWidth={3} aria-hidden="true" />}{o.label}
          </button>
        )
      })}
    </div>
  )
}

// Fenêtre de saisie RH : verre dépoli teinté du bleu du module, courte présentation avec une icône qui flotte doucement, champs qui
// apparaissent l'un après l'autre, Entrée valide le formulaire. Les champs sont les enfants (des <Champ>, éventuellement dans une grille).
// `titreHero` : texte du bandeau du haut (par exemple le nom en cours de saisie) ; par défaut le titre de la fenêtre.
export function ModalRh({ open, onClose, title, titreHero, icone: Icone, iconeNode, intro, onSave, libelleSave = 'Enregistrer', size, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size={size} {...glassModalProps(BLEU_RH)}
      footer={<>
        <button type="button" onClick={onClose} className="rh-btn-annuler">Annuler</button>
        <button type="button" onClick={onSave} className="rh-btn-valider"><span className="rh-btn-valider-ico"><Check size={13} strokeWidth={3.2} aria-hidden="true" /></span><span className="relative">{libelleSave}</span></button>
      </>}>
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
          {(Icone || iconeNode) && (
            <div className="ed-entree relative mb-3 flex items-center gap-4 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(2,132,199,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
              style={{ background: `linear-gradient(135deg, ${BLEU_RH}e6 0%, #0c4a6ee6 100%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="rh-reflet pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" />
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md">
                {iconeNode || <Icone size={26} className="rh-flotte" />}
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{titreHero || title}</p>
                {intro && <p className="text-sm text-white/85">{intro}</p>}
              </div>
            </div>
          )}
          <div className="rh-champs space-y-3">{children}</div>
          <button type="submit" className="sr-only" tabIndex={-1}>{libelleSave}</button>
        </form>
      )}
    </Modal>
  )
}
