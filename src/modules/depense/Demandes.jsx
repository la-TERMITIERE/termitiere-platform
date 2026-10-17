// Demandes de décaissement : on fait une demande, elle part en alerte au PAU, à la GE, à l'Info et à la direction,
// et l'un d'eux la valide (elle devient une dépense décaissée, qui compte dans le budget) ou la refuse, en une seule étape.
//   en_attente (envoyée) → decaissee (validée) ou refusee. L'ancien état « approuvee » reste décidable d'un seul clic.
import { useMemo, useState } from 'react'
import { Check, X, BadgeCheck, Stamp, Clock, MessageSquare, Trash2, AlertTriangle, Send, Plus, HandCoins, Wallet, Tag, CalendarDays, UserRound, FileText, Building2 } from 'lucide-react'
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
import { glassModalProps } from '../../utils/color'
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

  // Notifie la direction si le secteur — ou la Caisse commune si la dépense est marquée
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
    const libelle = estCaisseCommune ? (SECTEURS.find((s) => s.id === 'divers')?.label || 'Caisse commune') : libelleSecteurSite(secteur, d)
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

      {filtrees.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-gray-400">Aucune demande dans cet état.</p></Card>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {filtrees.map((d) => {
            const secteur = SECTEURS.find((s) => s.id === d.secteurId)
            const st = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.en_attente
            return (
              <button key={d.id} onClick={() => setDetail(d)}
                className="flex items-center gap-3 rounded-2xl border-l-4 bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(0,0,0,0.15)] hover:ring-gray-200"
                style={{ borderLeftColor: STATUT_ACCENT[d.statut] || '#94a3b8' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-gray-800">{libelleSecteurSite(secteur, d)}</p>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {d.financePar === 'caisse_commune' && <Badge tone="warning">💰 Caisse commune</Badge>}
                    {d.urgence && d.urgence !== 'normale' && URGENCES[d.urgence] && (() => { const u = URGENCES[d.urgence]; const Ic = u.icone; return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: u.couleur }}><Ic size={10} /> {u.label}</span> })()}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{d.categorie || '—'} · {formatDateShort(d.date)}</p>
                  {d.description && <p className="mt-1 truncate text-sm text-gray-600">{d.description}</p>}
                  <p className="mt-1 truncate text-[11px] text-gray-400">
                    ✍️ Demandé par <b className="text-gray-600">{d.enregistrePar || '—'}</b>
                    {(d.valideePar || d.approuveePar) && <> · ✓ {d.valideePar ? 'Validé' : 'Approuvé'} par <b className="text-gray-600">{d.valideePar || d.approuveePar}</b></>}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-extrabold text-gray-900">{Number(d.montant).toLocaleString('fr-FR')}<span className="ml-0.5 text-xs font-bold text-gray-400">FCFA</span></p>
              </button>
            )
          })}
        </div>
      )}

      {/* Fiche détail — toutes les infos + actions selon le statut et le rôle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail de la demande"
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (() => {
          const d = detail
          const secteur = SECTEURS.find((s) => s.id === d.secteurId)
          const st = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.en_attente
          return (
            <div className="space-y-4">
              {/* En-tête glassmorphism — montant bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(180,83,9,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(180,83,9,0.92) 0%, rgba(120,53,15,0.88) 100%)' }}>
                <p className="text-xs text-white/70">{libelleSecteurSite(secteur, d)} · {formatDateShort(d.date)}</p>
                <p className="mt-0.5 text-2xl font-black leading-none">{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{st.label}</span>
                  {d.categorie && <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{d.categorie}</span>}
                  {d.financePar === 'caisse_commune' && <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">💰 Caisse commune</span>}
                  {d.urgence && URGENCES[d.urgence] && <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">Urgence : {URGENCES[d.urgence].label}</span>}
                </div>
              </div>

              {d.description && (
                <div className="rounded-2xl bg-white/70 p-3.5 shadow-sm backdrop-blur-sm">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.description}</p>
                </div>
              )}

              <div className="rounded-2xl bg-white/70 p-3.5 shadow-sm backdrop-blur-sm">
                <p className="text-xs text-gray-500">Créée par <b className="text-gray-700">{d.enregistrePar || '—'}</b></p>
              </div>

              {/* Historique des décisions */}
              {(d.valideePar || d.approuveePar || d.certifieePar || (d.statut === 'refusee' && d.refusMotif)) && (
                <div className="space-y-2">
                  {(d.valideePar || d.approuveePar) && (
                    <div className="rounded-2xl bg-white/70 p-3 shadow-sm backdrop-blur-sm">
                      <p className="text-xs text-gray-500">{d.valideePar ? 'Validée' : 'Approuvée'} par <b className="text-gray-700">{d.valideePar || d.approuveePar}</b></p>
                      {(d.validationCommentaire || d.approbationCommentaire) && (
                        <p className="mt-1 flex items-start gap-1 rounded bg-green-50 p-2 text-xs italic text-green-700">
                          <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.validationCommentaire || d.approbationCommentaire} »
                        </p>
                      )}
                    </div>
                  )}
                  {d.statut === 'refusee' && d.refusMotif && (
                    <div className="rounded-2xl bg-white/70 p-3 shadow-sm backdrop-blur-sm">
                      <p className="text-xs text-gray-500">Refusée par <b className="text-gray-700">{d.refuseePar}</b></p>
                      <p className="mt-1 flex items-start gap-1 rounded bg-red-50 p-2 text-xs italic text-red-700">
                        <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.refusMotif} »
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions selon statut + rôle.
                  SÉPARATION DES POUVOIRS : on ne décide jamais sur sa propre demande,
                  et le certificateur ne peut pas être celui qui a approuvé au 1er
                  niveau. Sans cela, une même personne pouvait saisir un décaissement,
                  l'approuver et le certifier — argent sorti en trois clics. */}
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

      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={infoModal?.titre || ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setActionModal(null)}>Annuler</Button>
            <Button variant={infoModal?.variant} disabled={busy} onClick={confirmerAction}>
              {infoModal?.bouton}
            </Button>
          </>
        }
      >
        {actionModal && (
          <>
            <p className="mb-3 text-sm text-gray-600">
              {Number(actionModal.d.montant).toLocaleString('fr-FR')} FCFA : {SECTEURS.find((s) => s.id === actionModal.d.secteurId)?.label || actionModal.d.secteurId}
            </p>
            <FormGroup label={infoModal.label} required={infoModal.requis}>
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                rows={3}
                autoFocus
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder={infoModal.placeholder}
              />
            </FormGroup>
          </>
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
