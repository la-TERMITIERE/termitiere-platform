// Autorisation de décaissement — circuit à deux niveaux :
//   en_attente (créée) → approuvee (1er niveau) → decaissee (2e niveau, définitif, compte dans le budget)
//   ou refusee à n'importe quelle étape.
import { useMemo, useState } from 'react'
import { Check, X, BadgeCheck, Stamp, Clock, MessageSquare } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isApproverRole, isCertifierRole, FULL_ACCESS_ROLES } from '../../core/roles'
import { updateItem } from '../../core/db'
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

export default function Autorisations() {
  const { user, role } = useAuth()
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')

  const peutApprouver = isApproverRole(role)
  const peutCertifier = isCertifierRole(role)

  const [filtre, setFiltre] = useState('en_attente')
  const [busy, setBusy] = useState(false)
  const [actionModal, setActionModal] = useState(null) // { d, type: 'approuver' | 'refuser' | 'certifier' }
  const [commentaire, setCommentaire] = useState('')

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

  async function approuver(d, texte) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'approuvee', approuveePar: user?.nom || '—', approuveeLe: Date.now(), approbationCommentaire: texte || '' })
      await audit('depense', 'DECAISSEMENT_APPROUVE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, texte ? { commentaire: texte } : null)
    }, '✅ Décaissement approuvé — en attente de certification')
  }

  async function refuser(d, motif) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'refusee', refusMotif: motif || '', refuseePar: user?.nom || '—', refuseeLe: Date.now() })
      await audit('depense', 'DECAISSEMENT_REFUSE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, { motif })
    }, 'Décaissement refusé')
  }

  async function certifier(d, texte) {
    const secteur = SECTEURS.find((s) => s.id === d.secteurId)
    await run(async () => {
      await updateItem('depense_depenses', d.id, { statut: 'decaissee', certifieePar: user?.nom || '—', certifieeLe: Date.now(), certificationCommentaire: texte || '' })
      await audit('depense', 'DECAISSEMENT_CERTIFIE', `${secteur?.label || d.secteurId} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`, texte ? { commentaire: texte } : null)
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
        <div className="grid gap-3 md:grid-cols-2">
          {filtrees.map((d) => {
            const secteur = SECTEURS.find((s) => s.id === d.secteurId)
            const st = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.en_attente
            return (
              <Card key={d.id} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-800">{secteur?.label || d.secteurId}</p>
                    <p className="text-xs text-gray-500">{d.categorie || '—'} · {formatDateShort(d.date)}</p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="text-lg font-extrabold text-primary-dark">{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
                {d.description && <p className="text-sm text-gray-600">{d.description}</p>}
                <p className="text-[11px] text-gray-400">Créée par {d.enregistrePar || '—'}</p>

                {d.statut === 'approuvee' && (
                  <>
                    <p className="text-[11px] text-gray-400">Approuvée par {d.approuveePar}</p>
                    {d.approbationCommentaire && (
                      <p className="flex items-start gap-1 rounded bg-green-50 p-2 text-[11px] italic text-green-700">
                        <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.approbationCommentaire} »
                      </p>
                    )}
                  </>
                )}
                {d.statut === 'refusee' && d.refusMotif && (
                  <p className="flex items-start gap-1 rounded bg-red-50 p-2 text-[11px] italic text-red-700">
                    <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.refusMotif} »
                  </p>
                )}
                {d.statut === 'decaissee' && (
                  <>
                    <p className="text-[11px] text-gray-400">Certifiée par {d.certifieePar}</p>
                    {d.certificationCommentaire && (
                      <p className="flex items-start gap-1 rounded bg-green-50 p-2 text-[11px] italic text-green-700">
                        <MessageSquare size={12} className="mt-0.5 shrink-0" /> « {d.certificationCommentaire} »
                      </p>
                    )}
                  </>
                )}

                {d.statut === 'en_attente' && peutApprouver && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => ouvrirAction(d, 'approuver')} className="flex-1">
                      <Check size={15} /> Approuver
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => ouvrirAction(d, 'refuser')} className="flex-1">
                      <X size={15} /> Refuser
                    </Button>
                  </div>
                )}
                {d.statut === 'approuvee' && peutCertifier && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => ouvrirAction(d, 'certifier')} className="flex-1">
                      <BadgeCheck size={15} /> Certifier (décaisser)
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => ouvrirAction(d, 'refuser')} className="flex-1">
                      <X size={15} /> Refuser
                    </Button>
                  </div>
                )}
                {d.statut === 'en_attente' && !peutApprouver && (
                  <p className="flex items-center gap-1 pt-1 text-[11px] text-gray-400"><Clock size={12} /> En attente d'un responsable habilité à approuver</p>
                )}
                {d.statut === 'approuvee' && !peutCertifier && (
                  <p className="flex items-center gap-1 pt-1 text-[11px] text-gray-400"><Stamp size={12} /> En attente d'un décideur habilité à certifier</p>
                )}
              </Card>
            )
          })}
        </div>
      )}

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
