// E-TACHES : objectifs personnels et de département, avec avancement et commentaires.
import { useMemo, useState } from 'react'
import { Target, Plus, Pencil, Trash2, MessageSquare, Send, Calendar } from 'lucide-react'
import BandeauVolet, { BoutonBande, OngletsBande } from '../../shared/ui/BandeauVolet'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import EtatVide from '../../shared/ui/EtatVide'
import Badge from '../../shared/ui/Badge'
import { glassModalProps } from '../../utils/color'
import { toast } from '../../core/notifications'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr } from '../../utils/formatters'
import { COL, COULEUR, STATUTS_OBJECTIF, voitToutesLesEquipes, joursAvant, formatJour, niveauTaches, peutSupprimerTache } from './data'
import { enregistrerObjectif, majObjectif, commenterObjectif, supprimerObjectif } from './actions'
import { useMoi, usePersonnel } from './hooks'
import { Tuile, Bento, Barre, Anneau, Pers } from './ui'
import { heureMessage } from './outils'
import { usePeriode } from './Periode'
import { bornesPilotage } from './pilotageCalculs'

const TON = { 'En cours': 'info', Atteint: 'success', 'Échec': 'danger', 'Abandonné': 'neutral' }
const videObjectif = (moi, nom, equipe) => ({ type: 'perso', cibleUid: equipe ? '' : moi, cibleNom: equipe ? '' : nom, titre: '', description: '', dateDebut: todayStr(), dateFin: '', progression: 0, statut: 'En cours' })

export default function Objectifs() {
  const { moi, nom, role } = useMoi()
  const equipe = voitToutesLesEquipes(role)
  const { personnel } = usePersonnel()
  const { data } = useCollection(COL.objectifs)
  const [filtre, setFiltre] = useState('tous')
  const [statutFiltre, setStatutFiltre] = useState('')
  const { periode, selecteur } = usePeriode('all')
  const [form, setForm] = useState(null)
  const [ouvert, setOuvert] = useState(null) // objectif dont les commentaires sont affichés
  const [texte, setTexte] = useState('')
  const jour = todayStr()

  const visibles = useMemo(() => data.filter((o) => equipe || (o.type === 'perso' && o.cibleUid === moi)), [data, equipe, moi])
  // Période : un objectif compte s'il recoupe la période choisie (comme dans l'ancienne application).
  const bornes = bornesPilotage(periode)
  const dansPeriode = (o) => (!bornes.from || !o.dateFin || o.dateFin >= bornes.from) && (!bornes.to || !o.dateDebut || o.dateDebut <= bornes.to)
  const liste = useMemo(() => visibles.filter((o) => filtre === 'tous' || o.type === filtre).filter((o) => !statutFiltre || o.statut === statutFiltre).filter(dansPeriode).sort((a, b) => (a.statut === 'En cours' ? 0 : 1) - (b.statut === 'En cours' ? 0 : 1) || ((a.dateFin || '9999') < (b.dateFin || '9999') ? -1 : 1)), [visibles, filtre, statutFiltre, bornes.from, bornes.to])
  const encours = visibles.filter((o) => o.statut === 'En cours')
  const moyenne = encours.length ? encours.reduce((s, o) => s + (o.progression || 0), 0) / encours.length : 0
  const departements = useMemo(() => [...new Set([...personnel.map((p) => p.secteur), ...data.filter((o) => o.type === 'dept').map((o) => o.cibleNom)].filter(Boolean))].sort(), [personnel, data])

  const peutAgir = (o) => equipe || o.parUid === moi || o.cibleUid === moi
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function enregistrer() {
    if (!form.titre.trim()) return toast.error('Donnez un titre à l\'objectif')
    if (form.type === 'perso' && !form.cibleUid) return toast.error('Choisissez la personne concernée')
    if (form.type === 'dept' && !form.cibleNom.trim()) return toast.error('Indiquez le département')
    if (form.dateDebut && form.dateFin && form.dateDebut > form.dateFin) return toast.error('La fin ne peut pas précéder le début')
    try {
      const cible = personnel.find((p) => p.uid === form.cibleUid)
      await enregistrerObjectif({ ...form, cibleNom: form.type === 'perso' ? (cible?.nom || form.cibleNom) : form.cibleNom.trim() }, { uid: moi, nom })
      toast.success('Objectif enregistré ✓')
      setForm(null)
    } catch (e) { toast.error("Échec de l'enregistrement : " + (e?.message || e)) }
  }

  const commenter = async (o) => { const t = texte; setTexte(''); await commenterObjectif(o, t, { uid: moi, nom }).catch((e) => toast.error(e?.message || 'Envoi impossible')) }

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Target} surtitre="E-TACHES" titre="Objectifs" sous="Ce que chacun et chaque département doit atteindre, et où l'on en est."
        pied={equipe ? <OngletsBande options={[{ id: 'tous', label: 'Tous' }, { id: 'perso', label: 'Personnels' }, { id: 'dept', label: 'Départements' }]} valeur={filtre} onChange={setFiltre} /> : null}>
        <BoutonBande icone={Plus} anime onClick={() => setForm(videObjectif(moi, nom, equipe))}>Nouvel objectif</BoutonBande>
      </BandeauVolet>

      <div className="flex flex-wrap items-center gap-2">
        {selecteur}
        <select value={statutFiltre} onChange={(e) => setStatutFiltre(e.target.value)} aria-label="Statut" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold">
          <option value="">Tous les statuts</option>{STATUTS_OBJECTIF.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs font-semibold text-gray-500">{liste.length} objectif{liste.length > 1 ? 's' : ''}</span>
      </div>

      <Bento>
        <Tuile titre="Avancement moyen" icone={Target} className="flex flex-col items-center">
          <div className="flex flex-col items-center gap-2 py-1"><Anneau valeur={moyenne} /><p className="text-xs text-gray-500">{encours.length} objectif{encours.length > 1 ? 's' : ''} en cours</p></div>
        </Tuile>
        <Tuile titre="Bilan" icone={Target} accent="#16a34a">
          <div className="grid grid-cols-2 gap-2 text-center">
            {[['Atteints', visibles.filter((o) => o.statut === 'Atteint').length, '#16a34a'], ['Échecs', visibles.filter((o) => o.statut === 'Échec').length, '#dc2626'], ['En cours', encours.length, '#0284c7'], ['Abandonnés', visibles.filter((o) => o.statut === 'Abandonné').length, '#64748b']].map(([l, n, c]) => <div key={l} className="rounded-xl bg-white/60 px-2 py-1.5"><p className="text-xl font-black" style={{ color: c }}>{n}</p><p className="text-[10px] font-bold uppercase text-gray-500">{l}</p></div>)}
          </div>
        </Tuile>
        <Tuile titre="À échéance proche" icone={Calendar} accent="#d97706" span="sm:col-span-2">
          {encours.filter((o) => o.dateFin && joursAvant(o.dateFin, jour) <= 14).sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1)).slice(0, 3).map((o) => (
            <p key={o.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate font-semibold text-gray-700">{o.titre}</span><span className={`shrink-0 text-xs font-bold ${joursAvant(o.dateFin, jour) < 0 ? 'text-red-600' : 'text-amber-600'}`}>{formatJour(o.dateFin)}</span></p>
          ))}
          {!encours.some((o) => o.dateFin && joursAvant(o.dateFin, jour) <= 14) && <p className="py-2 text-sm text-gray-400">Aucune échéance dans les 14 jours.</p>}
        </Tuile>
      </Bento>

      {liste.length ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {liste.map((o) => {
            const reste = joursAvant(o.dateFin, jour)
            const peut = peutAgir(o)
            const commentaires = o.commentaires || []
            return (
              <li key={o.id} className="min-w-0">
                <Tuile titre={o.titre} icone={Target} action={<Badge tone={TON[o.statut] || 'neutral'}>{o.statut}</Badge>}>
                  <div className="space-y-3">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {o.type === 'perso' ? <Pers nom={o.cibleNom} taille={20} /> : <span className="font-bold text-gray-700">Département : {o.cibleNom}</span>}
                      {o.dateFin && <span className={reste !== null && reste < 0 && o.statut === 'En cours' ? 'font-bold text-red-600' : ''}>{formatJour(o.dateDebut)} → {formatJour(o.dateFin)}{reste !== null && o.statut === 'En cours' ? ` (${reste < 0 ? `échu depuis ${-reste} j` : reste === 0 ? "aujourd'hui" : `${reste} j`})` : ''}</span>}
                    </p>
                    {o.description && <p className="whitespace-pre-wrap text-sm text-gray-600">{o.description}</p>}
                    <div>
                      <div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Avancement</span><span className="text-sm font-black" style={{ color: COULEUR }}>{o.progression || 0}%</span></div>
                      <Barre valeur={o.progression} hauteur="h-2.5" />
                      {peut && o.statut === 'En cours' && <input type="range" min="0" max="100" step="5" value={o.progression || 0} aria-label="Avancement de l'objectif" onChange={(e) => majObjectif(o, { progression: e.target.value })} className="mt-2 w-full accent-violet-600" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setOuvert(ouvert === o.id ? null : o.id)} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-bold text-gray-600"><MessageSquare size={13} />{commentaires.length} commentaire{commentaires.length > 1 ? 's' : ''}</button>
                      <span className="flex-1" />
                      {peut && <button type="button" onClick={() => setForm({ ...o })} aria-label="Modifier" className="rounded-full p-1.5 text-gray-400 hover:text-violet-700"><Pencil size={15} /></button>}
                      {peutSupprimerTache(role) && <button type="button" onClick={() => confirm(`Supprimer l'objectif « ${o.titre} » ?`) && supprimerObjectif(o)} aria-label="Supprimer" className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                    </div>
                    {ouvert === o.id && (
                      <div className="space-y-2 rounded-2xl bg-white/60 p-3">
                        {commentaires.map((c, i) => <p key={i} className="text-sm"><span className="font-extrabold" style={{ color: COULEUR }}>{c.nom}</span> <span className="text-[10px] text-gray-400">{heureMessage(c.ts)}</span><span className="block whitespace-pre-wrap text-gray-700">{c.texte}</span></p>)}
                        {!commentaires.length && <p className="text-sm text-gray-400">Aucun commentaire.</p>}
                        <div className="flex gap-2"><input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && texte.trim() && commenter(o)} placeholder="Commenter…" aria-label="Commentaire" className="input-base flex-1" /><Button onClick={() => commenter(o)} disabled={!texte.trim()} style={{ backgroundColor: COULEUR }} aria-label="Envoyer"><Send size={15} /></Button></div>
                      </div>
                    )}
                  </div>
                </Tuile>
              </li>
            )
          })}
        </ul>
      ) : <EtatVide icone={Target} accent={COULEUR} texte="Aucun objectif pour le moment" />}

      {form && (
        <Modal open onClose={() => setForm(null)} size="lg" title={form.id ? 'Modifier l\'objectif' : 'Nouvel objectif'} {...glassModalProps(COULEUR)}
          footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button onClick={enregistrer} style={{ backgroundColor: COULEUR }}>Enregistrer</Button></>}>
          <div className="params-verre grid gap-3 sm:grid-cols-2" style={{ '--p-accent': COULEUR }}>
            {equipe && (
              <FormGroup label="Type"><Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, cibleUid: '', cibleNom: '' }))}><option value="perso">Personnel</option><option value="dept">Département</option></Select></FormGroup>
            )}
            {form.type === 'perso' ? (
              <FormGroup label="Personne" required>
                {equipe ? <Select value={form.cibleUid} onChange={(e) => set('cibleUid', e.target.value)}><option value="">Choisir</option>{personnel.map((p) => <option key={p.uid} value={p.uid}>{p.nom}</option>)}</Select> : <Input value={nom} disabled readOnly />}
              </FormGroup>
            ) : (
              <FormGroup label="Département" required>
                <Input list="taches-depts" value={form.cibleNom} onChange={(e) => set('cibleNom', e.target.value)} placeholder="Ex : Logistique" />
                <datalist id="taches-depts">{departements.map((d) => <option key={d} value={d} />)}</datalist>
              </FormGroup>
            )}
            <FormGroup label="Titre" required className="sm:col-span-2"><Input value={form.titre} onChange={(e) => set('titre', e.target.value)} placeholder="Ex : Atteindre 50 nouveaux clients" autoFocus /></FormGroup>
            <FormGroup label="Description" className="sm:col-span-2"><textarea className="input-base min-h-[4rem]" value={form.description} onChange={(e) => set('description', e.target.value)} /></FormGroup>
            <FormGroup label="Début"><Input type="date" value={form.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} /></FormGroup>
            <FormGroup label="Fin"><Input type="date" value={form.dateFin} onChange={(e) => set('dateFin', e.target.value)} /></FormGroup>
            <FormGroup label={`Avancement : ${form.progression}%`}><input type="range" min="0" max="100" step="5" value={form.progression} onChange={(e) => set('progression', Number(e.target.value))} className="w-full accent-violet-600" /></FormGroup>
            <FormGroup label="Statut"><Select value={form.statut} onChange={(e) => set('statut', e.target.value)}>{STATUTS_OBJECTIF.map((s) => <option key={s}>{s}</option>)}</Select></FormGroup>
          </div>
        </Modal>
      )}
    </div>
  )
}
