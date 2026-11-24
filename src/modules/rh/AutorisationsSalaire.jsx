// RH : Autorisation de salaire (Temps & Paie). La RH demande l'autorisation de payer le salaire d'un employé. La demande suit un circuit :
// 1 Demande (RH) → 2 Validation (DF) → 3 Approbation (GE) → 4 Autorisation (PAU). Chaque étape est cochée quand la personne valide ; à la fin,
// le bulletin du mois passe à « Payé ». Enregistré dans rh_autorisations_salaire : statut en_attente → autorise ou refuse.
import { useMemo, useState } from 'react'
import { ShieldCheck, Plus, UserRound, CalendarDays, Wallet, AlignLeft, Clock3, BadgeCheck, Ban, ChevronRight, Trash2, Pencil } from 'lucide-react'
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { avatarGradient } from '../../utils/color'
import { COL } from './store/rhStore'
import DetailAutorisationSalaire, { ETAPES, MiniatureCircuit, ChapeletAutorisation, STATUTS_AUTORISATION as STATUTS, moisLabel, peutDeciderAutorisation } from './DetailAutorisationSalaire'
import { PageHeader, Champ, ModalRh } from './rhui'
import { BoutonBande } from '../../shared/ui/BandeauVolet'

const ETAPES_A_TRAITER_PAGE = ETAPES.filter((e) => e.role)
const vide = () => ({ employeId: '', mois: todayStr().slice(0, 7), montant: '', message: '' })
const premiereEtape = ETAPES_A_TRAITER_PAGE[0]

export default function AutorisationsSalaire() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const { data: demandes } = useCollection(COL.autorisationsSalaire)
  const { data: employes } = useCollection(COL.employes)
  const { data: bulletins } = useCollection(COL.bulletins)
  const { data: users } = useCollection('users')
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [tente, setTente] = useState(false)

  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const peutDecider = (d) => peutDeciderAutorisation(d, user, role)

  const liste = useMemo(() => [...demandes].sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? 1 : -1))
    .filter((d) => correspond(recherche, d.employeNom, d.mois)), [demandes, recherche])
  const compte = (s) => demandes.filter((d) => (d.statut || 'en_attente') === s).length
  const aTraiter = demandes.filter((d) => peutDecider(d)).length

  // Net du bulletin du mois choisi : proposé comme montant, modifiable.
  const netBulletin = (empId, mois) => bulletins.find((b) => b.employeId === empId && b.mois === mois)?.net
  function choisir(champs) {
    const suivant = { ...modal, ...champs }
    if ('employeId' in champs || 'mois' in champs) {
      const net = netBulletin(suivant.employeId, suivant.mois)
      if (net) suivant.montant = String(net)
    }
    setModal(suivant)
  }

  async function envoyer() {
    setTente(true)
    const emp = employes.find((e) => e.id === modal.employeId)
    const montant = Number(modal.montant)
    if (!emp || !(montant > 0) || !modal.mois) return toast.error("Choisissez l'employé, le mois et le montant")
    const bulletin = bulletins.find((b) => b.employeId === emp.id && b.mois === modal.mois)
    // Correction d'une demande qui n'a encore reçu aucune validation : on met à jour la demande, sans la renvoyer ni avertir de nouveau.
    if (modal.id) {
      try {
        await updateItem(COL.autorisationsSalaire, modal.id, { employeId: emp.id, employeNom: emp.nom, mois: modal.mois, montant, bulletinId: bulletin?.id || '', message: (modal.message || '').trim() })
        toast.success('Demande corrigée ✓'); setModal(null); setTente(false)
      } catch (err) { toast.error(err?.message || 'Correction impossible : réessayez') }
      return
    }
    await addItem(COL.autorisationsSalaire, {
      employeId: emp.id, employeNom: emp.nom, mois: modal.mois, montant, bulletinId: bulletin?.id || '',
      message: (modal.message || '').trim(), statut: 'en_attente', validations: {},
      creePar: user?.nom || '', creeParUid: user?.uid || '', creeLe: new Date().toISOString()
    })
    // Étape 2 : la Validation (DF) est avertie, par cloche, push et alerte sur sa page d'accueil.
    await notify({
      type: 'demande', title: '💰 Autorisation de salaire à traiter',
      body: `${emp.nom} : ${formatMoney(montant)} pour ${moisLabel(modal.mois)}. Demande de ${user?.nom || 'la RH'}, à vous de ${premiereEtape.verbe.toLowerCase()}.`,
      module: 'rh', forRoles: [premiereEtape.role], excludeUid: user?.uid, link: '/rh/autorisations-salaire'
    }).catch(() => {})
    toast.success(`Demande envoyée : à ${premiereEtape.verbe.toLowerCase()} par ${premiereEtape.sigle} ✓`)
    setModal(null); setTente(false)
  }

  // Suppression réservée à l'administration ; la fenêtre « Motif » sert de confirmation.
  const peutSupprimer = usePeutSupprimerRh()
  const supprimer = (d) => supprimerAvecRetour(() => removeItem(COL.autorisationsSalaire, d.id), 'Demande supprimée')
  // Une demande se corrige tant qu'aucune étape du circuit ne l'a validée.
  const peutCorriger = (d) => (d.statut || 'en_attente') === 'en_attente' && !Object.keys(d.validations || {}).length

  const invalide = (ok) => tente && !ok
  const nomEmploye = modal?.employeId ? employes.find((e) => e.id === modal.employeId)?.nom : ''

  return (
    <div className="space-y-5">
      <PageHeader icon={ShieldCheck} sousModule="Temps & Paie" titre="Autorisation de salaire" sousTitre="Demande, validation DF, approbation GE, autorisation PAU : puis le bulletin passe à Payé."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
          <BoutonBande anime icone={Plus} onClick={() => { setTente(false); setModal(vide()) }}>Nouvelle demande</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="À traiter par moi" value={aTraiter} accent="#7c3aed" icon={ShieldCheck} />
        <StatCard title="En cours" value={compte('en_attente')} accent="#f59e0b" icon={Clock3} />
        <StatCard title="Autorisées" value={compte('autorise')} accent="#16a34a" icon={BadgeCheck} />
        <StatCard title="Refusées" value={compte('refuse')} accent="#dc2626" icon={Ban} />
      </div>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between px-1">
          <p className="text-sm font-extrabold uppercase tracking-wide text-gray-500">Demandes d'autorisation</p>
          <p className="text-xs font-semibold text-gray-400">{liste.length} demande(s)</p>
        </div>
        {liste.length === 0 ? (
          <p className="rounded-3xl border border-white/80 bg-white/60 px-3 py-10 text-center text-sm text-gray-400 backdrop-blur-xl">Aucune demande. Cliquez « Nouvelle demande » pour en envoyer une.</p>
        ) : liste.map((d, i) => {
          const st = STATUTS[d.statut || 'en_attente']
          const accent = d.statut === 'autorise' ? '#16a34a' : d.statut === 'refuse' ? '#dc2626' : '#f59e0b'
          const mienne = peutDecider(d)
          return (
            <div key={d.id} role="button" tabIndex={0} onClick={() => setDetailId(d.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(d.id) } }}
              className="ed-entree group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-white/70 to-sky-50/60 py-3 pl-5 pr-4 shadow-[0_14px_30px_-20px_rgba(2,132,199,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_rgba(2,132,199,0.6),inset_0_1px_0_rgba(255,255,255,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden="true" className="absolute inset-y-3 left-1.5 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}88` }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-base font-black text-white shadow-[0_8px_16px_-8px_rgba(15,23,42,0.6),inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: avatarGradient(d.employeNom || '?') }} aria-hidden="true">
                {(d.employeNom || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="relative min-w-0 flex-1 basis-44">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-extrabold text-gray-800">{d.employeNom}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 px-2 py-px text-[10.5px] font-bold text-sky-700"><CalendarDays size={10} aria-hidden="true" />{moisLabel(d.mois)}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500"><UserRound size={11} className="shrink-0" aria-hidden="true" />Demandé par {d.creePar || 'la RH'}{d.creeLe ? ` le ${formatDateShort(d.creeLe.slice(0, 10))}` : ''}</p>
                {d.message && <p className="truncate text-xs italic text-gray-500">« {d.message} »</p>}
                {d.statut === 'refuse' && d.motifRefus && <p className="truncate text-xs font-medium text-red-600">Refusée : {d.motifRefus}</p>}
              </div>
              <div className="relative flex flex-col items-end gap-1">
                <span className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-2.5 py-1 text-sm font-black tabular-nums text-white shadow-[0_8px_14px_-8px_rgba(15,23,42,0.8),inset_0_1px_0_rgba(255,255,255,0.2)]">{formatMoney(d.montant)}</span>
                <span className="flex items-center gap-1.5">
                  {mienne && <span className="animate-pulse rounded-full bg-violet-600 px-2 py-px text-[10px] font-bold text-white shadow-[0_0_0_3px_rgba(124,58,237,0.18)]">À traiter</span>}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
              </div>
              {/* Le circuit en miniature ferme la bande : chaque étape se coche quand la personne valide. */}
              <div className="relative flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                <MiniatureCircuit d={d} />
              </div>
              <div className="relative flex items-center gap-1">
                {peutCorriger(d) && (
                  <button onClick={(e) => { e.stopPropagation(); setTente(false); setModal({ id: d.id, employeId: d.employeId, mois: d.mois, montant: String(d.montant || ''), message: d.message || '' }) }} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-sky-50 hover:text-sky-700" title="Corriger la demande" aria-label="Corriger la demande"><Pencil size={14} /></button>
                )}
                {peutSupprimer && (
                  <button onClick={(e) => { e.stopPropagation(); supprimer(d) }} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Supprimer la demande" aria-label="Supprimer la demande"><Trash2 size={14} /></button>
                )}
                <ChevronRight size={18} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500" aria-hidden="true" />
              </div>
            </div>
          )
        })}
      </section>

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? "Corriger la demande d'autorisation" : "Demande d'autorisation de salaire"} libelleSave={modal?.id ? 'Enregistrer' : 'Envoyer la demande'}
        icone={UserRound} titreHero="Demande d'autorisation de salaire de :"
        intro={nomEmploye
          ? <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-white"><UserRound size={15} aria-hidden="true" />{nomEmploye}</span>
          : "Choisissez l'employé ci-dessous : son nom s'affichera ici."}
        onSave={envoyer}>
        {modal && (<>
          <Champ label="Employé" icone={UserRound} required erreur={invalide(modal.employeId) ? 'Choisissez un employé.' : undefined}>
            <select value={modal.employeId} onChange={(e) => choisir({ employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner un employé…</option>{actifs.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Mois du salaire" icone={CalendarDays} required>
              <input type="month" value={modal.mois} onChange={(e) => choisir({ mois: e.target.value })} className="input-base" />
            </Champ>
            <Champ label="Montant à payer (XOF)" icone={Wallet} required
              aide={netBulletin(modal.employeId, modal.mois) ? 'Net du bulletin de ce mois, modifiable.' : modal.employeId ? 'Aucun bulletin ce mois-ci : saisissez le montant.' : undefined}
              erreur={invalide(Number(modal.montant) > 0) ? 'Indiquez le montant.' : undefined}>
              <input type="number" min="0" value={modal.montant} onChange={(e) => setModal({ ...modal, montant: e.target.value })} className="input-base" placeholder="Ex. 150000" />
            </Champ>
          </div>
          <Champ label="Circuit de la demande" iconeLabel icone={ShieldCheck} aide="Chaque personne valide à son tour : l'étape se coche et la suivante est avertie. À la fin, le bulletin du mois passe à Payé.">
            <div className="mt-3 pb-1"><ChapeletAutorisation d={{ statut: 'en_attente', validations: {} }} demandeur={user?.nom} users={users} /></div>
          </Champ>
          <Champ label="Message (facultatif)" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.message} onChange={(e) => setModal({ ...modal, message: e.target.value })} className="input-base" placeholder="Ex. Salaire du mois, à payer avant vendredi" />
          </Champ>
        </>)}
      </ModalRh>

      <DetailAutorisationSalaire demande={demandes.find((d) => d.id === detailId)} onClose={() => setDetailId(null)} />
    </div>
  )
}
