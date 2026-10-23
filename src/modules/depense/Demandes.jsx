// Demandes de décaissement : on fait une demande, elle part en alerte au PAU, à la GE, à l'Info et à la direction,
// et l'un d'eux la valide (elle devient une dépense décaissée, qui compte dans le budget) ou la refuse, en une seule étape.
//   en_attente (envoyée) → decaissee (validée) ou refusee. L'ancien état « approuvee » reste décidable d'un seul clic.
import { useMemo, useState } from 'react'
import { Check, X, BadgeCheck, Stamp, Clock, MessageSquare, Trash2, AlertTriangle, Hourglass, CheckCircle2, XCircle, Layers, Phone, PiggyBank, Briefcase, Siren, Send, Plus, HandCoins, Wallet, Tag, CalendarDays, UserRound, FileText, Building2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import BoutonVerre from '../../shared/ui/BoutonVerre'
import BandeauVolet, { OngletsBande } from '../../shared/ui/BandeauVolet'
import NouvelleDemandeModal, { DESTINATAIRES_DEMANDE, URGENCES } from './NouvelleDemandeModal'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { FULL_ACCESS_ROLES, depenseRoleEffectif, isReadOnlyRole } from '../../core/roles'
import { updateItem, removeItem, setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { formatDateShort, formatMoney, genId, todayStr } from '../../utils/formatters'
import { glassModalProps, icone3D, avatarGradient } from '../../utils/color'
import Compteur from '../../shared/ui/Compteur'
import { SECTEURS, STATUTS_DECAISSEMENT, CATEGORIES_DEPENSE, LOGISTIQUE_SITES, natureFluxDefaut } from './data'
import { budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, libelleSecteurSite, seuilsBudgetDe } from './logic'
import { notifierBeneficiaire } from './notifications'

const ACTION_INFO = {
  valider: { titre: 'Valider la demande', label: 'Commentaire (optionnel)', placeholder: 'Ex. : fonds remis en main propre, montant conforme…', requis: false, variant: 'success', bouton: 'Valider' },
  refuser: { titre: 'Refuser la demande', label: 'Motif du refus', placeholder: 'Expliquez pourquoi cette demande est refusée…', requis: true, variant: 'danger', bouton: 'Refuser' }
}

// Ceux qui reçoivent l'alerte d'une nouvelle demande et qui peuvent la valider ou la refuser (un seul suffit).
// Le directeur compte ici, alors que dans le reste d'E-DÉPENSES il est traité comme un agent.
const VALIDEURS_DEMANDE = [...DESTINATAIRES_DEMANDE, 'assistant_pau']

// Couleur d'accent (barre latérale de la carte) selon le statut de la demande.
const STATUT_ACCENT = { en_attente: '#d97706', approuvee: '#0ea5e9', decaissee: '#16a34a', refusee: '#dc2626' }

const initiales = (nom) => (nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?'
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')

// Parcours d'une demande : envoyée → décision → argent décaissé. L'étape en cours pulse doucement.
function Etapes({ d }) {
  const refusee = d.statut === 'refusee'
  const validee = d.statut === 'decaissee'
  const etapes = [
    { label: 'Envoyée', etat: 'fait', couleur: '#16a34a' },
    { label: refusee ? 'Refusée' : 'Décision', etat: refusee ? 'refus' : validee ? 'fait' : 'cours', couleur: refusee ? '#dc2626' : validee ? '#16a34a' : '#d97706' },
    { label: 'Décaissée', etat: validee ? 'fait' : 'attente', couleur: validee ? '#16a34a' : '#cbd5e1' }
  ]
  return (
    <div className="flex items-center">
      {etapes.map((e, i) => (
        <div key={e.label} className="flex items-center">
          {i > 0 && <span className="h-0.5 w-5 rounded-full sm:w-8" style={{ background: etapes[i - 1].etat === 'fait' ? '#16a34a' : '#e2e8f0' }} />}
          <span className="flex flex-col items-center">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${e.etat === 'cours' ? 'ed-halo' : ''}`} style={{ background: e.couleur }}>
              {e.etat === 'fait' ? <Check size={11} strokeWidth={3} /> : e.etat === 'refus' ? <X size={11} strokeWidth={3} /> : e.etat === 'cours' ? <Hourglass size={10} /> : null}
            </span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">{e.label}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Demandes() {
  const { user, role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici,
  // y compris pour approuver/certifier/supprimer un décaissement.
  const role = depenseRoleEffectif(roleReel)
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: projets }  = useCollection('projets')
  const { data: besoins }  = useCollection('projet_besoins')
  const { data: depenseParams } = useCollection('depense_params')
  // Seuils d'alerte configurables en Paramètres — cf. Dashboard.jsx.
  const seuils = useMemo(() => seuilsBudgetDe(depenseParams), [depenseParams])

  // Destinataires d'une décision (approbation/refus/certification) : la personne qui a
  // enregistré la demande, le responsable du projet E-G.Pro concerné (besoin validé) ET,
  // si la dépense vient d'un besoin, l'agent qui l'a initialement demandé — car
  // `enregistreParUid` porte alors l'identité du chef de projet qui a validé le besoin,
  // pas celle du demandeur d'origine, qui sinon n'apprend jamais la décision finale du
  // PAU (il n'a été notifié qu'au moment de la validation du besoin) — sans doublon ni
  // auto-notification de qui décide.
  const destinataires = (d) => {
    const projet = d.projetId ? projets.find((p) => p.id === d.projetId) : null
    const besoin = d.source === 'besoin' && d.besoinId ? besoins.find((b) => b.id === d.besoinId) : null
    return [...new Set([d.enregistreParUid, projet?.responsableUid, besoin?.demandeParUid].filter((uid) => uid && uid !== user?.uid))]
  }

  // Peut valider ou refuser : PAU, GE, Info, directeur (jamais sa propre demande, cf. estMienne).
  const peutValider = VALIDEURS_DEMANDE.includes(roleReel)
  const lectureSeule = isReadOnlyRole(roleReel)

  // SÉPARATION DES POUVOIRS (audit sécurité 2026-08-04) : une même personne
  // pouvait saisir un décaissement, l'approuver PUIS le certifier — l'argent
  // sortait sans qu'aucun second regard n'intervienne.
  //  - `estMienne`      : je suis à l'origine de la demande → je ne décide pas.
  //  - `approuveeParMoi`: j'ai déjà approuvé au 1er niveau → la certification
  //                       (2e niveau) revient obligatoirement à quelqu'un d'autre.
  const estMienne = (d) => !!user && (d.enregistreParUid === user.uid || d.enregistrePar === user.nom)
  // Suppression réservée à l'administration — seulement tant qu'aucun niveau
  // d'approbation n'a encore statué (sinon c'est un engagement réel, cf. refuser).
  const peutSupprimer = FULL_ACCESS_ROLES.includes(role)

  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('attente')
  const [busy, setBusy] = useState(false)
  const [actionModal, setActionModal] = useState(null) // { d, type: 'valider' | 'refuser' }
  const [demandeOuverte, setDemandeOuverte] = useState(false) // fenêtre « Nouvelle demande »
  const [commentaire, setCommentaire] = useState('')
  const [detail, setDetail] = useState(null) // dépense sélectionnée pour la fiche détail
  const [toDelete, setToDelete] = useState(null) // dépense en cours de suppression
  const [motifSuppression, setMotifSuppression] = useState('')

  // Une « demande » : tout ce qui est passé par ce circuit (en attente, refusé, ou décaissé après validation).
  const demandes = useMemo(() => depenses.filter((d) => ['en_attente', 'approuvee', 'refusee'].includes(d.statut) || (d.statut === 'decaissee' && (d.demande || d.valideePar || d.certifieePar || d.approuveePar))), [depenses])
  const estAttente = (d) => d.statut === 'en_attente' || d.statut === 'approuvee'
  const compteur = (f) => demandes.filter((d) => (f === 'attente' ? estAttente(d) : f === 'validee' ? d.statut === 'decaissee' : d.statut === 'refusee')).length
  const filtrees = useMemo(() => {
    const rows = filtre === 'tous' ? demandes : filtre === 'attente' ? demandes.filter(estAttente) : filtre === 'validee' ? demandes.filter((d) => d.statut === 'decaissee') : demandes.filter((d) => d.statut === 'refusee')
    return rows.filter((d) => correspond(recherche, d.description, d.beneficiaireNom, d.enregistrePar, d.valideePar, d.categorie))
      .sort((a, b) => (estAttente(b) ? (URGENCES[b.urgence]?.rang || 0) : 0) - (estAttente(a) ? (URGENCES[a.urgence]?.rang || 0) : 0) || (b.createdAt || 0) - (a.createdAt || 0))
  }, [demandes, filtre, recherche])

  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); toast.success(okMsg) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  function ouvrirAction(d, type) {
    setCommentaire('')
    setActionModal({ d, type })
  }

  function fermerSuppression() {
    setToDelete(null)
    setMotifSuppression('')
  }

  async function confirmerSuppression() {
    const d = toDelete
    if (!d || busy) return
    // Le motif est OBLIGATOIRE : toute suppression de dépense doit être justifiée et
    // tracée dans le Journal et Historique (audit ci-dessous).
    const motif = motifSuppression.trim()
    if (!motif) return toast.error('Indiquez le motif de la suppression')
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      // Tombstone : reste consultable EN DÉTAIL dans l'Historique (cf. Depenses.jsx).
      await setItem('depense_depenses_supprimees', d.id, {
        ...d, id: d.id,
        supprimeePar: user?.nom || user?.login || '—', supprimeeParUid: user?.uid || null,
        supprimeeLe: Date.now(), motifSuppression: motif
      })
      await removeItem('depense_depenses', d.id)
      await audit('depense', 'DECAISSEMENT_SUPPRIME',
        `${secteur?.label || d.secteurId} : ${formatMoney(Number(d.montant) || 0)}${d.categorie ? ` · ${d.categorie}` : ''}${d.description ? ` : ${d.description}` : ''} · Statut : ${d.statut || '—'} · Motif : ${motif}`,
        { secteurId: d.secteurId, montant: Number(d.montant) || 0, categorie: d.categorie || null, date: d.date || null, statut: d.statut || null, motifSuppression: motif }
      )
    }, 'Dépense supprimée')
    fermerSuppression()
    setDetail(null)
  }

  async function refuser(d, motif) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'refusee', refusMotif: motif || '', refuseePar: user?.nom || '—', refuseeLe: Date.now() })
      await audit('depense', 'DEMANDE_REFUSEE', `${secteur?.label || d.secteurId} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, { motif })
      const dest = destinataires(d)
      if (dest.length) {
        await notify({ type: 'refus', title: '❌ Demande refusée', body: `${Number(d.montant).toLocaleString('fr-FR')} FCFA : ${secteur?.label || d.secteurId}${motif ? ' : ' + motif : ''}`, module: 'depense', forUsers: dest, link: '/depense/demandes' }).catch(() => {})
      }
    }, 'Demande refusée')
  }

  async function valider(d, texte) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      const nom = user?.nom || '—'
      // On renseigne aussi certifieePar/certifieeLe : d'autres écrans (historique, fiches) les lisent encore.
      await updateItem('depense_depenses', d.id, { statut: 'decaissee', demande: true, valideePar: nom, valideeLe: Date.now(), validationCommentaire: texte || '', certifieePar: nom, certifieeLe: Date.now() })
      await audit('depense', 'DEMANDE_VALIDEE', `${secteur?.label || d.secteurId} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, texte ? { commentaire: texte } : null)
      const dest = destinataires(d)
      if (dest.length) {
        await notify({ type: 'success', title: '✅ Demande validée', body: `${Number(d.montant).toLocaleString('fr-FR')} FCFA : ${secteur?.label || d.secteurId} : validée par ${nom}`, module: 'depense', forUsers: dest, link: '/depense/demandes' }).catch(() => {})
      }
      await notifierBeneficiaire(d, secteur?.label || d.secteurId)
      await alerterSiDepassement(d, secteur)
    }, '✅ Demande validée : dépense décaissée')
  }

  async function confirmerAction() {
    if (!actionModal) return
    const { d, type } = actionModal
    const info = ACTION_INFO[type]
    const texte = commentaire.trim()
    if (info.requis && !texte) { toast.error('Merci de préciser un motif.'); return }
    if (type === 'valider') await valider(d, texte)
    else if (type === 'refuser') await refuser(d, texte)
    setActionModal(null)
    setDetail(null)
  }

  // Notifie la direction si le secteur — ou la Caisse courante si la dépense est marquée
  // `financePar: 'caisse_commune'` (cf. même logique dans depenseActions.js) — atteint
  // 80%+ de son budget une fois la dépense décaissée.
  async function alerterSiDepassement(d, secteur) {
    const [annee, mois] = (d.date || '').split('-').map(Number)
    if (!annee || !mois) return
    const estCaisseCommune = d.financePar === 'caisse_commune'
    const secteurIdAlerte = estCaisseCommune ? 'divers' : d.secteurId
    const siteAlerte = estCaisseCommune ? null : d.site
    const alloue = budgetSecteur(budgets, secteurIdAlerte, annee, mois, siteAlerte)
    if (alloue <= 0) return
    const depenseTotal = totalDepenses(depensesEntrepriseSecteurMois([...depenses.filter((x) => x.id !== d.id), { ...d, statut: 'decaissee' }], secteurIdAlerte, annee, mois, siteAlerte))
    const pct = Math.round((depenseTotal / alloue) * 100)
    const statut = statutBudget(pct, seuils)
    if (statut.key === 'ok') return
    const libelle = estCaisseCommune ? (SECTEURS.find((s) => s.id === 'divers')?.label || 'Caisse courante') : libelleSecteurSite(secteur, d)
    await notify({
      type: statut.key === 'depasse' ? 'danger' : 'warning',
      title: statut.key === 'depasse' ? `🔴 Budget dépassé : ${libelle}` : `🟠 Budget en alerte : ${libelle}`,
      body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
    })
  }

  const filtres = [
    { id: 'attente', label: `En attente (${compteur('attente')})` },
    { id: 'validee', label: `Validées (${compteur('validee')})` },
    { id: 'refusee', label: `Refusées (${compteur('refusee')})` },
    { id: 'tous', label: 'Toutes' }
  ]

  const infoModal = actionModal ? ACTION_INFO[actionModal.type] : null

  return (
    <div className="space-y-4">
      <BandeauVolet couleur="#B45309" icone={Send} titre="Demandes"
        sous="Faites une demande de décaissement : le PAU, la GE, l'Info et la direction sont alertés, et l'un d'eux la valide ou la refuse.">
        <ChampRecherche variant="glass" className="!w-60" value={recherche} onChange={setRecherche} placeholder="Rechercher un bénéficiaire, un libellé…" />
        <OngletsBande options={filtres} valeur={filtre} onChange={setFiltre} />
      </BandeauVolet>

      {!lectureSeule && (
        <div className="flex justify-end">
          <BoutonVerre icone={Send} badgePlus onClick={() => setDemandeOuverte(true)}>Nouvelle demande</BoutonVerre>
        </div>
      )}

      {/* Chiffres clés : ce qui attend une décision, ce qui est validé, refusé, et le plus urgent. */}
      {(() => {
        const attente = demandes.filter(estAttente)
        const validees = demandes.filter((d) => d.statut === 'decaissee')
        const refusees = demandes.filter((d) => d.statut === 'refusee')
        const urgentes = attente.filter((d) => d.urgence && d.urgence !== 'normale')
        const somme = (l) => l.reduce((t, d) => t + (Number(d.montant) || 0), 0)
        const tuiles = [
          { icone: Hourglass, couleur: '#d97706', titre: 'En attente', nb: attente.length, montant: somme(attente) },
          { icone: CheckCircle2, couleur: '#16a34a', titre: 'Validées', nb: validees.length, montant: somme(validees) },
          { icone: XCircle, couleur: '#dc2626', titre: 'Refusées', nb: refusees.length, montant: somme(refusees) },
          { icone: Siren, couleur: '#7c3aed', titre: 'Urgentes en attente', nb: urgentes.length, montant: somme(urgentes) }
        ]
        return (
          <div className="ed-grille grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tuiles.map((t) => {
              const Ic = t.icone
              return (
                <div key={t.titre} className="flex items-center gap-3 rounded-3xl border border-white/70 bg-white/70 p-3.5 shadow-[0_14px_30px_-18px_rgba(26,26,26,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
                  <span className="ed-flotte flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(t.couleur)}><Ic size={20} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{t.titre}</p>
                    <p className="text-2xl font-black leading-tight text-gray-800"><Compteur valeur={t.nb} /></p>
                    <p className="truncate text-[11px] font-semibold text-gray-400">{fmtN(t.montant)} FCFA</p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {filtrees.length === 0 ? (
        <Card className="ed-entree">
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <span className="ed-flotte flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D('#94a3b8')}><Send size={26} /></span>
            <p className="text-sm">Aucune demande dans cet état.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrees.map((d, idx) => {
            const secteur = SECTEURS.find((x) => x.id === d.secteurId)
            const couleurSecteur = secteur?.color || '#64748b'
            const u = d.urgence && d.urgence !== 'normale' ? URGENCES[d.urgence] : null
            const critique = estAttente(d) && d.urgence === 'critique'
            const accent = u && estAttente(d) ? u.couleur : (STATUT_ACCENT[d.statut] || '#94a3b8')
            return (
              <button key={d.id} onClick={() => setDetail(d)} style={{ borderLeftColor: accent, animation: 'ed-entree 0.45s ease-out backwards', animationDelay: `${Math.min(idx, 10) * 50}ms` }}
                className={`group relative overflow-hidden rounded-3xl border border-l-[5px] border-white/70 bg-white/70 p-4 text-left shadow-[0_14px_30px_-18px_rgba(26,26,26,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_20px_36px_-16px_rgba(26,26,26,0.35)] ${critique ? 'ed-halo-carte' : ''}`}>
                <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-2xl" style={{ background: couleurSecteur }} />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black text-white shadow-[inset_0_2px_2px_rgba(255,255,255,0.5),0_8px_16px_-8px_rgba(0,0,0,0.5)]" style={{ background: avatarGradient(d.enregistrePar) }} title={`Demandé par ${d.enregistrePar || '—'}`}>{initiales(d.enregistrePar)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase" style={{ background: `${couleurSecteur}1a`, color: couleurSecteur }}>{libelleSecteurSite(secteur, d)}</span>
                      {u && (() => { const Ic = u.icone; return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${critique ? 'ed-halo' : ''}`} style={{ background: u.couleur }}><Ic size={10} /> {u.label}</span> })()}
                      {d.financePar === 'caisse_commune' && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700"><PiggyBank size={10} /> Caisse courante</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-sm font-bold text-gray-800">{d.description || d.categorie || 'Demande'}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1"><Tag size={10} /> {d.categorie || '—'}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays size={10} /> {formatDateShort(d.date)}</span>
                      {d.beneficiaireNom && <span className="inline-flex items-center gap-1"><UserRound size={10} /> {d.beneficiaireNom}</span>}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xl font-black leading-tight text-gray-900">{fmtN(d.montant)}<span className="block text-[10px] font-bold text-gray-400">FCFA</span></p>
                </div>
                <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <Etapes d={d} />
                  <p className="min-w-0 truncate text-right text-[11px] text-gray-400">
                    {d.statut === 'refusee' ? <>Refusée par <b className="text-gray-600">{d.refuseePar || '—'}</b></>
                      : (d.valideePar || d.approuveePar) ? <>{d.valideePar ? 'Validée' : 'Approuvée'} par <b className="text-gray-600">{d.valideePar || d.approuveePar}</b></>
                      : <>Demandé par <b className="text-gray-600">{d.enregistrePar || '—'}</b></>}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Fiche détail : bandeau du montant, tuiles d'information, parcours, puis les actions selon le statut et le rôle. */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" {...glassModalProps('#B45309')} title="Détail de la demande">
        {detail && (() => {
          const d = detail
          const secteur = SECTEURS.find((x) => x.id === d.secteurId)
          const couleurSecteur = secteur?.color || '#B45309'
          const st = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.en_attente
          const u = URGENCES[d.urgence] || null
          const refusee = d.statut === 'refusee'
          const validee = d.statut === 'decaissee'
          const fond = refusee ? 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 130%)'
            : validee ? 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)'
            : 'linear-gradient(135deg, #E08A1E 0%, #B45309 55%, #5c2a05 130%)'
          const cell = 'flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur-md'
          const Tuile = ({ icone: Ic, couleur, titre, children }) => (
            <div className={cell}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Ic size={16} /></span>
              <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">{titre}</p><div className="truncate text-sm font-bold text-gray-800">{children}</div></div>
            </div>
          )
          return (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]" style={{ background: fond }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <div className="relative flex items-center gap-3">
                  <span className="ed-flotte flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                    {refusee ? <XCircle size={24} /> : validee ? <CheckCircle2 size={24} /> : <Hourglass size={24} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-white/80">{st.label}</p>
                    <p className="text-3xl font-black leading-tight"><Compteur valeur={Number(d.montant) || 0} format={fmtN} /> <span className="text-sm font-bold text-white/75">FCFA</span></p>
                  </div>
                </div>
                <div className="relative mt-3 rounded-2xl bg-white/90 px-3 py-2"><Etapes d={d} /></div>
              </div>

              {d.description && (
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#475569')}><MessageSquare size={16} /></span>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase text-gray-400">Motif</p><p className="whitespace-pre-wrap text-sm text-gray-700">{d.description}</p></div>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Tuile icone={Layers} couleur={couleurSecteur} titre="Secteur"><span style={{ color: couleurSecteur }}>{libelleSecteurSite(secteur, d)}</span></Tuile>
                <Tuile icone={Tag} couleur="#7c3aed" titre="Catégorie">{d.categorie || '—'}</Tuile>
                <Tuile icone={CalendarDays} couleur="#0ea5e9" titre="Date">{formatDateShort(d.date)}</Tuile>
                <Tuile icone={UserRound} couleur="#16a34a" titre="Demandée par">{d.enregistrePar || '—'}</Tuile>
                {d.beneficiaireNom && <Tuile icone={Briefcase} couleur="#d97706" titre="Bénéficiaire">{d.beneficiaireNom}{d.beneficiaireFonction ? ` · ${d.beneficiaireFonction}` : ''}</Tuile>}
                {d.beneficiaireTelephone && <Tuile icone={Phone} couleur="#0ea5e9" titre="Téléphone">{d.beneficiaireTelephone}</Tuile>}
                {u && <Tuile icone={u.icone} couleur={u.couleur} titre="Urgence"><span style={{ color: u.couleur }}>{u.label}</span></Tuile>}
                {d.financePar === 'caisse_commune' && <Tuile icone={PiggyBank} couleur="#7c3aed" titre="Paiement">Depuis la caisse courante</Tuile>}
              </div>

              {/* Décisions déjà prises */}
              {(d.valideePar || d.approuveePar) && (
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#16a34a')}><CheckCircle2 size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm"><span className="text-gray-500">{d.valideePar ? 'Validée' : 'Approuvée'} par</span> <b className="text-gray-800">{d.valideePar || d.approuveePar}</b></p>
                    {(d.validationCommentaire || d.approbationCommentaire) && <p className="mt-1 text-xs italic text-green-700">« {d.validationCommentaire || d.approbationCommentaire} »</p>}
                  </div>
                </div>
              )}
              {refusee && (
                <div className={cell}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#dc2626')}><XCircle size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm"><span className="text-gray-500">Refusée par</span> <b className="text-gray-800">{d.refuseePar || '—'}</b></p>
                    {d.refusMotif && <p className="mt-1 text-xs italic text-red-700">« {d.refusMotif} »</p>}
                  </div>
                </div>
              )}

              {/* Actions selon statut + rôle.
                  SÉPARATION DES POUVOIRS : on ne décide jamais sur sa propre demande. */}
              {estAttente(d) && peutValider && !estMienne(d) && (
                <div className="flex gap-2 pt-1">
                  <Button variant="success" disabled={busy} onClick={() => ouvrirAction(d, 'valider')} className="flex-1">
                    <Check size={15} /> Valider
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => ouvrirAction(d, 'refuser')} className="flex-1">
                    <X size={15} /> Refuser
                  </Button>
                </div>
              )}
              {/* Messages explicites : l'utilisateur comprend pourquoi il ne peut pas agir. */}
              {estMienne(d) && estAttente(d) && (
                <p className="flex items-center gap-1 text-xs text-amber-600"><Clock size={13} /> Votre propre demande : elle doit être validée par quelqu'un d'autre</p>
              )}
              {estAttente(d) && !peutValider && !estMienne(d) && (
                <p className="flex items-center gap-1 text-xs text-gray-500"><Clock size={13} /> En attente du PAU, de la GE, de l'Info ou de la direction</p>
              )}
              {peutSupprimer && (
                <button onClick={() => { setMotifSuppression(''); setToDelete(d) }} disabled={busy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white/70 py-2 text-xs font-semibold text-red-500 backdrop-blur-sm transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-40">
                  <Trash2 size={13} /> Supprimer définitivement{d.statut !== 'en_attente' ? ' (saisie erronée ou test)' : ''}
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      <NouvelleDemandeModal open={demandeOuverte} onClose={() => setDemandeOuverte(false)} />

      <Modal open={!!actionModal} onClose={() => setActionModal(null)} size="sm" {...glassModalProps(actionModal?.type === 'refuser' ? '#dc2626' : '#16a34a')} title={infoModal?.titre || ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setActionModal(null)}><X size={15} /> Annuler</Button>
            <Button variant={infoModal?.variant} disabled={busy} onClick={confirmerAction}>
              {actionModal?.type === 'refuser' ? <XCircle size={15} /> : <CheckCircle2 size={15} />} {infoModal?.bouton}
            </Button>
          </>
        }>
        {actionModal && (
          <div className="space-y-3">
            <div className="relative flex items-center gap-3 overflow-hidden rounded-3xl p-3.5 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ background: actionModal.type === 'refuser' ? 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 130%)' : 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="ed-flotte relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                {actionModal.type === 'refuser' ? <XCircle size={22} /> : <CheckCircle2 size={22} />}
              </span>
              <div className="relative min-w-0">
                <p className="text-2xl font-black leading-tight">{fmtN(actionModal.d.montant)} <span className="text-sm font-bold text-white/75">FCFA</span></p>
                <p className="truncate text-xs text-white/85">{SECTEURS.find((x) => x.id === actionModal.d.secteurId)?.label || actionModal.d.secteurId}{actionModal.d.beneficiaireNom ? ` · ${actionModal.d.beneficiaireNom}` : ''}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#475569')}><MessageSquare size={13} /></span>
                {infoModal.label}{infoModal.requis && <span className="text-red-500">*</span>}
              </span>
              <textarea className="input-base w-full" rows={3} autoFocus value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder={infoModal.placeholder} />
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation de suppression — motif OBLIGATOIRE, tracé dans le Journal. */}
      <Modal open={!!toDelete} onClose={fermerSuppression} size="sm" title="Supprimer cette dépense ?"
        {...glassModalProps('#dc2626')}
        footer={<>
          <Button variant="outline" onClick={fermerSuppression} disabled={busy}>Annuler</Button>
          <Button variant="danger" onClick={confirmerSuppression} loading={busy} disabled={!motifSuppression.trim()}>
            <Trash2 size={14} className="mr-1" /> Supprimer
          </Button>
        </>}>
        {toDelete && (() => {
          const secteurLbl = SECTEURS.find((s) => s.id === toDelete.secteurId)?.label || toDelete.secteurId
          const engagee = toDelete.statut && toDelete.statut !== 'en_attente'
          return (
            <div className="space-y-4">
              <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
                style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.9) 0%, rgba(127,29,29,0.9) 100%)' }}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: '#dc2626', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                  <AlertTriangle size={22} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{formatMoney(Number(toDelete.montant) || 0)}</p>
                  <p className="truncate text-sm text-white/85">{secteurLbl} · {formatDateShort(toDelete.date)}{toDelete.categorie ? ` · ${toDelete.categorie}` : ''}</p>
                </div>
              </div>

              {toDelete.description && (
                <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">📝 {toDelete.description}</p>
              )}

              <p className="text-sm text-gray-600">
                {engagee
                  ? <>Cette dépense est déjà <span className="font-semibold text-red-600">{STATUTS_DECAISSEMENT[toDelete.statut]?.label || toDelete.statut}</span> : la supprimer retire aussi la trace de cet argent sorti. </>
                  : <>Elle n'est pas encore approuvée : aucun engagement réel n'est perdu. </>}
                Action <span className="font-semibold text-red-600">irréversible</span>. Le motif sera enregistré dans le <span className="font-semibold">Journal et Historique</span>.
              </p>

              <FormGroup label="Motif de la suppression" required>
                <textarea
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  rows={3} autoFocus
                  value={motifSuppression}
                  onChange={(e) => setMotifSuppression(e.target.value)}
                  placeholder="ex : doublon, erreur de saisie, demande de test…" />
              </FormGroup>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
