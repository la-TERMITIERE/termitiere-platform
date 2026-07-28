// Autorisation de décaissement — circuit à deux niveaux :
//   en_attente (créée) → approuvee (1er niveau) → decaissee (2e niveau, définitif, compte dans le budget)
//   ou refusee à n'importe quelle étape.
import { useMemo, useState } from 'react'
import { Check, X, BadgeCheck, Stamp, Clock, MessageSquare, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isApproverRole, isCertifierRole, FULL_ACCESS_ROLES } from '../../core/roles'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { formatDateShort } from '../../utils/formatters'
import { SECTEURS, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget } from './logic'
import { notifierBeneficiaire } from './notifications'

const ACTION_INFO = {
  approuver: { titre: 'Approuver le décaissement', label: 'Commentaire (optionnel)', placeholder: 'Ex. : vérifié avec le fournisseur, montant conforme…', requis: false, variant: 'success', bouton: 'Approuver' },
  refuser:   { titre: 'Refuser le décaissement',   label: 'Motif du refus', placeholder: 'Expliquez pourquoi cette demande est refusée…', requis: true, variant: 'danger', bouton: 'Refuser' },
  certifier: { titre: 'Certifier le décaissement', label: 'Commentaire (optionnel)', placeholder: 'Ex. : fonds remis en main propre le…', requis: false, variant: 'success', bouton: 'Certifier' }
}

// Couleur d'accent (barre latérale de la carte) selon le statut de la demande.
const STATUT_ACCENT = { en_attente: '#d97706', approuvee: '#0ea5e9', decaissee: '#16a34a', refusee: '#dc2626' }

export default function Autorisations() {
  const { user, role } = useAuth()
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: projets }  = useCollection('projets')
  const { data: besoins }  = useCollection('projet_besoins')

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

  const peutApprouver = isApproverRole(role)
  const peutCertifier = isCertifierRole(role)
  // Suppression réservée à l'administration — seulement tant qu'aucun niveau
  // d'approbation n'a encore statué (sinon c'est un engagement réel, cf. refuser).
  const peutSupprimer = FULL_ACCESS_ROLES.includes(role)

  const [filtre, setFiltre] = useState('en_attente')
  const [busy, setBusy] = useState(false)
  const [actionModal, setActionModal] = useState(null) // { d, type: 'approuver' | 'refuser' | 'certifier' }
  const [commentaire, setCommentaire] = useState('')
  const [detail, setDetail] = useState(null) // dépense sélectionnée pour la fiche détail

  const compteur = (st) => depenses.filter((d) => d.statut === st).length
  const filtrees = useMemo(() => {
    const rows = filtre === 'tous' ? depenses.filter((d) => d.statut) : depenses.filter((d) => d.statut === filtre)
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [depenses, filtre])

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

  async function supprimer(d) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    // Une demande encore en_attente n'engage rien de réel — avertissement léger. Une
    // dépense déjà décaissée (ou approuvée) représente un vrai mouvement d'argent : on
    // avertit clairement que sa suppression retire aussi la trace de ce décaissement
    // (utile pour nettoyer une saisie erronée/test, mais irréversible).
    const engagee = d.statut !== 'en_attente'
    const avertissement = engagee
      ? "Cette dépense est déjà DÉCAISSÉE/APPROUVÉE — la supprimer retire aussi la trace de cet argent sorti (utile pour corriger une saisie erronée ou un test, mais définitif)."
      : "Elle n'a pas encore été approuvée — aucun engagement réel n'est perdu."
    if (!window.confirm(`Supprimer définitivement cette dépense ?\n\n${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA\n\n${avertissement}`)) return
    await run(async () => {
      await removeItem('depense_depenses', d.id)
      await audit('depense', 'DECAISSEMENT_SUPPRIME', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA (statut : ${d.statut})`)
    }, 'Dépense supprimée')
    setDetail(null)
  }

  async function approuver(d, texte) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'approuvee', approuveePar: user?.nom || '—', approuveeLe: Date.now(), approbationCommentaire: texte || '' })
      await audit('depense', 'DECAISSEMENT_APPROUVE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, texte ? { commentaire: texte } : null)
      const dest = destinataires(d)
      if (dest.length) {
        await notify({ type: 'info', title: '☑️ Décaissement approuvé', body: `${Number(d.montant).toLocaleString('fr-FR')} FCFA — ${secteur?.label || d.secteurId} — en attente de certification`, module: 'depense', forUsers: dest, link: '/depense/autorisations' }).catch(() => {})
      }
    }, '✅ Décaissement approuvé — en attente de certification')
  }

  async function refuser(d, motif) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'refusee', refusMotif: motif || '', refuseePar: user?.nom || '—', refuseeLe: Date.now() })
      await audit('depense', 'DECAISSEMENT_REFUSE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, { motif })
      const dest = destinataires(d)
      if (dest.length) {
        await notify({ type: 'refus', title: '❌ Décaissement refusé', body: `${Number(d.montant).toLocaleString('fr-FR')} FCFA — ${secteur?.label || d.secteurId}${motif ? ' — ' + motif : ''}`, module: 'depense', forUsers: dest, link: '/depense/autorisations' }).catch(() => {})
      }
    }, 'Décaissement refusé')
  }

  async function certifier(d, texte) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'decaissee', certifieePar: user?.nom || '—', certifieeLe: Date.now(), certificationCommentaire: texte || '' })
      await audit('depense', 'DECAISSEMENT_CERTIFIE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, texte ? { commentaire: texte } : null)
      const dest = destinataires(d)
      if (dest.length) {
        await notify({ type: 'success', title: '💸 Décaissement certifié', body: `${Number(d.montant).toLocaleString('fr-FR')} FCFA — ${secteur?.label || d.secteurId} — argent décaissé`, module: 'depense', forUsers: dest, link: '/depense/autorisations' }).catch(() => {})
      }
      await notifierBeneficiaire(d, secteur?.label || d.secteurId)
      await alerterSiDepassement(d, secteur)
    }, '✅ Décaissement certifié — argent décaissé')
  }

  async function confirmerAction() {
    if (!actionModal) return
    const { d, type } = actionModal
    const info = ACTION_INFO[type]
    const texte = commentaire.trim()
    if (info.requis && !texte) { toast.error('Merci de préciser un motif.'); return }
    if (type === 'approuver') await approuver(d, texte)
    else if (type === 'refuser') await refuser(d, texte)
    else if (type === 'certifier') await certifier(d, texte)
    setActionModal(null)
    setDetail(null)
  }

  // Notifie la direction si le secteur atteint 80%+ de son budget une fois la dépense décaissée.
  async function alerterSiDepassement(d, secteur) {
    const [annee, mois] = (d.date || '').split('-').map(Number)
    if (!annee || !mois) return
    const alloue = budgetSecteur(budgets, d.secteurId, annee, mois)
    if (alloue <= 0) return
    const depenseTotal = totalDepenses(depensesSecteurMois([...depenses.filter((x) => x.id !== d.id), { ...d, statut: 'decaissee' }], d.secteurId, annee, mois))
    const pct = Math.round((depenseTotal / alloue) * 100)
    const statut = statutBudget(pct)
    if (statut.key === 'ok') return
    await notify({
      type: statut.key === 'depasse' ? 'danger' : 'warning',
      title: statut.key === 'depasse' ? `🔴 Budget dépassé — ${secteur?.label || d.secteurId}` : `🟠 Budget en alerte — ${secteur?.label || d.secteurId}`,
      body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
    })
  }

  const filtres = [
    ['en_attente', `À approuver (${compteur('en_attente')})`],
    ['approuvee', `À décaisser (${compteur('approuvee')})`],
    ['decaissee', `Décaissées (${compteur('decaissee')})`],
    ['refusee', `Refusées (${compteur('refusee')})`],
    ['tous', 'Toutes']
  ]

  const infoModal = actionModal ? ACTION_INFO[actionModal.type] : null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        <strong>Réservé aux dépenses imprévues (hors budget).</strong> Les dépenses prévues/budgétées sont comptées directement dans <strong>Dépenses</strong>. Ici : un responsable <strong>approuve</strong> la demande (1er niveau), puis un décideur la <strong>certifie</strong> pour décaisser réellement l'argent (2e niveau, définitif). Seules les dépenses <strong>décaissées</strong> comptent dans le budget du secteur.
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1">
        {filtres.map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${filtre === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {l}
          </button>
        ))}
      </div>

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
                    <p className="truncate font-bold text-gray-800">{secteur?.label || d.secteurId}</p>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{d.categorie || '—'} · {formatDateShort(d.date)}</p>
                  {d.description && <p className="mt-1 truncate text-sm text-gray-600">{d.description}</p>}
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
                <p className="text-xs text-white/70">{secteur?.label || d.secteurId} · {formatDateShort(d.date)}</p>
                <p className="mt-0.5 text-2xl font-black leading-none">{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{st.label}</span>
                  {d.categorie && <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{d.categorie}</span>}
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
              {(d.approuveePar || d.certifieePar || (d.statut === 'refusee' && d.refusMotif)) && (
                <div className="space-y-2">
                  {d.approuveePar && (
                    <div className="rounded-2xl bg-white/70 p-3 shadow-sm backdrop-blur-sm">
                      <p className="text-xs text-gray-500">Approuvée par <b className="text-gray-700">{d.approuveePar}</b></p>
                      {d.approbationCommentaire && (
                        <p className="mt-1 flex items-start gap-1 rounded bg-green-50 p-2 text-xs italic text-green-700">
                          <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.approbationCommentaire} »
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
                  {d.certifieePar && (
                    <div className="rounded-2xl bg-white/70 p-3 shadow-sm backdrop-blur-sm">
                      <p className="text-xs text-gray-500">Certifiée par <b className="text-gray-700">{d.certifieePar}</b></p>
                      {d.certificationCommentaire && (
                        <p className="mt-1 flex items-start gap-1 rounded bg-green-50 p-2 text-xs italic text-green-700">
                          <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.certificationCommentaire} »
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions selon statut + rôle */}
              {d.statut === 'en_attente' && peutApprouver && (
                <div className="flex gap-2 pt-1">
                  <Button variant="success" disabled={busy} onClick={() => ouvrirAction(d, 'approuver')} className="flex-1">
                    <Check size={15} /> Approuver
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => ouvrirAction(d, 'refuser')} className="flex-1">
                    <X size={15} /> Refuser
                  </Button>
                </div>
              )}
              {d.statut === 'approuvee' && peutCertifier && (
                <div className="flex gap-2 pt-1">
                  <Button variant="success" disabled={busy} onClick={() => ouvrirAction(d, 'certifier')} className="flex-1">
                    <BadgeCheck size={15} /> Certifier (décaisser)
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => ouvrirAction(d, 'refuser')} className="flex-1">
                    <X size={15} /> Refuser
                  </Button>
                </div>
              )}
              {d.statut === 'en_attente' && !peutApprouver && (
                <p className="flex items-center gap-1 text-xs text-gray-500"><Clock size={13} /> En attente d'un responsable habilité à approuver</p>
              )}
              {d.statut === 'approuvee' && !peutCertifier && (
                <p className="flex items-center gap-1 text-xs text-gray-500"><Stamp size={13} /> En attente d'un décideur habilité à certifier</p>
              )}
              {peutSupprimer && (
                <button onClick={() => supprimer(d)} disabled={busy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white/70 py-2 text-xs font-semibold text-red-500 backdrop-blur-sm transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-40">
                  <Trash2 size={13} /> Supprimer définitivement{d.statut !== 'en_attente' ? ' (saisie erronée ou test)' : ''}
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

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
              {Number(actionModal.d.montant).toLocaleString('fr-FR')} FCFA — {SECTEURS.find((s) => s.id === actionModal.d.secteurId)?.label || actionModal.d.secteurId}
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
    </div>
  )
}
