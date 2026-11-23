// RH : Avances et prêts sur salaire (Temps & Paie). La RH saisit la demande ; la GE l'approuve ou la refuse (motif obligatoire) ; la RH verse l'argent ;
// les mensualités sont ensuite retenues toutes seules sur les bulletins de paie de l'employé (cf. avancesCircuit.js et Paie).
import { useMemo, useState } from 'react'
import { HandCoins, Plus, UserRound, Banknote, CalendarDays, ChevronRight, ShieldCheck, Hourglass, Wallet, CircleCheck, AlignLeft, Layers, TriangleAlert } from 'lucide-react'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { supprimerAvecRetour } from './suppression'
import { STATUTS_AVANCE, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh, ChoixSimple } from './rhui'
import DetailAvance, { BarreRemboursement, moisEnClair } from './DetailAvance'
import { MiniatureMission, PastilleDecaissement } from './DetailMission'
import { ETAPES_AVANCE, SIGLES_AVANCE, etatsAvance, TYPES_AVANCE, libelleType, mensualiteAvance, resteDu, moisSuivant, peutApprouverAvance, demanderApprobationAvance } from './avancesCircuit'

const vide = () => ({ employeId: '', type: 'avance', montant: '', nbMensualites: 1, moisDebut: moisSuivant(), motif: '' })
const FILTRES = [
  { id: '', label: 'Toutes' }, { id: 'demandee', label: 'À approuver' }, { id: 'approuvee', label: 'À décaisser' },
  { id: 'versee', label: 'En remboursement' }, { id: 'remboursee', label: 'Remboursées' }, { id: 'refusee', label: 'Refusées' }
]

export default function Avances() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: avances } = useCollection(COL.avances)
  const { data: employes } = useCollection(COL.employes)
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('')
  const [modal, setModal] = useState(null)
  const [tente, setTente] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const compte = (s) => avances.filter((a) => (a.statut || 'demandee') === s).length
  const resteTotal = avances.filter((a) => a.statut === 'versee').reduce((s, a) => s + resteDu(a), 0)
  const liste = useMemo(() => [...avances].sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? 1 : -1))
    .filter((a) => !filtre || (a.statut || 'demandee') === filtre)
    .filter((a) => correspond(recherche, a.employeNom, a.motif, libelleType(a.type))), [avances, filtre, recherche])

  const emp = modal?.employeId ? employes.find((e) => e.id === modal.employeId) : null
  const montant = Number(modal?.montant) || 0
  const n = modal?.type === 'avance' ? 1 : Math.max(1, Number(modal?.nbMensualites) || 1)
  const mensualite = montant > 0 ? Math.ceil(montant / n) : 0
  const salaire = Number(emp?.salaire) || 0
  const tropFort = salaire > 0 && mensualite > salaire / 3
  const erreur = (ok) => tente && !ok

  async function enregistrer() {
    setTente(true)
    if (!emp || !(montant > 0) || !modal.moisDebut || (modal.type === 'pret' && !(n >= 1))) return toast.error('Complétez l’employé, le montant et la première retenue')
    const data = { employeId: emp.id, employeNom: emp.nom, type: modal.type, montant, nbMensualites: n, moisDebut: modal.moisDebut, motif: (modal.motif || '').trim() }
    if (modal.id) {
      const ancien = avances.find((a) => a.id === modal.id)
      if (ancien?.statut === 'refusee') {
        await updateItem(COL.avances, modal.id, { ...data, statut: 'demandee', motifRefus: '', refusePar: '', refuseParUid: '', refuseLe: '', creeLe: new Date().toISOString() })
        await demanderApprobationAvance({ ...ancien, ...data }, user)
        toast.success('Demande renvoyée à la GE ✓')
      } else { await updateItem(COL.avances, modal.id, data); toast.success('Demande modifiée ✓') }
    } else {
      const id = await addItem(COL.avances, { ...data, statut: 'demandee', remboursements: [], creePar: user?.nom || '', creeParUid: user?.uid || '', creeLe: new Date().toISOString() })
      await demanderApprobationAvance({ ...data, id, creePar: user?.nom }, user)
      toast.success('Demande envoyée à la GE pour approbation ✓')
    }
    setModal(null); setTente(false)
  }
  async function supprimer(a) { setDetailId(null); await supprimerAvecRetour(() => removeItem(COL.avances, a.id), 'Demande supprimée') }

  return (
    <div className="space-y-5">
      <PageHeader icon={HandCoins} sousModule="Temps & Paie" titre="Avances et prêts" sousTitre="Demande, approbation par la GE, versement, puis retenue automatique sur la paie."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
          <BoutonBande anime icone={Plus} onClick={() => { setTente(false); setModal(vide()) }}>Nouvelle demande</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="À approuver" value={compte('demandee')} sub="en attente de la GE" accent="#f59e0b" icon={Hourglass} />
        <StatCard title="À décaisser" value={compte('approuvee')} sub="décision de la finance" accent="#b45309" icon={CircleCheck} />
        <StatCard title="Reste à rembourser" value={formatMoney(resteTotal)} sub={`${compte('versee')} en cours`} accent="#7c3aed" icon={Wallet} />
        <StatCard title="Remboursées" value={compte('remboursee')} accent="#16a34a" icon={HandCoins} />
      </div>

      <div className="onglets-verre ed-entree" role="group" aria-label="Filtrer par statut" style={{ '--puce': '#0d9488' }}>
        {FILTRES.map((f) => (
          <button key={f.id || 'tous'} type="button" aria-pressed={filtre === f.id} data-actif={filtre === f.id} onClick={() => setFiltre(f.id)} className="onglet-verre">
            {f.label}{f.id && compte(f.id) > 0 ? <span className="onglet-verre-n">{compte(f.id)}</span> : null}
          </button>
        ))}
      </div>

      <section className="space-y-2.5">
        {liste.length === 0 ? (
          <p className="rounded-3xl border border-white/80 bg-white/60 px-3 py-10 text-center text-sm text-gray-400 backdrop-blur-xl">{avances.length ? 'Aucune demande ne correspond.' : 'Aucune avance ni prêt. Cliquez « Nouvelle demande ».'}</p>
        ) : liste.map((a, i) => {
          const st = STATUTS_AVANCE[a.statut || 'demandee']
          const accent = { demandee: '#f59e0b', approuvee: '#0284c7', versee: '#7c3aed', remboursee: '#16a34a', refusee: '#dc2626' }[a.statut || 'demandee']
          return (
            <div key={a.id} role="button" tabIndex={0} onClick={() => setDetailId(a.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(a.id) } }}
              className="ed-entree group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-white/70 to-teal-50/60 py-3 pl-5 pr-4 shadow-[0_14px_30px_-20px_rgba(13,148,136,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_rgba(13,148,136,0.6),inset_0_1px_0_rgba(255,255,255,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden="true" className="absolute inset-y-3 left-1.5 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-base font-black text-white shadow-[0_8px_16px_-8px_rgba(15,23,42,0.6),inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: avatarGradient(a.employeNom || '?') }} aria-hidden="true">{(a.employeNom || '?').trim().charAt(0).toUpperCase()}</span>
              <div className="relative min-w-0 flex-1 basis-44">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="truncate font-extrabold text-gray-800">{a.employeNom}</span><PastilleDecaissement doc={a} type="avance" petite />
                  <span className="rounded-full bg-teal-100/80 px-2 py-px text-[10.5px] font-bold text-teal-700">{libelleType(a.type)}</span></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1"><Banknote size={11} aria-hidden="true" />{a.nbMensualites > 1 ? `${a.nbMensualites} × ${formatMoney(mensualiteAvance(a))}` : 'Retenue en une fois'}</span>
                  {a.moisDebut && <span className="inline-flex items-center gap-1"><CalendarDays size={11} aria-hidden="true" />dès {moisEnClair(a.moisDebut)}</span>}
                </p>
                {a.motif && <p className="truncate text-xs italic text-gray-500">« {a.motif} »</p>}
                {a.statut === 'refusee' && a.motifRefus && <p className="truncate text-xs font-medium text-red-600">Refusée : {a.motifRefus}</p>}
                {a.statut === 'versee' && <div className="mt-1.5 max-w-xs"><BarreRemboursement avance={a} /></div>}
              </div>
              <div className="relative flex flex-col items-end gap-1">
                <span className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-2.5 py-1 text-sm font-black tabular-nums text-white shadow-[0_8px_14px_-8px_rgba(15,23,42,0.8),inset_0_1px_0_rgba(255,255,255,0.2)]">{formatMoney(a.montant)}</span>
                <span className="flex items-center gap-1.5">
                  {peutApprouverAvance(a, role) && <span className="animate-pulse rounded-full bg-violet-600 px-2 py-px text-[10px] font-bold text-white shadow-[0_0_0_3px_rgba(124,58,237,0.18)]">À traiter</span>}
                  <Badge tone={st?.tone}>{st?.label}</Badge>
                </span>
              </div>
              <div className="relative flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"><MiniatureMission mission={a} etapes={ETAPES_AVANCE} etats={etatsAvance(a)} sigles={SIGLES_AVANCE} /></div>
              <ChevronRight size={18} className="relative text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-500" aria-hidden="true" />
            </div>
          )
        })}
      </section>

      <DetailAvance avance={avances.find((a) => a.id === detailId)} employes={employes} onClose={() => setDetailId(null)} onSupprimer={supprimer}
        onModifier={(a) => { setDetailId(null); setTente(false); setModal({ id: a.id, employeId: a.employeId, type: a.type || 'avance', montant: a.montant || '', nbMensualites: a.nbMensualites || 1, moisDebut: a.moisDebut || moisSuivant(), motif: a.motif || '' }) }} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier la demande' : 'Nouvelle demande'} libelleSave={modal?.id ? 'Enregistrer' : 'Envoyer à la GE'}
        icone={UserRound} titreHero="Avance ou prêt pour :"
        intro={emp ? <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-white"><UserRound size={15} aria-hidden="true" />{emp.nom}</span> : 'Choisissez l’employé ci-dessous : son nom s’affichera ici.'}
        onSave={enregistrer}>
        {modal && (<>
          <Champ label="Employé" icone={UserRound} required erreur={erreur(modal.employeId) ? 'Choisissez un employé.' : undefined}>
            <select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner un employé…</option>{actifs.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Type de demande" iconeLabel icone={Layers}>
            <ChoixSimple value={modal.type} onChange={(type) => setModal({ ...modal, type, nbMensualites: type === 'avance' ? 1 : Math.max(2, Number(modal.nbMensualites) || 3) })} options={TYPES_AVANCE} />
          </Champ>
          <Champ label="Montant (XOF)" icone={Banknote} required erreur={erreur(montant > 0) ? 'Indiquez le montant.' : undefined}>
            <input type="number" min="0" value={modal.montant} onChange={(e) => setModal({ ...modal, montant: e.target.value })} className="input-base" placeholder="Ex. 100000" />
          </Champ>
          {modal.type === 'pret' && (
            <Champ label="Nombre de mensualités" iconeLabel icone={CalendarDays}>
              <ChoixSimple value={String(modal.nbMensualites)} onChange={(v) => setModal({ ...modal, nbMensualites: Number(v) })}
                options={[2, 3, 4, 6, 9, 12, 18, 24].map((v) => ({ value: String(v), label: `${v} mois` }))} />
            </Champ>
          )}
          <Champ label="Première retenue sur la paie de" icone={CalendarDays} required>
            <input type="month" value={modal.moisDebut} onChange={(e) => setModal({ ...modal, moisDebut: e.target.value })} className="input-base" />
          </Champ>
          {mensualite > 0 && (
            <p className={`flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-sm backdrop-blur-md ${tropFort ? 'border-amber-300/80 bg-amber-50/80 text-amber-800' : 'border-white/80 bg-white/60 text-gray-600'}`}>
              {tropFort ? <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Wallet size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />}
              <span>{n > 1 ? <>Retenue de <strong className="tabular-nums">{formatMoney(mensualite)}</strong> par mois pendant {n} mois</> : <>Retenue en une fois de <strong className="tabular-nums">{formatMoney(mensualite)}</strong></>} sur le net à payer.
                {tropFort && <> Attention : cela dépasse le tiers du salaire de base ({formatMoney(Math.round(salaire / 3))}).</>}</span>
            </p>
          )}
          <Champ label="Motif (facultatif)" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.motif} onChange={(e) => setModal({ ...modal, motif: e.target.value })} className="input-base" placeholder="Ex. Frais de scolarité, urgence médicale" />
          </Champ>
          <p className="flex items-start gap-2 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3.5 py-2.5 text-xs text-violet-800 backdrop-blur-md">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{modal.id ? 'Une demande refusée repart à l’approbation une fois corrigée.' : `La demande part à la GE pour approbation. Une fois versée, la retenue se fait toute seule sur les bulletins de paie.`}</span>
          </p>
        </>)}
      </ModalRh>
    </div>
  )
}
