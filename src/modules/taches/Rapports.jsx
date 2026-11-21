// E-TACHES : rapports partagés. On rédige un rapport (avec un fichier au besoin) et on choisit qui peut le lire ; les destinataires sont prévenus par notification push.
import { useMemo, useRef, useState } from 'react'
import { FileText, Plus, Paperclip, Download, Trash2, Eye, Loader2 } from 'lucide-react'
import BandeauVolet, { BoutonBande, OngletsBande } from '../../shared/ui/BandeauVolet'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import EtatVide from '../../shared/ui/EtatVide'
import { glassModalProps } from '../../utils/color'
import { toast } from '../../core/notifications'
import { useCollection } from '../../hooks/useFirestore'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { COL, COULEUR, niveauTaches } from './data'
import { envoyerRapport, supprimerRapport } from './actions'
import { useMoi, usePersonnel } from './hooks'
import { Tuile, Pers, SelecteurPersonnes } from './ui'
import { heureMessage } from './outils'

const vide = { titre: '', description: '', destinataires: [], piece: null }

export default function Rapports() {
  const { moi, nom, role } = useMoi()
  const chef = niveauTaches(role) === 'chef'
  const { personnel, parUid } = usePersonnel()
  const { data } = useCollection(COL.rapports)
  const [vue, setVue] = useState('recus')
  const [form, setForm] = useState(null)
  const [lecture, setLecture] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const entree = useRef(null)

  const visibles = useMemo(() => data.filter((r) => chef || r.parUid === moi || (r.destinataires || []).includes(moi)), [data, chef, moi])
  const liste = useMemo(() => visibles
    .filter((r) => vue === 'tous' ? chef : vue === 'envoyes' ? r.parUid === moi : r.parUid !== moi)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0)), [visibles, vue, chef, moi])

  const options = [{ id: 'recus', label: 'Reçus' }, { id: 'envoyes', label: 'Envoyés' }, ...(chef ? [{ id: 'tous', label: 'Tous' }] : [])]
  const bascule = (uid) => setForm((f) => ({ ...f, destinataires: f.destinataires.includes(uid) ? f.destinataires.filter((x) => x !== uid) : [...f.destinataires, uid] }))

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0]
    if (!fichier) return
    setLecture(true)
    try { const piece = await lireFichier(fichier); setForm((f) => ({ ...f, piece })) } catch (err) { toast.error(`${fichier.name} : ${err.message}`) } finally { setLecture(false); if (entree.current) entree.current.value = '' }
  }
  async function envoyer() {
    if (!form.titre.trim()) return toast.error('Donnez un titre au rapport')
    if (!form.piece) return toast.error('Choisissez le fichier du rapport')
    if (!form.destinataires.length) return toast.error('Choisissez au moins un destinataire')
    setEnvoi(true)
    try { await envoyerRapport(form, { uid: moi, nom }); toast.success('Rapport envoyé, les destinataires sont prévenus ✓'); setForm(null) } catch (e) { toast.error("Échec de l'envoi : " + (e?.message || e)) } finally { setEnvoi(false) }
  }

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={FileText} surtitre="E-TACHES" titre="Rapports" sous="Partagez un rapport avec les personnes concernées."
        pied={<OngletsBande options={options} valeur={vue} onChange={setVue} />}>
        <BoutonBande icone={Plus} anime onClick={() => setForm({ ...vide })}>Nouveau rapport</BoutonBande>
      </BandeauVolet>

      {liste.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {liste.map((r) => (
            <li key={r.id} className="min-w-0">
              <Tuile titre={r.titre} icone={FileText}>
                <div className="space-y-2.5">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500"><Pers nom={r.parNom} taille={20} /><span>{heureMessage(r.ts)}</span></p>
                  {r.description && <p className="whitespace-pre-wrap text-sm text-gray-600">{r.description}</p>}
                  <p className="text-xs text-gray-500"><span className="font-bold text-gray-600">Pour :</span> {(r.destinataires || []).map((u) => parUid[u]?.nom || 'Ancien compte').join(', ') || 'Personne'}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.piece && (
                      <button type="button" onClick={() => ouvrirPiece(r.piece)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-violet-700">
                        {(r.piece.type || '').startsWith('image/') ? <Eye size={13} /> : <Download size={13} />}<span className="truncate">{r.piece.nom}</span><span className="font-medium text-gray-400">{formatTaille(r.piece.taille)}</span>
                      </button>
                    )}
                    <span className="flex-1" />
                    {(chef || r.parUid === moi) && role !== 'agent' && <button type="button" onClick={() => confirm(`Supprimer le rapport « ${r.titre} » ?`) && supprimerRapport(r)} aria-label="Supprimer" className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                </div>
              </Tuile>
            </li>
          ))}
        </ul>
      ) : <EtatVide icone={FileText} accent={COULEUR} texte={vue === 'envoyes' ? 'Vous n\'avez envoyé aucun rapport' : 'Aucun rapport'} />}

      {form && (
        <Modal open onClose={() => setForm(null)} size="lg" title="Nouveau rapport" {...glassModalProps(COULEUR)}
          footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button loading={envoi} onClick={envoyer} style={{ backgroundColor: COULEUR }}>Envoyer</Button></>}>
          <div className="params-verre space-y-3" style={{ '--p-accent': COULEUR }}>
            <FormGroup label="Titre" required><Input value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} placeholder="Ex : Rapport d'activité de novembre" autoFocus /></FormGroup>
            <FormGroup label="Résumé"><textarea className="input-base min-h-[5rem]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="L'essentiel en quelques lignes" /></FormGroup>
            <div className="fg-tuile">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Qui peut voir ce rapport ? *</p>
              <SelecteurPersonnes personnes={personnel.filter((p) => p.uid !== moi)} value={form.destinataires} onChange={(destinataires) => setForm((f) => ({ ...f, destinataires }))} />
            </div>
            <div className="fg-tuile">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Fichier * (tout format, 4 Mo au plus)</p>
              {form.piece ? (
                <div className="flex items-center gap-2 text-sm"><Paperclip size={14} className="text-violet-600" /><span className="min-w-0 flex-1 truncate font-semibold">{form.piece.nom}</span><span className="text-xs text-gray-400">{formatTaille(form.piece.taille)}</span><button type="button" onClick={() => setForm((f) => ({ ...f, piece: null }))} className="text-xs font-bold text-red-600">Retirer</button></div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-violet-300 bg-violet-50/60 px-4 py-2 text-sm font-bold text-violet-700">
                  {lecture ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />} Joindre un fichier
                  <input ref={entree} type="file" className="sr-only" onChange={choisirFichier} />
                </label>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
