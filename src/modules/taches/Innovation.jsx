// E-TACHES : boîte à idées. Chacun propose, tout le monde lit et commente ; seule la direction générale fait avancer le statut (avis visible par tous, envoyé à l'auteur).
import { useMemo, useState } from 'react'
import { Lightbulb, MessageSquare, Scale, Trash2, Send } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import EtatVide from '../../shared/ui/EtatVide'
import AvatarNom from '../../shared/ui/AvatarNom'
import { glassModalProps } from '../../utils/color'
import { toast } from '../../core/notifications'
import { addItem, updateItem, removeItem } from '../../core/db'
import { notify } from '../../core/notify'
import { useCollection } from '../../hooks/useFirestore'
import { COULEUR, niveauTaches } from './data'
import { useMoi } from './hooks'
import { Tuile } from './ui'
import { heureMessage } from './outils'

const COL_IDEES = 'taches_idees'
const STATUTS = ['Nouvelle', 'À l\'étude', 'Retenue', 'Écartée']
const COULEUR_STATUT_IDEE = { 'Nouvelle': '#1a73e8', 'À l\'étude': '#e37400', 'Retenue': '#137333', 'Écartée': '#5f6368' }

const Pastille = ({ s }) => <span className="inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ background: COULEUR_STATUT_IDEE[s] || '#5f6368' }}>{s}</span>

export default function Innovation() {
  const { moi, nom, role } = useMoi()
  const chef = niveauTaches(role) === 'chef'
  const { data } = useCollection(COL_IDEES)
  const [filtre, setFiltre] = useState('')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [categorie, setCategorie] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [commentee, setCommentee] = useState(null)
  const [arbitree, setArbitree] = useState(null)
  const [texte, setTexte] = useState('')
  const [statut, setStatut] = useState('Nouvelle')
  const [avis, setAvis] = useState('')

  const idees = useMemo(() => [...data].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [data])
  const comptes = useMemo(() => { const m = {}; idees.forEach((i) => { m[i.statut] = (m[i.statut] || 0) + 1 }); return m }, [idees])
  const liste = filtre ? idees.filter((i) => i.statut === filtre) : idees
  const ouverte = commentee ? idees.find((i) => i.id === commentee) : null

  async function proposer(e) {
    e.preventDefault()
    if (!titre.trim()) return toast.error('Donnez un titre à votre idée')
    if (!description.trim()) return toast.error('Décrivez votre idée')
    setEnvoi(true)
    try {
      await addItem(COL_IDEES, { titre: titre.trim(), description: description.trim(), categorie: categorie.trim(), parUid: moi, parNom: nom, statut: 'Nouvelle', avis: '', commentaires: [] })
      setTitre(''); setDescription(''); setCategorie('')
      toast.success('Idée proposée, merci ✓')
    } catch (err) { toast.error(err?.message || "Échec de l'envoi") } finally { setEnvoi(false) }
  }

  async function commenter() {
    const corps = texte.trim()
    if (!corps || !ouverte) return
    setTexte('')
    await updateItem(COL_IDEES, ouverte.id, { commentaires: [...(ouverte.commentaires || []), { uid: moi, nom, texte: corps, ts: Date.now() }] })
    if (ouverte.parUid !== moi) await notify({ type: 'info', title: `Commentaire sur votre idée : ${ouverte.titre}`, body: `${nom} : ${corps.length > 110 ? corps.slice(0, 110) + '…' : corps}`, module: 'taches', forUsers: [ouverte.parUid], link: '/taches/innovation' }).catch(() => {})
  }

  async function arbitrer() {
    const i = arbitree
    setArbitree(null)
    try {
      await updateItem(COL_IDEES, i.id, { statut, avis: avis.trim() })
      toast.success('Idée mise à jour ✓')
      if (i.parUid !== moi) await notify({ type: 'info', title: `Votre idée est « ${statut} » : ${i.titre}`, body: avis.trim() || 'La direction a examiné votre idée.', module: 'taches', forUsers: [i.parUid], link: '/taches/innovation' }).catch(() => {})
    } catch (e) { toast.error(e?.message || 'Échec') }
  }

  const supprimer = (i) => { if (confirm('Supprimer cette idée et ses commentaires ? Cette action est définitive.')) removeItem(COL_IDEES, i.id).catch((e) => toast.error(e?.message || 'Suppression impossible')) }

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Lightbulb} surtitre="E-TACHES" titre="Innovation" sous="Partagez vos idées pour faire avancer LA TERMITIÈRE : tout le monde les voit et peut les commenter." />

      <Tuile titre="Proposer une idée" icone={Lightbulb} accent="#d97706">
        <form onSubmit={proposer} className="params-verre grid gap-3 sm:grid-cols-2" style={{ '--p-accent': COULEUR }}>
          <FormGroup label="Titre" required className="sm:col-span-2"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Automatiser le rapport hebdomadaire" /></FormGroup>
          <FormGroup label="Votre idée" required className="sm:col-span-2"><textarea className="input-base min-h-[5rem]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quel problème ça règle ? Qu'est-ce que ça apporte ?" /></FormGroup>
          <FormGroup label="Domaine"><Input value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Optionnel : Production, RH, Digital" /></FormGroup>
          <div className="flex items-end justify-end"><Button type="submit" loading={envoi} style={{ backgroundColor: COULEUR }}>Proposer</Button></div>
        </form>
      </Tuile>

      <div className="flex flex-wrap gap-2">
        {['', ...STATUTS].map((s) => (
          <button key={s || 'tous'} type="button" onClick={() => setFiltre(s)} aria-pressed={filtre === s} data-actif={filtre === s} className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': COULEUR_STATUT_IDEE[s] || COULEUR }}>
            {s || 'Toutes'} ({s ? comptes[s] || 0 : idees.length})
          </button>
        ))}
      </div>

      {liste.length ? (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {liste.map((i) => (
            <li key={i.id} className="min-w-0">
              <Tuile>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <AvatarNom nom={i.parNom} accent={COULEUR} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-gray-800">{i.titre}{i.parUid === moi && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Mon idée</span>}</p>
                      <p className="text-xs text-gray-500">Par {i.parNom} · {heureMessage(i.createdAt)}{i.categorie ? ` · ${i.categorie}` : ''}</p>
                    </div>
                    <Pastille s={i.statut} />
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-600">{i.description}</p>
                  {i.avis && <div className="rounded-xl border-l-4 bg-white/70 px-3 py-2 text-sm" style={{ borderColor: COULEUR_STATUT_IDEE[i.statut] }}><strong>Avis de la direction :</strong> {i.avis}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setCommentee(i.id)} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-gray-600"><MessageSquare size={13} />Commentaires{(i.commentaires || []).length ? ` (${i.commentaires.length})` : ''}</button>
                    {chef && <button type="button" onClick={() => { setArbitree(i); setStatut(i.statut); setAvis(i.avis || '') }} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-gray-600"><Scale size={13} />Arbitrer</button>}
                    <span className="flex-1" />
                    {(chef || i.parUid === moi) && role !== 'agent' && <button type="button" onClick={() => supprimer(i)} aria-label="Supprimer l'idée" className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                </div>
              </Tuile>
            </li>
          ))}
        </ul>
      ) : <EtatVide icone={Lightbulb} accent={COULEUR} texte={filtre ? 'Aucune idée dans ce statut' : 'Aucune idée pour le moment : lancez-vous'} />}

      {ouverte && (
        <Modal open onClose={() => setCommentee(null)} size="lg" title={`Commentaires : ${ouverte.titre}`} {...glassModalProps(COULEUR)}>
          <div className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(ouverte.commentaires || []).map((c, k) => <p key={k} className="rounded-2xl bg-white/70 px-3 py-2 text-sm"><span className="font-extrabold" style={{ color: COULEUR }}>{c.nom}</span> <span className="text-[10px] text-gray-400">{heureMessage(c.ts)}</span><span className="block whitespace-pre-wrap text-gray-700">{c.texte}</span></p>)}
              {!(ouverte.commentaires || []).length && <p className="py-4 text-center text-sm text-gray-400">Aucun commentaire.</p>}
            </div>
            <div className="flex gap-2"><input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commenter()} placeholder="Votre commentaire…" aria-label="Commentaire" className="input-base flex-1" /><Button onClick={commenter} disabled={!texte.trim()} style={{ backgroundColor: COULEUR }} aria-label="Envoyer"><Send size={15} /></Button></div>
          </div>
        </Modal>
      )}

      {arbitree && (
        <Modal open onClose={() => setArbitree(null)} size="md" title={`Arbitrer : ${arbitree.titre}`} {...glassModalProps(COULEUR)}
          footer={<><Button variant="ghost" onClick={() => setArbitree(null)}>Annuler</Button><Button onClick={arbitrer} style={{ backgroundColor: COULEUR }}>Enregistrer</Button></>}>
          <div className="params-verre space-y-3" style={{ '--p-accent': COULEUR }}>
            <FormGroup label="Statut"><Select value={statut} onChange={(e) => setStatut(e.target.value)}>{STATUTS.map((s) => <option key={s}>{s}</option>)}</Select></FormGroup>
            <FormGroup label="Avis (visible par tous, envoyé à l'auteur)"><textarea className="input-base min-h-[5rem]" value={avis} onChange={(e) => setAvis(e.target.value)} /></FormGroup>
          </div>
        </Modal>
      )}
    </div>
  )
}
