// E-TACHES : création et modification d'une tâche (fenêtre en verre, champs en tuiles bento).
import { useState } from 'react'
import { Star, Users } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { glassModalProps } from '../../utils/color'
import { toast } from '../../core/notifications'
import { todayStr } from '../../utils/formatters'
import { COULEUR, PRIORITES, peutAssignerAuxAutres } from './data'
import { creerTache, modifierTache } from './actions'
import { SelecteurPersonnes } from './ui'
import { usePersonnel, useMoi } from './hooks'

const vide = (moi, nom, role) => ({
  titre: '', destUid: peutAssignerAuxAutres(role) ? '' : moi, destNom: peutAssignerAuxAutres(role) ? '' : nom,
  description: '', resultatAttendu: '', dateDebut: '', dateLimite: '', priorite: 'Moyenne', categorie: '', note: '', rapportRequis: false, membres: [], pieces: []
})

export default function TacheForm({ tache, categories = [], nbExistantes = 0, onClose, onSaved }) {
  const { moi, nom, role, user } = useMoi()
  const { personnel } = usePersonnel()
  const [f, setF] = useState(() => (tache ? { ...vide(moi, nom, role), ...tache, membres: tache.membres || [], pieces: tache.pieces || [] } : vide(moi, nom, role)))
  const [enCours, setEnCours] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const autres = peutAssignerAuxAutres(role)
  const modif = !!tache

  const basculeMembre = (p) => setF((x) => {
    const a = x.membres.some((m) => m.uid === p.uid)
    return { ...x, membres: a ? x.membres.filter((m) => m.uid !== p.uid) : [...x.membres, { uid: p.uid, nom: p.nom, leader: false, sousStatut: 'À faire', lienRapport: '' }] }
  })
  const chefEquipe = (uid) => setF((x) => ({ ...x, membres: x.membres.map((m) => ({ ...m, leader: m.uid === uid ? !m.leader : false })) }))

  async function enregistrer() {
    if (!f.titre.trim()) return toast.error('Donnez un titre à la tâche')
    if (!f.destUid) return toast.error('Choisissez le destinataire')
    if (!f.dateLimite) return toast.error('Indiquez la date limite')
    if (f.dateDebut && f.dateDebut > f.dateLimite) return toast.error('Le début ne peut pas dépasser la date limite')
    setEnCours(true)
    try {
      const dest = personnel.find((p) => p.uid === f.destUid)
      const donnees = { ...f, destNom: dest?.nom || f.destNom }
      if (modif) {
        await modifierTache(tache, {
          titre: donnees.titre.trim(), description: donnees.description.trim(), resultatAttendu: donnees.resultatAttendu.trim(), categorie: donnees.categorie.trim(),
          priorite: donnees.priorite, dateDebut: donnees.dateDebut, dateLimite: donnees.dateLimite, note: donnees.note.trim(), rapportRequis: !!donnees.rapportRequis,
          destUid: donnees.destUid, destNom: donnees.destNom, membres: donnees.membres, pieces: donnees.pieces
        }, { uid: moi, nom })
        toast.success('Tâche mise à jour ✓')
        onSaved?.(tache.id)
      } else {
        const id = await creerTache(donnees, { uid: moi, nom }, nbExistantes)
        toast.success('Tâche créée, le destinataire est prévenu ✓')
        onSaved?.(id)
      }
      onClose()
    } catch (e) {
      toast.error("Échec de l'enregistrement : " + (e?.message || e))
    } finally { setEnCours(false) }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={modif ? `Modifier ${tache.numero || 'la tâche'}` : 'Nouvelle tâche'} {...glassModalProps(COULEUR)}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={enCours} onClick={enregistrer} style={{ backgroundColor: COULEUR }}>{modif ? 'Enregistrer' : 'Créer la tâche'}</Button></>}>
      <div className="params-verre grid gap-3 sm:grid-cols-2" style={{ '--p-accent': COULEUR }}>
        <FormGroup label="Titre" required className="sm:col-span-2"><Input value={f.titre} onChange={(e) => set('titre', e.target.value)} placeholder="Ex : Préparer l'inventaire de fin de mois" autoFocus /></FormGroup>

        <FormGroup label="Destinataire" required>
          {autres ? (
            <Select value={f.destUid} onChange={(e) => set('destUid', e.target.value)}>
              <option value="">Choisir une personne</option>
              {personnel.map((p) => <option key={p.uid} value={p.uid}>{p.nom}{p.poste ? ` · ${p.poste}` : ''}</option>)}
            </Select>
          ) : <Input value={nom} disabled readOnly />}
        </FormGroup>
        <FormGroup label="Priorité">
          <Select value={f.priorite} onChange={(e) => set('priorite', e.target.value)}>{PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
        </FormGroup>

        <FormGroup label="Date de début souhaitée"><Input type="date" value={f.dateDebut} min={modif ? undefined : todayStr()} onChange={(e) => set('dateDebut', e.target.value)} /></FormGroup>
        <FormGroup label="Date limite" required><Input type="date" value={f.dateLimite} min={modif ? undefined : todayStr()} onChange={(e) => set('dateLimite', e.target.value)} /></FormGroup>

        <FormGroup label="Description" className="sm:col-span-2"><textarea className="input-base min-h-[5rem]" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Ce qu'il faut faire, en quelques lignes" /></FormGroup>
        <FormGroup label="Résultat attendu" className="sm:col-span-2" hint="Ce qui sera concrètement obtenu une fois la tâche terminée : rapport validé, 50 appels passés…"><textarea className="input-base min-h-[4rem]" value={f.resultatAttendu} onChange={(e) => set('resultatAttendu', e.target.value)} /></FormGroup>

        <FormGroup label="Catégorie" hint="Saisie libre ; les catégories déjà utilisées sont proposées.">
          <Input list="taches-categories" value={f.categorie} onChange={(e) => set('categorie', e.target.value)} placeholder="Ex : Comptabilité, Marketing" />
          <datalist id="taches-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </FormGroup>
        <FormGroup label="Note"><Input value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Instructions complémentaires" /></FormGroup>

        <label className="fg-tuile flex cursor-pointer items-start gap-3 sm:col-span-2">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={f.rapportRequis} onChange={(e) => set('rapportRequis', e.target.checked)} />
          <span><span className="block text-sm font-bold text-gray-800">Rapport ou preuve requis à la clôture</span><span className="block text-xs text-gray-500">Le destinataire devra joindre un lien (rapport, photo, document) ou un fichier avant de marquer la tâche terminée.</span></span>
        </label>

        {autres && (
          <div className="fg-tuile sm:col-span-2">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><Users size={14} /> Équipe (optionnel)</p>
            <p className="mb-2 text-xs text-gray-500">Ajoutez d'autres personnes pour une tâche collective : chacune avance à son rythme, la tâche se termine quand tout le monde a terminé. L'étoile désigne le chef d'équipe.</p>
            <SelecteurPersonnes personnes={personnel.filter((p) => p.uid !== f.destUid)} value={f.membres.map((m) => m.uid)}
              onChange={(uids) => setF((x) => ({ ...x, membres: uids.map((uid) => x.membres.find((m) => m.uid === uid) || { uid, nom: personnel.find((p) => p.uid === uid)?.nom || uid, leader: false, sousStatut: 'À faire', lienRapport: '' }) }))}
              placeholder="Ajouter un membre : tapez un nom" />
            {f.membres.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {f.membres.map((m) => (
                  <li key={m.uid} className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">{m.nom}</span>
                    <button type="button" onClick={() => chefEquipe(m.uid)} aria-pressed={m.leader} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${m.leader ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-white/80 bg-white/70 text-gray-500'}`}><Star size={12} className={m.leader ? 'fill-amber-400 text-amber-500' : ''} />{m.leader ? "Chef d'équipe" : "Désigner chef d'équipe"}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="fg-tuile sm:col-span-2">
          <PiecesJointes pieces={f.pieces} label="Documents joints" onAdd={(p) => setF((x) => ({ ...x, pieces: [...x.pieces, p] }))} onRemove={(p) => setF((x) => ({ ...x, pieces: x.pieces.filter((y) => y !== p) }))} />
        </div>
      </div>
    </Modal>
  )
}
