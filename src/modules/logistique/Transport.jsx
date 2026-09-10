// Transport — MAXI LOGISTIQUE (Lomé & Kara).
// Cycle de vie d'un TRAJET (sortie de camion) :
//   1. Création par l'agent          → statut « À autoriser »
//   2. Autorisation (gérant/direction) → statut « En route » : le camion peut sortir,
//      le trajet apparaît dans l'onglet « En cours »
//   3. Sur la route, on peut encore AJOUTER des dépenses (carburant acheté en cours
//      de route, péage, main d'œuvre…) sans rouvrir toute la fiche
//   4. À l'arrivée, le chauffeur / la réception clique « Marquer l'arrivée »
//      → statut « Arrivé », heure d'arrivée réelle horodatée
// Chaque trajet porte sa plaque, ses horaires (prévu → réel), son itinéraire, sa
// cargaison, la recette de la course et ses dépenses. Marge = recette − dépenses,
// calculée automatiquement ; l'onglet « Tous les trajets » cumule recette / dépenses
// / marge sur la période choisie. Les membres de l'administration (et Info) peuvent
// modifier ou supprimer un trajet à tout stade ; l'auteur et les approbateurs ne le
// peuvent que tant que la sortie n'est pas autorisée.
import { useMemo, useState } from 'react'
import { Truck, Plus, Trash2, Pencil, X, MapPin, Fuel, CheckCircle2, Eye, Flag, ShieldCheck, Clock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isReadOnlyRole, isApproverRole, canViewFinance, isFullAccessRole, logistiqueVoitMontants, logistiqueVoitValidateur } from '../../core/roles'
import { genId, genNumero, todayStr, nowHM, formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE, shadeHex } from '../../utils/color'
import { useSite, matchSite, siteLabel } from './site/useSite'

const COULEUR = COULEUR_MODULE.logistique

const totalDep = (dep) => (dep || []).reduce((s, d) => s + (parseFloat(d.montant) || 0), 0)
const margeDe = (t) => (parseFloat(t.recette) || 0) - totalDep(t.depenses)

// Statut dérivé (pas de champ dédié en base : on le déduit de `approuvee` / `arrivee`
// pour rester compatible avec les trajets déjà enregistrés).
const STATUTS_TRAJET = {
  en_attente: { label: 'À autoriser', tone: 'warning' },
  en_route:   { label: 'En route',    tone: 'info' },
  arrive:     { label: 'Arrivé',      tone: 'success' }
}
const statutTrajet = (t) => (t?.arrivee || t?.arriveeLe) ? 'arrive' : (t?.approuvee ? 'en_route' : 'en_attente')
const dateTimeCourt = (ms) => ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const vide = () => ({
  date: todayStr(), plaque: '', chauffeur: '',
  heureDepart: '', heureArrivee: '', lieuDepart: '', lieuArrivee: '',
  cargaison: '', recette: '', depenses: [], motifSortie: ''
})

export default function Transport() {
  const { user, role } = useAuth()
  const site = useSite()
  const peutSaisir = !isReadOnlyRole(role)
  const peutApprouver = isApproverRole(role) // gérant / direction : autorisent la sortie
  const peutAdmin = isFullAccessRole(role)   // administration + Info : modif/suppr à tout stade
  const voitMontants = logistiqueVoitMontants(role)
  const voitValidateur = logistiqueVoitValidateur(role)
  const estAdministration = canViewFinance(role)
  const { data: allTransports } = useCollection('logistique_transports')
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  // Cloisonnement par site (sous-application Lomé / Kara) — même principe que
  // Prestations.jsx/Factures.jsx.
  const transports = useMemo(() => allTransports.filter((t) => matchSite(t, site)), [allTransports, site])

  const [onglet, setOnglet] = useState('route')   // 'route' | 'attente' | 'tous'
  const [modal, setModal] = useState(null)   // { data, isNew, id, dataInitial }
  const [dep, setDep] = useState({ label: '', montant: '' }) // brouillon de dépense (modale trajet)
  const [toDelete, setToDelete] = useState(null)
  const [detail, setDetail] = useState(null)          // trajet affiché en lecture
  const [depTrajet, setDepTrajet] = useState(null)    // { trajet, label, montant } — dépense ajoutée en route
  const [saving, setSaving] = useState(false)

  // Plaques déjà utilisées → suggestions (identification des camions).
  const plaques = useMemo(
    () => [...new Set(transports.map((t) => (t.plaque || '').trim()).filter(Boolean))].sort(),
    [transports]
  )

  // Répartition par statut (tous sites confondus pour ce site, sans filtre de
  // période : les onglets opérationnels doivent montrer tous les camions dehors,
  // quelle que soit la date de départ).
  const parStatut = useMemo(() => {
    const g = { en_attente: [], en_route: [], arrive: [] }
    for (const t of transports) g[statutTrajet(t)].push(t)
    return g
  }, [transports])

  const triDate = (a, b) => (a.date < b.date ? 1 : -1)
  const listePeriode = useMemo(
    () => transports.filter((t) => (t.date || '') >= start && (t.date || '') <= end).sort(triDate),
    [transports, start, end]
  )
  const liste = useMemo(() => {
    if (onglet === 'attente') return [...parStatut.en_attente].sort(triDate)
    if (onglet === 'route') return [...parStatut.en_route].sort(triDate)
    return listePeriode
  }, [onglet, parStatut, listePeriode])

  // Cumul de l'onglet « Tous les trajets » — comme le « Cumul » de Prestations.jsx,
  // une ligne encore en attente d'autorisation compte quand même dedans (le suivi
  // financier ne doit pas dépendre d'un oubli de validation).
  const cumul = useMemo(() => liste.reduce((s, t) => {
    const d = totalDep(t.depenses)
    return { recette: s.recette + (parseFloat(t.recette) || 0), depenses: s.depenses + d, marge: s.marge + margeDe(t) }
  }, { recette: 0, depenses: 0, marge: 0 }), [liste])

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function ajouterDepense() {
    const label = (dep.label || '').trim()
    const montant = parseFloat(dep.montant) || 0
    if (!label && !montant) return
    set('depenses', [...(modal.data.depenses || []), { label: label || 'Dépense', montant }])
    setDep({ label: '', montant: '' })
  }
  function retirerDepense(i) {
    set('depenses', (modal.data.depenses || []).filter((_, j) => j !== i))
  }

  function ouvrirEdition(t) {
    setModal({ data: { ...vide(), ...t }, dataInitial: t, isNew: false, id: t.id })
    setDep({ label: '', montant: '' })
  }

  async function enregistrer() {
    if (saving) return
    const d = modal.data
    if (!d.plaque.trim()) return toast.error("Indiquez la plaque d'immatriculation du camion")
    setSaving(true)
    try {
      const depenses = (d.depenses || []).map((x) => ({ ...x, label: x.label, montant: parseFloat(x.montant) || 0 }))
      const payload = {
        ...d, site, plaque: d.plaque.trim().toUpperCase(),
        recette: parseFloat(d.recette) || 0, depenses,
        totalDepenses: totalDep(depenses), marge: (parseFloat(d.recette) || 0) - totalDep(depenses),
        agentId: modal.isNew ? user.uid : (modal.dataInitial?.agentId || user.uid),
        agentNom: modal.isNew ? user.nom : (modal.dataInitial?.agentNom || user.nom)
      }
      if (modal.isNew) {
        const id = genId()
        await setItem('logistique_transports', id, { id, num: genNumero(`TR-${site.toUpperCase()}`, transports.length), createdAt: Date.now(), approuvee: false, ...payload })
        await audit('logistique', 'TRANSPORT', `${siteLabel(site)} — ${payload.plaque} · ${d.lieuDepart || '?'} → ${d.lieuArrivee || '?'}`)
        toast.success("Trajet enregistré ✓ — en attente d'autorisation de sortie")
      } else {
        // On repart de la fiche en base (`dataInitial`) : le statut (approuvee /
        // arrivee / horodatages) est préservé même si un admin corrige un trajet
        // déjà autorisé ou arrivé.
        await setItem('logistique_transports', modal.id, { ...modal.dataInitial, ...payload, id: modal.id })
        await audit('logistique', 'TRANSPORT_EDIT', `${siteLabel(site)} — ${payload.plaque} · ${STATUTS_TRAJET[statutTrajet(modal.dataInitial)].label}`)
        toast.success('Trajet mis à jour ✓')
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  // Autorisation de sortie : le gérant / la direction valide le départ du camion.
  // Le trajet bascule alors dans l'onglet « En cours » ; il reste modifiable /
  // supprimable par l'administration, mais plus par son seul auteur.
  async function approuver(t) {
    if (!peutApprouver) return toast.error('Action réservée aux gérants / direction')
    await updateItem('logistique_transports', t.id, { approuvee: true, approuveePar: user.nom, approuveeLe: todayStr() })
    await audit('logistique', 'TRANSPORT_APPROUVE', `${siteLabel(site)} — ${t.num || t.plaque} — sortie autorisée`)
    toast.success(`Sortie autorisée pour ${t.num || t.plaque} ✓`)
    setDetail((d) => (d && d.id === t.id ? { ...d, approuvee: true, approuveePar: user.nom, approuveeLe: todayStr() } : d))
  }

  // Marquer l'arrivée — horodate l'heure d'arrivée réelle et fige le statut.
  async function marquerArrivee(t) {
    if (saving) return
    setSaving(true)
    try {
      const hm = nowHM()
      const patch = { arrivee: true, arriveeLe: Date.now(), arriveePar: user.nom, heureArriveeReelle: hm }
      if (!t.heureArrivee) patch.heureArrivee = hm
      await updateItem('logistique_transports', t.id, patch)
      await audit('logistique', 'TRANSPORT_ARRIVEE', `${siteLabel(site)} — ${t.num || t.plaque} — arrivé le ${todayStr()} à ${hm}`)
      toast.success('Arrivée enregistrée ✓')
      setDetail((d) => (d && d.id === t.id ? { ...d, ...patch } : d))
    } finally { setSaving(false) }
  }

  // Ajout d'une dépense en cours de route (carburant, péage…) sans rouvrir toute
  // la fiche — possible tant que le trajet n'est pas… eh bien, jamais verrouillé
  // pour la dépense : une facture de carburant peut arriver après l'arrivée.
  async function ajouterDepenseTrajet() {
    if (saving) return
    const t = depTrajet.trajet
    const label = (depTrajet.label || '').trim() || 'Dépense'
    const montant = parseFloat(depTrajet.montant) || 0
    if (!montant) return toast.error('Indiquez le montant de la dépense')
    setSaving(true)
    try {
      const depenses = [...(t.depenses || []), { label, montant, ajouteeLe: Date.now(), ajouteePar: user.nom }]
      const totDep = totalDep(depenses)
      await updateItem('logistique_transports', t.id, {
        depenses, totalDepenses: totDep, marge: (parseFloat(t.recette) || 0) - totDep
      })
      await audit('logistique', 'TRANSPORT_DEPENSE', `${siteLabel(site)} — ${t.num || t.plaque} — +${formatMoney(montant)} · ${label}`)
      toast.success('Dépense ajoutée au trajet ✓')
      setDetail((d) => (d && d.id === t.id ? { ...d, depenses } : d))
      setDepTrajet(null)
    } finally { setSaving(false) }
  }

  async function supprimer() {
    const t = toDelete
    setToDelete(null)
    await removeItem('logistique_transports', t.id)
    await audit('logistique', 'TRANSPORT_DELETE', `${siteLabel(site)} — ${t.plaque || ''} · ${t.num || ''} · ${STATUTS_TRAJET[statutTrajet(t)].label}`)
    toast.success('Trajet supprimé ✓')
    setDetail((d) => (d && d.id === t.id ? null : d))
  }

  const estMien = (t) => t.agentId && user?.uid && t.agentId === user.uid
  // Modif / suppression : l'administration (+ Info) à tout stade ; l'auteur et les
  // approbateurs uniquement tant que la sortie n'est pas autorisée.
  const peutModifier = (t) => peutSaisir && (peutAdmin || ((estMien(t) || peutApprouver) && statutTrajet(t) === 'en_attente'))
  const horaire = (t) => (t.heureDepart || t.heureArrivee) ? `${t.heureDepart || '—'} → ${t.heureArriveeReelle || t.heureArrivee || '—'}` : '—'

  const ongletsDef = [
    ['route', 'En cours', parStatut.en_route.length],
    ['attente', 'À autoriser', parStatut.en_attente.length],
    ['tous', 'Tous les trajets', null]
  ]

  // Cellule d'actions d'une ligne — dépend du statut du trajet et des droits.
  const actionsTrajet = (t) => {
    const st = statutTrajet(t)
    // Actions bien visibles : les étapes du workflow (Autoriser / Arrivée) sont des
    // boutons pleins avec libellé ; les autres, des pastilles teintées bordées.
    const chip = 'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors'
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setDetail(t)} title="Voir le détail du trajet"
          className={`${chip} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}>
          <Eye size={15} /> Détail
        </button>
        {st === 'en_attente' && peutApprouver && (
          <button onClick={() => approuver(t)} title="Autoriser la sortie du camion"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-green-600/40 transition-colors hover:bg-green-700">
            <ShieldCheck size={15} /> Autoriser
          </button>
        )}
        {st === 'en_route' && peutSaisir && (
          <button onClick={() => marquerArrivee(t)} title="Marquer l'arrivée du camion"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-sky-600/40 transition-colors hover:bg-sky-700">
            <Flag size={15} /> Arrivée
          </button>
        )}
        {(st === 'en_route' || st === 'arrive') && peutSaisir && (
          <button onClick={() => setDepTrajet({ trajet: t, label: '', montant: '' })} title="Ajouter une dépense (carburant, péage…)"
            className={`${chip} border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200`}>
            <Fuel size={15} /> Dépense
          </button>
        )}
        {peutModifier(t) && (
          <button onClick={() => ouvrirEdition(t)} title="Modifier le trajet"
            className={`${chip} border-gray-200 bg-white hover:bg-gray-50`} style={{ color: COULEUR }}>
            <Pencil size={15} />
          </button>
        )}
        {peutModifier(t) && (
          <button onClick={() => setToDelete(t)} title="Supprimer le trajet"
            className={`${chip} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* En-tête + période — même recette que Briqueterie (bandeau dégradé), teintée
          à la couleur de MAXI LOGISTIQUE. Le sélecteur de période ne sert qu'à
          l'onglet « Tous les trajets ». */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl p-4 text-white shadow-lg"
        style={{ background: `linear-gradient(to right, ${COULEUR}, ${shadeHex(COULEUR, -30)})` }}>
        <Truck size={22} />
        <div>
          <h2 className="text-base font-extrabold">Transport — MAXI LOGISTIQUE ({siteLabel(site)})</h2>
          <p className="text-xs text-white/80">Sortie de camion sous autorisation · suivi départ → arrivée · recette, dépenses, marge</p>
        </div>
        {onglet === 'tous' && (
          <div className="w-full sm:ml-auto sm:w-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white">
            {periodNode}
          </div>
        )}
      </div>

      {/* Cumul sur la période — onglet « Tous les trajets » uniquement, réservé à
          l'administration comme les autres KPI financiers de Logistique. */}
      {onglet === 'tous' && estAdministration && voitMontants && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Recette (période)</p>
            <p className="text-xl font-extrabold" style={{ color: COULEUR }}>{formatMoney(cumul.recette)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Dépenses (période)</p>
            <p className="text-xl font-extrabold text-amber-700">{formatMoney(cumul.depenses)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Marge bénéficiaire</p>
            <p className={`text-xl font-extrabold ${cumul.marge >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(cumul.marge)}</p>
          </div>
        </div>
      )}

      {/* Onglets + bouton de création */}
      <div className="flex flex-wrap items-center gap-2">
        {ongletsDef.map(([k, label, count]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${onglet === k ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={onglet === k ? { backgroundColor: COULEUR } : undefined}>
            {label}{count != null && count > 0 ? ` (${count})` : ''}
          </button>
        ))}
        {peutSaisir && (
          <Button className="ml-auto" style={{ backgroundColor: COULEUR }} onClick={() => { setModal({ data: vide(), isNew: true }); setDep({ label: '', montant: '' }) }}>
            <Plus size={16} /> Nouveau trajet
          </Button>
        )}
      </div>

      {onglet === 'attente' && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Trajets déclarés, en attente d'<strong>autorisation de sortie</strong> par un gérant / la direction. Le camion ne doit pas sortir tant que la sortie n'est pas autorisée.
        </div>
      )}
      {onglet === 'route' && (
        <div className="rounded-lg bg-sky-50 px-4 py-2 text-xs text-sky-800">
          Camions actuellement <strong>en route</strong>. À l'arrivée, cliquez sur <strong>« Arrivée »</strong> pour l'enregistrer. Une dépense (carburant, péage…) peut être ajoutée à tout moment avec <strong>« Dépense »</strong>.
        </div>
      )}

      {/* Tableau des trajets */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Plaque</th>
              <th className="px-3 py-2 text-left">Trajet</th>
              <th className="px-3 py-2 text-left">Horaire</th>
              <th className="px-3 py-2 text-left">Cargaison</th>
              {voitMontants && <th className="px-3 py-2 text-right">Recette</th>}
              {voitMontants && <th className="px-3 py-2 text-right">Dépenses</th>}
              {voitMontants && <th className="px-3 py-2 text-right">Marge</th>}
              <th className="px-3 py-2 text-center">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.map((t) => {
              const d = totalDep(t.depenses)
              const m = margeDe(t)
              const st = statutTrajet(t)
              return (
                <tr key={t.id} onClick={() => setDetail(t)} className="cursor-pointer transition-colors hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{t.num || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(t.date)}</td>
                  <td className="px-3 py-2"><span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold">{t.plaque || '—'}</span></td>
                  <td className="px-3 py-2">{(t.lieuDepart || t.lieuArrivee) ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{t.lieuDepart || '?'} → {t.lieuArrivee || '?'}</span> : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{horaire(t)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{t.cargaison || '—'}</td>
                  {voitMontants && <td className="px-3 py-2 text-right font-semibold" style={{ color: COULEUR }}>{formatMoney(parseFloat(t.recette) || 0)}</td>}
                  {voitMontants && <td className="px-3 py-2 text-right text-amber-700">{formatMoney(d)}</td>}
                  {voitMontants && <td className={`px-3 py-2 text-right font-bold ${m >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(m)}</td>}
                  <td className="px-3 py-2 text-center">
                    <Badge tone={STATUTS_TRAJET[st].tone}>{STATUTS_TRAJET[st].label}</Badge>
                    {st !== 'en_attente' && voitValidateur && t.approuveePar && (
                      <span className="mt-0.5 block text-[10px] text-gray-400">par {t.approuveePar}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{actionsTrajet(t)}</td>
                </tr>
              )
            })}
            {!liste.length && (
              <tr><td colSpan={11} className="py-10 text-center text-gray-400">
                {onglet === 'attente' ? 'Aucun trajet en attente d\'autorisation.' : onglet === 'route' ? 'Aucun camion en route.' : 'Aucun trajet sur la période.'}
              </td></tr>
            )}
          </tbody>
          {onglet === 'tous' && liste.length > 0 && voitMontants && (
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-3 py-2" colSpan={6}>TOTAL PÉRIODE ({formatDateShort(start)} → {formatDateShort(end)})</td>
                <td className="px-3 py-2 text-right" style={{ color: COULEUR }}>{formatMoney(cumul.recette)}</td>
                <td className="px-3 py-2 text-right text-amber-700">{formatMoney(cumul.depenses)}</td>
                <td className={`px-3 py-2 text-right ${cumul.marge >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(cumul.marge)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {/* Modale création / édition d'un trajet — glassmorphism teinté module. */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal?.isNew ? 'Nouveau trajet' : 'Modifier le trajet'}
        {...glassModalProps(COULEUR)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: COULEUR }} onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            {!modal.isNew && statutTrajet(modal.dataInitial) !== 'en_attente' && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ce trajet est déjà <strong>{STATUTS_TRAJET[statutTrajet(modal.dataInitial)].label.toLowerCase()}</strong> — modification réservée à l'administration. Le statut et les horodatages sont conservés.
              </div>
            )}
            {/* Identification & date */}
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-white p-3 md:grid-cols-3">
              <FormGroup label="Date">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Plaque d'immatriculation" required>
                <Input list="plaques-transport-logistique" value={modal.data.plaque} onChange={(e) => set('plaque', e.target.value)} placeholder="ex : TG 1234 AB" />
                <datalist id="plaques-transport-logistique">{plaques.map((p) => <option key={p} value={p} />)}</datalist>
              </FormGroup>
              <FormGroup label="Chauffeur">
                <Input value={modal.data.chauffeur} onChange={(e) => set('chauffeur', e.target.value)} placeholder="Nom du chauffeur" />
              </FormGroup>
            </div>

            {/* Itinéraire & horaires */}
            <div className="rounded-lg bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: COULEUR }}><MapPin size={13} /> Itinéraire & horaires</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Départ (lieu)"><Input value={modal.data.lieuDepart} onChange={(e) => set('lieuDepart', e.target.value)} placeholder="D'où" /></FormGroup>
                <FormGroup label="Arrivée (lieu)"><Input value={modal.data.lieuArrivee} onChange={(e) => set('lieuArrivee', e.target.value)} placeholder="Vers où" /></FormGroup>
                <FormGroup label="Heure de départ"><Input type="time" value={modal.data.heureDepart} onChange={(e) => set('heureDepart', e.target.value)} /></FormGroup>
                <FormGroup label="Heure d'arrivée (prévue)"><Input type="time" value={modal.data.heureArrivee} onChange={(e) => set('heureArrivee', e.target.value)} /></FormGroup>
              </div>
              <FormGroup label="Cargaison (qu'est-ce qui a été transporté)" className="mt-1">
                <Input value={modal.data.cargaison} onChange={(e) => set('cargaison', e.target.value)} placeholder="ex : mobilier événementiel pour chantier X" />
              </FormGroup>
              <FormGroup label="Motif de la sortie" className="mt-1">
                <Input value={modal.data.motifSortie} onChange={(e) => set('motifSortie', e.target.value)} placeholder="ex : livraison client, retour matériel…" />
              </FormGroup>
            </div>

            {/* Finances : recette + dépenses un à un */}
            <div className="rounded-lg bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: COULEUR }}><Fuel size={13} /> Coût & dépenses du trajet</p>
              <FormGroup label="Recette de la course (travail / location du camion, FCFA)">
                <Input type="number" min="0" value={modal.data.recette} onChange={(e) => set('recette', e.target.value)} placeholder="Montant facturé / gagné pour ce trajet" />
              </FormGroup>

              <p className="mt-3 mb-1 text-xs font-semibold text-gray-500">Dépenses (carburant, péage, main d'œuvre…) — ajoutez-les une à une</p>
              {(modal.data.depenses || []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {modal.data.depenses.map((x, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {x.label} · {formatMoney(parseFloat(x.montant) || 0)}
                      <button type="button" onClick={() => retirerDepense(i)} className="rounded-full p-0.5 hover:bg-black/10"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                <Input className="col-span-2 md:col-span-6" value={dep.label} onChange={(e) => setDep((d) => ({ ...d, label: e.target.value }))} placeholder="Nature (ex : Carburant / essence)" />
                <Input className="md:col-span-4" type="number" min="0" value={dep.montant} onChange={(e) => setDep((d) => ({ ...d, montant: e.target.value }))} placeholder="Montant" />
                <div className="col-span-2 md:col-span-2">
                  <Button type="button" variant="outline" onClick={ajouterDepense}><Plus size={14} /> Ajouter</Button>
                </div>
              </div>

              {/* Récap marge en direct */}
              <div className="mt-3 flex flex-wrap justify-end gap-4 border-t border-gray-100 pt-2 text-sm">
                <span className="text-gray-500">Dépenses : <strong className="text-amber-700">{formatMoney(totalDep(modal.data.depenses))}</strong></span>
                <span className="text-gray-500">Marge : <strong className={margeDe(modal.data) >= 0 ? 'text-green-700' : 'text-red-600'}>{formatMoney(margeDe(modal.data))}</strong></span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Détail d'un trajet (clic sur une ligne) */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `Trajet ${detail.num || ''} — ${detail.plaque || ''}` : ''}
        {...glassModalProps(COULEUR)}
        footer={detail && (() => {
          const st = statutTrajet(detail)
          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>
              {st === 'en_attente' && peutApprouver && (
                <Button style={{ backgroundColor: '#16a34a' }} onClick={() => approuver(detail)}><ShieldCheck size={15} /> Autoriser la sortie</Button>
              )}
              {st === 'en_route' && peutSaisir && (
                <Button style={{ backgroundColor: '#0284c7' }} loading={saving} onClick={() => marquerArrivee(detail)}><Flag size={15} /> Marquer l'arrivée</Button>
              )}
              {(st === 'en_route' || st === 'arrive') && peutSaisir && (
                <Button variant="outline" onClick={() => setDepTrajet({ trajet: detail, label: '', montant: '' })}><Fuel size={15} /> Ajouter une dépense</Button>
              )}
              {peutModifier(detail) && (
                <Button variant="outline" onClick={() => { const t = detail; setDetail(null); ouvrirEdition(t) }}><Pencil size={15} /> Modifier</Button>
              )}
              {peutModifier(detail) && (
                <Button variant="danger" onClick={() => setToDelete(detail)}><Trash2 size={15} /> Supprimer</Button>
              )}
            </div>
          )
        })()}>
        {detail && (() => {
          const st = statutTrajet(detail)
          const d = totalDep(detail.depenses)
          const m = margeDe(detail)
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUTS_TRAJET[st].tone}>{STATUTS_TRAJET[st].label}</Badge>
                <span className="font-mono text-xs text-gray-500">{formatDateShort(detail.date)}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold">{detail.plaque || '—'}</span>
              </div>

              <div className="grid gap-3 rounded-lg bg-white p-3 sm:grid-cols-2">
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Chauffeur</p><p className="text-sm">{detail.chauffeur || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Itinéraire</p><p className="text-sm">{(detail.lieuDepart || '?')} → {(detail.lieuArrivee || '?')}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Horaire prévu</p><p className="text-sm">{detail.heureDepart || '—'} → {detail.heureArrivee || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Heure d'arrivée réelle</p><p className="text-sm">{detail.heureArriveeReelle || '—'}</p></div>
                <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-gray-400">Cargaison</p><p className="text-sm">{detail.cargaison || '—'}</p></div>
                {detail.motifSortie && <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-gray-400">Motif de la sortie</p><p className="text-sm">{detail.motifSortie}</p></div>}
              </div>

              {/* Suivi / traçabilité */}
              <div className="rounded-lg bg-white p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: COULEUR }}><Clock size={13} /> Suivi</p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-gray-400" /> Créé par <strong>{detail.agentNom || '—'}</strong>{detail.createdAt ? ` · ${dateTimeCourt(detail.createdAt)}` : ''}</li>
                  <li className="flex items-center gap-2">
                    {st === 'en_attente'
                      ? <><Clock size={14} className="text-amber-500" /> En attente d'autorisation de sortie</>
                      : <><ShieldCheck size={14} className="text-green-600" /> Sortie autorisée{voitValidateur && detail.approuveePar ? <> par <strong>{detail.approuveePar}</strong></> : ''}{detail.approuveeLe ? ` · ${formatDateShort(detail.approuveeLe)}` : ''}</>}
                  </li>
                  {st === 'arrive' && (
                    <li className="flex items-center gap-2"><Flag size={14} className="text-sky-600" /> Arrivée enregistrée{detail.arriveePar ? <> par <strong>{detail.arriveePar}</strong></> : ''}{detail.arriveeLe ? ` · ${dateTimeCourt(detail.arriveeLe)}` : ''}</li>
                  )}
                </ul>
              </div>

              {/* Finances */}
              {voitMontants && (
                <div className="rounded-lg bg-white p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: COULEUR }}><Fuel size={13} /> Recette & dépenses</p>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Recette de la course</span><strong style={{ color: COULEUR }}>{formatMoney(parseFloat(detail.recette) || 0)}</strong></div>
                  <div className="mt-2 space-y-1">
                    {(detail.depenses || []).length === 0 && <p className="text-xs text-gray-400">Aucune dépense enregistrée.</p>}
                    {(detail.depenses || []).map((x, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-amber-50 px-2.5 py-1 text-xs">
                        <span className="text-amber-800">
                          {x.label}
                          {x.ajouteePar && <span className="text-amber-500"> · ajoutée par {x.ajouteePar}{x.ajouteeLe ? ` le ${formatDateShort(x.ajouteeLe)}` : ''}</span>}
                        </span>
                        <strong className="text-amber-800">{formatMoney(parseFloat(x.montant) || 0)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-sm"><span className="text-gray-500">Total dépenses</span><strong className="text-amber-700">{formatMoney(d)}</strong></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Marge</span><strong className={m >= 0 ? 'text-green-700' : 'text-red-600'}>{formatMoney(m)}</strong></div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Ajout d'une dépense en cours de route */}
      <Modal open={!!depTrajet} onClose={() => setDepTrajet(null)} size="sm" title="Ajouter une dépense au trajet"
        {...glassModalProps(COULEUR)}
        footer={<><Button variant="outline" onClick={() => setDepTrajet(null)}>Annuler</Button><Button style={{ backgroundColor: COULEUR }} loading={saving} onClick={ajouterDepenseTrajet}>Ajouter</Button></>}>
        {depTrajet && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Trajet {depTrajet.trajet.num || ''} — {depTrajet.trajet.plaque} · {depTrajet.trajet.lieuDepart || '?'} → {depTrajet.trajet.lieuArrivee || '?'}</p>
            <FormGroup label="Nature de la dépense" required>
              <Input value={depTrajet.label} onChange={(e) => setDepTrajet((s) => ({ ...s, label: e.target.value }))} placeholder="ex : Carburant / essence, péage, réparation…" autoFocus />
            </FormGroup>
            <FormGroup label="Montant (FCFA)" required>
              <Input type="number" min="0" value={depTrajet.montant} onChange={(e) => setDepTrajet((s) => ({ ...s, montant: e.target.value }))} placeholder="Montant dépensé" />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer ce trajet ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={supprimer}>Supprimer</Button></>}>
        {toDelete && (
          <p className="text-sm text-gray-600">
            Supprimer le trajet {toDelete.num || ''} du {formatDateShort(toDelete.date)} — {toDelete.plaque}
            {statutTrajet(toDelete) !== 'en_attente' && <> (<strong>{STATUTS_TRAJET[statutTrajet(toDelete)].label.toLowerCase()}</strong>)</>} ?
          </p>
        )}
      </Modal>
    </div>
  )
}
