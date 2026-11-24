// RH : Annonces. La RH et la direction publient une annonce (note de service, événement, félicitations, urgence…) à tout le monde, à des secteurs ou à des personnes.
// Les destinataires la reçoivent en notification push et la voient sur leur page d'accueil jusqu'à l'avoir lue ; ici, on suit qui l'a lue, on la modifie ou on la retire.
import { useMemo, useState } from 'react'
import { Megaphone, Plus, Pencil, Trash2, Pin, Users, CalendarClock, Eye, Search, Check, CheckCheck, Undo2, X, Bell, Type, AlignLeft, CalendarDays } from 'lucide-react'
import { addItem, updateItem, removeItem, getAll } from '../../core/db'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { todayStr, formatDateShort } from '../../utils/formatters'
import { icone3D } from '../../utils/color'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { PageHeader, Champ, ChoixSimple, ModalRh } from './rhui'
import {
  COL_ANNONCES, COL_LECTURES, COL_PIECES, CATEGORIES, AUDIENCES, categorieAnnonce, peutPublierAnnonce, estActive, estEffectuee, rappelee, destinatairesDe, libelleAudience,
  employeActif, compteDeEmploye, construireAudience
} from './annoncesData'
import LectureAnnonce from './LectureAnnonce'

const BLEU = '#0284c7'
const vide = () => ({ categorie: 'info', categorieLabel: '', titre: '', texte: '', audience: { type: 'tous', secteurs: [], employes: [] }, dateFin: '', epinglee: false, rappel: true, prevenir: true, pieces: [] })
// Choix de personnes précises : une recherche avec suggestions parmi les EMPLOYÉS de l'annuaire RH (nom, poste ou département), puis les personnes choisies
// en pastilles à retirer. Reste fluide avec des centaines d'employés : on n'affiche jamais toute la liste. Un employé sans compte est signalé.
function ChoixPersonnes({ employes, users, value = [], onChange }) {
  const [q, setQ] = useState('')
  const personnes = useMemo(() => employes.map((e) => ({ id: e.id, nom: e.nom, compte: !!compteDeEmploye(e, users), detail: [e.poste, e.departement].filter(Boolean).join(' · ') })), [employes, users])
  const choisies = value.map((id) => personnes.find((p) => p.id === id)).filter(Boolean)
  const restantes = personnes.filter((p) => !value.includes(p.id)).map((p) => ({ ...p, detail: [p.detail, p.compte ? '' : 'sans compte'].filter(Boolean).join(' · ') }))
  const sansCompte = choisies.filter((p) => !p.compte).length
  return (
    <div className="mt-2">
      <ChampAutocomplete accent="sky" className="input-base" value={q} onChange={setQ} suggestions={restantes} maxSuggestions={30}
        getLabel={(p) => p.nom} getDetail={(p) => p.detail} onSelect={(p) => { onChange([...value, p.id]); setQ('') }}
        placeholder={personnes.length ? `Tapez un nom (${personnes.length} employés de l'annuaire)…` : "Aucun employé : ajoutez-en dans Équipe, Annuaire."} emptyLabel="Aucun employé correspondant dans l'annuaire." />
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Personnes choisies">
        {choisies.length ? choisies.map((p) => (
          <button key={p.id} type="button" onClick={() => onChange(value.filter((x) => x !== p.id))} data-actif="true" title={p.compte ? 'Retirer' : 'Retirer (sans compte : ne sera pas prévenu)'} className="rh-pastille inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
            <Check size={13} strokeWidth={3} aria-hidden="true" />{p.nom}{!p.compte && <span className="rounded-full bg-amber-200/80 px-1.5 text-[10px] text-amber-900">sans compte</span>}<X size={12} strokeWidth={3} aria-hidden="true" className="opacity-80" />
          </button>
        )) : <span className="text-xs text-gray-500">Aucune personne choisie pour le moment.</span>}
        {choisies.length > 1 && <button type="button" onClick={() => onChange([])} className="ml-1 text-xs font-bold text-gray-500 underline-offset-2 hover:text-red-600 hover:underline">Tout retirer</button>}
      </div>
      {choisies.length > 0 && <p className="mt-1.5 text-xs font-semibold text-gray-500">{choisies.length} personne{choisies.length > 1 ? 's' : ''} choisie{choisies.length > 1 ? 's' : ''}{sansCompte ? `, dont ${sansCompte} sans compte (non prévue${sansCompte > 1 ? 's' : ''} par notification)` : ''}</p>}
    </div>
  )
}

const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Annonces() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const peutPublier = peutPublierAnnonce(role)
  const { data: annonces } = useCollection(COL_ANNONCES)
  const { data: lectures } = useCollection(COL_LECTURES)
  const { data: users } = useCollection('users')
  const { data: employes } = useCollection('rh_employes')
  const [onglet, setOnglet] = useState('en_cours')
  const [form, setForm] = useState(null) // { id?, ...champs }
  const [ouverte, setOuverte] = useState(null)
  const [q, setQ] = useState('')
  const [enCours, setEnCours] = useState(false)
  const jour = todayStr()

  // Les personnes et les secteurs proposés sont ceux de l'annuaire RH (employés renseignés par la RH).
  const annuaire = useMemo(() => employes.filter(employeActif), [employes])
  const secteurs = useMemo(() => [...new Set(annuaire.map((e) => e.departement).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [annuaire])
  const luesPar = useMemo(() => { const m = {}; lectures.forEach((l) => { (m[l.annonceId] = m[l.annonceId] || new Set()).add(l.uid) }); return m }, [lectures])

  const triees = useMemo(() => [...annonces].sort((a, b) => (Number(!!b.epinglee) - Number(!!a.epinglee)) || ((b.createdAt || 0) - (a.createdAt || 0))), [annonces])
  const nb = { en_cours: triees.filter((a) => estActive(a, jour)).length, expirees: triees.filter((a) => !estActive(a, jour)).length, toutes: triees.length }
  const liste = triees.filter((a) => (onglet === 'toutes' ? true : onglet === 'en_cours' ? estActive(a, jour) : !estActive(a, jour)))
    .filter((a) => !q || normaliser(`${a.titre} ${a.texte} ${a.parNom}`).includes(normaliser(q)))

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setAudience = (patch) => setForm((f) => ({ ...f, audience: { ...f.audience, ...patch } }))
  const bascule = (cle, valeur) => setForm((f) => { const l = f.audience[cle] || []; return { ...f, audience: { ...f.audience, [cle]: l.includes(valeur) ? l.filter((x) => x !== valeur) : [...l, valeur] } } })

  async function ouvrirEdition(a) {
    const l = a.nbPieces > 0 ? (await getAll(COL_PIECES).catch(() => [])).filter((p) => p.annonceId === a.id) : []
    setForm({ ...vide(), ...a, audience: { type: 'tous', secteurs: [], employes: [], ...(a.audience || {}) }, prevenir: false, pieces: l })
  }

  async function enregistrer() {
    if (!form.categorie) return toast.error('Choisissez le type d\'annonce')
    if (!form.audience.type) return toast.error('Choisissez qui est concerné')
    if (form.categorie === 'autre' && !form.categorieLabel.trim()) return toast.error('Précisez le type d\'annonce')
    if (!form.titre.trim()) return toast.error('Donnez un titre à l\'annonce')
    if (!form.texte.trim()) return toast.error('Écrivez le texte de l\'annonce')
    const type = form.audience.type
    if (type === 'secteurs' && !(form.audience.secteurs || []).length) return toast.error('Choisissez au moins un secteur')
    if (type === 'personnes' && !(form.audience.employes || []).length) return toast.error('Choisissez au moins une personne')
    if (form.dateFin && form.dateFin < jour) return toast.error('La date de fin est déjà passée')
    setEnCours(true)
    try {
      const donnees = {
        rappel: !!form.rappel, categorie: form.categorie, categorieLabel: form.categorie === 'autre' ? form.categorieLabel.trim() : '', titre: form.titre.trim(), texte: form.texte.trim(), epinglee: !!form.epinglee, dateFin: form.dateFin || '',
        audience: construireAudience(form.audience, employes, users),
        nbPieces: form.pieces.length
      }
      let id = form.id
      if (id) await updateItem(COL_ANNONCES, id, donnees)
      else id = await addItem(COL_ANNONCES, { ...donnees, parUid: user?.uid, parNom: user?.nom || 'La RH' })
      // Fichiers joints : on remplace l'ensemble (peu nombreux, chargés seulement à l'ouverture).
      const anciens = (await getAll(COL_PIECES).catch(() => [])).filter((p) => p.annonceId === id)
      await Promise.all(anciens.filter((p) => !form.pieces.some((n) => n.id === p.id)).map((p) => removeItem(COL_PIECES, p.id, { sansMotif: true })))
      await Promise.all(form.pieces.filter((p) => !p.id).map((p) => addItem(COL_PIECES, { ...p, annonceId: id })))
      if (form.prevenir) {
        const vers = destinatairesDe({ audience: donnees.audience }, users, user?.uid).map((u) => u.uid)
        const sans = donnees.audience.sansCompte || 0
        const cat = categorieAnnonce(donnees)
        if (vers.length) await notify({ type: cat.id === 'urgent' ? 'warning' : 'info', title: `${cat.label} : ${donnees.titre}`, body: donnees.texte.length > 140 ? `${donnees.texte.slice(0, 140)}…` : donnees.texte, module: 'rh', forUsers: vers, link: '/' }).catch(() => {})
        toast.success(vers.length ? `Annonce publiée, ${vers.length} personne${vers.length > 1 ? 's' : ''} prévenue${vers.length > 1 ? 's' : ''} ✓${sans ? ` (${sans} sans compte, non prévu${sans > 1 ? 's' : ''})` : ''}` : 'Annonce publiée ✓')
      } else toast.success(form.id ? 'Annonce mise à jour ✓' : 'Annonce publiée ✓')
      setForm(null)
    } catch (e) { toast.error("Échec de l'enregistrement : " + (e?.message || e)) } finally { setEnCours(false) }
  }

  async function basculerEffectuee(a) {
    try {
      if (estEffectuee(a)) { await updateItem(COL_ANNONCES, a.id, { effectueLe: '', effectuePar: '' }); toast.success('Annonce rouverte : les rappels reprennent') }
      else { await updateItem(COL_ANNONCES, a.id, { effectueLe: Date.now(), effectuePar: user?.nom || 'La RH' }); toast.success('Annonce marquée effectuée : plus de rappel') }
    } catch (e) { toast.error(e?.message || 'Action impossible') }
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer l'annonce « ${a.titre} » ?`)) return
    try {
      await removeItem(COL_ANNONCES, a.id)
      const pieces = (await getAll(COL_PIECES).catch(() => [])).filter((p) => p.annonceId === a.id)
      await Promise.all(pieces.map((p) => removeItem(COL_PIECES, p.id, { sansMotif: true })))
      const lues = lectures.filter((l) => l.annonceId === a.id)
      await Promise.all(lues.map((l) => removeItem(COL_LECTURES, l.id, { sansMotif: true })))
      toast.success('Annonce supprimée')
    } catch (e) { if (e?.name !== 'SuppressionAnnulee') toast.error(e?.message || 'Suppression impossible') }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Megaphone} sousModule="Vie de l'entreprise" titre="Annonces" sousTitre="Informez toute l'équipe, un secteur ou des personnes précises : chacun est prévenu et retrouve l'annonce sur son accueil."
        action={peutPublier ? (
          <BoutonBande icone={Plus} anime onClick={() => setForm(vide())}>Nouvelle annonce</BoutonBande>
        ) : null} />

      <div className="flex flex-wrap items-center gap-2">
        {[['en_cours', 'En cours'], ['expirees', 'Terminées'], ['toutes', 'Toutes']].map(([id, l]) => (
          <button key={id} type="button" aria-pressed={onglet === id} data-actif={onglet === id} onClick={() => setOnglet(id)} className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': BLEU }}>
            {l}<span className="rounded-full bg-black/5 px-1.5 text-[10px]">{nb[id]}</span>
          </button>
        ))}
        <label className="ml-auto flex min-w-[10rem] flex-1 items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 backdrop-blur-md sm:max-w-xs">
          <Search size={14} className="text-gray-400" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une annonce" className="w-full bg-transparent text-sm outline-none" />
        </label>
      </div>

      {liste.length ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {liste.map((a) => {
            const cat = categorieAnnonce(a)
            const Icone = cat.icone
            const visee = destinatairesDe(a, users, a.parUid)
            const lues = [...(luesPar[a.id] || [])].filter((uid) => uid !== a.parUid && visee.some((v) => v.uid === uid)).length
            const active = estActive(a, jour)
            return (
              <li key={a.id} className="min-w-0">
                <article className={`card relative flex h-full flex-col gap-3 overflow-hidden border-white/60 p-4 backdrop-blur-xl ${active ? '' : 'opacity-70'}`} style={{ background: `linear-gradient(160deg, rgba(255,255,255,0.82), ${cat.couleur}14)` }}>
                  <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: cat.couleur }} />
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(cat.couleur)}><Icone size={18} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: cat.couleur }}>{cat.label}</span>{a.epinglee && <Pin size={12} className="text-amber-500" aria-label="Épinglée" />}{estEffectuee(a) ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCheck size={11} aria-hidden="true" />Effectuée{a.effectuePar ? ` par ${a.effectuePar}` : ''}</span> : !active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Expirée</span>}{active && rappelee(a) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700" title="Rappelée 3 fois par jour jusqu'à ce qu'elle soit effectuée">Rappel 3 × par jour</span>}</p>
                      <h3 className="mt-1 break-words text-sm font-extrabold leading-snug text-gray-800">{a.titre}</h3>
                    </div>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-600">{a.texte}</p>
                  <div className="mt-auto space-y-2">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" />{libelleAudience(a)}</span>
                      {a.dateFin && <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" />Jusqu'au {formatDateShort(a.dateFin)}</span>}
                      <span>Par {a.parNom || 'la RH'}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {peutPublier && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-gray-600" title="Personnes visées qui l'ont ouverte"><Eye size={12} aria-hidden="true" />Lue par {lues}/{visee.length}</span>}
                      <span className="flex-1" />
                      <button type="button" onClick={() => setOuverte(a)} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-bold text-sky-700 hover:bg-white">Lire</button>
                      {peutPublier && <button type="button" onClick={() => basculerEffectuee(a)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${estEffectuee(a) ? 'border-slate-200 bg-white/70 text-slate-600 hover:bg-white' : 'border-emerald-300 bg-emerald-50/90 text-emerald-700 hover:bg-emerald-100'}`}>{estEffectuee(a) ? <><Undo2 size={13} aria-hidden="true" />Rouvrir</> : <><CheckCheck size={13} aria-hidden="true" />Marquer effectué</>}</button>}
                      {peutPublier && <button type="button" onClick={() => ouvrirEdition(a)} aria-label="Modifier l'annonce" className="rounded-full p-1.5 text-gray-400 hover:text-sky-700"><Pencil size={15} /></button>}
                      {peutPublier && role !== 'agent' && <button type="button" onClick={() => supprimer(a)} aria-label="Supprimer l'annonce" className="rounded-full p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-3xl border border-white/80 bg-white/60 px-6 py-10 text-center text-sm text-gray-500 backdrop-blur-xl">
          {annonces.length ? 'Aucune annonce ne correspond.' : peutPublier ? 'Aucune annonce pour le moment. Publiez la première avec « Nouvelle annonce ».' : 'Aucune annonce pour le moment.'}
        </p>
      )}

      <ModalRh open={!!form} onClose={() => setForm(null)} title={form?.id ? "Modifier l'annonce" : 'Nouvelle annonce'} titreHero={form?.titre || (form?.id ? "Modifier l'annonce" : 'Nouvelle annonce')} icone={Megaphone}
        intro="Choisissez le type, écrivez le message et indiquez qui est concerné." onSave={enregistrer} libelleSave={enCours ? 'Enregistrement…' : form?.id ? 'Enregistrer' : 'Publier'} size="xl">
        {form && (
          <>
            <Champ label="Type d'annonce" iconeLabel icone={Megaphone}>
              <div className="flex flex-wrap gap-1.5" role="group">
                {CATEGORIES.map((c) => {
                  const actif = form.categorie === c.id
                  const I = c.icone
                  return <button key={c.id} type="button" aria-pressed={actif} data-actif={actif} onClick={() => set('categorie', actif ? '' : c.id)} className="rh-pastille inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"><I size={13} aria-hidden="true" />{c.label}</button>
                })}
              </div>
              {form.categorie === 'autre' && (
                <input className="input-base ed-entree mt-2" value={form.categorieLabel} onChange={(e) => set('categorieLabel', e.target.value)} maxLength={40} autoFocus
                  placeholder="Précisez le type d'annonce (ex : Recrutement, Sécurité, Formation)" aria-label="Type d'annonce personnalisé" />
              )}
            </Champ>
            <Champ label="Titre" icone={Type} required><input className="input-base" value={form.titre} onChange={(e) => set('titre', e.target.value)} placeholder="Ex : Fermeture exceptionnelle vendredi" autoFocus /></Champ>
            <Champ label="Message" icone={AlignLeft} haut required><textarea className="input-base min-h-[8rem]" value={form.texte} onChange={(e) => set('texte', e.target.value)} placeholder="Le texte complet de l'annonce" /></Champ>

            <Champ label="Qui est concerné ?" iconeLabel icone={Users}>
              <ChoixSimple options={AUDIENCES} value={form.audience.type} onChange={(v) => setAudience({ type: v === form.audience.type ? '' : v })} />
              {form.audience.type === 'secteurs' && (
                <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="Secteurs">
                  {secteurs.length ? secteurs.map((s) => { const a = form.audience.secteurs.includes(s); return <button key={s} type="button" aria-pressed={a} data-actif={a} onClick={() => bascule('secteurs', s)} className="rh-pastille inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">{a && <Check size={13} strokeWidth={3} aria-hidden="true" />}{s}</button> }) : <p className="text-xs text-gray-500">Aucun département renseigné sur les employés de l'annuaire.</p>}
                </div>
              )}
              {form.audience.type === 'personnes' && (
                <ChoixPersonnes employes={annuaire} users={users} value={form.audience.employes} onChange={(ids) => setAudience({ employes: ids })} />
              )}
            </Champ>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Valable jusqu'au" icone={CalendarDays} aide="Facultatif. Passée cette date, l'annonce n'est plus affichée sur l'accueil."><input type="date" className="input-base" min={jour} value={form.dateFin} onChange={(e) => set('dateFin', e.target.value)} /></Champ>
              <Champ label="Options" iconeLabel icone={Pin}>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-gray-700"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.epinglee} onChange={(e) => set('epinglee', e.target.checked)} />Épingler en haut de la liste</label>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-gray-700" title="Après avoir fermé l'annonce avec la croix, elle revient à midi, à 16 h puis le lendemain, jusqu'à ce que la RH la marque effectuée."><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.rappel} onChange={(e) => set('rappel', e.target.checked)} />Rappeler 3 fois par jour jusqu'à « effectué »</label>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-gray-700"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.prevenir} onChange={(e) => set('prevenir', e.target.checked)} /><Bell size={14} className="text-sky-600" aria-hidden="true" />Prévenir par notification{form.id ? ' à nouveau' : ''}</label>
                </div>
              </Champ>
            </div>

            <div className="fg-tuile">
              <PiecesJointes pieces={form.pieces} label="Fichiers joints" onAdd={(p) => setForm((f) => ({ ...f, pieces: [...f.pieces, p] }))} onRemove={(p) => setForm((f) => ({ ...f, pieces: f.pieces.filter((x) => x !== p) }))} />
            </div>
          </>
        )}
      </ModalRh>

      {ouverte && <LectureAnnonce annonce={annonces.find((a) => a.id === ouverte.id) || ouverte} utilisateurs={users} onClose={() => setOuverte(null)} />}
    </div>
  )
}
