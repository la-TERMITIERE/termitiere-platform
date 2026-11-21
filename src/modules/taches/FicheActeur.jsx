// E-TACHES : fiche d'une personne sur une période : tâches reçues, confiées à d'autres et auto-attribuées, chacune avec ses indicateurs cliquables.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Send, Repeat } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import EtatVide from '../../shared/ui/EtatVide'
import { glassModalProps } from '../../utils/color'
import { todayStr } from '../../utils/formatters'
import { COULEUR, enRetard, formatJour } from './data'
import { dateAttribution, joursEntre } from './pilotageCalculs'
import { PastilleStatut, Pers } from './ui'

export function indicateurs(liste, jour = todayStr()) {
  const finies = liste.filter((t) => t.statut === 'Terminé')
  const clotures = finies.filter((t) => t.dateCloture && dateAttribution(t))
  return {
    total: liste.length, finies: finies.length, encours: liste.filter((t) => t.statut === 'En cours').length, afaire: liste.filter((t) => t.statut === 'À faire').length,
    retard: liste.filter((t) => enRetard(t, jour)).length, tardif: liste.filter((t) => t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour).length,
    taux: liste.length ? Math.round((finies.length * 100) / liste.length) : 0,
    delai: clotures.length ? Math.round(clotures.reduce((s, t) => s + Math.max(0, joursEntre(dateAttribution(t), t.dateCloture)), 0) / clotures.length) : 0
  }
}

const FILTRES = {
  all: () => true, done: (t) => t.statut === 'Terminé', encours: (t) => t.statut === 'En cours', afaire: (t) => t.statut === 'À faire',
  retard: (t, j) => enRetard(t, j), tardif: (t, j) => t.statut === 'À faire' && !!t.dateDebut && t.dateDebut <= j
}
const GROUPES = [
  { id: 'recues', titre: 'Tâches reçues (des autres)', icone: Inbox },
  { id: 'pilotees', titre: 'Tâches confiées aux autres', icone: Send },
  { id: 'auto', titre: 'Tâches qu\'il s\'est confiées', icone: Repeat }
]

export default function FicheActeur({ acteur, taches, onClose }) {
  const navigate = useNavigate()
  const jour = todayStr()
  const [groupe, setGroupe] = useState('recues')
  const [filtre, setFiltre] = useState('all')

  const groupes = useMemo(() => ({
    recues: taches.filter((t) => t.destUid === acteur.uid && t.parUid !== acteur.uid),
    pilotees: taches.filter((t) => t.parUid === acteur.uid && t.destUid !== acteur.uid),
    auto: taches.filter((t) => t.parUid === acteur.uid && t.destUid === acteur.uid)
  }), [taches, acteur.uid])
  const liste = useMemo(() => groupes[groupe].filter((t) => FILTRES[filtre](t, jour)).sort((a, b) => (dateAttribution(b) || '').localeCompare(dateAttribution(a) || '')), [groupes, groupe, filtre, jour])

  const Carte = ({ g, cle, label, valeur, sous, couleur }) => {
    const actif = groupe === g && filtre === cle
    return (
      <button type="button" onClick={() => { setGroupe(g); setFiltre(cle) }} aria-pressed={actif}
        className={`rounded-2xl border px-3 py-2 text-left transition-all ${actif ? 'border-violet-400 bg-violet-100/80 shadow-sm' : 'border-white/80 bg-white/60 hover:bg-white/90'}`}>
        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block text-xl font-black" style={{ color: couleur || '#1f2937' }}>{valeur}</span>
        {sous && <span className="block text-[10px] text-gray-400">{sous}</span>}
      </button>
    )
  }

  return (
    <Modal open onClose={onClose} size="xl" title={acteur.nom} {...glassModalProps(COULEUR)}>
      <div className="space-y-4">
        {acteur.poste || acteur.secteur ? <p className="-mt-1 text-xs text-gray-500">{[acteur.poste, acteur.secteur].filter(Boolean).join(' · ')}</p> : null}
        {GROUPES.map(({ id, titre, icone: Icone }) => {
          const k = indicateurs(groupes[id], jour)
          return (
            <section key={id} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-gray-700"><Icone size={15} style={{ color: COULEUR }} />{titre}<span className="rounded-full bg-violet-100 px-2 text-xs text-violet-700">{k.total}</span></h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <Carte g={id} cle="all" label="Total" valeur={k.total} />
                <Carte g={id} cle="done" label="Terminées" valeur={k.finies} sous={k.total ? `${k.taux}%` : ''} couleur="#16a34a" />
                <Carte g={id} cle="encours" label="En cours" valeur={k.encours} couleur="#0284c7" />
                <Carte g={id} cle="afaire" label="À faire" valeur={k.afaire} />
                <Carte g={id} cle="retard" label="En retard" valeur={k.retard} couleur={k.retard ? '#dc2626' : '#16a34a'} />
                <Carte g={id} cle="tardif" label="Dém. tardif" valeur={k.tardif} couleur={k.tardif ? '#d97706' : '#16a34a'} />
                <div className="rounded-2xl border border-white/80 bg-white/40 px-3 py-2"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Délai moyen</span><span className="block text-xl font-black text-gray-800">{k.delai ? `${k.delai} j` : '-'}</span></div>
              </div>
            </section>
          )
        })}
        <div>
          <p className="mb-2 text-xs font-bold text-violet-700">{GROUPES.find((g) => g.id === groupe).titre} · {{ all: 'toutes', done: 'terminées', encours: 'en cours', afaire: 'à faire', retard: 'en retard', tardif: 'démarrage tardif' }[filtre]} ({liste.length})</p>
          {liste.length ? (
            <ul className="divide-y divide-black/5 rounded-2xl bg-white/60">
              {liste.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate(`/taches/taches?t=${t.id}`)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/80">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-800">{t.titre}</span><span className="block truncate text-xs text-gray-500">{t.numero} · échéance {formatJour(t.dateLimite) || '-'}{t.dateCloture ? ` · clôturée le ${formatJour(t.dateCloture)}` : ''}</span></span>
                    <span className="hidden sm:block"><Pers nom={groupe === 'recues' ? t.parNom : t.destNom} /></span>
                    <span className="w-10 text-right text-xs font-extrabold text-gray-500">{t.progression || 0}%</span>
                    <PastilleStatut tache={t} jour={jour} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <EtatVide icone={Inbox} accent={COULEUR} texte="Aucune tâche" />}
        </div>
      </div>
    </Modal>
  )
}
