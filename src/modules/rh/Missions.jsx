// RH : Missions & frais (Missions & Frais). La RH saisit un ordre de mission ; la Gérante exécutive l'approuve ou le refuse (motif obligatoire) ;
// une mission approuvée se termine puis se rembourse. Chaque étape laisse une trace et prévient les personnes concernées (cf. missionsCircuit.js).
import { useMemo, useState } from 'react'
import { Plane, Plus, UserRound, MapPin, CalendarDays, Banknote, Clock, ChevronRight, ShieldCheck, ClipboardList, Hourglass, Wallet, CircleCheck, Ban } from 'lucide-react'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { STATUTS_MISSION, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh } from './rhui'
import DetailMission, { MiniatureMission, PastilleDecaissement } from './DetailMission'
import { demanderApprobation, peutApprouverMission, dureeMission } from './missionsCircuit'

const vide = () => ({ employeId: '', objet: '', destination: '', dateDebut: todayStr(), dateFin: todayStr(), montantFrais: '' })
// Filtres : le circuit s'arrête à la GE ; ensuite la finance décaisse (E-DÉPENSES) ou non.
const FILTRES = [
  { id: '', label: 'Toutes' }, { id: 'demandee', label: 'À approuver' }, { id: 'adecaisser', label: 'À décaisser' },
  { id: 'decaissee', label: 'Décaissées' }, { id: 'nondecaissee', label: 'Non décaissées' }, { id: 'refusee', label: 'Refusées' }
]
const filtreDe = (m) => (m.statut === 'refusee' ? 'refusee' : (m.statut || 'demandee') === 'demandee' ? 'demandee' : m.decaissement === 'fait' ? 'decaissee' : m.decaissement === 'non' ? 'nondecaissee' : 'adecaisser')

export default function Missions() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: missions } = useCollection(COL.missions)
  const { data: employes } = useCollection(COL.employes)
  const { data: users } = useCollection('users')
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('')
  const [modal, setModal] = useState(null)
  const [tente, setTente] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const compte = (s) => missions.filter((m) => filtreDe(m) === s).length
  const totalDecaisse = missions.filter((m) => filtreDe(m) === 'decaissee').reduce((s, m) => s + (Number(m.montantFrais) || 0), 0)
  const liste = useMemo(() => [...missions].sort((a, b) => ((a.creeLe || a.dateDebut || '') < (b.creeLe || b.dateDebut || '') ? 1 : -1))
    .filter((m) => !filtre || filtreDe(m) === filtre)
    .filter((m) => correspond(recherche, m.employeNom, m.objet, m.destination)), [missions, filtre, recherche])
  const nomsGe = users.filter((u) => u.role === 'ge').map((u) => u.nom || u.login)

  const duree = modal ? dureeMission(modal) : 0
  const dateInvalide = modal && modal.dateDebut && modal.dateFin && modal.dateFin < modal.dateDebut
  const nomEmploye = modal?.employeId ? employes.find((e) => e.id === modal.employeId)?.nom : ''
  const erreur = (ok) => tente && !ok

  async function enregistrer() {
    setTente(true)
    const emp = employes.find((e) => e.id === modal.employeId)
    if (!emp || !modal.objet.trim() || dateInvalide) return toast.error('Complétez l’employé, l’objet et des dates cohérentes')
    const data = { employeId: emp.id, employeNom: emp.nom, objet: modal.objet.trim(), destination: (modal.destination || '').trim(), dateDebut: modal.dateDebut, dateFin: modal.dateFin, montantFrais: Number(modal.montantFrais) || 0 }
    if (modal.id) {
      const ancien = missions.find((m) => m.id === modal.id)
      // Une mission refusée, une fois corrigée, repart à l'approbation.
      if (ancien?.statut === 'refusee') {
        await updateItem(COL.missions, modal.id, { ...data, statut: 'demandee', motifRefus: '', refusePar: '', refuseParUid: '', refuseLe: '', creeLe: new Date().toISOString() })
        await demanderApprobation({ ...ancien, ...data }, user)
        toast.success('Demande renvoyée à la GE ✓')
      } else { await updateItem(COL.missions, modal.id, data); toast.success('Mission modifiée ✓') }
    } else {
      const id = await addItem(COL.missions, { ...data, statut: 'demandee', creePar: user?.nom || '', creeParUid: user?.uid || '', creeLe: new Date().toISOString() })
      await demanderApprobation({ ...data, id, creePar: user?.nom }, user)
      toast.success('Demande envoyée à la GE pour approbation ✓')
    }
    setModal(null); setTente(false)
  }
  async function supprimer(m) { setDetailId(null); await removeItem(COL.missions, m.id); toast.success('Mission supprimée') }

  return (
    <div className="space-y-5">
      <PageHeader icon={Plane} sousModule="Missions & Frais" titre="Missions & frais" sousTitre="Ordres de mission : demande, approbation par la GE, puis remboursement."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher une mission…" />
          <BoutonBande anime icone={Plus} onClick={() => { setTente(false); setModal(vide()) }}>Nouvel ordre de mission</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="À approuver" value={compte('demandee')} sub="en attente de la GE" accent="#f59e0b" icon={Hourglass} />
        <StatCard title="À décaisser" value={compte('adecaisser')} sub="approuvées, décision de la finance" accent="#b45309" icon={CircleCheck} />
        <StatCard title="Décaissées" value={compte('decaissee')} sub={formatMoney(totalDecaisse)} accent="#16a34a" icon={Wallet} />
        <StatCard title="Refusées" value={compte('refusee') + compte('nondecaissee')} sub="refusées ou non décaissées" accent="#dc2626" icon={Ban} />
      </div>

      <div className="onglets-verre ed-entree" role="group" aria-label="Filtrer par statut" style={{ '--puce': '#0284c7' }}>
        {FILTRES.map((f) => (
          <button key={f.id || 'tous'} type="button" aria-pressed={filtre === f.id} data-actif={filtre === f.id} onClick={() => setFiltre(f.id)} className="onglet-verre">
            {f.label}{f.id && compte(f.id) > 0 ? <span className="onglet-verre-n">{compte(f.id)}</span> : null}
          </button>
        ))}
      </div>

      <section className="space-y-2.5">
        {liste.length === 0 ? (
          <p className="rounded-3xl border border-white/80 bg-white/60 px-3 py-10 text-center text-sm text-gray-400 backdrop-blur-xl">{missions.length ? 'Aucune mission ne correspond.' : 'Aucune mission enregistrée. Cliquez « Nouvel ordre de mission ».'}</p>
        ) : liste.map((m, i) => {
          const st = STATUTS_MISSION[m.statut || 'demandee']
          const accent = { demandee: '#f59e0b', approuvee: '#0284c7', terminee: '#7c3aed', remboursee: '#16a34a', refusee: '#dc2626' }[m.statut || 'demandee']
          const d = dureeMission(m)
          return (
            <div key={m.id} role="button" tabIndex={0} onClick={() => setDetailId(m.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(m.id) } }}
              className="ed-entree group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-white/70 to-sky-50/60 py-3 pl-5 pr-4 shadow-[0_14px_30px_-20px_rgba(2,132,199,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_rgba(2,132,199,0.6),inset_0_1px_0_rgba(255,255,255,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden="true" className="absolute inset-y-3 left-1.5 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-base font-black text-white shadow-[0_8px_16px_-8px_rgba(15,23,42,0.6),inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: avatarGradient(m.employeNom || '?') }} aria-hidden="true">{(m.employeNom || '?').trim().charAt(0).toUpperCase()}</span>
              <div className="relative min-w-0 flex-1 basis-44">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="truncate font-extrabold text-gray-800">{m.employeNom}</span><PastilleDecaissement doc={m} type="mission" petite /></p>
                <p className="truncate text-sm text-gray-600">{m.objet}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-gray-500">
                  {m.destination && <span className="inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{m.destination}</span>}
                  {m.dateDebut && <span className="inline-flex items-center gap-1"><CalendarDays size={11} aria-hidden="true" />{formatDateShort(m.dateDebut)}{m.dateFin && m.dateFin !== m.dateDebut ? ` → ${formatDateShort(m.dateFin)}` : ''}</span>}
                  {d > 0 && <span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" />{d} j</span>}
                </p>
                {m.statut === 'refusee' && m.motifRefus && <p className="truncate text-xs font-medium text-red-600">Refusée : {m.motifRefus}</p>}
              </div>
              <div className="relative flex flex-col items-end gap-1">
                {Number(m.montantFrais) > 0 && <span className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-2.5 py-1 text-sm font-black tabular-nums text-white shadow-[0_8px_14px_-8px_rgba(15,23,42,0.8),inset_0_1px_0_rgba(255,255,255,0.2)]">{formatMoney(m.montantFrais)}</span>}
                <span className="flex items-center gap-1.5">
                  {peutApprouverMission(m, role) && <span className="animate-pulse rounded-full bg-violet-600 px-2 py-px text-[10px] font-bold text-white shadow-[0_0_0_3px_rgba(124,58,237,0.18)]">À traiter</span>}
                  <Badge tone={st?.tone}>{st?.label}</Badge>
                </span>
              </div>
              <div className="relative flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"><MiniatureMission mission={m} /></div>
              <ChevronRight size={18} className="relative text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500" aria-hidden="true" />
            </div>
          )
        })}
      </section>

      <DetailMission mission={missions.find((m) => m.id === detailId)} employes={employes} onClose={() => setDetailId(null)} onSupprimer={supprimer}
        onModifier={(m) => { setDetailId(null); setTente(false); setModal({ id: m.id, employeId: m.employeId, objet: m.objet || '', destination: m.destination || '', dateDebut: m.dateDebut || todayStr(), dateFin: m.dateFin || m.dateDebut || todayStr(), montantFrais: m.montantFrais || '' }) }} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l’ordre de mission' : 'Nouvel ordre de mission'} libelleSave={modal?.id ? 'Enregistrer' : 'Envoyer à la GE'}
        icone={UserRound} titreHero="Ordre de mission de :"
        intro={nomEmploye
          ? <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-white"><UserRound size={15} aria-hidden="true" />{nomEmploye}</span>
          : 'Choisissez l’employé ci-dessous : son nom s’affichera ici.'}
        onSave={enregistrer}>
        {modal && (<>
          <Champ label="Employé" icone={UserRound} required erreur={erreur(modal.employeId) ? 'Choisissez un employé.' : undefined}>
            <select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner un employé…</option>{actifs.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Objet de la mission" icone={ClipboardList} required erreur={erreur(modal.objet.trim()) ? 'Indiquez l’objet de la mission.' : undefined}>
            <input value={modal.objet} onChange={(e) => setModal({ ...modal, objet: e.target.value })} className="input-base" placeholder="Ex. Achat de matériel à Accra" />
          </Champ>
          <Champ label="Destination" icone={MapPin}>
            <input value={modal.destination} onChange={(e) => setModal({ ...modal, destination: e.target.value })} className="input-base" placeholder="Ville ou pays de destination" />
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Départ le" icone={CalendarDays}>
              <input type="date" value={modal.dateDebut} onChange={(e) => setModal({ ...modal, dateDebut: e.target.value, dateFin: modal.dateFin < e.target.value ? e.target.value : modal.dateFin })} className="input-base" />
            </Champ>
            <Champ label="Retour le" icone={CalendarDays} erreur={dateInvalide ? 'Le retour doit être après le départ.' : undefined}>
              <input type="date" value={modal.dateFin} min={modal.dateDebut || undefined} onChange={(e) => setModal({ ...modal, dateFin: e.target.value })} className="input-base" />
            </Champ>
          </div>
          <p className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-sm text-gray-600 backdrop-blur-md">
            <Clock size={16} className="text-gray-400" aria-hidden="true" /> Durée : <strong className="tabular-nums text-gray-800">{duree ? `${duree} jour${duree > 1 ? 's' : ''}` : '-'}</strong>
          </p>
          <Champ label="Montant des frais prévus (XOF)" icone={Banknote}>
            <input type="number" min="0" value={modal.montantFrais} onChange={(e) => setModal({ ...modal, montantFrais: e.target.value })} className="input-base" placeholder="Ex. 150000" />
          </Champ>
          <p className="flex items-start gap-2 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3.5 py-2.5 text-xs text-violet-800 backdrop-blur-md">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{modal.id ? 'Une mission refusée repart à l’approbation une fois corrigée.' : `La demande part à ${nomsGe.length ? nomsGe.join(', ') : 'la Gérante exécutive'} pour approbation : elle sera alertée, et vous serez prévenu(e) de sa décision.`}</span>
          </p>
        </>)}
      </ModalRh>
    </div>
  )
}
