// Demandes de sortie MAXI-AGRO — TOUJOURS adossées à une facture.
// Plus de demande « libre » : l'agent choisit une facture BROUILLON, la soumet ;
// la hiérarchie approuve (décompte stock) ; l'agent certifie ou signale un écart ;
// la hiérarchie ajuste les quantités réelles (vendus / morts / retournés).
import { useMemo, useState } from 'react'
import { Plus, Check, X, BadgeCheck, AlertTriangle, Package, FileText, Timer, Trash2, RotateCcw } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { FACTURE_STATUTS, factureStatut } from './data'
import EcartModal from './EcartModal'
import CorrectifModal from '../../shared/demandes/CorrectifModal'
import CorrectifCompare from '../../shared/demandes/CorrectifCompare'
import {
  CORRECTIF_STATUTS, correctifEnCours, peutRelancer, deltasLignes, aDesEcarts
} from '../../shared/demandes/correctif'
import {
  factureTotaux, lignesEffectives,
  demanderSortie as wfDemander, approuverSortie as wfApprouver, refuserSortie as wfRefuser,
  certifier as wfCertifier, signalerEcart as wfSignaler, appliquerAjustement as wfAjuster,
  demanderCorrectif as wfDemanderCorrectif, trancherCorrectif as wfTrancherCorrectif,
  supprimerFacture as wfSupprimer
} from './factureWorkflow'

// Clés identifiant un article dans les lignes d'une facture Maxi-Agro.
const CLES = { key: 'articleId', nom: 'article' }
// Statuts avant tout effet sur le stock : la demande peut encore être retirée.
const SUPPRIMABLES = ['brouillon', 'sortie_demandee', 'refusee']

export default function Demandes() {
  const { user, role, canManage } = useAuth()
  const isAgent = role === 'agent'
  const peutApprouver = canManage()
  const { data: factures } = useCollection('agro_factures')

  const [filtre, setFiltre] = useState('sortie_demandee')
  const [createOpen, setCreateOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [ecart, setEcart] = useState(null)
  const [relance, setRelance] = useState(null)      // facture certifiée à relancer
  const [correctif, setCorrectif] = useState(null)  // correctif à trancher (hiérarchie)
  const [busy, setBusy] = useState(false)

  // Brouillons disponibles pour une demande de sortie.
  const brouillons = useMemo(
    () => factures.filter((f) => factureStatut(f) === 'brouillon').sort((a, b) => (a.date < b.date ? 1 : -1)),
    [factures]
  )
  // Factures entrées dans le circuit de sortie (hors brouillon).
  const enCircuit = useMemo(
    () => factures.filter((f) => factureStatut(f) !== 'brouillon'),
    [factures]
  )
  const compteur = (st) => enCircuit.filter((f) => factureStatut(f) === st).length
  const nbCorrectifs = useMemo(() => enCircuit.filter(correctifEnCours).length, [enCircuit])
  const filtrees = useMemo(
    () => enCircuit
      .filter((f) => (filtre === 'tous' ? true : filtre === 'correctif' ? correctifEnCours(f) : factureStatut(f) === filtre))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [enCircuit, filtre]
  )
  const estAuteur = (f) => f.createdBy === user.nom

  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); if (okMsg) toast.success(okMsg) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function soumettre() {
    const f = brouillons.find((x) => x.id === pick)
    if (!f) return toast.error('Choisissez une facture brouillon')
    await run(() => wfDemander(f, user), '📤 Demande de sortie soumise à la hiérarchie ✓')
    setCreateOpen(false); setPick('')
  }
  function approuver(f) { if (confirm(`Approuver la sortie de la facture ${f.numero} ? Le stock sera décompté.`)) run(() => wfApprouver(f, user), '✅ Sortie approuvée — stock décompté') }
  function refuser(f) { const m = prompt(`Refuser la sortie de ${f.numero} ?\nMotif (optionnel) :`); if (m !== null) run(() => wfRefuser(f, user, m), 'Sortie refusée') }
  function certifier(f) { const { totalTTC } = factureTotaux(f); if (confirm(`Certifier ${f.numero} pour ${formatMoney(totalTTC)} ? Définitive et imprimable.`)) run(() => wfCertifier(f, user), '✅ Facture certifiée — CA enregistré') }
  function signaler(f) { const m = prompt(`Signaler un écart sur ${f.numero}\n(reliquats retournés, pertes au marché)\nMessage :`); if (m !== null) run(() => wfSignaler(f, user, m), '📝 Demande de modification envoyée') }
  async function ajuster(f, ajustements) { await run(() => wfAjuster(f, user, ajustements), '✅ Quantités réelles ajustées — stock réajusté'); setEcart(null) }

  // Suppression : possible tant que la sortie n'a pas été approuvée (stock intact).
  function supprimer(f) {
    if (!confirm(`Supprimer définitivement la demande de sortie ${f.numero} ?\nLa facture sera retirée — aucun stock n'a encore bougé.`)) return
    run(() => wfSupprimer(f), 'Demande supprimée')
  }

  // Relance : la facture est certifiée, l'agent corrige les quantités voulues.
  async function envoyerCorrectif({ lignes, motif }) {
    const f = relance
    if (!motif.trim()) return toast.error('Motif du correctif obligatoire')
    if (!aDesEcarts(deltasLignes(lignesEffectives(f), lignes, CLES))) return toast.error('Aucune quantité modifiée')
    await run(() => wfDemanderCorrectif(f, user, lignes, motif), '🔄 Correctif envoyé à la hiérarchie')
    setRelance(null)
  }
  async function trancher(accepte) {
    await run(() => wfTrancherCorrectif(correctif, user, accepte),
      accepte ? '✅ Correctif appliqué — stock et CA réajustés' : 'Correctif refusé')
    setCorrectif(null)
  }

  function actions(f) {
    const st = factureStatut(f)
    const a = []
    if (correctifEnCours(f)) {
      if (peutApprouver) a.push({ id: 'corr', label: 'Trancher le correctif', icon: RotateCcw, tone: 'warning', on: () => setCorrectif(f) })
      return a
    }
    if (st === 'sortie_demandee' && peutApprouver) {
      a.push({ id: 'app', label: 'Approuver', icon: Check, tone: 'success', on: () => approuver(f) })
      a.push({ id: 'ref', label: 'Refuser', icon: X, tone: 'danger', on: () => refuser(f) })
    } else if (st === 'sortie_approuvee' && isAgent) {
      a.push({ id: 'cert', label: 'Certifier (tout vendu)', icon: BadgeCheck, tone: 'success', on: () => certifier(f) })
      a.push({ id: 'ec', label: 'Signaler un écart', icon: AlertTriangle, tone: 'warning', on: () => signaler(f) })
    } else if (st === 'modif_demandee' && peutApprouver) {
      a.push({ id: 'adj', label: 'Ajuster les quantités', icon: AlertTriangle, tone: 'primary', on: () => setEcart(f) })
    }
    if (SUPPRIMABLES.includes(st) && (estAuteur(f) || peutApprouver)) {
      a.push({ id: 'del', label: 'Supprimer', icon: Trash2, tone: 'danger', on: () => supprimer(f) })
    }
    if (peutRelancer(f, { estCertifiee: st === 'certifiee', isAuteur: estAuteur(f), canManage: peutApprouver })) {
      a.push({ id: 'rel', label: 'Relancer (correctif)', icon: RotateCcw, tone: 'warning', on: () => setRelance(f) })
    }
    return a
  }

  const filtres = [
    ['sortie_demandee', `À approuver (${compteur('sortie_demandee')})`],
    ['modif_demandee', `Écarts (${compteur('modif_demandee')})`],
    ['correctif', `Correctifs (${nbCorrectifs})`],
    ['sortie_approuvee', `Approuvées (${compteur('sortie_approuvee')})`],
    ['certifiee', `Certifiées (${compteur('certifiee')})`],
    ['refusee', `Refusées (${compteur('refusee')})`],
    ['tous', 'Toutes']
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Package size={18} className="mt-0.5 shrink-0" />
        <p>
          <strong>Toute sortie passe par une facture.</strong> L'agent crée d'abord une facture (brouillon) dans <em>Facturation</em>,
          puis demande ici la sortie en la sélectionnant. La hiérarchie approuve (le stock est décompté), puis l'agent certifie —
          ou signale un écart que la hiérarchie ajuste (vendus / morts / retournés).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1">
          {filtres.map(([v, l]) => (
            <button key={v} onClick={() => setFiltre(v)}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${filtre === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
        {isAgent && <Button className="ml-auto" onClick={() => { setPick(brouillons[0]?.id || ''); setCreateOpen(true) }}><Plus size={16} /> Nouvelle demande de sortie</Button>}
      </div>

      {filtrees.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-gray-400">Aucune facture dans cet état.</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrees.map((f) => {
            const st = factureStatut(f)
            const sd = FACTURE_STATUTS[st] || { label: st, tone: 'neutral' }
            const { totalTTC } = factureTotaux(f)
            const lignes = lignesEffectives(f).filter((l) => l.articleId)
            return (
              <Card key={f.id} className={`space-y-2 ${correctifEnCours(f) ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-800">{f.client?.nom || '—'}</p>
                    <p className="flex items-center gap-1 text-xs text-gray-500"><FileText size={12} /> {f.numero} · {formatDateShort(f.date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={sd.tone}>{sd.label}</Badge>
                    {f.correctif && (
                      <Badge tone={CORRECTIF_STATUTS[f.correctif.statut]?.tone}>
                        {CORRECTIF_STATUTS[f.correctif.statut]?.label}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg bg-gray-50 p-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Ce qui va sortir</p>
                  {lignes.length ? (
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase text-gray-400">
                        <tr><th className="pb-1 text-left">Article</th><th className="pb-1 text-center">Qté</th><th className="pb-1 text-right">PU</th><th className="pb-1 text-right">Total</th></tr>
                      </thead>
                      <tbody>
                        {lignes.map((l, i) => {
                          const pu = l.prixUnit ?? l.prix ?? (l.qte ? Math.round((l.total || 0) / l.qte) : 0)
                          return (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="py-1 font-medium text-gray-700">{l.article}</td>
                              <td className="py-1 text-center font-semibold">{l.qte}</td>
                              <td className="py-1 text-right text-gray-500">{formatMoney(pu)}</td>
                              <td className="py-1 text-right font-semibold text-gray-700">{formatMoney(l.total || 0)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : <span className="text-xs text-gray-400">Aucune ligne</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-primary-dark">{formatMoney(totalTTC)}</span>
                  {f.ecartAjuste && <span className="text-[11px] text-amber-600">quantités ajustées</span>}
                </div>
                {st === 'sortie_demandee' && <p className="text-[11px] text-gray-400">Demandée par {f.sortieDemandeePar} · le {f.sortieDemandeeLe}</p>}
                {st === 'sortie_approuvee' && <p className="text-[11px] text-gray-400">Approuvée par {f.sortieApprouveePar}</p>}
                {st === 'modif_demandee' && f.ecartMotif && <p className="rounded bg-amber-50 p-2 text-[11px] italic text-amber-700">« {f.ecartMotif} »</p>}
                {correctifEnCours(f) && <p className="rounded bg-amber-50 p-2 text-[11px] italic text-amber-700">Correctif demandé par {f.correctif.parNom} : « {f.correctif.motif} »</p>}
                {st === 'refusee' && f.refusMotif && <p className="text-[11px] text-red-500">Refus : {f.refusMotif}</p>}
                {actions(f).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {actions(f).map((act) => (
                      <Button key={act.id} size="sm" variant={act.tone} disabled={busy} onClick={act.on} className="flex-1">
                        <act.icon size={15} /> {act.label}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal : nouvelle demande de sortie à partir d'une facture brouillon */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle demande de sortie"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button onClick={soumettre} loading={busy} disabled={!brouillons.length}><Timer size={15} /> Soumettre à la hiérarchie</Button></>}>
        {brouillons.length === 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-4 text-center text-sm text-amber-800">
            Aucune facture en brouillon. Créez d'abord une facture dans <strong>Facturation</strong>, puis revenez ici pour en demander la sortie.
          </div>
        ) : (
          <>
            <FormGroup label="Facture à sortir (brouillon)" required hint="La demande hérite de toutes les informations de la facture.">
              <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                {brouillons.map((f) => (
                  <option key={f.id} value={f.id}>{f.numero} — {f.client?.nom || '—'} — {formatMoney(factureTotaux(f).totalTTC)}</option>
                ))}
              </Select>
            </FormGroup>
            {(() => {
              const f = brouillons.find((x) => x.id === pick)
              if (!f) return null
              const lignes = (f.lignes || []).filter((l) => l.articleId)
              return (
                <div className="mt-2 rounded-lg border border-gray-100 p-3 text-sm">
                  <p className="mb-1 font-semibold">{f.client?.nom} · {formatDateShort(f.date)}</p>
                  {lignes.map((l, i) => <p key={i} className="text-xs text-gray-600">• {l.qte} × {l.article}</p>)}
                  <p className="mt-2 text-right font-bold text-primary-dark">{formatMoney(factureTotaux(f).totalTTC)}</p>
                </div>
              )
            })()}
          </>
        )}
      </Modal>

      {/* Modal écart (hiérarchie) */}
      <EcartModal facture={ecart} onClose={() => setEcart(null)} onSubmit={ajuster} busy={busy} />

      {/* Relance : correctif de quantités sur une facture déjà certifiée */}
      {relance && (
        <CorrectifModal
          key={relance.id} onClose={() => setRelance(null)} busy={busy}
          titre={`Relancer la facture ${relance.numero}`}
          lignes={lignesEffectives(relance).filter((l) => l.articleId)}
          nomField="article"
          onSubmit={envoyerCorrectif}
        />
      )}

      {/* Arbitrage du correctif par la hiérarchie */}
      <Modal open={!!correctif} onClose={() => setCorrectif(null)} size="lg" title="Trancher le correctif"
        footer={<>
          <Button variant="ghost" onClick={() => setCorrectif(null)}>Annuler</Button>
          <Button variant="danger" loading={busy} onClick={() => trancher(false)}>Refuser le correctif</Button>
          <Button variant="success" loading={busy} onClick={() => trancher(true)}>Appliquer le correctif</Button>
        </>}>
        {correctif && (
          <>
            <p className="mb-2 text-sm font-semibold text-gray-800">
              Facture {correctif.numero} · {correctif.client?.nom || '—'}
            </p>
            <CorrectifCompare
              correctif={correctif.correctif}
              deltas={deltasLignes(correctif.correctif.lignesAvant || [], correctif.correctif.lignes || [], CLES)}
            />
            <p className="mt-3 text-xs text-gray-500">
              En appliquant, les quantités déjà sorties reviennent au stock et les quantités corrigées en ressortent ;
              le montant de la facture (chiffre d'affaires) est recalculé.
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}
