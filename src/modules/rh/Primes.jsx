// RH : Primes (Temps & Paie). La RH attribue un type de prime (réglé dans Paramètres, Primes) à un employé, à un secteur ou à toute l'équipe ;
// la GE approuve ou refuse (motif obligatoire) ; les primes approuvées s'ajoutent ensuite toutes seules au brut des bulletins de paie du mois concerné.
import { useMemo, useState } from 'react'
import { Gift, Plus, UserRound, Banknote, CalendarDays, ChevronRight, ShieldCheck, Hourglass, Wallet, CheckCircle2, AlignLeft, Users, TriangleAlert, Settings2, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, todayStr } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { STATUTS_PRIME, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh, ChoixSimple } from './rhui'
import { supprimerAvecRetour } from './suppression'
import DetailPrime, { periodePrime } from './DetailPrime'
import { MiniatureCircuit } from './DetailAutorisationSalaire'
import { CIBLES_PRIME, peutTraiterPrime, etapeCourante, demanderValidationPrime, cibleLibelle, valeurLibelle, employesConcernes, montantPourEmploye, totalEstime, couvreMois, depassements } from './primesCircuit'

const vide = () => ({ typeId: '', cibleType: 'employe', employeId: '', departement: '', valeur: '', moisDebut: todayStr().slice(0, 7), motif: '' })
const FILTRES = [{ id: '', label: 'Toutes' }, { id: 'en_attente', label: 'En circuit' }, { id: 'autorise', label: 'Autorisées' }, { id: 'refuse', label: 'Refusées' }]

export default function Primes() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: primes } = useCollection(COL.primes)
  const { data: types } = useCollection(COL.typesPrimes)
  const { data: employes } = useCollection(COL.employes)
  const { data: users } = useCollection('users')
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('')
  const [modal, setModal] = useState(null)
  const [tente, setTente] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const secteurs = useMemo(() => [...new Set(actifs.map((e) => String(e.departement || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [actifs])
  const compte = (s) => primes.filter((p) => (p.statut || 'en_attente') === s).length
  const moisCourant = todayStr().slice(0, 7)
  const enCours = primes.filter((p) => couvreMois(p, moisCourant))
  const totalMois = enCours.reduce((s, p) => s + totalEstime(p, employes), 0)
  const liste = useMemo(() => [...primes].sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? 1 : -1))
    .filter((p) => !filtre || (p.statut || 'en_attente') === filtre)
    .filter((p) => correspond(recherche, p.typeNom, p.employeNom, p.departement, p.motif)), [primes, filtre, recherche])
  const nomsGe = users.filter((u) => u.role === 'ge').map((u) => u.nom || u.login)

  // Aperçu du formulaire : employés concernés, total estimé, dépassement du plafond du type.
  const type = modal ? types.find((t) => t.id === modal.typeId) : null
  const valeur = Number(modal?.valeur) || 0
  const brouillon = modal && type ? { typeId: type.id, typeNom: type.nom, mode: type.mode, valeur, periodicite: type.periodicite, cibleType: modal.cibleType, employeId: modal.employeId, departement: modal.departement } : null
  const concernes = brouillon ? employesConcernes(brouillon, employes) : []
  const total = brouillon ? concernes.reduce((s, e) => s + montantPourEmploye(brouillon, e), 0) : 0
  const trop = brouillon ? depassements(brouillon, type.plafondPct, employes) : []
  const erreur = (ok) => tente && !ok
  const cibleOk = modal && (modal.cibleType === 'equipe' || (modal.cibleType === 'employe' && modal.employeId) || (modal.cibleType === 'secteur' && modal.departement))

  function choisirType(id) {
    const t = types.find((x) => x.id === id)
    setModal({ ...modal, typeId: id, valeur: t && Number(t.valeur) > 0 ? String(t.valeur) : modal.valeur })
  }

  async function enregistrer() {
    setTente(true)
    if (!type || !(valeur > 0) || !cibleOk || !modal.moisDebut) return toast.error('Complétez le type, la cible, la valeur et le mois')
    if (!concernes.length) return toast.error('Aucun employé actif ne correspond à cette cible')
    if (trop.length) return toast.error(`Au-dessus du plafond de ${type.plafondPct} % du salaire : ${trop.slice(0, 3).join(', ')}${trop.length > 3 ? '…' : ''}`)
    const emp = modal.cibleType === 'employe' ? employes.find((e) => e.id === modal.employeId) : null
    const data = {
      typeId: type.id, typeNom: type.nom, mode: type.mode, valeur, periodicite: type.periodicite, plafondPct: Number(type.plafondPct) || 0,
      cibleType: modal.cibleType, employeId: emp?.id || '', employeNom: emp?.nom || '', departement: modal.cibleType === 'secteur' ? modal.departement : '',
      moisDebut: modal.moisDebut, moisFin: '', motif: (modal.motif || '').trim()
    }
    if (modal.id) {
      const ancien = primes.find((p) => p.id === modal.id)
      if (ancien?.statut === 'refuse') {
        // Corrigée après un refus : le circuit repart de zéro (Validation DF, puis GE, puis PAU).
        await updateItem(COL.primes, modal.id, { ...data, statut: 'en_attente', validations: {}, refus: null, motifRefus: '', decidePar: '', decideLe: '', creeLe: new Date().toISOString() })
        await demanderValidationPrime({ ...ancien, ...data }, user)
        toast.success('Prime renvoyée au circuit ✓')
      } else { await updateItem(COL.primes, modal.id, data); toast.success('Prime modifiée ✓') }
    } else {
      const id = await addItem(COL.primes, { ...data, statut: 'en_attente', validations: {}, creePar: user?.nom || '', creeParUid: user?.uid || '', creeLe: new Date().toISOString() })
      await demanderValidationPrime({ ...data, id, creePar: user?.nom }, user)
      toast.success('Prime envoyée au circuit : validation du DF ✓')
    }
    setModal(null); setTente(false)
  }
  async function supprimer(p) { setDetailId(null); await supprimerAvecRetour(() => removeItem(COL.primes, p.id), 'Prime supprimée') }

  return (
    <div className="space-y-5">
      <PageHeader icon={Gift} sousModule="Temps & Paie" titre="Primes" sousTitre="Attribution d'une prime, circuit DF, GE puis PAU, puis ajout automatique au salaire."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher une prime…" />
          <BoutonBande anime icone={Plus} onClick={() => { setTente(false); setModal(vide()) }}>Attribuer une prime</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="En circuit" value={compte('en_attente')} sub="DF, GE puis PAU" accent="#f59e0b" icon={Hourglass} />
        <StatCard title="En cours ce mois" value={enCours.length} sub="primes autorisées" accent="#be185d" icon={Gift} />
        <StatCard title="Total du mois" value={formatMoney(totalMois)} sub="estimation, tous employés" accent="#7c3aed" icon={Wallet} />
        <StatCard title="Refusées" value={compte('refuse')} accent="#dc2626" icon={TriangleAlert} />
      </div>

      {types.length === 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 backdrop-blur-md">
          <Settings2 size={16} aria-hidden="true" /> Aucun type de prime n'est réglé.
          <Link to="/rh/primes-configuration" className="font-extrabold underline">Ajouter les types de primes</Link>
        </p>
      )}

      <div className="onglets-verre ed-entree" role="group" aria-label="Filtrer par statut" style={{ '--puce': '#be185d' }}>
        {FILTRES.map((f) => (
          <button key={f.id || 'tous'} type="button" aria-pressed={filtre === f.id} data-actif={filtre === f.id} onClick={() => setFiltre(f.id)} className="onglet-verre">
            {f.label}{f.id && compte(f.id) > 0 ? <span className="onglet-verre-n">{compte(f.id)}</span> : null}
          </button>
        ))}
      </div>

      <section className="space-y-2.5">
        {liste.length === 0 ? (
          <p className="rounded-3xl border border-white/80 bg-white/60 px-3 py-10 text-center text-sm text-gray-400 backdrop-blur-xl">{primes.length ? 'Aucune prime ne correspond.' : 'Aucune prime. Cliquez « Attribuer une prime ».'}</p>
        ) : liste.map((p, i) => {
          const st = STATUTS_PRIME[p.statut || 'en_attente']
          const accent = { en_attente: '#f59e0b', autorise: '#16a34a', refuse: '#dc2626' }[p.statut || 'en_attente']
          const nom = cibleLibelle(p)
          return (
            <div key={p.id} role="button" tabIndex={0} onClick={() => setDetailId(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(p.id) } }}
              className="ed-entree group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-white/70 to-pink-50/60 py-3 pl-5 pr-4 shadow-[0_14px_30px_-20px_rgba(190,24,93,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden="true" className="absolute inset-y-3 left-1.5 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-white shadow-[0_8px_16px_-8px_rgba(15,23,42,0.6),inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: p.cibleType === 'employe' ? avatarGradient(nom) : 'linear-gradient(135deg,#be185d,#9d174d)' }} aria-hidden="true">
                {p.cibleType === 'employe' ? <span className="text-base font-black">{(nom || '?').trim().charAt(0).toUpperCase()}</span> : <Users size={18} />}
              </span>
              <div className="relative min-w-0 flex-1 basis-44">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="truncate font-extrabold text-gray-800">{p.typeNom}</span>
                  <span className="rounded-full bg-pink-100/80 px-2 py-px text-[10.5px] font-bold text-pink-700">{p.periodicite === 'ponctuelle' ? 'Ponctuelle' : 'Mensuelle'}</span></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1"><UserRound size={11} aria-hidden="true" />{nom}</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays size={11} aria-hidden="true" />{periodePrime(p)}</span>
                </p>
                {p.motif && <p className="truncate text-xs italic text-gray-500">« {p.motif} »</p>}
                {p.statut === 'refuse' && p.motifRefus && <p className="truncate text-xs font-medium text-red-600">Refusée : {p.motifRefus}</p>}
              </div>
              <div className="relative flex flex-col items-end gap-1">
                <span className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-2.5 py-1 text-sm font-black tabular-nums text-white shadow-[0_8px_14px_-8px_rgba(15,23,42,0.8),inset_0_1px_0_rgba(255,255,255,0.2)]">{valeurLibelle(p)}</span>
                <span className="flex items-center gap-1.5">
                  {peutTraiterPrime(p, user, role) && <span className="animate-pulse rounded-full bg-violet-600 px-2 py-px text-[10px] font-bold text-white shadow-[0_0_0_3px_rgba(124,58,237,0.18)]">À traiter</span>}
                  <Badge tone={st?.tone}>{st?.label}</Badge>
                </span>
              </div>
              <div className="relative flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"><MiniatureCircuit d={p} /></div>
              <ChevronRight size={18} className="relative text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500" aria-hidden="true" />
            </div>
          )
        })}
      </section>

      <DetailPrime prime={primes.find((p) => p.id === detailId)} employes={employes} onClose={() => setDetailId(null)} onSupprimer={supprimer}
        onModifier={(p) => { setDetailId(null); setTente(false); setModal({ id: p.id, typeId: p.typeId, cibleType: p.cibleType || 'employe', employeId: p.employeId || '', departement: p.departement || '', valeur: String(p.valeur ?? ''), moisDebut: p.moisDebut || todayStr().slice(0, 7), motif: p.motif || '' }) }} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier la prime' : 'Attribuer une prime'} libelleSave={modal?.id ? 'Enregistrer' : 'Envoyer au circuit'}
        icone={Gift} titreHero="Prime" intro={type ? `${type.nom} : ${type.periodicite === 'ponctuelle' ? 'une seule fois' : 'chaque mois'}` : 'Choisissez le type de prime ci-dessous.'}
        onSave={enregistrer}>
        {modal && (<>
          <Champ label="Type de prime" iconeLabel icone={Layers} required erreur={erreur(type) ? 'Choisissez un type.' : undefined}>
            {types.length ? <ChoixSimple value={modal.typeId} onChange={choisirType} options={types.map((t) => ({ value: t.id, label: t.nom }))} />
              : <p className="text-sm text-gray-500">Aucun type : réglez-les dans Paramètres, Primes.</p>}
          </Champ>
          <Champ label="Pour" iconeLabel icone={Users}>
            <ChoixSimple value={modal.cibleType} onChange={(v) => setModal({ ...modal, cibleType: v })} options={CIBLES_PRIME} />
          </Champ>
          {modal.cibleType === 'employe' && (
            <Champ label="Employé" icone={UserRound} required erreur={erreur(modal.employeId) ? 'Choisissez un employé.' : undefined}>
              <select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
                <option value="">Sélectionner un employé…</option>{actifs.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </Champ>
          )}
          {modal.cibleType === 'secteur' && (
            <Champ label="Secteur" icone={Users} required erreur={erreur(modal.departement) ? 'Choisissez un secteur.' : undefined}>
              <select value={modal.departement} onChange={(e) => setModal({ ...modal, departement: e.target.value })} className="input-base">
                <option value="">Sélectionner un secteur…</option>{secteurs.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Champ>
          )}
          <Champ label={type?.mode === 'pourcent' ? 'Pourcentage du salaire de base (%)' : 'Montant par employé (FCFA)'} icone={Banknote} required erreur={erreur(valeur > 0) ? 'Indiquez la valeur.' : undefined}>
            <input type="number" min="0" value={modal.valeur} onChange={(e) => setModal({ ...modal, valeur: e.target.value })} className="input-base" placeholder={type?.mode === 'pourcent' ? 'Ex. 10' : 'Ex. 15000'} />
          </Champ>
          <Champ label={type?.periodicite === 'ponctuelle' ? 'Mois de la prime' : 'À partir de la paie de'} icone={CalendarDays} required>
            <input type="month" value={modal.moisDebut} onChange={(e) => setModal({ ...modal, moisDebut: e.target.value })} className="input-base" />
          </Champ>
          {brouillon && valeur > 0 && cibleOk && (
            <p className={`flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-sm backdrop-blur-md ${trop.length ? 'border-amber-300/80 bg-amber-50/80 text-amber-800' : 'border-white/80 bg-white/60 text-gray-600'}`}>
              {trop.length ? <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Wallet size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />}
              <span>{concernes.length} employé(s) concerné(s) : <strong className="tabular-nums">{formatMoney(total)}</strong> {type.periodicite === 'ponctuelle' ? 'au total' : 'par mois au total'}, ajoutés au brut.
                {concernes.length === 1 && Number(concernes[0].salaire) > 0 && <> {type.mode === 'pourcent' ? `${valeur} % de son salaire de ${formatMoney(concernes[0].salaire)} = ${formatMoney(total)}.` : `Soit ${Math.round((total / Number(concernes[0].salaire)) * 1000) / 10} % de son salaire de ${formatMoney(concernes[0].salaire)}.`}</>}
                {trop.length > 0 && <> Plafond de {type.plafondPct} % du salaire dépassé pour : {trop.slice(0, 3).join(', ')}{trop.length > 3 ? '…' : ''}.</>}</span>
            </p>
          )}
          <Champ label="Motif (facultatif)" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.motif} onChange={(e) => setModal({ ...modal, motif: e.target.value })} className="input-base" placeholder="Ex. Objectifs atteints au 3e trimestre" />
          </Champ>
          <p className="flex items-start gap-2 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3.5 py-2.5 text-xs text-violet-800 backdrop-blur-md">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{modal.id ? 'Une prime refusée repart au début du circuit une fois corrigée.' : 'La prime suit le circuit des salaires : validation du DF, approbation de la GE, autorisation du PAU. Une fois autorisée, elle s’ajoute au salaire de l’employé pour les mois concernés.'}</span>
          </p>
        </>)}
      </ModalRh>
    </div>
  )
}
