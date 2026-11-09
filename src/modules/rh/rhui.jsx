import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
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
export function ChoixBoutons({ options, value, onChange, autre = 'Autre', placeholderAutre = 'Précisez', vide }) {
  const estSuggestion = options.includes(value)
  const [autreOuvert, setAutreOuvert] = useState(false)
  const modeAutre = autreOuvert || (!!value && !estSuggestion)
  const pastille = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
  const style = (actif) => (actif ? { background: BLEU_RH, borderColor: BLEU_RH, color: '#fff' } : undefined)
  const inactif = 'border-white/80 bg-white/70 text-gray-700 hover:bg-white'
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group">
        {options.map((o) => {
          const actif = value === o && !modeAutre
          return (
            <button key={o} type="button" aria-pressed={actif} onClick={() => { setAutreOuvert(false); onChange(actif ? '' : o) }} className={`${pastille} ${actif ? 'rh-pop' : inactif}`} style={style(actif)}>
              {actif && <Check size={13} strokeWidth={3} aria-hidden="true" />}{o}
            </button>
          )
        })}
        <button type="button" aria-pressed={modeAutre} onClick={() => { if (modeAutre) { setAutreOuvert(false); onChange('') } else { setAutreOuvert(true); if (estSuggestion) onChange('') } }} className={`${pastille} ${modeAutre ? 'rh-pop' : inactif}`} style={style(modeAutre)}>
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

// Fenêtre de saisie RH : verre dépoli teinté du bleu du module, courte présentation avec une icône qui flotte doucement, champs qui
// apparaissent l'un après l'autre, Entrée valide le formulaire. Les champs sont les enfants (des <Champ>, éventuellement dans une grille).
// `titreHero` : texte du bandeau du haut (par exemple le nom en cours de saisie) ; par défaut le titre de la fenêtre.
export function ModalRh({ open, onClose, title, titreHero, icone: Icone, intro, onSave, libelleSave = 'Enregistrer', size, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size={size} {...glassModalProps(BLEU_RH)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={onSave} style={{ backgroundColor: BLEU_RH }}><Check size={16} /> {libelleSave}</Button>
      </>}>
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
          {Icone && (
            <div className="ed-entree relative mb-3 flex items-center gap-4 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(2,132,199,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
              style={{ background: `linear-gradient(135deg, ${BLEU_RH}e6 0%, #0c4a6ee6 100%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="rh-reflet pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" />
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <Icone size={26} className="rh-flotte" />
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
